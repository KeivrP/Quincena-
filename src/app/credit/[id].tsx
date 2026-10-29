import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { messageFor } from '../../api/errors';
import { appApi } from '../../api/endpoints';
import type { LoanDetail } from '../../api/types';
import { statusPill } from '../../components/CreditCard';
import { Banner, Button, Card, OrangeHeader, Row, Screen, T } from '../../components/ui';
import { toBig, formatUsd } from '../../lib/money';
import { formatCivilDate } from '../../lib/validators';
import { colors, space } from '../../theme';

const INST_STATUS: Record<string, [string, string]> = {
  paid: ['Pagada', colors.success],
  scheduled: ['Pendiente', colors.textMuted],
  overdue: ['Vencida', colors.danger],
  cancelled: ['Cancelada', colors.textMuted],
};

export default function CreditDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [credit, setCredit] = useState<LoanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    try {
      setCredit(await appApi.loan(id));
    } catch (e) {
      setError(messageFor(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const outstanding = credit
    ? credit.installments.reduce((acc, i) => acc.plus(toBig(i.outstanding_usd)), toBig('0')).toFixed(2)
    : '0.00';

  const openReceipt = async () => {
    setOpening(true);
    try {
      // La URL prefirmada vence pronto: pedimos el detalle de nuevo para traer una fresca.
      const fresh = await appApi.loan(id);
      setCredit(fresh);
      if (fresh.receipt_download_url) await WebBrowser.openBrowserAsync(fresh.receipt_download_url);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Detalle del crédito" />
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
              <T variant="amount">{formatUsd(outstanding)}</T>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.sm }} />
              <Row label="Monto recibido" value={formatUsd(credit.principal_usd)} />
              <Row label="Cuotas" value={`${credit.installments_count} · Total ${formatUsd(credit.total_payable_usd)}`} />
              <Row label="Fecha" value={formatCivilDate(credit.requested_at)} />
            </Card>

            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
              {credit.status !== 'disbursement_failed' ? (
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
                  onPress={() => router.push({ pathname: '/report-payment', params: { loanId: credit.id } })}
                />
              ) : null}
            </View>

            <T variant="h3" style={{ marginTop: space.lg, marginBottom: space.sm }}>
              Cronograma de cuotas
            </T>
            <Card style={{ paddingVertical: space.sm }}>
              {credit.installments.map((s, k) => {
                const [label, tint] = INST_STATUS[s.status] ?? [s.status, colors.textMuted];
                return (
                  <View
                    key={s.sequence_number}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: space.sm,
                      borderBottomWidth: k === credit.installments.length - 1 ? 0 : 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Ionicons
                      name={s.status === 'paid' ? 'checkmark-circle' : 'ellipse-outline'}
                      size={20}
                      color={tint}
                    />
                    <View style={{ flex: 1, marginLeft: space.sm }}>
                      <T variant="label">Cuota {s.sequence_number}</T>
                      <T variant="caption" color={colors.textMuted}>
                        Vence {formatCivilDate(s.due_date)}
                      </T>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <T variant="label">{formatUsd(s.total_amount_usd)}</T>
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
