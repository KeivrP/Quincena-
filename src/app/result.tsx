import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, T } from '../components/ui';
import { formatBs, formatUsd } from '../lib/money';
import { colors, space } from '../theme';

// Los tres desenlaces de pedir un crédito: desembolsado, rechazado por el banco, o en revisión.
const CONTENT = {
  disbursed: {
    icon: 'checkmark',
    tint: colors.success,
    title: '¡Dinero enviado!',
    text: 'Tu crédito fue desembolsado a tu pago móvil.',
  },
  rejected: {
    icon: 'close',
    tint: colors.danger,
    title: 'El banco rechazó el envío',
    text: 'No se creó ningún crédito ni se descontó tu cupo. Puedes intentarlo de nuevo más tarde.',
  },
  in_review: {
    icon: 'time-outline',
    tint: colors.warning,
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
      <View style={[styles.side, { left: -140 }]} />
      <View style={[styles.side, { right: -140 }]} />
      <View style={{ alignItems: 'center', marginTop: space.xl }}>
        <View style={[styles.check, { borderColor: c.tint }]}>
          <Ionicons name={c.icon} size={30} color={c.tint} />
        </View>
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
      <Image source={require('../../assets/images/hero-success.png')} style={styles.hero} resizeMode="contain" />
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
  side: {
    position: 'absolute',
    top: '42%',
    width: 220,
    height: 360,
    borderRadius: 180,
    backgroundColor: colors.primary,
  },
  check: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  hero: { flex: 1, width: '70%', alignSelf: 'center', marginTop: space.md },
});
