import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Illustration } from '../components/Illustration';
import { Button, T } from '../components/ui';
import { formatBs, formatUsd } from '../lib/money';
import { colors, space } from '../theme';

// Los tres desenlaces de pedir un crédito: desembolsado, rechazado por el banco, o en revisión.
const CONTENT = {
  disbursed: {
    icon: 'checkmark',
    tint: colors.success,
    soft: colors.successSoft,
    badges: [
      { icon: 'cash', color: colors.accent },
      { icon: 'phone-portrait', color: colors.primary },
      { icon: 'sparkles', color: colors.warning },
    ],
    title: '¡Dinero enviado!',
    text: 'Tu crédito fue desembolsado a tu pago móvil.',
  },
  rejected: {
    icon: 'close',
    tint: colors.danger,
    soft: colors.dangerSoft,
    badges: [{ icon: 'business', color: colors.textMuted }],
    title: 'El banco rechazó el envío',
    text: 'No se creó ningún crédito ni se descontó tu cupo. Puedes intentarlo de nuevo más tarde.',
  },
  in_review: {
    icon: 'time-outline',
    tint: colors.warning,
    soft: colors.warningSoft,
    badges: [{ icon: 'business', color: colors.primary }],
    title: 'Tu crédito está en revisión',
    text: 'El banco aún no confirma el envío. Te avisaremos apenas se resuelva; no lo pidas de nuevo.',
  },
} as const;

export default function Result() {
  const p = useLocalSearchParams<{
    status: string;
    id?: string;
    amount?: string;
    amount_bs?: string;
    message?: string;
  }>();
  const key = (p.status in CONTENT ? p.status : 'in_review') as keyof typeof CONTENT;
  const c = CONTENT[key];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Illustration icon={c.icon} tint={c.tint} soft={c.soft} size={190} badges={c.badges} />
        <T variant="h1" style={{ textAlign: 'center', marginTop: space.lg, paddingHorizontal: space.lg }}>
          {c.title}
        </T>
        {p.amount && key !== 'rejected' ? (
          <T variant="amount" color={colors.accentDark} style={{ marginTop: space.sm }}>
            {formatUsd(p.amount)}
          </T>
        ) : null}
        {p.amount_bs && key === 'disbursed' ? <T color={colors.textMuted}>{formatBs(p.amount_bs)}</T> : null}
        <T color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.sm, paddingHorizontal: space.xl }}>
          {p.message || c.text}
        </T>
      </View>
      <View style={{ padding: space.lg, gap: space.sm }}>
        {p.id && key !== 'rejected' ? (
          <Button
            title="Ver detalle"
            variant="outline"
            onPress={() => router.replace({ pathname: '/credit/[id]', params: { id: p.id! } })}
          />
        ) : null}
        <Button title="Volver al inicio" onPress={() => router.replace('/home')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
});
