import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { messageFor } from '../../api/errors';
import { appApi } from '../../api/endpoints';
import type { LoanInstallment } from '../../api/types';
import { Banner, Card, EmptyState, OrangeHeader, Pill, T } from '../../components/ui';
import { formatUsd, toBig } from '../../lib/money';
import { formatCivilDate } from '../../lib/validators';
import { colors, space } from '../../theme';

type PaidInstallment = LoanInstallment & { loanId: string };

export default function Payments() {
  const [items, setItems] = useState<PaidInstallment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // No existe un endpoint "mis abonos": se arma a partir de las cuotas
  // ya pagadas de cada crédito (no hay un historial de transacciones
  // expuesto al trabajador en el backend).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          const loans = await appApi.loans();
          const details = await Promise.all(loans.map((l) => appApi.loan(l.id)));
          const paid = details
            .flatMap((d) => d.installments.map((i) => ({ ...i, loanId: d.id })))
            .filter((i) => i.status === 'paid')
            .sort((a, b) => (b.paid_at ?? '').localeCompare(a.paid_at ?? ''));
          if (!cancelled) {
            setItems(paid);
            setError(null);
          }
        } catch (e) {
          if (!cancelled) setError(messageFor(e));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader
        title="Mis abonos"
        back={false}
        right={
          <Ionicons
            name="add-circle-outline"
            size={24}
            color={colors.white}
            onPress={() => router.push('/report-payment')}
          />
        }
      />
      <FlatList
        data={items}
        keyExtractor={(i) => `${i.loanId}-${i.sequence_number}`}
        contentContainerStyle={{ padding: space.md, paddingBottom: 120 }}
        ListHeaderComponent={error ? <Banner tone="error" message={error} /> : undefined}
        ListEmptyComponent={
          !loading ? (
            <Card>
              <EmptyState
                icon="receipt-outline"
                title="Sin abonos aplicados"
                message="Cuando pagues una cuota por pago móvil y la reportes, se verá aquí una vez aplicada."
              />
            </Card>
          ) : undefined
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: space.sm, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <T variant="h3">{formatUsd(toBig(item.paid_principal_usd).plus(item.paid_fee_interest_usd).toFixed(2))}</T>
              <T variant="caption" color={colors.textMuted}>
                Cuota {item.sequence_number} · {item.paid_at ? formatCivilDate(item.paid_at) : '—'}
              </T>
            </View>
            <Pill label="Aplicado" tone="success" />
          </Card>
        )}
      />
    </View>
  );
}
