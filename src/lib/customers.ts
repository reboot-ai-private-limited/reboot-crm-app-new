import { api } from './api';

const PAGE_SIZE = 20;

export type CustomerRow = {
  _id: string;
  contactName: string;
  businessName: string;
  mobile?: string;
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
    email?: string;
    city?: string;
    address?: string;
    category?: string;
    joinedDate?: string;
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
  }[];
};

/** Backend scopes the list itself: employees only get their own customers, Admin gets all. */
export function fetchCustomers(opts: { page: number; search?: string }) {
  return api<CustomerPage>('/customers', {
    query: { page: opts.page, limit: PAGE_SIZE, search: opts.search?.trim() },
  });
}

export function fetchCustomer(id: string) {
  return api<CustomerDetails>(`/customers/${id}`);
}

export const rupees = (n?: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`;

export function shortDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
