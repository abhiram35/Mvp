import { router, type Href } from 'expo-router';
import type { NotificationRoute } from '../../lib/types';

type Pathname = NotificationRoute['pathname'];

/** Every pathname a notification may open, and whether it needs an `id` param. */
const ROUTES: Record<Pathname, { needsId: boolean }> = {
  '/lfg/[id]': { needsId: true },
  '/chat/[id]': { needsId: true },
  '/friends': { needsId: false },
  '/community/[id]': { needsId: true },
  '/user/[id]': { needsId: true },
  '/notifications': { needsId: false },
};

function isPathname(v: unknown): v is Pathname {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ROUTES, v);
}

/**
 * Validates an untrusted route (from a push payload or a notifications row) against the
 * NotificationRoute union. Accepts the object or a JSON string; returns null when invalid.
 */
export function parseNotificationRoute(raw: unknown): NotificationRoute | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { pathname, params } = value as { pathname?: unknown; params?: unknown };
  if (!isPathname(pathname)) return null;
  const clean: Record<string, string> = {};
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length > 0 && v.length <= 200) clean[k] = v;
      else if (typeof v === 'number' && Number.isFinite(v)) clean[k] = String(v);
    }
  }
  if (ROUTES[pathname].needsId && !clean.id) return null;
  return Object.keys(clean).length > 0 ? { pathname, params: clean } : { pathname };
}

/** Route stored in a notification's `data` (push payload data or notifications.data). */
export function routeFromData(data: unknown): NotificationRoute | null {
  if (typeof data === 'string') {
    try {
      return routeFromData(JSON.parse(data));
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  return parseNotificationRoute((data as { route?: unknown }).route);
}

/** Opens a validated notification route. */
export function openNotificationRoute(route: NotificationRoute) {
  if (route.params && Object.keys(route.params).length > 0) {
    // pathname and params were validated together in parseNotificationRoute.
    router.push({ pathname: route.pathname, params: route.params } as Href);
  } else {
    router.push(route.pathname);
  }
}
