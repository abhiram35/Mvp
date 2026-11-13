// Moderator-only RPCs (list_reports, resolve_report, unban_user, get_beta_metrics) with friendly errors.
import { errorMessage, supabase } from '../../lib/supabase';
import type { BetaMetrics, ModerationAction, Report, ReportQueueItem, ReportTarget } from '../../lib/types';

export const REPORTS_PAGE_SIZE = 20;

export const REPORT_TARGET_LABELS: Record<ReportTarget, string> = {
  profile: 'Profile',
  message: 'Chat message',
  lfg_post: 'Lobby',
  community_post: 'Community post',
  community_reply: 'Community reply',
  clip: 'Clip',
  clip_comment: 'Clip comment',
};

/** Turns RPC errors into short copy a moderator can act on. */
export function moderationErrorMessage(err: unknown): string {
  const e = (err ?? {}) as { code?: string; message?: string };
  const msg = (e.message ?? '').toLowerCase();
  if (e.code === '42501' || msg.includes('moderator') || msg.includes('not allowed') || msg.includes('permission')) {
    return 'Only moderators can do this.';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
    return 'Check your connection and try again.';
  }
  if (e.code === 'P0002' || msg.includes('not found')) return 'That report no longer exists. Pull to refresh.';
  if (msg.includes('ban_days') || msg.includes('between 1 and 365')) return 'Ban length must be 1 to 365 days.';
  return errorMessage(err);
}

function fail(err: unknown): never {
  throw new Error(moderationErrorMessage(err));
}

/** Newest first. */
export async function listReports(status: Report['status'], offset = 0, limit = REPORTS_PAGE_SIZE): Promise<ReportQueueItem[]> {
  const { data, error } = await supabase.rpc('list_reports', { p_status: status, p_limit: limit, p_offset: offset });
  if (error) fail(error);
  return Array.isArray(data) ? (data as ReportQueueItem[]) : [];
}

export async function resolveReport(reportId: string, action: ModerationAction, banDays?: number): Promise<void> {
  const { error } = await supabase.rpc('resolve_report', {
    p_report_id: reportId,
    p_action: action,
    p_ban_days: action === 'ban_user' ? (banDays ?? 1) : null,
  });
  if (error) fail(error);
}

export async function unbanUser(profileId: string): Promise<void> {
  const { error } = await supabase.rpc('unban_user', { p_profile_id: profileId });
  if (error) fail(error);
}

export async function getBetaMetrics(days = 14): Promise<BetaMetrics> {
  const { data, error } = await supabase.rpc('get_beta_metrics', { p_days: days });
  if (error) fail(error);
  const row = (Array.isArray(data) ? data[0] : data) as BetaMetrics | null | undefined;
  if (!row) throw new Error('No stats yet.');
  return { ...row, daily_active: Array.isArray(row.daily_active) ? row.daily_active : [] };
}
