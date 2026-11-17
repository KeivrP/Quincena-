import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';
import { messageFor } from '../api/errors';
import { appApi } from '../api/endpoints';
import type { DeviceSession } from '../api/types';
import { Banner, Button, Card, OrangeHeader, Pill, Screen, T } from '../components/ui';
import { formatInstantDateTime } from '../lib/validators';
import { colors, space } from '../theme';

/** "RealMedio/1.2.0 (Android 14; SM-A145M)" → "Android 14 · SM-A145M". */
function deviceName(ua: string | null): string {
  if (!ua) return 'Dispositivo desconocido';
  const m = ua.match(/\(([^)]+)\)/);
  return m ? m[1].replace(/;\s*/g, ' · ') : ua;
}

/**
 * Dispositivos con sesión abierta (guía §4.8). Solo existe "cerrar todas las demás": no hay cierre
 * de una sesión individual. `last_seen_at` se actualiza al iniciar sesión y en cada renovación.
 */
export default function Sessions() {
  const [items, setItems] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await appApi.sessions());
      setError(null);
    } catch (e) {
      setError(messageFor(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    appApi
      .sessions()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((e) => {
        if (!cancelled) setError(messageFor(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const revoke = async () => {
    setRevoking(true);
    setNote(null);
    try {
      const { revoked_count } = await appApi.revokeOtherSessions();
      setNote(
        revoked_count
          ? `Cerramos la sesión en ${revoked_count} dispositivo${revoked_count === 1 ? '' : 's'}.`
          : 'No había sesiones abiertas en otros dispositivos.',
      );
      await load();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setRevoking(false);
    }
  };

  const confirmRevoke = () => {
    if (Platform.OS === 'web') return revoke();
    Alert.alert('Cerrar las demás sesiones', 'Se cerrará tu cuenta en todos los otros teléfonos. Este sigue abierto.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesiones', style: 'destructive', onPress: revoke },
    ]);
  };

  const others = items?.filter((s) => !s.is_current).length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Dispositivos conectados" subtitle="Dónde está abierta tu cuenta" />
      <Screen edges={['bottom']}>
        {error ? <Banner tone="error" message={error} /> : null}
        {note ? <Banner tone="success" message={note} /> : null}
        {!items && !error ? <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} /> : null}
        {items ? (
          <Card style={{ paddingVertical: space.xs, marginTop: space.sm }}>
            {items.map((s, k) => (
              <View
                key={s.family_id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: space.sm,
                  borderBottomWidth: k === items.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Ionicons name="phone-portrait-outline" size={22} color={colors.primary} />
                <View style={{ flex: 1, marginLeft: space.sm }}>
                  <T variant="label">{deviceName(s.user_agent)}</T>
                  <T variant="caption" color={colors.textMuted}>
                    Última actividad {formatInstantDateTime(s.last_seen_at)}
                    {s.ip ? ` · IP ${s.ip}` : ''}
                  </T>
                </View>
                {s.is_current ? <Pill label="Este teléfono" tone="brand" /> : null}
              </View>
            ))}
          </Card>
        ) : null}
        {items ? (
          <Button
            title="Cerrar sesión en los demás"
            icon="log-out-outline"
            variant="outline"
            style={{ marginTop: space.lg }}
            disabled={others === 0}
            loading={revoking}
            onPress={confirmRevoke}
          />
        ) : null}
        <T variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.sm }}>
          Si no reconoces un dispositivo, cierra las demás sesiones y cambia tu contraseña.
        </T>
      </Screen>
    </View>
  );
}
