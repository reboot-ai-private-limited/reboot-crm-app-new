import { IconName } from '@/components/ui/Icon';
import { Activity, LeadPriority, LeadStatus, statusLabel } from '@/lib/leads';
import { ColorName } from '@/theme';

export const STATUS_TONE: Record<LeadStatus, [ColorName, ColorName]> = {
  FRESH: ['primary', 'primarySoft'],
  CONTACTED: ['purple', 'purpleSoft'],
  MEETING: ['warning', 'warningSoft'],
  FOLLOW_UP: ['warning', 'warningSoft'],
  PROPOSAL: ['purple', 'purpleSoft'],
  DEAL_CLOSED: ['success', 'successSoft'],
  NOT_INTERESTED: ['slate', 'slateSoft'],
  INVALID: ['danger', 'dangerSoft'],
};

export const PRIORITY_TONE: Record<LeadPriority, [ColorName, ColorName]> = {
  HOT: ['danger', 'dangerSoft'],
  WARM: ['warning', 'warningSoft'],
  COLD: ['slate', 'slateSoft'],
};

export const statusTone = (s?: string): [ColorName, ColorName] => (s && s in STATUS_TONE ? STATUS_TONE[s as LeadStatus] : ['slate', 'slateSoft']);

const EVENT: Record<string, { label: string; icon: IconName; tone: ColorName }> = {
  CREATED: { label: 'Lead created', icon: 'plus', tone: 'primary' },
  ASSIGNED: { label: 'Assigned', icon: 'user', tone: 'primary' },
  UNASSIGNED: { label: 'Moved to lead pool', icon: 'userx', tone: 'slate' },
  REASSIGNED: { label: 'Reassigned', icon: 'users', tone: 'primary' },
  NOTE_ADDED: { label: 'Note added', icon: 'edit', tone: 'purple' },
  FOLLOW_UP_SCHEDULED: { label: 'Next action set', icon: 'clock', tone: 'warning' },
  MARKED_LOST: { label: 'Marked as lost', icon: 'x', tone: 'slate' },
  MARKED_INVALID: { label: 'Marked as invalid', icon: 'alert', tone: 'danger' },
  STATUS_CHANGED: { label: 'Status changed', icon: 'refresh', tone: 'primary' },
  DETAILS_UPDATED: { label: 'Details updated', icon: 'edit', tone: 'slate' },
  PROPOSAL_GENERATED: { label: 'Proposal generated', icon: 'file', tone: 'purple' },
  PROPOSAL_EDITED: { label: 'Proposal edited', icon: 'file', tone: 'purple' },
  PROPOSAL_SENT: { label: 'Proposal sent', icon: 'send', tone: 'purple' },
};

export function eventMeta(type: string) {
  return EVENT[type] ?? { label: type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), icon: 'check' as IconName, tone: 'slate' as ColorName };
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** One-line detail under the activity title, from its metadata. */
export function eventDetail(a: Activity): string | undefined {
  const m = a.metadata ?? {};
  switch (a.eventType) {
    case 'NOTE_ADDED':
      return str(m.note);
    case 'FOLLOW_UP_SCHEDULED': {
      const d = str(m.followUpDate) ? new Date(m.followUpDate as string) : null;
      const when = d && !isNaN(d.getTime()) ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
      return [when && `For ${when}`, str(m.note)].filter(Boolean).join(' · ') || undefined;
    }
    case 'STATUS_CHANGED': {
      const move = m.newStatus ? `${statusLabel(str(m.oldStatus)) || '—'} → ${statusLabel(str(m.newStatus))}` : '';
      const value = typeof m.dealValue === 'number' ? `₹${m.dealValue.toLocaleString('en-IN')}` : '';
      return [move, value, str(m.reason)].filter(Boolean).join(' · ') || undefined;
    }
    case 'MARKED_LOST':
    case 'MARKED_INVALID':
      return str(m.reason);
    case 'DETAILS_UPDATED':
      return Array.isArray(m.updatedFields) ? `Changed: ${(m.updatedFields as string[]).join(', ')}` : undefined;
    default:
      return undefined;
  }
}

export function timeAgo(iso: string) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
