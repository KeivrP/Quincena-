import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { Loan, LoanStatus } from '../api/types';
import { formatUsd } from '../lib/money';
import { formatCivilDate } from '../lib/validators';
import { colors, radius, shadow, space } from '../theme';
import { Pill, T } from './ui';

export function statusPill(status: LoanStatus | string) {
  switch (status) {
    case 'active':
      return <Pill label="Activo" tone="brand" />;
    case 'paid_off':
      return <Pill label="Pagado" tone="success" />;
    case 'disbursing':
      return <Pill label="Procesando" tone="warning" />;
    case 'disbursement_failed':
      return <Pill label="En revisión" tone="warning" />;
    case 'cancelled':
      return <Pill label="Cancelado" tone="danger" />;
    default:
      return <Pill label={status} />;
  }
}

export function CreditCard({ credit }: { credit: Loan }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/credit/[id]', params: { id: credit.id } })}
      style={({ pressed }) => ({
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        padding: space.md,
        marginBottom: space.md,
        opacity: pressed ? 0.9 : 1,
        ...shadow,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="cash-outline" size={22} color={colors.accentDark} />
        </View>
        <View style={{ flex: 1 }}>
          <T variant="h3">{formatUsd(credit.principal_usd)}</T>
          <T variant="caption" color={colors.textMuted}>
            {credit.installments_count} cuota{credit.installments_count === 1 ? '' : 's'} · Total{' '}
            {formatUsd(credit.total_payable_usd)}
          </T>
        </View>
        {statusPill(credit.status)}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm }}>
        <T variant="caption" color={colors.textMuted}>
          Solicitado {formatCivilDate(credit.requested_at)}
        </T>
        {credit.disbursed_at ? (
          <T variant="caption" color={colors.textMuted}>
            Desembolsado {formatCivilDate(credit.disbursed_at)}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}
