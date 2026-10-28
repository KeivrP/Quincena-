import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Platform, Pressable, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { Card, OrangeHeader, Screen, T } from '../../components/ui';
import { colors, space } from '../../theme';

type Item = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
  danger?: boolean;
};

export default function Profile() {
  const { profile, signOut } = useAuth();
  const acct = profile?.payout_account;

  const confirmLogout = () => {
    if (Platform.OS === 'web') return signOut();
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: signOut },
    ]);
  };

  const items: Item[] = [
    {
      icon: 'phone-portrait-outline',
      label: 'Datos de cobro',
      detail: acct ? `${acct.bank_name ?? acct.bank_code} · ${acct.phone}` : 'Sin registrar',
      onPress: () => router.push('/onboarding/payout'),
    },
    {
      icon: 'document-text-outline',
      label: 'Contrato marco',
      detail: profile?.contract_status === 'signed' ? 'Firmado' : 'Pendiente',
      onPress: () => router.push('/onboarding/contract'),
    },
    { icon: 'lock-closed-outline', label: 'Cambiar contraseña', onPress: () => router.push('/forgot-password') },
    { icon: 'help-circle-outline', label: 'Ayuda', detail: 'Consulta con RRHH de tu empresa', onPress: () => {} },
    { icon: 'log-out-outline', label: 'Cerrar sesión', onPress: confirmLogout, danger: true },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Perfil" back={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.md, gap: space.md }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.white,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <T variant="h2" color={colors.primary}>
              {profile?.full_name?.charAt(0) ?? '·'}
            </T>
          </View>
          <View style={{ flex: 1 }}>
            <T variant="h3" color={colors.white}>
              {profile?.full_name}
            </T>
            <T variant="caption" color={colors.onPrimaryMuted}>
              {profile?.email}
            </T>
            <T variant="caption" color={colors.onPrimaryMuted}>
              {profile?.cedula} · {profile?.company_name}
            </T>
          </View>
        </View>
      </OrangeHeader>
      <Screen edges={[]}>
        <Card style={{ paddingVertical: space.xs }}>
          {items.map((it, k) => (
            <Pressable
              key={it.label}
              onPress={it.onPress}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 14,
                borderBottomWidth: k === items.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <Ionicons name={it.icon} size={20} color={it.danger ? colors.danger : colors.primary} />
              <View style={{ flex: 1, marginLeft: space.md }}>
                <T variant="label" color={it.danger ? colors.danger : colors.text}>
                  {it.label}
                </T>
                {it.detail ? (
                  <T variant="caption" color={colors.textMuted}>
                    {it.detail}
                  </T>
                ) : null}
              </View>
              {!it.danger ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
            </Pressable>
          ))}
        </Card>
        <T variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.lg }}>
          Quincena+ v0.1 · Crédito de nómina DisGlobal
        </T>
      </Screen>
    </View>
  );
}
