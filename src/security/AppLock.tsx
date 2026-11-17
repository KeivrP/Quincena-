import { Ionicons } from '@expo/vector-icons';
import * as ScreenCapture from 'expo-screen-capture';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Button, T, Wordmark } from '../components/ui';
import { colors, radius, space } from '../theme';
import { authenticateWithDevice, canUseDeviceLock } from './device';
import { onResume } from './inactivity';

const isNative = Platform.OS === 'android' || Platform.OS === 'ios';

/**
 * Sin capturas ni grabación de pantalla, y el contenido oculto en el selector de apps
 * (FLAG_SECURE en Android; difuminado en iOS). Toda la app maneja montos, cédula y datos de
 * cobro, así que va global. En desarrollo se deja capturar para poder documentar.
 */
function useScreenProtection() {
  useEffect(() => {
    if (!isNative || __DEV__) return;
    ScreenCapture.preventScreenCaptureAsync('app').catch(() => undefined);
    if (Platform.OS === 'ios') ScreenCapture.enableAppSwitcherProtectionAsync(0.9).catch(() => undefined);
  }, []);
}

/**
 * Bloqueo por inactividad: si la app estuvo en segundo plano más de un minuto (o se abre en
 * frío con la sesión guardada), se tapa todo y se pide la biometría o el PIN del equipo. Si el
 * equipo no tiene ninguno, pasados 5 minutos en segundo plano se cierra la sesión.
 */
export function AppLock() {
  useScreenProtection();
  const { status, signOut } = useAuth();
  const [locked, setLocked] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [failed, setFailed] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const evaluated = useRef(false);

  const evaluate = useCallback(async () => {
    if (!isNative || status !== 'signedIn') return;
    const canLock = await canUseDeviceLock();
    const action = onResume({ backgroundedAt: backgroundedAt.current, now: Date.now(), canLock });
    backgroundedAt.current = null;
    // Se decide de nuevo en cada evaluación: un bloqueo viejo de otra sesión no queda pegado.
    setLocked(action === 'lock');
    if (action === 'signOut') await signOut();
  }, [status, signOut]);

  // Arranque en frío con la sesión guardada.
  useEffect(() => {
    if (status === 'signedIn' && !evaluated.current) {
      evaluated.current = true;
      void evaluate();
    }
    if (status === 'signedOut') evaluated.current = false;
  }, [status, evaluate]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') backgroundedAt.current = Date.now();
      // El diálogo de biometría también pasa la app a "inactive": solo cuenta "background".
      if (next === 'active' && backgroundedAt.current != null) void evaluate();
    });
    return () => sub.remove();
  }, [evaluate]);

  const unlock = useCallback(async () => {
    setPrompting(true);
    setFailed(false);
    const ok = await authenticateWithDevice('Desbloquea Real ½');
    setPrompting(false);
    if (ok) setLocked(false);
    else setFailed(true);
  }, []);

  // Al aparecer el bloqueo se pide la biometría de una vez, sin un toque extra.
  useEffect(() => {
    if (!locked) return;
    const t = setTimeout(() => void unlock(), 0);
    return () => clearTimeout(t);
  }, [locked, unlock]);

  // Sin sesión no hay nada que proteger (el bloqueo se reevalúa al volver a entrar).
  if (!locked || status !== 'signedIn') return null;
  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <Wordmark size="lg" light />
      <View style={styles.card}>
        <Ionicons name="lock-closed" size={40} color={colors.primary} />
        <T variant="h2" style={{ marginTop: space.md, textAlign: 'center' }}>
          Tu sesión está protegida
        </T>
        <T color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.xs }}>
          {failed
            ? 'No pudimos confirmar que eres tú. Inténtalo de nuevo.'
            : 'Usa tu huella, rostro o el PIN del teléfono para continuar.'}
        </T>
        <Button
          title="Desbloquear"
          icon="finger-print"
          onPress={unlock}
          loading={prompting}
          style={{ marginTop: space.lg }}
        />
        <Button
          title="Cerrar sesión"
          variant="outline"
          onPress={() => {
            setLocked(false);
            void signOut();
          }}
          style={{ marginTop: space.sm }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    zIndex: 1000,
    elevation: 1000,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: space.lg,
    alignItems: 'center',
    width: '100%',
    marginTop: space.lg,
  },
});
