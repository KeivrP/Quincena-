import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ApiError, messageFor } from '../api/errors';
import { appApi } from '../api/endpoints';
import type { LoanQuote } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { ChargeBreakdown } from '../components/ChargeBreakdown';
import { Illustration } from '../components/Illustration';
import { Banner, Button, Card, OrangeHeader, Row, Screen, T, webNoOutline } from '../components/ui';
import { formatBs, formatUsd, isValidAmount, normalizeAmountInput, toBig } from '../lib/money';
import { installmentBreakdown, scheduleShape, shapeHint } from '../lib/schedule';
import { confirmSensitiveAction } from '../security/device';
import { formatCivilDate } from '../lib/validators';
import { colors, fonts, radius, space } from '../theme';

// Reasones de negocio que mandan a otra pantalla en vez de mostrarse como error genérico.
const ONBOARDING_REASONS: Record<string, string> = {
  credit_agreement_not_signed: '/onboarding/contract',
  payout_account_not_registered: '/onboarding/payout',
};

export default function RequestCredit() {
  const { simulate } = useLocalSearchParams<{ simulate?: string }>();
  const { profile } = useAuth();
  const [raw, setRawState] = useState('');
  const [quote, setQuote] = useState<LoanQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<{ msg: string; retryable: boolean } | null>(null);
  const seq = useRef(0);

  const [showSchedule, setShowSchedule] = useState(false);
  // Tasa de respaldo (BCV no respondió): el trabajador tiene que aceptarla explícitamente (§7.2).
  const [acceptedStaleRate, setAcceptedStaleRate] = useState(false);
  const product = profile?.credit_product;
  const noProduct = profile ? product === null : false;
  // Límite práctico del selector: min(max_amount_usd, credit_available_usd) (guía §7.1).
  const maxAmount =
    product && profile && toBig(product.max_amount_usd).lt(toBig(profile.credit_available_usd))
      ? product.max_amount_usd
      : profile?.credit_available_usd;

  // Al cambiar el monto, la cotización anterior deja de valer.
  const setRaw = (value: string) => {
    setRawState(value);
    setQuote(null);
    setQuoteError(null);
    setAcceptedStaleRate(false);
  };

  const amount = normalizeAmountInput(raw);
  const valid = isValidAmount(amount);
  // Ya no se asume cuota pareja: con "german" baja, y con "french" + comisiones la 1 es más alta.
  const shape = quote?.installments.length ? scheduleShape(quote.installments) : null;

  // Cotizar es sin efectos: se recalcula al cambiar el monto (con debounce).
  useEffect(() => {
    if (!valid || noProduct) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setQuoting(true);
      try {
        const q = await appApi.quote(amount);
        if (id === seq.current) setQuote(q);
      } catch (e) {
        // Precondición sin cumplir (contrato o datos de cobro): llevar a esa pantalla (§7.2 forma B).
        const reason = e instanceof ApiError ? e.reason : undefined;
        if (reason && ONBOARDING_REASONS[reason]) {
          router.replace(ONBOARDING_REASONS[reason] as never);
          return;
        }
        if (id === seq.current) setQuoteError(messageFor(e));
      } finally {
        if (id === seq.current) setQuoting(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [amount, valid, noProduct]);

  const submit = async () => {
    if (!quote || quote.would_be_rejected) return;
    if (quote.fx_rate_confirmation_required && !acceptedStaleRate) {
      setSendError({ msg: 'Para continuar, acepta usar la tasa de respaldo indicada arriba.', retryable: false });
      return;
    }
    setSendError(null);
    const check = await confirmSensitiveAction(`Confirma que quieres recibir ${formatUsd(quote.principal_usd)}`);
    if (!check.ok) return setSendError({ msg: check.message, retryable: false });
    setSending(true);
    try {
      // Siempre la tasa que el trabajador vio, tal cual (§7.3): si cambió, el servidor responde
      // 409 fx_rate_changed en vez de desembolsar a otra tasa.
      const res = await appApi.requestCredit(amount, {
        accepted_fx_rate_source_date: quote.fx_rate_source_date ?? quote.fx_rate_date,
        accepted_usd_to_bs_rate: quote.usd_to_bs_rate,
      });
      if (res.status === 'disbursed') {
        router.replace({
          pathname: '/result',
          params: {
            status: 'disbursed',
            id: res.loan.id,
            amount: res.loan.principal_usd,
            amount_bs: quote.total_payable_bs ?? '',
          },
        });
      } else {
        // 'in_review' (202): el banco no confirmó a tiempo. NUNCA se reintenta (§7.4).
        router.replace({
          pathname: '/result',
          params: { status: 'in_review', message: res.message, ...(res.loanId ? { id: res.loanId } : {}) },
        });
      }
    } catch (e) {
      if (e instanceof ApiError) {
        const reason = e.reason;
        if (reason === 'disbursement_failed') {
          router.replace({ pathname: '/result', params: { status: 'rejected', message: messageFor(e) } });
          return;
        }
        if (reason && ONBOARDING_REASONS[reason]) {
          router.replace(ONBOARDING_REASONS[reason] as never);
          return;
        }
        // 409 con otra clave mientras hay un desembolso sin resolver: misma pantalla de revisión.
        if (reason === 'disbursement_pending_review') {
          router.replace({ pathname: '/result', params: { status: 'in_review', message: messageFor(e) } });
          return;
        }
        if (reason === 'fx_rate_confirmation_required') {
          setQuote(null);
          setSendError({
            msg: 'La tasa del día no está disponible y se usaría una de respaldo. Vuelve a escribir el monto para ver la tasa y confirmarla.',
            retryable: false,
          });
          return;
        }
        if (reason === 'fx_rate_changed') {
          setQuote(null);
          setSendError({
            msg: 'La tasa cambió desde tu cotización. Vuelve a escribir el monto para cotizar de nuevo.',
            retryable: false,
          });
          return;
        }
      }
      setSendError({ msg: messageFor(e), retryable: e instanceof ApiError && e.retryable });
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader
        title={simulate ? 'Simular crédito' : 'Solicitar crédito'}
        subtitle={`Disponible: ${formatUsd(profile?.credit_available_usd)}`}
      />
      <Screen edges={['bottom']}>
        <Card>
          <T variant="label" color={colors.textMuted}>
            ¿Cuánto necesitas? (USD)
          </T>
          <View style={styles.amountRow}>
            <T style={styles.currency}>$</T>
            <TextInput
              value={raw}
              onChangeText={setRaw}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor="#C9CAD3"
              style={styles.amountInput}
              accessibilityLabel="Monto"
            />
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {['50', '100', '200'].map((v) => (
              <Pressable key={v} style={styles.chip} onPress={() => setRaw(v)}>
                <T variant="label">${v}</T>
              </Pressable>
            ))}
            {maxAmount && toBig(maxAmount).gt(0) ? (
              <Pressable style={styles.chip} onPress={() => setRaw(maxAmount)}>
                <T variant="label">Máximo</T>
              </Pressable>
            ) : null}
          </View>
        </Card>

        <View style={{ marginTop: space.md }}>
          {noProduct ? (
            <Banner
              tone="warning"
              title="Sin producto de crédito"
              message="Todavía no tienes un producto de crédito asignado. Contacta a RRHH de tu empresa."
            />
          ) : quoting ? (
            <Card style={{ alignItems: 'center', padding: space.lg }}>
              <ActivityIndicator color={colors.primary} />
              <T color={colors.textMuted} style={{ marginTop: space.sm }}>
                Calculando…
              </T>
            </Card>
          ) : quoteError ? (
            <Banner tone="error" message={quoteError} />
          ) : quote ? (
            <Card>
              <T variant="label" color={colors.textMuted}>
                {shape?.kind === 'even' ? 'Pagarás' : 'Primera cuota'}
              </T>
              <T variant="amount" style={{ fontSize: 28 }}>
                {shape?.kind === 'even'
                  ? `${quote.installments_count} × ${formatUsd(shape.amount)}`
                  : formatUsd(quote.installments[0]?.total_amount_usd)}
              </T>
              {shape && shapeHint(shape, quote.installments_count) ? (
                <T variant="caption" color={colors.textMuted}>
                  {shapeHint(shape, quote.installments_count)}
                </T>
              ) : null}
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.sm }} />
              <Row label="Recibes" value={formatUsd(quote.principal_usd)} />
              <ChargeBreakdown
                method={quote.amortization_method}
                totalCharge={quote.total_charge_usd}
                totalInterest={quote.total_interest_usd}
                totalFees={quote.total_fees_usd}
                fees={quote.fees}
              />
              <Row label="Tasa BCV" value={`Bs. ${quote.usd_to_bs_rate}`} />
              {quote.installments[0] ? (
                <Row label="Primera cuota" value={formatCivilDate(quote.installments[0].due_date)} />
              ) : null}
              <Row label="Total a pagar" value={formatUsd(quote.total_payable_usd)} strong />
              <Row label="Equivalente en Bs" value={formatBs(quote.total_payable_bs)} />
              {quote.installments.length ? (
                <Pressable
                  onPress={() => setShowSchedule((v) => !v)}
                  style={styles.scheduleToggle}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showSchedule }}
                >
                  <T variant="label" color={colors.primary}>
                    {showSchedule ? 'Ocultar cronograma' : `Ver cronograma (${quote.installments.length} cuotas)`}
                  </T>
                  <Ionicons name={showSchedule ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
                </Pressable>
              ) : null}
              {showSchedule
                ? quote.installments.map((i) => (
                    <View key={i.sequence_number} style={styles.scheduleRow}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <T variant="label">
                          Cuota {i.sequence_number} · {formatCivilDate(i.due_date)}
                        </T>
                        <T variant="label">{formatUsd(i.total_amount_usd)}</T>
                      </View>
                      <T variant="caption" color={colors.textMuted}>
                        {installmentBreakdown(i)}
                      </T>
                    </View>
                  ))
                : null}
              {quote.fx_rate_is_stale || quote.fx_rate_confirmation_required ? (
                <View style={{ marginTop: space.sm, gap: space.sm }}>
                  <Banner
                    tone="warning"
                    title="Tasa de respaldo"
                    message={`El BCV no respondió: se usa la tasa del ${formatCivilDate(
                      quote.fx_rate_source_date ?? quote.fx_rate_date,
                    )} (${quote.fx_rate_age_days} día${quote.fx_rate_age_days === 1 ? '' : 's'} de antigüedad).`}
                  />
                  {quote.fx_rate_confirmation_required ? (
                    <Pressable
                      onPress={() => setAcceptedStaleRate((v) => !v)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: acceptedStaleRate }}
                    >
                      <Ionicons
                        name={acceptedStaleRate ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={colors.primary}
                      />
                      <T style={{ flex: 1 }}>Acepto usar esta tasa (Bs. {quote.usd_to_bs_rate} por dólar)</T>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {quote.would_be_rejected && quote.exceeds_credit_limit ? (
                // Lo único que falla es el cupo: en vez de un error, se ofrece el extra-crédito.
                <View style={{ marginTop: space.sm, gap: space.sm }}>
                  <Banner
                    tone="info"
                    title="Supera tu cupo disponible"
                    message={`Puedes pedirlo como extra-crédito: RRHH de tu empresa lo revisa y puede aprobarlo completo o por un monto menor. Tu cupo hoy es ${formatUsd(profile?.credit_available_usd)}.`}
                  />
                  <Button
                    title="Pedir como extra-crédito"
                    icon="trending-up"
                    variant="outline"
                    onPress={() => router.push({ pathname: '/extra-credit/new', params: { amount } })}
                  />
                </View>
              ) : quote.would_be_rejected ? (
                <View style={{ marginTop: space.sm }}>
                  <Banner
                    tone="warning"
                    title="No podemos aprobar este monto"
                    message={quote.rejection_reason ?? 'Prueba con un monto menor.'}
                  />
                </View>
              ) : null}
            </Card>
          ) : (
            <T color={colors.textMuted} style={{ textAlign: 'center' }}>
              Escribe un monto para ver tus cuotas.
            </T>
          )}
        </View>

        {sendError ? (
          <View style={{ marginTop: space.md }}>
            <Banner
              tone="error"
              title={sendError.retryable ? 'No pudimos confirmar' : undefined}
              message={sendError.retryable ? `${sendError.msg} Reintentar no duplica el crédito.` : sendError.msg}
            />
          </View>
        ) : null}

        <Button
          title={
            sendError?.retryable ? 'Reintentar' : quote ? `Recibir ${formatUsd(quote.principal_usd)}` : 'Solicitar'
          }
          icon="flash"
          style={{ marginTop: space.lg }}
          disabled={!quote || quote.would_be_rejected || quoting || noProduct}
          onPress={submit}
        />
        <T variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.sm }}>
          El dinero se envía de inmediato a tu pago móvil registrado.
        </T>
      </Screen>

      <Modal visible={sending} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <Illustration
              icon="paper-plane"
              spinning
              size={170}
              badges={[
                { icon: 'cash', color: colors.accent },
                { icon: 'phone-portrait', color: colors.primary },
              ]}
            />
            <T variant="h3" style={{ marginTop: space.lg, textAlign: 'center' }}>
              Enviando tu dinero…
            </T>
            <T color={colors.textMuted} style={{ textAlign: 'center' }}>
              Esto puede tardar unos segundos. No cierres la app.
            </T>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  amountRow: { flexDirection: 'row', alignItems: 'center', marginVertical: space.sm },
  currency: { fontFamily: fonts.bold, fontSize: 36, color: colors.primary, marginRight: 4 },
  amountInput: {
    flex: 1,
    minWidth: 0,
    ...webNoOutline,
    fontFamily: fonts.bold,
    fontSize: 40,
    color: colors.text,
    padding: 0,
  },
  scheduleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  scheduleRow: { paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(27,29,41,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  overlayCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: space.lg,
    alignItems: 'center',
    width: '100%',
  },
});
