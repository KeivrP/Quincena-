import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { messageFor } from '../api/errors';
import { appApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { Banner, Button, Card, OrangeHeader, Screen, T } from '../components/ui';
import { colors, space } from '../theme';

/**
 * Cambiar la contraseña desde Perfil (guía §4.5). Cambiarla NO cierra las demás sesiones: después
 * se ofrece cerrar la sesión en los otros dispositivos (§4.8).
 */
export default function ChangePasswordScreen() {
  const { refreshProfile } = useAuth();
  const [done, setDone] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [note, setNote] = useState<{ tone: 'success' | 'error'; msg: string } | null>(null);

  const revokeOthers = async () => {
    setRevoking(true);
    setNote(null);
    try {
      const { revoked_count } = await appApi.revokeOtherSessions();
      setNote({
        tone: 'success',
        msg: revoked_count
          ? `Cerramos la sesión en ${revoked_count} dispositivo${revoked_count === 1 ? '' : 's'}.`
          : 'No había sesiones abiertas en otros dispositivos.',
      });
    } catch (e) {
      setNote({ tone: 'error', msg: messageFor(e) });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Cambiar contraseña" subtitle="Usa una que no uses en otras apps" />
      <Screen edges={['bottom']}>
        {done ? (
          <Card>
            <Banner tone="success" title="Contraseña actualizada" message="Tu sesión en este teléfono sigue abierta." />
            <T color={colors.textMuted} style={{ marginTop: space.md }}>
              Si sospechas que alguien más entró a tu cuenta, cierra la sesión en tus otros dispositivos.
            </T>
            {note ? (
              <View style={{ marginTop: space.md }}>
                <Banner tone={note.tone} message={note.msg} />
              </View>
            ) : null}
            <Button
              title="Cerrar sesión en otros dispositivos"
              variant="outline"
              icon="phone-portrait-outline"
              style={{ marginTop: space.md }}
              loading={revoking}
              onPress={revokeOthers}
            />
            <Button title="Listo" style={{ marginTop: space.sm }} onPress={() => router.back()} />
          </Card>
        ) : (
          <ChangePasswordForm
            temporary={false}
            onDone={async () => {
              setDone(true);
              await refreshProfile().catch(() => null);
            }}
          />
        )}
      </Screen>
    </View>
  );
}
