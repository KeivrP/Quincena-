import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { messageFor } from '../../api/errors';
import { appApi } from '../../api/endpoints';
import type { CreditDetail } from '../../api/types';
import { statusPill } from '../../components/CreditCard';
import { Banner, Button, Card, OrangeHeader, Row, Screen, T } from '../../components/ui';
import { formatBs, formatUsd } from '../../lib/money';
import { formatCivilDate } from '../../lib/validators';
import { colors, space } from '../../theme';

const INST_STATUS: Record<string, [string, string]> = {
  paid: ['Pagada', colors.success],
  pending: ['Pendiente', colors.textMuted],
  overdue: ['Vencida', colors.danger],
  partial: ['Parcial', colors.warning],
};

export default function CreditDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [credit, setCredit] = useState<CreditDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    try {
      setCredit(await appApi.credit(id));
    } catch (e) {
      setError(messageFor(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openReceipt = async () => {
    setOpening(true);
    try {
      // URL prefirmada nueva en cada apertura; no se guarda.
      const { pdf_url } = await appApi.creditReceipt(id);
      await WebBrowser.openBrowserAsync(pdf_url);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title={`Crédito ${id}`} />
      <Screen edges={['bottom']}>
        {error ? <Banner tone="error" message={error} /> : null}
        {!credit && !error ? <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} /> : null}
        {credit ? (
          <>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T variant="label" color={colors.textMuted}>
                  Saldo pendiente
                </T>
                {statusPill(credit.status)}
              </View>
              <T variant="amount">{formatUsd(credit.outstanding)}</T>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.sm }} />
              <Row label="Monto recibido" value={formatUsd(credit.amount)} />
              {credit.amount_bs ? <Row label="En bolívares" value={formatBs(credit.amount_bs)} /> : null}
              <Row label="Cuotas" value={`${credit.installments} × ${formatUsd(credit.installment_amount)}`} />
              <Row label="Fecha" value={formatCivilDate(credit.created_at)} />
            </Card>

            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
              {credit.receipt_available !== false ? (
                <Button
                  title="Comprobante"
                  icon="document-text-outline"
                  variant="outline"
                  style={{ flex: 1 }}
                  loading={opening}
                  onPress={openReceipt}
                />
              ) : null}
              {credit.status === 'active' ? (
                <Button
                  title="Pagar cuota"
                  icon="arrow-up-circle-outline"
                  style={{ flex: 1 }}
                  onPress={() =>
                    router.push({
                      pathname: '/report-payment',
                      params: { creditId: credit.id, amount: credit.installment_amount },
                    })
                  }
                />
              ) : null}
            </View>

            <T variant="h3" style={{ marginTop: space.lg, marginBottom: space.sm }}>
              Cronograma de cuotas
            </T>
            <Card style={{ paddingVertical: space.sm }}>
              {credit.schedule.map((s, k) => {
                const [label, tint] = INST_STATUS[s.status] ?? [s.status, colors.textMuted];
                return (
                  <View
                    key={s.number}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: space.sm,
                      borderBottomWidth: k === credit.schedule.length - 1 ? 0 : 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Ionicons
                      name={s.status === 'paid' ? 'checkmark-circle' : 'ellipse-outline'}
                      size={20}
                      color={tint}
                    />
                    <View style={{ flex: 1, marginLeft: space.sm }}>
                      <T variant="label">Cuota {s.number}</T>
                      <T variant="caption" color={colors.textMuted}>
                        Vence {formatCivilDate(s.due_date)}
                      </T>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <T variant="label">{formatUsd(s.amount)}</T>
                      <T variant="caption" color={tint}>
                        {label}
                      </T>
                    </View>
                  </View>
                );
              })}
            </Card>
          </>
        ) : null}
      </Screen>
    </View>
  );
}
