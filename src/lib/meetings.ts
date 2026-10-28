import { ColorName } from '@/theme';
import { api } from './api';
import { getLocation } from './location';

export const MEETING_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'DONE', 'NOT_HAPPENED', 'CANCELLED'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  NOT_HAPPENED: 'Not attend',
  CANCELLED: 'Cancelled',
};

export const MEETING_STATUS_TONE: Record<MeetingStatus, [ColorName, ColorName]> = {
  SCHEDULED: ['primary', 'primarySoft'],
  IN_PROGRESS: ['warning', 'warningSoft'],
  DONE: ['success', 'successSoft'],
  NOT_HAPPENED: ['danger', 'dangerSoft'],
  CANCELLED: ['slate', 'slateSoft'],
};

export const meetingStatusTone = (s?: string): [ColorName, ColorName] =>
  s && s in MEETING_STATUS_TONE ? MEETING_STATUS_TONE[s as MeetingStatus] : ['slate', 'slateSoft'];

export const meetingStatusLabel = (s?: string) =>
  s && s in MEETING_STATUS_LABEL ? MEETING_STATUS_LABEL[s as MeetingStatus] : (s ?? '').replace(/_/g, ' ');

export type MeetingType = 'ONLINE' | 'OFFLINE';
export const isOfflineMeeting = (m: Pick<Meeting, 'type'>) => m.type === 'OFFLINE';

