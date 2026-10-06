import { IconName } from '@/components/ui/Icon';
import { ColorName } from '@/theme';

import { api } from './api';
import { rupees } from './customers';
import { fetchFollowUps, Lead, LeadPage } from './leads';
import { fetchMeetings, hostName } from './meetings';
import { fetchNotifications, timeAgo } from './notifications';
import { DashboardRow, fetchDashboardRows, ROLE_LABEL } from './reporting';

/**
 * Admin "Action required": exceptions worked out in the app from existing APIs
 * (the planned /exceptions endpoint does not exist yet).
 */
export const ACTION_KINDS = ['alerts', 'followups', 'meetings', 'hot', 'pool', 'proposals', 'invoices', 'inactive'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** A proposal with no progress for this many days is flagged. */
export const PROPOSAL_WAIT_DAYS = 3;
/** An active employee with no CRM activity for this many days is flagged. */
export const INACTIVE_DAYS = 3;

export const ACTION_INFO: Record<ActionKind, { title: string; hint: string; icon: IconName; tone: 'danger' | 'warning' | 'primary' | 'purple' }> = {
  alerts: { title: 'Unread alerts', hint: 'New notifications for you', icon: 'bell', tone: 'primary' },
  followups: { title: 'Overdue follow-ups', hint: 'Follow-up date has passed', icon: 'clock', tone: 'danger' },
  meetings: { title: 'Meetings need an outcome', hint: 'Ended, but not marked Done or Not attend', icon: 'calendar', tone: 'warning' },
  hot: { title: 'HOT leads not contacted', hint: 'High-priority leads still Fresh', icon: 'zap', tone: 'danger' },
  invoices: { title: 'Overdue invoices', hint: 'Past due date with balance unpaid', icon: 'rupee', tone: 'danger' },
  pool: { title: 'Unassigned leads', hint: 'Waiting in the lead pool', icon: 'userx', tone: 'warning' },
  proposals: { title: 'Proposals without response', hint: `No progress ${PROPOSAL_WAIT_DAYS}+ days after the proposal`, icon: 'file', tone: 'purple' },
  inactive: { title: 'Inactive employees', hint: `No activity in the last ${INACTIVE_DAYS} days`, icon: 'users', tone: 'warning' },
};

/** Shown greyed out until their backend exists. */
export const COMING_SOON: { title: string; icon: IconName }[] = [{ title: 'Renewals approaching', icon: 'refresh' }];

export type ActionItem = {
  id: string;
  title: string;
  subtitle: string;
  /** Right-hand text, e.g. "3 days late" or "₹12,000". */
  meta?: string;
  metaTone?: ColorName;
  target: { pathname: '/lead/[id]' | '/customers/[id]' | '/team/[id]'; params: Record<string, string> };
};

export type ActionResult = { items: ActionItem[]; /** Total that exists (may exceed items when the API caps the page). */ total: number; /** Extra line for the summary card. */ note?: string };

const DAY = 24 * 60 * 60 * 1000;
const startOfToday = () => new Date().setHours(0, 0, 0, 0);
const daysSince = (iso: string) => Math.max(0, Math.floor((startOfToday() - new Date(iso).setHours(0, 0, 0, 0)) / DAY));
const late = (n: number) => (n === 0 ? 'Today' : n === 1 ? '1 day' : `${n} days`);
const leadName = (l: Lead) => l.companyName || l.contactName || 'Unnamed lead';
const owner = (l: Lead) => (typeof l.assignedTo === 'object' && l.assignedTo?.fullName) || 'Unassigned';
const leadTarget = (l: Lead) => ({ pathname: '/lead/[id]' as const, params: { id: l._id } });

function leadPage(path: '/leads/all' | '/leads/pool', query: Record<string, string | number | undefined>) {
  return api<LeadPage>(path, { query: { page: 1, limit: 100, ...query } });
}

async function overdueFollowUps(): Promise<ActionResult> {
  const today = startOfToday();
  const items = (await fetchFollowUps(true))
    .filter((l) => new Date(l.nextActionDate as string).getTime() < today)
    .sort((a, b) => new Date(a.nextActionDate as string).getTime() - new Date(b.nextActionDate as string).getTime())
    .map((l) => {
      const d = daysSince(l.nextActionDate as string);
      return {
        id: l._id,
        title: leadName(l),
        subtitle: [owner(l), l.nextActionNote].filter(Boolean).join(' · '),
        meta: `${late(d)} late`,
        metaTone: 'danger' as ColorName,
        target: leadTarget(l),
      };
    });
  return { items, total: items.length };
}

/** The Admin's own unread notifications (the newest page; `total` is how many are unread). Tap one to open its lead. */
async function unreadAlerts(): Promise<ActionResult> {
  const res = await fetchNotifications({ unread: true });
  const items = res.data
    .filter((n) => n.leadId?._id)
    .map((n) => ({
      id: n._id,
      title: n.title,
      subtitle: n.body ?? '',
      meta: timeAgo(n.createdAt),
      metaTone: (n.priority === 'HIGH' ? 'danger' : 'textMuted') as ColorName,
      target: { pathname: '/lead/[id]' as const, params: { id: n.leadId!._id } },
    }));
  return { items, total: res.unread };
}

/** "45 min", "3 h" or "2 days": how long ago a meeting ended. */
const sinceEnd = (endIso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(endIso).getTime()) / 60_000));
  return mins < 60 ? `${mins} min` : mins < 24 * 60 ? `${Math.round(mins / 60)} h` : late(Math.floor(mins / (24 * 60)));
};

