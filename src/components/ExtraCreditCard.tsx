import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { ExtraCreditRequest, ExtraCreditStatus } from '../api/types';
import { formatUsd, toBig } from '../lib/money';
import { formatCivilDate } from '../lib/validators';
import { colors, radius, shadow, space } from '../theme';
import { Pill, T } from './ui';

export function extraCreditPill(status: ExtraCreditStatus | string) {
  switch (status) {
    case 'pending':
      return <Pill label="En revisión" tone="warning" />;
    case 'approved':
      return <Pill label="Aprobado" tone="success" />;
    case 'rejected':
      return <Pill label="Rechazado" tone="danger" />;
    case 'cancelled':
      return <Pill label="Cancelado" />;
    default:
      return <Pill label={status} />;
  }
}

/** Aprobado por menos de lo pedido (RRHH puede aprobar un monto menor). */
export function approvedForLess(r: ExtraCreditRequest): boolean {
  return (
    r.status === 'approved' && !!r.approved_amount_usd && toBig(r.approved_amount_usd).lt(toBig(r.requested_amount_usd))
  );
}

export function ExtraCreditCard({ request: r }: { request: ExtraCreditRequest }) {
  const subtitle =
    r.status === 'approved' && r.approved_amount_usd
      ? approvedForLess(r)
        ? `Aprobado por ${formatUsd(r.approved_amount_usd)}`
        : 'Aprobado completo'
      : r.status === 'pending'
        ? 'RRHH la está revisando'
        : r.status === 'rejected'
          ? 'Toca para ver el motivo'
          : 'La cancelaste';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Extra-crédito de ${formatUsd(r.requested_amount_usd)}`}
      onPress={() => router.push({ pathname: '/extra-credit/[id]', params: { id: r.id } })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        padding: space.md,
        marginBottom: space.sm,
        opacity: pressed ? 0.85 : 1,
        ...shadow,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="trending-up" size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1, marginLeft: space.sm }}>
        <T variant="h3">{formatUsd(r.requested_amount_usd)}</T>
        <T variant="caption" color={colors.textMuted}>
          {subtitle} · {formatCivilDate(r.created_at)}
        </T>
      </View>
      {extraCreditPill(r.status)}
    </Pressable>
  );
}
