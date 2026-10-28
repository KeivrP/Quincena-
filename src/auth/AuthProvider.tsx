import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onSessionExpired } from '../api/client';
import { authApi, appApi } from '../api/endpoints';
import { clearSession, loadSession, saveSession } from '../api/tokens';
import type { Profile } from '../api/types';
import { secureStorage } from '../lib/storage';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  profile: Profile | null;
  mustChangePassword: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  refreshProfile(): Promise<Profile | null>;
  passwordChanged(): Promise<void>;
}

const MUST_CHANGE_KEY = 'xc.mustChange';
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mustChangePassword, setMustChange] = useState(false);

  const refreshProfile = useCallback(async () => {
    const p = await appApi.profile();
    setProfile(p);
    return p;
  }, []);

  useEffect(() => {
    (async () => {
      const s = await loadSession();
      if (!s) return setStatus('signedOut');
      setMustChange((await secureStorage.get(MUST_CHANGE_KEY)) === '1');
      try {
        await refreshProfile();
        setStatus('signedIn');
      } catch {
        // Sin red al abrir: si hay sesión guardada seguimos; la pantalla mostrará el error.
        setStatus((await loadSession()) ? 'signedIn' : 'signedOut');
      }
    })();
  }, [refreshProfile]);

  useEffect(
    () =>
      onSessionExpired(() => {
        setProfile(null);
        setStatus('signedOut');
      }),
    [],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const pair = await authApi.login(email.trim().toLowerCase(), password);
      await saveSession(pair);
      // El login NO trae must_change_password; sale de /auth/me (CurrentUser).
      const me = await authApi.me();
      const must = me.must_change_password;
      await secureStorage.set(MUST_CHANGE_KEY, must ? '1' : '0');
      setMustChange(must);
      await refreshProfile();
      setStatus('signedIn');
    },
    [refreshProfile],
  );

  const signOut = useCallback(async () => {
    const s = await loadSession();
    try {
      if (s) await authApi.logout(s.refreshToken);
    } catch {
      // Cerramos localmente aunque el servidor no responda.
    }
    await clearSession();
    await secureStorage.remove(MUST_CHANGE_KEY);
    setProfile(null);
    setStatus('signedOut');
  }, []);

  const passwordChanged = useCallback(async () => {
    await secureStorage.set(MUST_CHANGE_KEY, '0');
    setMustChange(false);
    await refreshProfile();
  }, [refreshProfile]);

  const value = useMemo(
    () => ({ status, profile, mustChangePassword, signIn, signOut, refreshProfile, passwordChanged }),
    [status, profile, mustChangePassword, signIn, signOut, refreshProfile, passwordChanged],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuera de AuthProvider');
  return v;
}

/** Siguiente paso obligatorio del onboarding, o null si ya puede usar la app. */
export function nextOnboardingStep(profile: Profile | null, mustChange: boolean) {
  if (mustChange) return '/onboarding/change-password' as const;
  if (profile && !profile.credit_agreement_signed) return '/onboarding/contract' as const;
  if (profile && !profile.payout_registered) return '/onboarding/payout' as const;
  return null;
}
