import { ColorName } from '@/theme';

import { api } from './api';
import { getLocation } from './location';

export type ProposalStatus = 'DRAFT' | 'GENERATED' | 'SENT' | 'ACCEPTED' | 'REJECTED';

/** [text, background] colours of a status pill. */
export const PROPOSAL_STATUS_TONE: Record<ProposalStatus, [ColorName, ColorName]> = {
  DRAFT: ['slate', 'slateSoft'],
  GENERATED: ['primary', 'primarySoft'],
  SENT: ['purple', 'purpleSoft'],
  ACCEPTED: ['success', 'successSoft'],
  REJECTED: ['danger', 'dangerSoft'],
};

export type Proposal = {
  _id: string;
  status: ProposalStatus;
  version?: number;
  coverType?: string;
  aiContent: string;
  publicToken?: string;
  viewCount: number;
  lastViewedAt?: string | null;
  validUntil?: string | null;
  createdAt: string;
};

/** A Services Master entry; `price` / `defaultTaxType` pre-fill deal lines. */
export type ServiceOption = { _id: string; name: string; isActive?: boolean; price?: number; defaultTaxType?: 'NONE' | 'GST_18' };

export type ProposalSection = { serviceName: string; html: string };

/** Sentinel the backend understands: "no template, write it with AI from the remarks". */
export const OTHER_SERVICE = 'other';

/**
 * Where the public proposal page lives (the web app). Set EXPO_PUBLIC_WEB_URL to the deployed
 * frontend, e.g. https://crm.example.com. Without it the app can list proposals but not open or share them.
 */
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/+$/, '');

export function proposalUrl(token?: string, preview = false) {
  if (!WEB_URL || !token) return null;
  return `${WEB_URL}/public/proposal/${token}${preview ? '?preview=true' : ''}`;
}

export function fetchProposals(leadId: string) {
  return api<Proposal[]>(`/proposals/entity/${leadId}`);
}

type Named = { _id: string; companyName?: string; businessName?: string; contactName?: string; fullName?: string } | string | null;

/** A row of GET /proposals: no body (aiContent), with the lead/customer and sender populated. */
export type ProposalRow = Omit<Proposal, 'aiContent'> & {
  leadId?: Named;
  customerId?: Named;
  senderId?: Named;
  pricing?: { serviceName: string; price: number; frequency: string }[];
};

export type ProposalPage = { data: ProposalRow[]; meta: { total: number; page: number; limit: number; totalPages: number } };

/** Admin: every proposal; others: the ones they sent. Newest first. */
export function fetchAllProposals(opts: { page: number; status?: ProposalStatus; limit?: number }) {
  return api<ProposalPage>('/proposals', { query: { page: opts.page, limit: opts.limit ?? 20, status: opts.status } });
}

/** How many proposals there are in total, sent and accepted (Home card). */
export async function countProposals() {
  const count = (status?: ProposalStatus) => fetchAllProposals({ page: 1, limit: 1, status }).then((r) => r.meta.total);
  const [total, sent, accepted] = await Promise.all([count(), count('SENT'), count('ACCEPTED')]);
  return { total, sent, accepted };
}

/** "Acme Pvt Ltd" from a populated lead or customer; '' when not populated. */
export function proposalFor(p: ProposalRow) {
  const e = (p.leadId && typeof p.leadId === 'object' ? p.leadId : null) ?? (p.customerId && typeof p.customerId === 'object' ? p.customerId : null);
  return e ? e.companyName || e.businessName || e.contactName || '' : '';
}

export const proposalLeadId = (p: ProposalRow) => (typeof p.leadId === 'string' ? p.leadId : p.leadId?._id);

export const proposalSender = (p: ProposalRow) => (p.senderId && typeof p.senderId === 'object' ? p.senderId.fullName ?? '' : '');

/** Total of the price lines, or null when the proposal has none (prices usually live in the proposal text). */
export const proposalAmount = (p: ProposalRow) => (p.pricing?.length ? p.pricing.reduce((s, l) => s + (l.price || 0), 0) : null);

/** Active services only: inactive ones are hidden from every dropdown. */
export function fetchServices() {
  return api<ServiceOption[]>('/services', { query: { isActive: 'true' } });
}

type Generated = {
  aiContent?: string;
  sections?: ProposalSection[];
  content?: unknown;
};

/** Builds the proposal text from the chosen services (templates), or with AI when 'other' is picked. */
export async function generateProposal(input: {
  serviceIds: string[];
  category: string;
  businessName: string;
  location: string;
  remarks: string;
}): Promise<ProposalSection[]> {
  const res = await api<{ content?: Generated } & Generated>('/proposals/generate-ai', {
    method: 'POST',
    body: input,
  });
  // The endpoint wraps its result as { content: { aiContent, sections, ... } }.
  const data: Generated = res.content && typeof res.content === 'object' ? (res.content as Generated) : res;
  if (data.sections?.length) return data.sections;
  if (data.aiContent) return [{ serviceName: 'Proposal', html: data.aiContent }];
  throw new Error('No proposal content was generated. Pick a service that has a template, or choose Other and add remarks.');
}

/** Same page-break wrapping the web app uses, so the public page paginates the same way. */
function joinSections(sections: ProposalSection[]) {
  return sections
    .map((s, i) => (i === 0 ? s.html : `<div class="break-before-page pt-16">${s.html}</div>`))
    .join('\n');
}

export async function saveProposal(leadId: string, serviceIds: string[], sections: ProposalSection[]) {
  const location = await getLocation();
  return api<Proposal>('/proposals', {
    method: 'POST',
    body: {
      leadId,
      serviceIds: serviceIds.filter((id) => id !== OTHER_SERVICE),
      timeline: 'See Proposal Details',
      paymentTerms: 'See Proposal Details',
      aiContent: joinSections(sections),
      pricing: [],
      location,
    },
  });
}

/** Proposal HTML → readable plain text for the in-app preview. */
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
