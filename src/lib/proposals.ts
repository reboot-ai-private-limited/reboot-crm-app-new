import { api } from './api';
import { getLocation } from './location';

export type ProposalStatus = 'DRAFT' | 'GENERATED' | 'SENT' | 'ACCEPTED' | 'REJECTED';

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

export type ServiceOption = { _id: string; name: string; isActive?: boolean };

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

export function fetchServices() {
  return api<ServiceOption[]>('/services');
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
