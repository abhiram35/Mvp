// GG Edge Function: generate-theme
// POST { prompt } with the player's JWT → asks the AI designer for a ThemeSpec,
// validates/repairs it and saves it to custom_themes. See docs/CUSTOM_THEMES.md.
//
// Responses (always JSON):
//   200 { theme: { id, name, spec, created_at }, quota }
//   400 { error: "invalid_prompt" }        prompt missing or not 3–300 chars
//   400 { error: "prompt_rejected" }       hateful / sexual prompt (not counted)
//   401 { error: "unauthorized" }
//   403 { error: "no_profile" }            signed in but no profile row yet
//   405 { error: "method_not_allowed" }
//   409 { error: "storage_full", quota }   already 6 saved themes
//   422 { error: "invalid_theme" }         AI output failed validation (not counted)
//   429 { error: "quota", quota }          2 this month already
//   429 { error: "busy" }                  another generation for this player is running
//   429 { error: "too_many_attempts", quota }  too many failed attempts in 24 h
//   500 { error: "internal" } / { error: "not_configured" }
//   502 { error: "ai_unavailable" }        AI timeout / upstream error (not counted)
//
// Secrets: ANTHROPIC_API_KEY (required), THEME_MODEL (optional).
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.

// deno-lint-ignore no-import-prefix -- Supabase's documented style for Edge Functions
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { corsHeaders, json } from '../_shared/cors.ts';
import { THEME_SYSTEM_PROMPT } from '../_shared/themePrompt.ts';
import { CREATE_THEME_TOOL_SCHEMA, cleanPrompt, isAbusivePrompt, validateAndRepair } from '../_shared/themeSpec.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const AI_TIMEOUT_MS = 30_000;
const MAX_TOKENS = 1500;

type Status = 'succeeded' | 'failed' | 'rejected';

class UpstreamError extends Error {}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? serviceKey;
  if (!supabaseUrl || !serviceKey || !anonKey) {
    console.error('generate-theme: missing Supabase env');
    return json(500, { error: 'not_configured' });
  }

  // ── Who is calling? ────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'unauthorized' });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return json(401, { error: 'unauthorized' });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Prompt ─────────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_prompt' });
  }
  const prompt = cleanPrompt((body as { prompt?: unknown } | null)?.prompt);
  if (!prompt) return json(400, { error: 'invalid_prompt' });

  const log = async (status: Exclude<Status, 'succeeded'>, error: string) => {
    const { error: e } = await admin.rpc('finish_theme_generation', {
      p_profile_id: user.id, p_status: status, p_error: error,
    });
    if (e) console.error('generate-theme: log failed', e.message);
  };

  if (isAbusivePrompt(prompt)) {
    // Not counted; logged so repeated abuse hits the daily attempt cap.
    await log('rejected', 'prompt_denylist');
    return json(400, { error: 'prompt_rejected' });
  }

  // ── Quota / storage / lock ─────────────────────────────────────────────────
  const { data: begin, error: beginErr } = await admin.rpc('begin_theme_generation', { p_profile_id: user.id });
  if (beginErr || !begin) {
    console.error('generate-theme: begin failed', beginErr?.message);
    return json(500, { error: 'internal' });
  }
  if (!begin.ok) {
    switch (begin.error) {
      case 'quota': return json(429, { error: 'quota', quota: begin.quota });
      case 'storage_full': return json(409, { error: 'storage_full', quota: begin.quota });
      case 'too_many_attempts': return json(429, { error: 'too_many_attempts', quota: begin.quota });
      case 'busy': return json(429, { error: 'busy' });
      case 'no_profile': return json(403, { error: 'no_profile' });
      default: return json(500, { error: 'internal' });
    }
  }

  // From here on the player holds the lock: every path must call finish_theme_generation.
  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      console.error('generate-theme: ANTHROPIC_API_KEY is not set');
      await log('failed', 'not_configured');
      return json(500, { error: 'not_configured' });
    }

    let toolInput: Record<string, unknown> | null;
    try {
      toolInput = await callDesigner(apiKey, prompt);
    } catch (e) {
      const code = e instanceof UpstreamError ? e.message : 'upstream_exception';
      console.error('generate-theme: AI call failed', code);
      await log('failed', code);
      return json(502, { error: 'ai_unavailable' });
    }

    if (!toolInput) {
      await log('failed', 'no_tool_output');
      return json(422, { error: 'invalid_theme' });
    }
    if (toolInput.refuse === true) {
      await log('rejected', 'ai_refused');
      return json(400, { error: 'prompt_rejected' });
    }

    const result = validateAndRepair(toolInput);
    if (!result.ok) {
      await log(result.status, result.reason);
      return json(422, { error: 'invalid_theme' });
    }

    const { data: done, error: doneErr } = await admin.rpc('finish_theme_generation', {
      p_profile_id: user.id,
      p_status: 'succeeded',
      p_name: result.spec.name,
      p_prompt: prompt,
      p_spec: result.spec,
    });
    if (doneErr || !done) {
      console.error('generate-theme: save failed', doneErr?.message);
      return json(500, { error: 'internal' });
    }
    if (!done.ok) {
      if (done.error === 'storage_full') return json(409, { error: 'storage_full', quota: done.quota });
      return json(429, { error: 'quota', quota: done.quota });
    }
    return json(200, { theme: done.theme, quota: done.quota });
  } catch (e) {
    console.error('generate-theme: unexpected', e instanceof Error ? e.message : String(e));
    await log('failed', 'internal');
    return json(500, { error: 'internal' });
  }
});

/** Calls the Anthropic Messages API, forcing the create_theme tool. Returns the tool input or null. */
async function callDesigner(apiKey: string, prompt: string): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('THEME_MODEL') ?? 'claude-sonnet-5-5',
        max_tokens: MAX_TOKENS,
        system: THEME_SYSTEM_PROMPT,
        tools: [{
          name: 'create_theme',
          description: 'Create one complete Vinq theme from the player\'s description.',
          input_schema: CREATE_THEME_TOOL_SCHEMA,
        }],
        tool_choice: { type: 'tool', name: 'create_theme' },
        messages: [{
          role: 'user',
          content: `Design a Vinq theme for this player description:\n<description>\n${prompt}\n</description>`,
        }],
      }),
    });
  } catch {
    clearTimeout(timer);
    throw new UpstreamError(controller.signal.aborted ? 'timeout' : 'network');
  }

  try {
    if (!res.ok) {
      // Log only the status server-side; never the body (could echo request details).
      await res.body?.cancel();
      throw new UpstreamError(`upstream_${res.status}`);
    }

    let data: { stop_reason?: string; content?: { type: string; name?: string; input?: unknown }[] };
    try {
      data = await res.json();
    } catch {
      throw new UpstreamError(controller.signal.aborted ? 'timeout' : 'upstream_bad_json');
    }
    if (data.stop_reason === 'refusal') return { refuse: true };
    const block = data.content?.find((c) => c.type === 'tool_use' && c.name === 'create_theme');
    const input = block?.input;
    return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
  } finally {
    clearTimeout(timer);
  }
}
