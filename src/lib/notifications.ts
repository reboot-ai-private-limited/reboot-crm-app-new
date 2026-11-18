import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { IconName } from '@/components/ui/Icon';
import { api } from './api';

// Mirrors backend notification types (backend/src/modules/notification/domain/notification.types.ts).
export type NotificationType =
  | 'LEAD_ASSIGNED'
  | 'FOLLOW_UP_DUE'
  | 'MEETING_SCHEDULED'
  | 'MEETING_RESCHEDULED'
  | 'MEETING_CANCELLED'
  | 'MEETING_STARTING'
  | 'MEETING_NEEDS_OUTCOME'
  | 'MEETING_REMINDER'
  | 'PROPOSAL_VIEWED'
  | 'PROPOSAL_UNSEEN'
  | 'RENEWAL_DUE'
  | 'SERVICE_EXPIRED';

export type AppNotification = {
  _id: string;
  type: NotificationType;
  title: string;
  body?: string;
  priority: 'HIGH' | 'NORMAL';
  leadId?: { _id: string; companyName?: string; contactName?: string } | null;
  customerId?: { _id: string; businessName?: string; contactName?: string } | null;
  meetingId?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export type NotificationList = { data: AppNotification[]; total: number; unread: number; page: number; limit: number };

export const PAGE_SIZE = 20;

export function fetchNotifications(opts: { unread?: boolean; page?: number } = {}) {
  return api<NotificationList>('/notifications', { query: { unread: opts.unread ? 'true' : undefined, page: opts.page ?? 1, limit: PAGE_SIZE } });
}

export async function markNotificationRead(id: string) {
  await api(`/notifications/${id}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead() {
  await api('/notifications/read-all', { method: 'POST' });
}

/** Icon and colour for each kind of notification. */
export const notificationStyle: Record<NotificationType, { icon: IconName; tone: 'primary' | 'purple' | 'warning' | 'success' | 'danger' | 'slate' }> = {
  LEAD_ASSIGNED: { icon: 'users', tone: 'primary' },
  FOLLOW_UP_DUE: { icon: 'clock', tone: 'warning' },
  MEETING_SCHEDULED: { icon: 'video', tone: 'purple' },
  MEETING_RESCHEDULED: { icon: 'video', tone: 'warning' },
  MEETING_CANCELLED: { icon: 'video', tone: 'slate' },
  MEETING_STARTING: { icon: 'video', tone: 'danger' },
  MEETING_NEEDS_OUTCOME: { icon: 'check', tone: 'success' },
  MEETING_REMINDER: { icon: 'video', tone: 'purple' },
  PROPOSAL_VIEWED: { icon: 'check', tone: 'success' },
  PROPOSAL_UNSEEN: { icon: 'clock', tone: 'warning' },
  RENEWAL_DUE: { icon: 'refresh', tone: 'warning' },
  SERVICE_EXPIRED: { icon: 'refresh', tone: 'danger' },
};

/** "just now", "5 min ago", "3 h ago", "2 d ago", then the date. */
/** Meeting notifications are always shown as important (highlighted), whatever their priority. Same rule as the web. */
export const isMeetingNotification = (t?: string) => !!t && t.startsWith('MEETING_');

export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
  if (mins < 7 * 24 * 60) return `${Math.floor(mins / (24 * 60))} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// --- Unread count for the tab badge -------------------------------------------------------------
// One number shared by the tab bar and the Alerts screen. The tab bar polls it; the screen pushes
// the fresh value after loading or marking read, so the badge never lags behind what the list shows.
let unreadCount = 0;
const listeners = new Set<(n: number) => void>();
export function setUnreadCount(n: number) {
  if (n === unreadCount) return;
  unreadCount = n;
  listeners.forEach((l) => l(n));
}

/** Re-reads the unread count now (a push just arrived) instead of waiting for the next poll. */
export function refreshUnreadCount() {
  api<{ unread: number }>('/notifications/unread-count')
    .then((r) => setUnreadCount(r.unread))
    .catch(() => {});
}

const POLL_MS = 30_000;

/** Unread notifications, kept fresh while the app is open. Pass enabled=false to do nothing. */
export function useUnreadCount(enabled: boolean) {
  const [count, setCount] = useState(unreadCount);

  useEffect(() => {
    if (!enabled) return;
    listeners.add(setCount);
    let alive = true;
    const refresh = () => {
      api<{ unread: number }>('/notifications/unread-count')
        .then((r) => alive && setUnreadCount(r.unread))
        .catch(() => {}); // a missed refresh is fine; the next one catches up
    };
    refresh();
    const timer = setInterval(() => AppState.currentState === 'active' && refresh(), POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      alive = false;
      listeners.delete(setCount);
      unreadCount = 0; // the next person to log in must not briefly see this count
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled]);

  return enabled ? count : 0;
}
