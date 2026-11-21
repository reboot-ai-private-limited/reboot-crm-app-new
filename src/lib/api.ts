import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export const TOKEN_KEYS = { access: 'accessToken', refresh: 'refreshToken' } as const;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Error code from the backend, e.g. DUPLICATE_LEAD_MOBILE, INVALID_STATUS_TRANSITION. */
    public code?: string,
    /** Extra data from the backend error response (e.g. existingLead on a 409 duplicate). */
    public data?: unknown,
  ) {
    super(message);
  }
}

type Init = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  query?: Record<string, string | number | undefined>;
  /** How long to wait for the server before giving up. Default REQUEST_TIMEOUT_MS. */
  timeoutMs?: number;
};

const REQUEST_TIMEOUT_MS = 30_000;

// Called when the session can't be refreshed; AuthProvider sets it to sign the user out.
let onSessionExpired: () => void = () => {};
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

async function send(path: string, init: Init) {
  if (!BASE_URL) throw new ApiError('EXPO_PUBLIC_API_URL is not set', 0);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Tells the backend to return tokens in the body instead of cookies.
    'x-client-type': 'mobile',
  };
  if (init.auth !== false) {
    const token = await SecureStore.getItemAsync(TOKEN_KEYS.access);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const qs = init.query
    ? '?' +
      Object.entries(init.query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';

  // A request on a bad network must fail with a message instead of leaving a spinner on screen forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${BASE_URL}${path}${qs}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      controller.signal.aborted
        ? 'The server is taking too long to respond. Check your internet connection and try again.'
        : 'Cannot connect to the server. Check your internet connection and try again.',
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** ok: new tokens saved. rejected: the server refused the refresh token (log out). failed: no network or a server error (stay signed in). */
type RefreshResult = 'ok' | 'rejected' | 'failed';

// Refresh tokens are single-use on the backend, so share one in-flight refresh between callers.
let refreshing: Promise<RefreshResult> | null = null;
function refreshTokens() {
  refreshing ??= (async (): Promise<RefreshResult> => {
    try {
      const refreshToken = await SecureStore.getItemAsync(TOKEN_KEYS.refresh);
      if (!refreshToken) return 'rejected';
      const res = await send('/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false });
      // Only a 4xx means the session is really over. A 5xx or a gateway error must not sign the person out.
      if (!res.ok) return res.status >= 400 && res.status < 500 ? 'rejected' : 'failed';
      const json = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
      await SecureStore.setItemAsync(TOKEN_KEYS.access, json.data.accessToken);
      await SecureStore.setItemAsync(TOKEN_KEYS.refresh, json.data.refreshToken);
      return 'ok';
    } catch {
      return 'failed';
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// Backend wraps every response as { success, message, data }.
export async function api<T>(path: string, init: Init = {}): Promise<T> {
  let res = await send(path, init);

  // Access token expired (1h): refresh once and retry.
  if (res.status === 401 && init.auth !== false) {
    const refreshed = await refreshTokens();
    if (refreshed === 'ok') res = await send(path, init);
    else if (refreshed === 'rejected') {
      onSessionExpired();
      throw new ApiError('Session expired. Please log in again.', 401);
    } else throw new ApiError('Cannot connect to the server. Check your internet connection and try again.', 0);
  }

  const json = (await res.json().catch(() => null)) as { message?: string; code?: string; data?: T } | null;
  if (!res.ok) throw new ApiError(json?.message ?? `Request failed (${res.status})`, res.status, json?.code, json?.data);
  return json?.data as T;
}