/** Google Maps search for the venue text. Nothing is stored; the Maps app opens it. */
export const venueMapUrl = (venue: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;

export const isActiveMeeting = (s: MeetingStatus) => s === 'SCHEDULED' || s === 'IN_PROGRESS';

export const DURATIONS = [15, 30, 45, 60, 90, 120] as const;

export type MeetingSession = { joinAt: string; leaveAt: string | null };

export type MeetingParticipant = {
  displayName: string;
  userType: 'SIGNED_IN' | 'ANONYMOUS' | 'PHONE';
  googleUserId?: string;
  email?: string;
  emailLookup?: 'FOUND' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
  isEmployee: boolean;
  employeeId?: string;
  totalSeconds: number;
  sessions: MeetingSession[];
};

export type MeetingTracking = {
  externalJoined: boolean;
  firstExternalJoinAt: string | null;
  employeeJoined: boolean;
  firstEmployeeJoinAt: string | null;
  conferenceStartAt: string | null;
  conferenceEndAt: string | null;
  participants: MeetingParticipant[];
  syncedAt: string | null;
  error?: string | null;
};

export type Meeting = {
  _id: string;
  leadId: string;
  hostEmployeeId: { _id: string; fullName: string; email?: string } | string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  durationMin: number;
  /** OFFLINE is a field meeting: a venue, no link, no attendance tracking. */
  type: MeetingType;
  venue?: string | null;
  /** null for an OFFLINE meeting: it never has a link. */
  meetLink: string | null;
  /** Where the employee was when they marked an OFFLINE meeting Done. */
  checkIn?: { lat: number; lng: number; at: string } | null;
  status: MeetingStatus;
  outcomeNote?: string | null;
  rescheduleCount: number;
  notify: boolean;
  linkSentAt?: string | null;
  employeeLinkSentAt?: string | null;
  reminderSentAt?: string | null;
  tracking: MeetingTracking;
  suggestedStatus: 'DONE' | 'NOT_HAPPENED' | null;
  lead?: {
    _id: string;
    companyName?: string;
    contactName?: string;
    mobile?: string;
    email?: string;
    city?: string;
  };
};

export const hostName = (m: Meeting) =>
  typeof m.hostEmployeeId === 'string' ? '' : m.hostEmployeeId?.fullName ?? '';

export const POLL_BEFORE_MIN = 60;
export const POLL_AFTER_MIN = 90;

export const shouldPoll = (meetings: Pick<Meeting, 'status' | 'startAt' | 'endAt'>[] | undefined, now = Date.now()) =>
  !!meetings?.some((m) => {
    const open = m.status === 'IN_PROGRESS' || (m.status === 'SCHEDULED' && new Date(m.startAt).getTime() < now + POLL_BEFORE_MIN * 60_000);
    return open && now <= new Date(m.endAt).getTime() + POLL_AFTER_MIN * 60_000;
  });

export const reminderState = (m: Pick<Meeting, 'notify' | 'linkSentAt' | 'reminderSentAt' | 'type'>): { text: string; ok?: boolean } => {
  if (!m.notify) return { text: 'Off' };
  if (!m.reminderSentAt) return { text: 'Pending', ok: false };
  const sentWithLink = !!m.linkSentAt && Math.abs(new Date(m.reminderSentAt).getTime() - new Date(m.linkSentAt).getTime()) < 60_000;
  // A field meeting has no link: its first message (time and place) is the reminder.
  return sentWithLink ? { text: m.type === 'OFFLINE' ? 'First message was the reminder' : 'Link was the reminder', ok: true } : { text: 'Sent', ok: true };
};

export const formatDuration = (seconds: number) => {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return '< 1 min';
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins} min`;
};

export type MeetingQueryOptions = {
  leadId?: string;
  mine?: boolean;
  hostEmployeeId?: string;
  from?: string;
  to?: string;
  status?: string;
  type?: MeetingType;
  limit?: number;
  page?: number;
};

// API functions - location is omitted on every meeting call, except marking a field (OFFLINE) meeting Done:
// there is no Meet attendance for it, so the employee's position at that moment is the only proof it took place.
export async function fetchMeetings(optionsOrLeadId?: string | MeetingQueryOptions): Promise<Meeting[]> {
  const query: Record<string, string | number | undefined> = {};
  if (typeof optionsOrLeadId === 'string') {
    query.leadId = optionsOrLeadId;
  } else if (optionsOrLeadId) {
    if (optionsOrLeadId.leadId) query.leadId = optionsOrLeadId.leadId;
    if (optionsOrLeadId.mine) query.mine = 'true';
    if (optionsOrLeadId.hostEmployeeId) query.hostEmployeeId = optionsOrLeadId.hostEmployeeId;
    if (optionsOrLeadId.from) query.from = optionsOrLeadId.from;
    if (optionsOrLeadId.to) query.to = optionsOrLeadId.to;
    if (optionsOrLeadId.status) query.status = optionsOrLeadId.status;
    if (optionsOrLeadId.type) query.type = optionsOrLeadId.type;
    if (optionsOrLeadId.limit) query.limit = optionsOrLeadId.limit;
    if (optionsOrLeadId.page) query.page = optionsOrLeadId.page;
  }
  const data = await api<Meeting[]>('/meetings', { query });
  return data ?? [];
}

export async function scheduleMeeting(input: {
  leadId: string;
  /** OFFLINE = a field meeting at `venue`: no Google event, no link. Default ONLINE. */
  type?: MeetingType;
  venue?: string;
  startAt: Date;
  durationMin?: number;
  title?: string;
  description?: string;
  hostEmployeeId?: string;
  notify?: boolean;
}): Promise<Meeting> {
  const body: Record<string, unknown> = {
    leadId: input.leadId,
    startAt: input.startAt.toISOString(),
    durationMin: input.durationMin ?? 30,
    notify: input.notify !== false,
  };
  if (input.type === 'OFFLINE') {
    body.type = 'OFFLINE';
    body.venue = input.venue?.trim();
  }
  if (input.title?.trim()) body.title = input.title.trim();
  if (input.description?.trim()) body.description = input.description.trim();
  if (input.hostEmployeeId) body.hostEmployeeId = input.hostEmployeeId;
  return api<Meeting>('/meetings', { method: 'POST', body });
}

export async function rescheduleMeeting(id: string, input: { startAt: Date; durationMin?: number; venue?: string }): Promise<Meeting> {
  const body: Record<string, unknown> = {
    startAt: input.startAt.toISOString(),
  };
  if (input.durationMin) body.durationMin = input.durationMin;
  if (input.venue?.trim()) body.venue = input.venue.trim();
  return api<Meeting>(`/meetings/${id}/reschedule`, { method: 'PATCH', body });
}

export async function cancelMeeting(id: string, reason?: string): Promise<Meeting> {
  const body: Record<string, unknown> = {};
  if (reason?.trim()) body.reason = reason.trim();
  return api<Meeting>(`/meetings/${id}/cancel`, { method: 'POST', body });
}

export async function markMeetingStatus(
  id: string,
  input: { status: 'DONE' | 'NOT_HAPPENED'; note?: string; /** Field meeting being marked Done: attach the GPS position. */ withLocation?: boolean },
): Promise<Meeting> {
  const body: Record<string, unknown> = {
    status: input.status,
  };
  if (input.note?.trim()) body.note = input.note.trim();
  if (input.withLocation) body.location = await getLocation();
  return api<Meeting>(`/meetings/${id}/status`, { method: 'POST', body });
}

export async function syncMeeting(id: string): Promise<Meeting> {
  return api<Meeting>(`/meetings/${id}/sync`, { method: 'POST' });
}

/** The signed-in employee's own id (the stored session only keeps name, mobile and role). */
export async function fetchMyEmployeeId(): Promise<string> {
  const me = await api<{ id?: string; _id?: string }>('/employees/me');
  const id = me.id ?? me._id;
  if (!id) throw new Error('Could not read your employee profile. Please try again.');
  return id;
}

/**
 * Remember a participant's Google account as an employee, so every meeting (past and future) counts them as team.
 * Admins can link anyone; other roles can only link themselves.
 */
export async function linkParticipant(meetingId: string, input: { googleUserId: string; employeeId: string }): Promise<Meeting> {
  return api<Meeting>(`/meetings/${meetingId}/participants/link`, { method: 'POST', body: input });
}
