import { api } from './api';
import { dealPayload } from './deal';
import { getLocation } from './location';

// Mirrors backend ILead + lifecycle (backend/docs/05-LEAD-LIFECYCLE.md).
export const LEAD_STATUSES = ['FRESH', 'CONTACTED', 'NO_RESPONSE', 'MEETING', 'FOLLOW_UP', 'PROPOSAL', 'DEAL_CLOSED', 'NOT_INTERESTED', 'INVALID'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadPriority = 'HOT' | 'WARM' | 'COLD';

export type Lead = {
  _id: string;
  companyName?: string;
  contactName?: string;
  /** National number, digits only. */
  mobile?: string;
  /** Calling code ("91", "971"). Missing on old leads = India. */
  countryCode?: string;
  /** Full number, "+919876543210". */
  phoneE164?: string;
  email?: string;
  city?: string;
  address?: string;
  /** Full URL, or empty / missing when the business has no website. */
  website?: string;
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
  /** Where the user was when they did this (set by field actions and the web). */
  location?: { lat?: number; lng?: number } | null;
  createdAt: string;
};

/**
 * A visit is saved as a note with the phone's GPS, its text starting with this marker
 * (no separate backend type yet). The web shows the marker as plain text.
 */
export const VISIT_PREFIX = 'Visit: ';

export const isVisit = (a: { eventType: string; metadata?: Record<string, unknown> | null }) =>
  a.eventType === 'NOTE_ADDED' && typeof a.metadata?.note === 'string' && a.metadata.note.startsWith(VISIT_PREFIX);

/** Google Maps link for an activity's location, or null when it has none. */
export function mapUrl(loc?: { lat?: number; lng?: number } | null) {
  if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') return null;
  return `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
}

export type LeadDetails = { lead: Lead; activities: Activity[]; allowedNextStatuses: LeadStatus[] };
export type LeadPage = { data: Lead[]; total: number };

export const STATUS_LABEL: Record<LeadStatus, string> = {
  FRESH: 'Fresh',
  CONTACTED: 'Contacted',
  NO_RESPONSE: 'No response',
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
  NO_RESPONSE: 'Tried to reach them, no answer yet',
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

/** Leads loaded per request on the Leads screen (infinite scroll). */
export const PAGE_SIZE = 50;

/** Employees: GET /leads/my. Admin: GET /leads/all (every assigned lead). `pool`: GET /leads/pool (unassigned). */
export function fetchLeads(opts: { admin: boolean; pool?: boolean; page: number; search?: string; status?: LeadStatus; priority?: LeadPriority }) {
  const path = opts.pool ? '/leads/pool' : opts.admin ? '/leads/all' : '/leads/my';
  return api<LeadPage>(path, {
    query: { page: opts.page, limit: PAGE_SIZE, search: opts.search?.trim(), status: opts.status, priority: opts.priority },
  });
}

/**
 * Every lead of the list (same scope as fetchLeads), read in pages of 100 (capped at 3,000).
 * The leads screen filters by several statuses / priorities / cities at once, which the API cannot do.
 */
export async function fetchAllLeads(opts: { admin: boolean; pool?: boolean; search?: string }): Promise<Lead[]> {
  const path = opts.pool ? '/leads/pool' : opts.admin ? '/leads/all' : '/leads/my';
  const all: Lead[] = [];
  for (let page = 1; page <= 30; page++) {
    const res = await api<LeadPage>(path, { query: { page, limit: 100, search: opts.search?.trim() } });
    all.push(...res.data);
    if (all.length >= res.total || res.data.length === 0) break;
  }
  return all;
}

/**
 * Open leads that have a scheduled follow-up (nextActionDate) (employees: /leads/my, admin: /leads/all).
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

/** Admin: number of assigned leads (/leads/all), optionally in one status. */
export async function countAllLeads(status?: LeadStatus) {
  const res = await api<LeadPage>('/leads/all', { query: { page: 1, limit: 1, status } });
  return res.total;
}

/** Number of unassigned leads waiting in the pool. */
export async function countPoolLeads() {
  const res = await api<LeadPage>('/leads/pool', { query: { page: 1, limit: 1 } });
  return res.total;
}

export function fetchLead(id: string) {
  return api<LeadDetails>(`/leads/${id}`);
}

export type LeadInput = {
  companyName: string;
  contactName: string;
  mobile?: string;
  /** Calling code of the mobile number, default "91". Only sent together with a mobile. */
  countryCode?: string;
  email?: string;
  city: string;
  category: string;
  address?: string;
  website?: string;
};

// Empty optional strings must be omitted: the backend validates email/mobile format when present.
function clean(input: LeadInput) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    const t = (v ?? '').trim();
    if (t) out[k] = t;
  }
  // The backend rejects a country code without a number.
  if (!out.mobile) delete out.countryCode;
  return out;
}

/** Field lead: GPS is captured here (business rule: only at lead creation and Log Visit). */
export async function createLead(input: LeadInput) {
  const location = await getLocation();
  return api<Lead>('/leads', { method: 'POST', body: { ...clean(input), source: 'Field', location } });
}

// No GPS on the calls below — the backend no longer needs it and the business rule says not to capture it.

export function updateLead(id: string, input: LeadInput) {
  // clean() drops empty strings, but an empty website must be sent so a removed website is cleared.
  return api<{ lead: Lead }>(`/leads/${id}`, { method: 'PATCH', body: { ...clean(input), website: (input.website ?? '').trim() } });
}

/** Takes a pool lead: an empty PATCH assigns an unassigned lead to the caller (and logs "Assigned"). Fails if someone claimed it first. */
export function claimLead(id: string) {
  return api<{ lead: Lead }>(`/leads/${id}`, { method: 'PATCH', body: {} });
}

export function addNote(id: string, note: string) {
  return api(`/leads/${id}/notes`, { method: 'POST', body: { note: note.trim() } });
}

/** "Call back on…" — FRESH becomes CONTACTED; never moves to FOLLOW_UP. */
/** Field sales: a note tagged as a visit, with the phone's current GPS (throws a readable error if unavailable). */
export async function logVisit(id: string, note: string) {
  const location = await getLocation();
  return api(`/leads/${id}/notes`, { method: 'POST', body: { note: `${VISIT_PREFIX}${note.trim()}`, location } });
}

export function setNextAction(id: string, date: Date, note?: string) {
  const body: Record<string, unknown> = { date: date.toISOString() };
  if (note?.trim()) body.note = note.trim();
  return api(`/leads/${id}/next-action`, { method: 'POST', body });
}

/** Every status move. Backend enforces the rules and returns a readable 422 message if not allowed. */
/** DEAL_CLOSED also sends the deal (services, due date, notes, advance) — see lib/deal.ts dealPayload. */
export function changeStatus(id: string, input: { status: LeadStatus; reason?: string } & Partial<ReturnType<typeof dealPayload>>) {
  return api<{ lead: Lead; customerId?: string }>(`/leads/${id}/status`, { method: 'PATCH', body: input });
}

/**
 * Admin: POST /leads/bulk-reassign. Gives the leads to an employee, or to nobody (`newAssigneeId` null), which moves them
 * to the lead pool. Returns how many were changed.
 */
export function reassignLeads(leadIds: string[], newAssigneeId: string | null) {
  return api<{ count: number }>('/leads/bulk-reassign', { method: 'POST', body: { leadIds, newAssigneeId } });
}

/** The roles a candidate can be interested in (same list as the web Candidates form). */
export const CANDIDATE_ROLES = ['Developer', 'Designer', 'Marketer', 'Telecaller', 'Sales', 'Content', 'Other'] as const;

export type MoveToCandidatesResult = { moved: { leadId: string; candidateId: string }[]; skipped: { leadId: string; name: string; reason: string }[] };

/**
 * Admin, Lead Pool leads who are really job seekers: POST /candidates/from-leads. Each lead becomes a candidate with the chosen role and
 * is deleted from Leads; a lead that has sales work on it is refused, and comes back in `skipped` with the reason.
 */
export async function moveLeadsToCandidates(leadIds: string[], roleCategory: string): Promise<MoveToCandidatesResult> {
  const result: MoveToCandidatesResult = { moved: [], skipped: [] };
  // The server takes at most 200 leads in one request ("Select all" can pick more).
  for (let i = 0; i < leadIds.length; i += 200) {
    const part = await api<MoveToCandidatesResult>('/candidates/from-leads', { method: 'POST', body: { leadIds: leadIds.slice(i, i + 200), roleCategory } });
    result.moved.push(...part.moved);
    result.skipped.push(...part.skipped);
  }
  return result;
}

export function titleCase(s?: string) {
  return (s ?? '').replace(/\b\w/g, (c) => c.toUpperCase());
}
