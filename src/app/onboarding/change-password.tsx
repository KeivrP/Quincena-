import { router } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { ChangePasswordForm } from '../../components/ChangePasswordForm';
import { Steps } from '../../components/Steps';
import { Button, OrangeHeader, Screen } from '../../components/ui';
import { colors, space } from '../../theme';

/**
 * Primer ingreso: el servidor bloquea todo `/app/*` (salvo el perfil) hasta cambiar la contraseña
 * temporal (guía §4.7). Los tokens siguen sirviendo después del cambio.
 */
export default function ChangePassword() {
  const { passwordChanged, signOut } = useAuth();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Crea tu contraseña" back={false} subtitle="Por seguridad, cambia la contraseña temporal">
        <Steps current={0} />
      </OrangeHeader>
      <Screen edges={[]}>
        <ChangePasswordForm
          temporary
          onDone={async () => {
            await passwordChanged();
            router.replace('/');
          }}
        />
        <Button title="Cerrar sesión" variant="ghost" style={{ marginTop: space.md }} onPress={signOut} />
      </Screen>
    </View>
  );
}
