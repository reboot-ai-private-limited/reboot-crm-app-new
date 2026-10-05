import { isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js';

import { COUNTRIES } from '@/constants/countries';

// Phone numbers from any country. A lead stores the national number (`mobile`), the calling code (`countryCode`,
// "91") and the full number (`phoneE164`). Leads saved before country codes have only `mobile` and are Indian.
// The backend does the final check (backend/src/shared/phone/phone.ts); this only helps the form.

export const DEFAULT_CALLING_CODE = '91';

type PhoneLike = { mobile?: string | null; countryCode?: string | null; phoneE164?: string | null };

/** "🇮🇳 India (+91)": the label shown in the country picker. */
const flagOf = (iso: string) => [...iso].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join('');
export const countryLabel = (c: readonly [string, string, string]) => `${flagOf(c[0])} ${c[1]} (+${c[2]})`;

export const COUNTRY_LABELS: readonly string[] = COUNTRIES.map(countryLabel);

/** The picker label for a calling code ("91" -> "🇮🇳 India (+91)"). The first country of a shared code (+1) is used. */
export function labelForCode(code?: string | null): string {
  const c = COUNTRIES.find((x) => x[2] === (code || DEFAULT_CALLING_CODE));
  return countryLabel(c ?? COUNTRIES[0]);
}

/** The calling code behind a picker label ("🇦🇪 United Arab Emirates (+971)" -> "971"). */
export function codeForLabel(label: string): string {
  const match = /\(\+(\d+)\)\s*$/.exec(label);
  return match ? match[1] : DEFAULT_CALLING_CODE;
}

/** Is this national number valid for the calling code? India keeps the rule the CRM always had: exactly 10 digits. */
export function isValidNumber(callingCode: string, national: string): boolean {
  const digits = national.replace(/\D/g, '');
  if (!digits) return false;
  if (callingCode === DEFAULT_CALLING_CODE) return /^\d{10}$/.test(digits);
  const parsed = parsePhoneNumberFromString(`+${callingCode}${digits}`);
  return !!parsed && parsed.countryCallingCode === callingCode && isValidPhoneNumber(`+${callingCode}${digits}`);
}

/** "+91 98765 43210" for display. Works for a record that predates country codes (Indian, `mobile` only). */
export function formatPhone(entity: PhoneLike): string {
  const full = entity.phoneE164 ?? (entity.mobile ? `+${entity.countryCode || DEFAULT_CALLING_CODE}${entity.mobile.replace(/\D/g, '')}` : '');
  if (!full) return '';
  return parsePhoneNumberFromString(full)?.formatInternational() ?? full;
}

/** Digits for a call (tel:+...) or WhatsApp (wa.me/...) link. */
export function dialDigits(entity: PhoneLike): string {
  if (entity.phoneE164) return entity.phoneE164.replace(/\D/g, '');
  return `${entity.countryCode || DEFAULT_CALLING_CODE}${(entity.mobile ?? '').replace(/\D/g, '')}`;
}
