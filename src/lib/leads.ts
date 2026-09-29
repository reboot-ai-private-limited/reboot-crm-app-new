import { api } from './api';
import { getLocation } from './location';

// Mirrors backend ILead (backend/src/modules/lead/infrastructure/lead.model.ts).
// Statuses are the CURRENT backend ones; they change when the lead lifecycle rework lands.
export type LeadStatus = 'NEW' | 'FOLLOW_UP' | 'PROPOSAL_GENERATED' | 'CONVERTED' | 'LOST' | 'INVALID_DATA';

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
  nextFollowUpDate?: string | null;
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

export type LeadPage = { data: Lead[]; total: number };

export const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'New',
  FOLLOW_UP: 'Follow-up',
  PROPOSAL_GENERATED: 'Proposal',
  CONVERTED: 'Converted',
  LOST: 'Lost',
  INVALID_DATA: 'Invalid',
};

export const PAGE_SIZE = 20;

/** Employees: GET /leads/my. Admin: GET /leads/all (every assigned lead). */
export function fetchLeads(opts: { admin: boolean; page: number; search?: string; status?: LeadStatus }) {
  return api<LeadPage>(opts.admin ? '/leads/all' : '/leads/my', {
    // page and limit are always sent: the backend rejects the request if they are missing.
    query: { page: opts.page, limit: PAGE_SIZE, search: opts.search?.trim(), status: opts.status },
  });
}

export function fetchLead(id: string) {
  return api<{ lead: Lead; activities: Activity[] }>(`/leads/${id}`);
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

export async function createLead(input: LeadInput) {
  const location = await getLocation();
  return api<Lead>('/leads', { method: 'POST', body: { ...clean(input), source: 'Manual', location } });
}

export async function updateLead(id: string, input: LeadInput) {
  const location = await getLocation();
  return api<Lead>(`/leads/${id}`, { method: 'PATCH', body: { ...clean(input), location } });
}

export async function addNote(id: string, note: string) {
  const location = await getLocation();
  return api(`/leads/${id}/notes`, { method: 'POST', body: { note: note.trim(), location } });
}

export async function scheduleFollowUp(id: string, date: Date, note?: string) {
  const location = await getLocation();
  const body: Record<string, unknown> = { followUpDate: date.toISOString(), location };
  if (note?.trim()) body.note = note.trim();
  return api(`/leads/${id}/actions/follow-up`, { method: 'POST', body });
}

export async function markLost(id: string, reason: string) {
  const location = await getLocation();
  return api(`/leads/${id}/actions/lost`, { method: 'POST', body: { reason: reason.trim(), location } });
}

export async function markInvalid(id: string, reason: string) {
  const location = await getLocation();
  return api(`/leads/${id}/actions/invalid`, { method: 'POST', body: { reason: reason.trim(), location } });
}

export function titleCase(s?: string) {
  return (s ?? '').replace(/\b\w/g, (c) => c.toUpperCase());
}
