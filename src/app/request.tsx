import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ApiError, messageFor } from '../api/errors';
import { appApi } from '../api/endpoints';
import type { LoanQuote } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Illustration } from '../components/Illustration';
import { Banner, Button, Card, OrangeHeader, Row, Screen, T, webNoOutline } from '../components/ui';
import { formatBs, formatUsd, isValidAmount, normalizeAmountInput } from '../lib/money';
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
  const [raw, setRaw] = useState('');
  const [quote, setQuote] = useState<LoanQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<{ msg: string; retryable: boolean } | null>(null);
  const seq = useRef(0);

  const amount = normalizeAmountInput(raw);
  const valid = isValidAmount(amount);

  // Cotizar es sin efectos: se recalcula al cambiar el monto (con debounce).
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (!valid) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setQuoting(true);
      try {
        const q = await appApi.quote(amount);
        if (id === seq.current) setQuote(q);
      } catch (e) {
        if (id === seq.current) setQuoteError(messageFor(e));
      } finally {
        if (id === seq.current) setQuoting(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [amount, valid]);

  const submit = async () => {
    if (!quote || quote.would_be_rejected) return;
    setSending(true);
    setSendError(null);
    try {
      const fxConfirmation = quote.fx_rate_confirmation_required
        ? {
            accepted_fx_rate_source_date: quote.fx_rate_source_date ?? quote.fx_rate_date,
            accepted_usd_to_bs_rate: quote.usd_to_bs_rate,
          }
        : undefined;
      const res = await appApi.requestCredit(amount, fxConfirmation);
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
        // 'in_review': el banco no confirmó a tiempo; no hay loan_id que mostrar.
        router.replace({ pathname: '/result', params: { status: 'in_review', message: res.message } });
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
            {profile?.credit_available_usd ? (
              <Pressable style={styles.chip} onPress={() => setRaw(profile.credit_available_usd)}>
                <T variant="label">Máximo</T>
              </Pressable>
            ) : null}
          </View>
        </Card>

        <View style={{ marginTop: space.md }}>
          {quoting ? (
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
                Pagarás
              </T>
              <T variant="amount" style={{ fontSize: 28 }}>
                {quote.installments_count} × {formatUsd(quote.installments[0]?.total_amount_usd)}
              </T>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.sm }} />
              <Row label="Recibes" value={formatUsd(quote.principal_usd)} />
              <Row label="Tasa BCV" value={`Bs. ${quote.usd_to_bs_rate}`} />
              {quote.installments[0] ? (
                <Row label="Primera cuota" value={formatCivilDate(quote.installments[0].due_date)} />
              ) : null}
              <Row label="Total a pagar" value={formatUsd(quote.total_payable_usd)} strong />
              <Row label="Equivalente en Bs" value={formatBs(quote.total_payable_bs)} />
              {quote.fx_rate_is_stale ? (
                <View style={{ marginTop: space.sm }}>
                  <Banner
                    tone="info"
                    message={`La tasa BCV es de respaldo (${quote.fx_rate_age_days} día(s) de antigüedad). Al confirmar, aceptas usar esta misma tasa.`}
                  />
                </View>
              ) : null}
              {quote.would_be_rejected ? (
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
          title={sendError?.retryable ? 'Reintentar' : quote ? `Recibir ${formatUsd(quote.principal_usd)}` : 'Solicitar'}
          icon="flash"
          style={{ marginTop: space.lg }}
          disabled={!quote || quote.would_be_rejected || quoting}
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
