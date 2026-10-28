import * as SecureStore from 'expo-secure-store';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, setSessionExpiredHandler, TOKEN_KEYS } from '@/lib/api';
import { unregisterPush } from '@/lib/push';

export type Role = 'Admin' | 'BusinessAdvisor' | 'FieldSales';

export type Session = { name: string; mobile: string; role: Role };

type AuthState = {
  status: 'loading' | 'out' | 'in';
  session: Session | null;
  pendingMobile: string | null;
  isAdmin: boolean;
  requestOtp: (mobile: string) => Promise<void>;
  verifyOtp: (otp: string) => Promise<void>;
  signOut: () => Promise<void>;
};

type Employee = { fullName: string; mobile: string; role: Role };

const SESSION_KEY = 'session';
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [pendingMobile, setPendingMobile] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([SecureStore.getItemAsync(SESSION_KEY), SecureStore.getItemAsync(TOKEN_KEYS.access)])
      .then(([raw, token]) => {
        if (raw && token) {
          setSession(JSON.parse(raw) as Session);
          setStatus('in');
        } else setStatus('out');
      })
      .catch(() => setStatus('out'));
  }, []);

  // POST /auth/send-otp — backend sends the code on WhatsApp.
  const requestOtp = useCallback(async (mobile: string) => {
    await api('/auth/send-otp', { method: 'POST', body: { mobile }, auth: false });
    setPendingMobile(mobile);
  }, []);

  // POST /auth/verify-otp → tokens, then GET /employees/me for name and role.
  const verifyOtp = useCallback(
    async (otp: string) => {
      if (!pendingMobile) throw new Error('Enter your mobile number first');
      const tokens = await api<{ accessToken: string; refreshToken: string }>('/auth/verify-otp', {
        method: 'POST',
        body: { mobile: pendingMobile, otp },
        auth: false,
      });
      await SecureStore.setItemAsync(TOKEN_KEYS.access, tokens.accessToken);
      await SecureStore.setItemAsync(TOKEN_KEYS.refresh, tokens.refreshToken);

      const me = await api<Employee>('/employees/me');
      const s: Session = { name: me.fullName, mobile: me.mobile, role: me.role };
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(s));
      setSession(s);
      setStatus('in');
    },
    [pendingMobile],
  );

  const signOut = useCallback(async () => {
    // First, while still signed in: stop this phone getting the person's pushes.
    await unregisterPush();
    const refreshToken = await SecureStore.getItemAsync(TOKEN_KEYS.refresh);
    await api('/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => undefined);
    await Promise.all([SESSION_KEY, TOKEN_KEYS.access, TOKEN_KEYS.refresh].map((k) => SecureStore.deleteItemAsync(k)));
    setSession(null);
    setPendingMobile(null);
    setStatus('out');
  }, []);

  // If a token refresh fails, drop the local session so the user lands on Login.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      Promise.all([SESSION_KEY, TOKEN_KEYS.access, TOKEN_KEYS.refresh].map((k) => SecureStore.deleteItemAsync(k))).finally(() => {
        setSession(null);
        setStatus('out');
      });
    });
  }, []);

  const value = useMemo(
    () => ({ status, session, pendingMobile, isAdmin: session?.role === 'Admin', requestOtp, verifyOtp, signOut }),
    [status, session, pendingMobile, requestOtp, verifyOtp, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
