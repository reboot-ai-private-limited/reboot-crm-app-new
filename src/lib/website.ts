// A lead's website is stored as a full http(s) URL, or empty / missing when the business has none.
// The backend normalises what is typed ("example.com" becomes "https://example.com"); this only checks
// the text early so the form can say what is wrong, and formats it for display.

/** True when the text is empty (no website) or looks like a web address the backend will accept. */
export function isValidWebsite(input: string): boolean {
  const text = input.trim();
  if (!text) return true;
  if (/\s/.test(text)) return false;
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)/i.exec(text);
  if (match && !/^https?$/i.test(match[1])) return false;
  const authority = match ? match[2] : text.split(/[/?#]/)[0];
  if (authority.includes('@')) return false;
  const host = authority.replace(/:\d+$/, '');
  // At least two dot-separated parts, none empty ("example." and "example" are rejected).
  return /^[^\s./:@]+(\.[^\s./:@]+)+$/.test(host);
}

/** "https://www.example.com/about" shown as "www.example.com/about". */
export const websiteLabel = (url: string): string => url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
