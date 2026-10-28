import { api } from './api';

/**
 * Email an invoice or a proposal to the customer: the same backend call as the web's "Email this invoice / proposal"
 * (POST /email/invoices/:id/send, /email/proposals/:id/send). The email carries the link to the document; the backend checks
 * the address, the suppression list and that the sender may see the customer, and says why when it refuses.
 */
export type DocumentKind = 'invoice' | 'proposal';

export type DocumentEmailInput = { to: string; cc?: string[]; message?: string };

export async function emailDocument(kind: DocumentKind, id: string, input: DocumentEmailInput): Promise<{ duplicate?: boolean }> {
  return api<{ duplicate?: boolean }>(`/email/${kind}s/${id}/send`, {
    method: 'POST',
    body: {
      to: input.to.trim(),
      ...(input.cc?.length ? { cc: input.cc } : {}),
      ...(input.message?.trim() ? { message: input.message.trim() } : {}),
    },
  });
}

/** "a@x.com, b@y.com; c@z.com" -> ["a@x.com", "b@y.com", "c@z.com"]. */
export const splitAddresses = (text: string) => text.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
