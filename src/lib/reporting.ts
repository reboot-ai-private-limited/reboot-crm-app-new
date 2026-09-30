import { api } from './api';

/**
 * One employee's row from GET /reporting/dashboard-table. Counts cover the requested date range:
 * totalLeads = leads assigned/taken, proposals = proposals sent, dealsClosed = moves to Deal closed.
 * Target figures are the monthly target of the range's start month.
 */
export type DashboardRow = {
  employeeId: string;
  employeeName: string;
  role: 'Admin' | 'BusinessAdvisor' | 'FieldSales';
  mobile: string;
  status: string;
  firstActivity: string | null;
  lastActivity: string | null;
  attendanceText: string;
  totalLeads: number;
  proposals: number;
  meetings: number;
  followUps: number;
  dealsClosed: number;
  targetRevenue: number;
  achievedAmount: number;
  collectionAmount: number;
};

export const ROLE_LABEL: Record<string, string> = { Admin: 'Admin', BusinessAdvisor: 'Business Advisor', FieldSales: 'Field Sales' };

export const RANGES =['This month', 'Last 7 days', 'Last 30 days', 'Last month'] as const;
export type Range = (typeof RANGES)[number];

/** Start/end dates of a period. `targetMonth` is the month whose targets the period is judged against. */
export function rangeDates(r: Range) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysAgo = (n: number) => new Date(y, m, now.getDate() - n);
  switch (r) {
    case 'Last 7 days':
      return { start: daysAgo(6), end: now, targetMonth: 'this' as const };
    case 'Last 30 days':
      return { start: daysAgo(29), end: now, targetMonth: 'this' as const };
    case 'Last month':
      return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0), targetMonth: 'last' as const };
    default:
      return { start: new Date(y, m, 1), end: now, targetMonth: 'this' as const };
  }
}

/** A day of GET /reporting/attendance/:employeeId (only days with activity exist). */
export type AttendanceDay = { _id: string; date: string; firstActivityAt?: string; lastActivityAt?: string };

/** Days the employee was active in a month (1–12). */
export function fetchAttendance(employeeId: string, year: number, month: number) {
  return api<AttendanceDay[]>(`/reporting/attendance/${employeeId}`, { query: { year, month } });
}

/** One activity-log entry done by the employee; `entityId` is the populated lead/customer/invoice. */
export type EmployeeActivity = {
  _id: string;
  eventType: string;
  entityType: 'Lead' | 'Customer' | 'Invoice';
  entityId?: { _id: string; companyName?: string; contactName?: string; invoiceNumber?: string } | null;
  metadata?: Record<string, unknown> | null;
  location?: { lat?: number; lng?: number } | null;
  createdAt: string;
};

/** Everything the employee did on one day. */
export function fetchEmployeeActivities(employeeId: string, day: Date) {
  return api<EmployeeActivity[]>(`/reporting/attendance/${employeeId}/activities`, { query: { date: ymd(day) } });
}

/** Hours between first and last activity of a day. The backend counts > 4 h as a full day, otherwise half. */
export function attendanceHours(d: AttendanceDay) {
  if (!d.firstActivityAt || !d.lastActivityAt) return 0;
  return (new Date(d.lastActivityAt).getTime() - new Date(d.firstActivityAt).getTime()) / 3_600_000;
}

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function fetchDashboardRows(start: Date, end: Date) {
  return api<DashboardRow[]>('/reporting/dashboard-table', { query: { startDate: ymd(start), endDate: ymd(end) } });
}

/** 1st of the current month → today. */
export function fetchMonthRows() {
  const now = new Date();
  return fetchDashboardRows(new Date(now.getFullYear(), now.getMonth(), 1), now);
}

/**
 * This month so far for the signed-in employee, matched by mobile number.
 * Null when there is no matching row.
 */
export async function fetchMyMonth(mobile: string): Promise<DashboardRow | null> {
  const rows = await fetchMonthRows();
  return rows.find((r) => r.mobile === mobile) ?? null;
}
