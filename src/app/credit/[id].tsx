import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { ApiError, messageFor } from '../../api/errors';
import { appApi } from '../../api/endpoints';
import type { LoanDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ChargeBreakdown } from '../../components/ChargeBreakdown';
import { statusPill } from '../../components/CreditCard';
import { Banner, Button, Card, OrangeHeader, Pill, Row, T } from '../../components/ui';
import { formatUsd, toBig } from '../../lib/money';
import { installmentAlert, installmentBreakdown, loanOutstanding } from '../../lib/schedule';
import { formatCivilDate, formatInstantDate } from '../../lib/validators';
import { colors, space } from '../../theme';

const INST_STATUS: Record<string, [string, string]> = {
  paid: ['Pagada', colors.success],
  scheduled: ['Por vencer', colors.textMuted],
  overdue: ['Vencida', colors.danger],
  cancelled: ['Cancelada', colors.textMuted],
};

/** 404: no existe o no es del trabajador → volver a la lista (Anexo A). */
function loanError(e: unknown): string {
  return e instanceof ApiError && e.status === 404 ? 'No encontramos este crédito. Vuelve a la lista.' : messageFor(e);
}

export default function CreditDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [credit, setCredit] = useState<LoanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const detail = await appApi.loan(id);
      setCredit(detail);
      setError(null);
    } catch (e) {
      setError(loanError(e));
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    appApi
      .loan(id)
      .then((detail) => {
        if (!cancelled) setCredit(detail);
      })
      .catch((e) => {
        if (!cancelled) setError(loanError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // En revisión: el banco no confirmó el desembolso; las cuotas NO son exigibles (guía §9.2).
  const inReview = credit?.status === 'disbursement_failed' || credit?.status === 'disbursing';
  const outstanding = credit ? loanOutstanding(credit.installments) : '0.00';
  const hasOverdue = !!credit?.installments.some((i) => i.status === 'overdue');
  const grace = credit?.grace_period_days_snapshot ?? 0;

  const openReceipt = async () => {
    setOpening(true);
    try {
      // La URL prefirmada vence en 1 hora: se pide el detalle de nuevo para traer una fresca (§3.6).
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
      <ScrollView
        contentContainerStyle={{ padding: space.md, paddingBottom: space.xl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        {error ? <Banner tone="error" message={error} /> : null}
        {!credit && !error ? <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} /> : null}
        {credit ? (
          <>
            {inReview ? (
              <View style={{ marginBottom: space.md }}>
                <Banner
                  tone="warning"
                  title="En revisión"
                  message="El banco no confirmó a tiempo si el dinero salió. Un administrador lo está revisando: si salió, el crédito quedará activo; si no, se cancelará y tu cupo se libera. No lo pidas de nuevo."
                />
              </View>
            ) : null}
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T variant="label" color={colors.textMuted}>
                  {inReview ? 'Monto solicitado' : 'Lo que debes'}
                </T>
                {statusPill(credit.status)}
              </View>
              <T variant="amount">{formatUsd(inReview ? credit.principal_usd : outstanding)}</T>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.sm }} />
              <Row label="Monto recibido" value={formatUsd(credit.principal_usd)} />
              <Row
                label="Cuotas"
                value={`${credit.installments_count} · Total ${formatUsd(credit.total_payable_usd)}`}
              />
              <ChargeBreakdown
                method={credit.amortization_method_snapshot}
                totalInterest={credit.total_interest_usd}
                totalFees={credit.total_fees_usd}
                fees={credit.fees}
              />
              {credit.fx_rate_at_disbursement ? (
                <Row label="Tasa del desembolso" value={`Bs. ${credit.fx_rate_at_disbursement}`} />
              ) : null}
              <Row
                label="Período de gracia"
                value={grace > 0 ? `${grace} día${grace === 1 ? '' : 's'} sin mora` : 'Sin gracia'}
              />
              <Row label="Solicitado" value={formatInstantDate(credit.requested_at)} />
            </Card>

            {hasOverdue && !inReview ? (
              <View style={{ marginTop: space.md }}>
                <Banner
                  tone="warning"
                  message="Tienes cuotas vencidas: no podrás pedir otro crédito hasta ponerte al día, aunque estén en período de gracia."
                />
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
              {credit.receipt_download_url ? (
                <Button
                  title="Comprobante"
                  icon="document-text-outline"
                  variant="outline"
                  style={{ flex: 1 }}
                  loading={opening}
                  onPress={openReceipt}
                />
              ) : null}
              {credit.status === 'active' && profile?.payment_destination ? (
                <Button
                  title="Abonar"
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
                const alert = inReview ? null : installmentAlert(s);
                const owed = s.status !== 'paid' && s.status !== 'cancelled' && toBig(s.outstanding_usd).gt(0);
                return (
                  <View
                    key={s.sequence_number}
                    style={{
                      paddingVertical: space.sm,
                      borderBottomWidth: k === credit.installments.length - 1 ? 0 : 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
                        <T variant="caption" color={colors.textMuted}>
                          {installmentBreakdown(s)}
                        </T>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <T variant="label">{formatUsd(owed && !inReview ? s.outstanding_usd : s.total_amount_usd)}</T>
                        <T variant="caption" color={tint}>
                          {owed && !inReview && s.status !== 'scheduled' ? 'Debes' : label}
                        </T>
                      </View>
                    </View>
                    {alert?.kind === 'grace' ? (
                      <View style={{ marginTop: space.xs, marginLeft: 28, alignSelf: 'flex-start' }}>
                        <Pill label={`En gracia hasta ${formatCivilDate(alert.until)}`} tone="warning" />
                        <T variant="caption" color={colors.textMuted} style={{ marginTop: 2 }}>
                          Venció, pero puedes pagarla sin recargo hasta esa fecha.
                        </T>
                      </View>
                    ) : alert?.kind === 'mora' ? (
                      <T variant="caption" color={colors.danger} style={{ marginTop: space.xs, marginLeft: 28 }}>
                        En mora: incluye {formatUsd(alert.mora)} de recargo.
                      </T>
                    ) : null}
                  </View>
                );
              })}
            </Card>
            {inReview ? (
              <T variant="caption" color={colors.textMuted} style={{ marginTop: space.sm }}>
                Estas cuotas no son exigibles mientras el crédito esté en revisión.
              </T>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
