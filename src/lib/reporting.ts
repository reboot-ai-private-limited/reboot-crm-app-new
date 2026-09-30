import { api } from './api';

/** One employee's row from GET /reporting/dashboard-table (counts are for the requested date range). */
export type DashboardRow = {
  employeeId: string;
  employeeName: string;
  mobile: string;
  totalLeads: number;
  proposals: number;
  meetings: number;
  followUps: number;
  dealsClosed: number;
  targetRevenue: number;
  achievedAmount: number;
  collectionAmount: number;
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * This month so far (1st → today) for the signed-in employee, matched by mobile number.
 * The target figures are the monthly target of the current month. Null when there is no matching row.
 */
export async function fetchMyMonth(mobile: string): Promise<DashboardRow | null> {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const rows = await api<DashboardRow[]>('/reporting/dashboard-table', { query: { startDate: ymd(first), endDate: ymd(now) } });
  return rows.find((r) => r.mobile === mobile) ?? null;
}
