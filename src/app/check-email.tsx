import { router } from 'expo-router';
import { View } from 'react-native';
import { Illustration } from '../components/Illustration';
import { Button, Card, OrangeHeader, Screen, T } from '../components/ui';
import { colors, space } from '../theme';

// Activación de cuenta nueva: no hay código que teclear. RRHH te carga y te llega un correo
// con una contraseña temporal (vence en 7 días). Inicias sesión con ella y la cambias.
const STEPS = [
  [
    'mail-unread',
    'Busca el correo de bienvenida',
    'Te lo envía DisGlobal cuando RRHH te registra. Revisa también "No deseado".',
  ],
  ['key', 'Copia tu contraseña temporal', 'Es válida por 7 días. Si venció, usa "Olvidé mi contraseña".'],
  ['log-in', 'Inicia sesión y crea la tuya', 'Te pediremos una contraseña nueva antes de continuar.'],
] as const;

export default function CheckEmail() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Activa tu cuenta" subtitle="Revisa tu correo para empezar" />
      <Screen edges={[]}>
        <View style={{ alignItems: 'center', marginVertical: space.md }}>
          <Illustration
            icon="mail-unread"
            size={170}
            badges={[
              { icon: 'key', color: colors.accent },
              { icon: 'lock-closed', color: colors.primary },
            ]}
          />
        </View>
        <Card>
          {STEPS.map(([, title, text], k) => (
            <View key={title} style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.sm }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <T variant="label" color={colors.primaryDark}>
                  {k + 1}
                </T>
              </View>
              <View style={{ flex: 1 }}>
                <T variant="h3">{title}</T>
                <T color={colors.textMuted}>{text}</T>
              </View>
            </View>
          ))}
        </Card>
        <Button
          title="Ya tengo mi contraseña temporal"
          style={{ marginTop: space.lg }}
          onPress={() => router.replace('/login')}
        />
        <T variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.md }}>
          ¿No te llegó nada? Pide a RRHH de tu empresa que confirme tu correo.
        </T>
      </Screen>
    </View>
  );
}
