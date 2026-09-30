import { api } from './api';
import { getLocation } from './location';

// Mirrors backend ILead + lifecycle (backend/docs/05-LEAD-LIFECYCLE.md).
export const LEAD_STATUSES = ['FRESH', 'CONTACTED', 'MEETING', 'FOLLOW_UP', 'PROPOSAL', 'DEAL_CLOSED', 'NOT_INTERESTED', 'INVALID'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadPriority = 'HOT' | 'WARM' | 'COLD';

export type Lead = {
  _id: string;
  companyName?: string;
  contactName?: string;
  mobile?: string;
  email?: string;
  city?: string;
  address?: string;
  category?: string;
  source?: string;
  status: LeadStatus;
  priority?: LeadPriority;
  score?: number;
  nextActionDate?: string | null;
  nextActionNote?: string | null;
  lostReason?: string | null;
  invalidReason?: string | null;
  dealValue?: number | null;
  assignedTo?: { _id: string; fullName?: string } | string | null;
  lastProposalAt?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type Activity = {
  _id: string;
  eventType: string;
  metadata?: Record<string, unknown> | null;
  actorId?: { _id: string; fullName?: string } | null;
  createdAt: string;
};

export type LeadDetails = { lead: Lead; activities: Activity[]; allowedNextStatuses: LeadStatus[] };
export type LeadPage = { data: Lead[]; total: number };

export const STATUS_LABEL: Record<LeadStatus, string> = {
  FRESH: 'Fresh',
  CONTACTED: 'Contacted',
  MEETING: 'Meeting',
  FOLLOW_UP: 'Follow-up',
  PROPOSAL: 'Proposal',
  DEAL_CLOSED: 'Deal closed',
  NOT_INTERESTED: 'Not interested',
  INVALID: 'Invalid',
};

export const STATUS_HINT: Record<LeadStatus, string> = {
  FRESH: 'New lead, not contacted yet',
  CONTACTED: 'Spoke to them, no meeting yet',
  MEETING: 'Meeting scheduled',
  FOLLOW_UP: 'Meeting done, deal pending',
  PROPOSAL: 'Proposal generated or sent',
  DEAL_CLOSED: 'Won — creates the customer',
  NOT_INTERESTED: 'Customer said no',
  INVALID: 'Wrong, fake or duplicate data',
};

export const REASON_REQUIRED: LeadStatus[] = ['NOT_INTERESTED', 'INVALID'];
export const CLOSED_STATUSES: LeadStatus[] = ['DEAL_CLOSED', 'NOT_INTERESTED', 'INVALID'];

export const statusLabel = (s?: string) => (s && s in STATUS_LABEL ? STATUS_LABEL[s as LeadStatus] : (s ?? '').replace(/_/g, ' '));

export const PAGE_SIZE = 20;

/** Employees: GET /leads/my. Admin: GET /leads/all (every assigned lead). `pool`: GET /leads/pool (unassigned). */
export function fetchLeads(opts: { admin: boolean; pool?: boolean; page: number; search?: string; status?: LeadStatus; priority?: LeadPriority }) {
  const path = opts.pool ? '/leads/pool' : opts.admin ? '/leads/all' : '/leads/my';
  return api<LeadPage>(path, {
    query: { page: opts.page, limit: PAGE_SIZE, search: opts.search?.trim(), status: opts.status, priority: opts.priority },
  });
}

/**
 * Open leads that have a next action date (employees: /leads/my, admin: /leads/all).
 * The date-range filter only matches leads that have a date; closed leads are dropped here.
 */
export async function fetchFollowUps(admin: boolean): Promise<Lead[]> {
  const found: Lead[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await api<LeadPage>(admin ? '/leads/all' : '/leads/my', {
      query: { page, limit: 100, nextActionFrom: '2000-01-01', nextActionTo: '2100-01-01' },
    });
    found.push(...res.data);
    if (found.length >= res.total || res.data.length === 0) break;
  }
  return found.filter((l) => l.nextActionDate && !CLOSED_STATUSES.includes(l.status));
}

/** Number of the employee's own leads, optionally in one status (reads `total` from a 1-row page). */
export async function countMyLeads(status?: LeadStatus) {
  const res = await api<LeadPage>('/leads/my', { query: { page: 1, limit: 1, status } });
  return res.total;
}

export function fetchLead(id: string) {
  return api<LeadDetails>(`/leads/${id}`);
}

export type LeadInput = {
  companyName: string;
  contactName: string;
  mobile?: string;
  email?: string;
  city: string;
  category: string;
  address?: string;
};

// Empty optional strings must be omitted: the backend validates email/mobile format when present.
function clean(input: LeadInput) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    const t = (v ?? '').trim();
    if (t) out[k] = t;
  }
  return out;
}

/** Field lead: GPS is captured here (business rule: only at lead creation and Log Visit). */
export async function createLead(input: LeadInput) {
  const location = await getLocation();
  return api<Lead>('/leads', { method: 'POST', body: { ...clean(input), source: 'Field', location } });
}

// No GPS on the calls below — the backend no longer needs it and the business rule says not to capture it.

export function updateLead(id: string, input: LeadInput) {
  return api<{ lead: Lead }>(`/leads/${id}`, { method: 'PATCH', body: clean(input) });
}

export function addNote(id: string, note: string) {
  return api(`/leads/${id}/notes`, { method: 'POST', body: { note: note.trim() } });
}

/** "Call back on…" — FRESH becomes CONTACTED; never moves to FOLLOW_UP. */
export function setNextAction(id: string, date: Date, note?: string) {
  const body: Record<string, unknown> = { date: date.toISOString() };
  if (note?.trim()) body.note = note.trim();
  return api(`/leads/${id}/next-action`, { method: 'POST', body });
}

/** Every status move. Backend enforces the rules and returns a readable 422 message if not allowed. */
export function changeStatus(id: string, input: { status: LeadStatus; reason?: string; dealValue?: number }) {
  return api<{ lead: Lead; customerId?: string }>(`/leads/${id}/status`, { method: 'PATCH', body: input });
}

export function titleCase(s?: string) {
  return (s ?? '').replace(/\b\w/g, (c) => c.toUpperCase());
}