/** Meetings (any host) whose end time has passed while they are still Scheduled or In progress: nobody has marked the outcome. */
async function meetingsNeedingOutcome(): Promise<ActionResult> {
  const now = Date.now();
  const meetings = await fetchMeetings({ status: 'SCHEDULED,IN_PROGRESS', to: new Date(now).toISOString(), limit: 200 });
  const items = meetings
    .filter((m) => new Date(m.endAt).getTime() < now)
    .sort((a, b) => new Date(a.endAt).getTime() - new Date(b.endAt).getTime())
    .map((m) => ({
      id: m._id,
      title: m.lead?.companyName || m.lead?.contactName || m.title,
      subtitle: [hostName(m), new Date(m.startAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })].filter(Boolean).join(' · '),
      meta: `${sinceEnd(m.endAt)} ago`,
      metaTone: 'warning' as ColorName,
      target: { pathname: '/lead/[id]' as const, params: { id: m.leadId } },
    }));
  return { items, total: items.length };
}

async function hotUncontacted(): Promise<ActionResult> {
  const res = await leadPage('/leads/all', { priority: 'HOT', status: 'FRESH' });
  const items = res.data.map((l) => ({
    id: l._id,
    title: leadName(l),
    subtitle: [owner(l), l.source].filter(Boolean).join(' · '),
    meta: `${daysSince(l.createdAt)}d old`,
    metaTone: 'danger' as ColorName,
    target: leadTarget(l),
  }));
  return { items, total: res.total };
}

async function poolLeads(): Promise<ActionResult> {
  const res = await leadPage('/leads/pool', {});
  const items = res.data.map((l) => ({
    id: l._id,
    title: leadName(l),
    subtitle: [l.priority, l.source, l.city].filter(Boolean).join(' · '),
    meta: `${daysSince(l.createdAt)}d waiting`,
    metaTone: (l.priority === 'HOT' ? 'danger' : 'warning') as ColorName,
    target: leadTarget(l),
  }));
  return { items, total: res.total };
}

async function staleProposals(): Promise<ActionResult> {
  const res = await leadPage('/leads/all', { status: 'PROPOSAL' });
  const items = res.data
    .map((l) => ({ l, since: l.lastProposalAt ?? l.updatedAt ?? l.createdAt }))
    .filter(({ since }) => daysSince(since) >= PROPOSAL_WAIT_DAYS)
    .sort((a, b) => new Date(a.since).getTime() - new Date(b.since).getTime())
    .map(({ l, since }) => ({
      id: l._id,
      title: leadName(l),
      subtitle: owner(l),
      meta: `${daysSince(since)} days`,
      metaTone: 'purple' as ColorName,
      target: leadTarget(l),
    }));
  return { items, total: items.length };
}

type InvoiceRow = {
  _id: string;
  invoiceNumber: string;
  outstandingAmount: number;
  status: string;
  dueDate: string;
  customerId?: { _id: string; businessName?: string; contactName?: string } | null;
};

/**
 * The backend only flips status to OVERDUE when an invoice is saved again, so overdue is decided
 * here from the due date and the unpaid balance across every open status.
 */
async function overdueInvoices(): Promise<ActionResult> {
  const pages = await Promise.all(
    ['PENDING', 'PARTIAL', 'OVERDUE'].map((status) => api<{ data: InvoiceRow[]; total: number }>('/invoices', { query: { limit: 100, status } })),
  );
  const today = startOfToday();
  const due = pages
    .flatMap((p) => p.data)
    .filter((i) => i.outstandingAmount > 0 && new Date(i.dueDate).getTime() < today)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const amount = due.reduce((n, i) => n + i.outstandingAmount, 0);
  const items = due.map((i) => ({
    id: i._id,
    title: i.customerId?.businessName || i.customerId?.contactName || 'Customer',
    subtitle: `${i.invoiceNumber} · ${late(daysSince(i.dueDate))} late`,
    meta: rupees(i.outstandingAmount),
    metaTone: 'danger' as ColorName,
    target: { pathname: '/customers/[id]' as const, params: { id: i.customerId?._id ?? '' } },
  }));
  return { items: items.filter((i) => i.target.params.id), total: items.length, note: due.length ? `${rupees(amount)} unpaid` : undefined };
}

/** Active non-admin employees whose attendance over the window is 0 days. */
async function inactiveEmployees(): Promise<ActionResult> {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (INACTIVE_DAYS - 1));
  const rows = await fetchDashboardRows(start, end);
  const items = rows
    .filter((r: DashboardRow) => r.role !== 'Admin' && r.status === 'Active' && r.attendanceText.startsWith('0'))
    .map((r) => ({
      id: r.employeeId,
      title: r.employeeName,
      subtitle: ROLE_LABEL[r.role] ?? r.role,
      meta: `0 / ${INACTIVE_DAYS} days`,
      metaTone: 'warning' as ColorName,
      target: { pathname: '/team/[id]' as const, params: { id: r.employeeId, name: r.employeeName, role: r.role, mobile: r.mobile, status: r.status } },
    }));
  return { items, total: items.length };
}

export const ACTION_LOADERS: Record<ActionKind, () => Promise<ActionResult>> = {
  alerts: unreadAlerts,
  followups: overdueFollowUps,
  meetings: meetingsNeedingOutcome,
  hot: hotUncontacted,
  pool: poolLeads,
  proposals: staleProposals,
  invoices: overdueInvoices,
  inactive: inactiveEmployees,
};
