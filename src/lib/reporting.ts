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

export const RANGES = ['Today', 'This month', 'Last 7 days', 'Last 30 days', 'Last month'] as const;
export type Range = (typeof RANGES)[number];

/** Start/end dates of a period. `targetMonth` is the month whose targets the period is judged against. */
export function rangeDates(r: Range) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysAgo = (n: number) => new Date(y, m, now.getDate() - n);
  switch (r) {
    case 'Today':
      return { start: now, end: now, targetMonth: 'this' as const };
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

export type EmployeeRole = 'Admin' | 'BusinessAdvisor' | 'FieldSales';

/** Employee list item from GET /employees (only what the Team screen needs). */
export type EmployeeOption = { id: string; fullName: string; role: EmployeeRole; status: string; mobile?: string };

/** Admin: every employee (GET /employees, up to 100). */
export async function fetchEmployees() {
  const res = await api<{ data: EmployeeOption[] }>('/employees', { query: { limit: 100 } });
  return res.data;
}

/**
 * Admin: POST /employees as a Draft. The app has only the basic details; the address, guardian, joining date and documents
 * are added on the web, where "Submit & create ID pass" activates the login. A draft cannot sign in.
 */
export function createEmployee(input: { fullName: string; mobile: string; email: string; role: EmployeeRole }) {
  return api<unknown>('/employees', { method: 'POST', body: { ...input, saveAsDraft: true } });
}

/** Employee statuses. Draft = saved but not submitted yet; Inactive and Terminated cannot sign in either. */
export type EmployeeStatus = 'Active' | 'Inactive' | 'Terminated' | 'Draft';
export const STATUS_TONE: Record<EmployeeStatus, 'success' | 'slate' | 'danger' | 'warning'> = { Active: 'success', Inactive: 'slate', Terminated: 'danger', Draft: 'warning' };
export const statusTone = (s?: string) => STATUS_TONE[(s as EmployeeStatus) ?? 'Inactive'] ?? 'slate';

/** One employee with the onboarding details (GET /employees/:id, Admin). */
export type EmployeeDetails = {
  id: string;
  fullName: string;
  mobile: string;
  email: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  alternateMobile?: string;
  addressLine1?: string;
  city?: string;
  pinCode?: string;
  state?: string;
  presentAddressSame?: boolean;
  presentAddress?: { line1?: string; city?: string; pinCode?: string; state?: string };
  guardianName?: string;
  guardianContact?: string;
  refPersonName?: string;
  refPersonContact?: string;
  joiningDate?: string | null;
  lastQualification?: string;
  documents?: { name: string; url: string; publicId: string; category?: string; isRaw?: boolean }[];
};

export function fetchEmployee(id: string) {
  return api<EmployeeDetails>(`/employees/${id}`);
}

/** Financial year (April–March) a month falls in, as the backend expects it: "2026-2027". */
export function financialYearOf(year: number, month: number) {
  const start = month < 4 ? year - 1 : year;
  return `${start}-${start + 1}`;
}

export type MonthlyTarget = { month: number; targetRevenue: number; achievedAmount: number; collectionAmount: number };

/** The saved target of one employee for a month (1–12), or null when none is set. */
export async function fetchTarget(employeeId: string, year: number, month: number): Promise<MonthlyTarget | null> {
  const targets = await api<MonthlyTarget[]>('/reporting/targets', { query: { employeeId, financialYear: financialYearOf(year, month) } });
  return targets.find((t) => t.month === month) ?? null;
}

/** Admin: POST /reporting/targets — creates or replaces the month's target. */
export function saveTarget(input: { employeeId: string; year: number; month: number; targetRevenue: number; achievedAmount: number; collectionAmount: number }) {
  return api<unknown>('/reporting/targets', {
    method: 'POST',
    body: {
      employeeId: input.employeeId,
      financialYear: financialYearOf(input.year, input.month),
      month: input.month,
      targetRevenue: input.targetRevenue,
      achievedAmount: input.achievedAmount,
      collectionAmount: input.collectionAmount,
    },
  });
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
