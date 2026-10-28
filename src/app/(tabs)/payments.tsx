import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { messageFor } from '../../api/errors';
import { appApi } from '../../api/endpoints';
import type { PaymentReport } from '../../api/types';
import { Banner, Button, Card, EmptyState, OrangeHeader, Pill, T } from '../../components/ui';
import { formatUsd } from '../../lib/money';
import { colors, space } from '../../theme';

const STATUS: Record<string, [string, 'success' | 'warning' | 'danger']> = {
  validated: ['Validado', 'success'],
  pending: ['Validando', 'warning'],
  rejected: ['No conciliado', 'danger'],
};

export default function Payments() {
  const [items, setItems] = useState<PaymentReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      appApi
        .payments()
        .then(setItems)
        .catch((e) => setError(messageFor(e)));
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
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: space.md, paddingBottom: 120 }}
        ListHeaderComponent={error ? <Banner tone="error" message={error} /> : undefined}
        ListEmptyComponent={
          <Card>
            <EmptyState
              icon="receipt-outline"
              title="Sin abonos reportados"
              message="Cuando pagues una cuota por pago móvil, repórtala aquí para que se aplique."
            />
            <Button title="Reportar un abono" onPress={() => router.push('/report-payment')} />
          </Card>
        }
        renderItem={({ item }) => {
          const [label, tone] = STATUS[item.status] ?? [item.status, 'warning'];
          return (
            <Card style={{ marginBottom: space.sm, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <T variant="h3">{formatUsd(item.amount)}</T>
                <T variant="caption" color={colors.textMuted}>
                  Ref. {item.reference}
                </T>
              </View>
              <Pill label={label} tone={tone} />
            </Card>
          );
        }}
      />
    </View>
  );
}
