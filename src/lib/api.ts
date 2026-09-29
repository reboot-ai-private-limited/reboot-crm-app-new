import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export const TOKEN_KEYS = { access: 'accessToken', refresh: 'refreshToken' } as const;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Init = { method?: string; body?: unknown; auth?: boolean; query?: Record<string, string | number | undefined> };

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

  try {
    return await fetch(`${BASE_URL}${path}${qs}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(`Cannot reach the server at ${BASE_URL}. Is the backend running and on the same Wi-Fi?`, 0);
  }
}

// Refresh tokens are single-use on the backend, so share one in-flight refresh between callers.
let refreshing: Promise<boolean> | null = null;
function refreshTokens() {
  refreshing ??= (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(TOKEN_KEYS.refresh);
      if (!refreshToken) return false;
      const res = await send('/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false });
      if (!res.ok) return false;
      const json = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
      await SecureStore.setItemAsync(TOKEN_KEYS.access, json.data.accessToken);
      await SecureStore.setItemAsync(TOKEN_KEYS.refresh, json.data.refreshToken);
      return true;
    } catch {
      return false;
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
    if (await refreshTokens()) res = await send(path, init);
    else {
      onSessionExpired();
      throw new ApiError('Session expired. Please log in again.', 401);
    }
  }

  const json = (await res.json().catch(() => null)) as { message?: string; data?: T } | null;
  if (!res.ok) throw new ApiError(json?.message ?? `Request failed (${res.status})`, res.status);
  return json?.data as T;
}
