import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { CreditSummary } from '../api/types';
import { formatUsd, ratio, toBig } from '../lib/money';
import { formatCivilDate } from '../lib/validators';
import { colors, radius, shadow, space } from '../theme';
import { Pill, ProgressBar, T } from './ui';

export function statusPill(status: string) {
  switch (status) {
    case 'active':
      return <Pill label="Activo" tone="brand" />;
    case 'paid':
      return <Pill label="Pagado" tone="success" />;
    case 'in_review':
      return <Pill label="En revisión" tone="warning" />;
    case 'overdue':
      return <Pill label="Vencido" tone="danger" />;
    default:
      return <Pill label={status} />;
  }
}

export function CreditCard({ credit }: { credit: CreditSummary }) {
  const total = toBig(credit.installment_amount).times(credit.installments).toFixed(2);
  const paidPct = 100 - ratio(credit.outstanding, total);
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
          <T variant="h3">{formatUsd(credit.amount)}</T>
          <T variant="caption" color={colors.textMuted}>
            {credit.id} · {credit.installments} cuota{credit.installments === 1 ? '' : 's'} de{' '}
            {formatUsd(credit.installment_amount)}
          </T>
        </View>
        {statusPill(credit.status)}
      </View>
      <View style={{ marginTop: space.md }}>
        <ProgressBar value={paidPct} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <T variant="caption" color={colors.textMuted}>
            Saldo {formatUsd(credit.outstanding)}
          </T>
          <T variant="caption" color={colors.textMuted}>
            {credit.next_due_date ? `Próxima: ${formatCivilDate(credit.next_due_date)}` : 'Sin cuotas pendientes'}
          </T>
        </View>
      </View>
    </Pressable>
  );
}
