import { api } from './api';
import type { PaymentMethod } from './deal';
import { getLocation } from './location';

const PAGE_SIZE = 20;

export type CustomerRow = {
  _id: string;
  contactName: string;
  businessName: string;
  mobile?: string;
  countryCode?: string;
  phoneE164?: string;
  email?: string;
  city?: string;
  category?: string;
  joinedDate?: string;
  assignedRM?: { _id: string; fullName?: string; firstName?: string; lastName?: string } | null;
  totalPaid: number;
  totalReceivable: number;
  services: { name: string; expiryDate?: string | null }[];
};

export type CustomerPage = { data: CustomerRow[]; total: number };

export type InvoiceStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED' | 'OVERDUE';

export type CustomerDetails = {
  customer: {
    _id: string;
    contactName: string;
    businessName: string;
    mobile?: string;
    countryCode?: string;
    phoneE164?: string;
    email?: string;
    city?: string;
    address?: string;
    category?: string;
    joinedDate?: string;
    /** The lead this customer was converted from. */
    leadId?: string | null;
    isActive: boolean;
  };
  services: {
    _id: string;
    serviceNameSnapshot: string;
    agreedPrice: number;
    taxType: 'GST_18' | 'NONE';
    startDate?: string;
    expiryDate?: string | null;
    status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  }[];
  invoices: {
    _id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    status: InvoiceStatus;
    dueDate?: string;
    customerServiceId?: { serviceNameSnapshot?: string } | null;
    /** Deal invoices: one line per service. */
    lines?: { serviceName: string; lineTotal: number }[];
  }[];
};

/** Backend scopes the list itself: employees only get their own customers, Admin gets all. */
export function fetchCustomers(opts: { page: number; search?: string }) {
  return api<CustomerPage>('/customers', {
    query: { page: opts.page, limit: PAGE_SIZE, search: opts.search?.trim() },
  });
}

/**
 * Every customer matching the search, read in pages of 100 (capped at 3,000).
 * The customers screen filters by several employees at once, which the API cannot do.
 */
export async function fetchAllCustomers(opts: { search?: string }): Promise<CustomerRow[]> {
  const all: CustomerRow[] = [];
  for (let page = 1; page <= 30; page++) {
    const res = await api<CustomerPage>('/customers', { query: { page, limit: 100, search: opts.search?.trim() } });
    all.push(...res.data);
    if (all.length >= res.total || res.data.length === 0) break;
  }
  return all;
}

/** Display name of the employee a customer belongs to. */
export function rmName(rm: CustomerRow['assignedRM']) {
  if (!rm) return '';
  return rm.fullName || [rm.firstName, rm.lastName].filter(Boolean).join(' ') || 'Unknown user';
}

export function fetchCustomer(id: string) {
  return api<CustomerDetails>(`/customers/${id}`);
}

/** Where the web app lives (same setting the proposal links use). */
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/+$/, '');

export type InvoiceChannel = 'WHATSAPP' | 'COPY_LINK';

/**
 * POST /invoices/:id/send — creates the public link on first use and logs the send.
 * WHATSAPP also messages the customer through WABridge. Returns the link the customer sees
 * (Proforma with the number hidden until fully paid, then the Billing invoice).
 */
export async function sendInvoice(id: string, channel: InvoiceChannel) {
  const { publicToken } = await api<{ publicToken: string }>(`/invoices/${id}/send`, { method: 'POST', body: { deliveryChannel: channel } });
  if (!WEB_URL) throw new Error('Invoice links need EXPO_PUBLIC_WEB_URL in the app settings.');
  return `${WEB_URL}/public/invoice/${publicToken}`;
}

// --- Edit customer, add a service, record a payment (the same three actions as the web Customer page) -------------------
// The backend needs the phone's GPS position with each of them, like the web does.

export type CustomerEdit = { contactName: string; businessName: string; mobile: string; email: string };

/** PATCH /customers/:id. Employees can only change their own customers; the backend says so if not. */
export async function updateCustomer(id: string, input: CustomerEdit) {
  const location = await getLocation();
  return api(`/customers/${id}`, {
    method: 'PATCH',
    body: { contactName: input.contactName.trim(), businessName: input.businessName.trim(), mobile: input.mobile.trim(), email: input.email.trim(), location },
  });
}

export type ServiceAttach = { serviceId: string; agreedPrice: number; discount: number; taxType: 'NONE' | 'GST_18'; expiryDate: Date | null };

/** POST /customers/:id/services. The backend creates the invoice for it a moment later. */
export async function attachService(customerId: string, input: ServiceAttach) {
  const location = await getLocation();
  return api(`/customers/${customerId}/services`, {
    method: 'POST',
    body: {
      serviceId: input.serviceId,
      agreedPrice: input.agreedPrice,
      ...(input.discount > 0 ? { discount: input.discount } : {}),
      taxType: input.taxType,
      ...(input.expiryDate ? { expiryDate: input.expiryDate.toISOString() } : {}),
      location,
    },
  });
}

export type PaymentRecord = { amount: number; method: PaymentMethod; referenceId: string };

/** POST /invoices/:id/payments. Manual payments only (no gateway). */
export async function recordPayment(invoiceId: string, input: PaymentRecord) {
  const location = await getLocation();
  return api(`/invoices/${invoiceId}/payments`, {
    method: 'POST',
    body: { amount: input.amount, method: input.method, ...(input.referenceId.trim() ? { referenceId: input.referenceId.trim() } : {}), location },
  });
}

export const rupees = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`;

export function shortDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
