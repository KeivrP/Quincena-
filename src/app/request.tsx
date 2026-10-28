import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ApiError, messageFor } from '../api/errors';
import { appApi } from '../api/endpoints';
import type { Quote } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Banner, Button, Card, OrangeHeader, Row, Screen, T, webNoOutline } from '../components/ui';
import { formatBs, formatUsd, isValidAmount, normalizeAmountInput } from '../lib/money';
import { formatCivilDate } from '../lib/validators';
import { colors, fonts, radius, space } from '../theme';

const DEFAULT_OPTIONS = [1, 2, 3, 4, 6];

export default function RequestCredit() {
  const { simulate } = useLocalSearchParams<{ simulate?: string }>();
  const { profile } = useAuth();
  const [raw, setRaw] = useState('');
  const [installments, setInstallments] = useState(2);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<{ msg: string; retryable: boolean } | null>(null);
  const seq = useRef(0);

  const amount = normalizeAmountInput(raw);
  const valid = isValidAmount(amount);

  // Cotizar es sin efectos: se recalcula al cambiar monto o cuotas (con debounce).
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (!valid) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setQuoting(true);
      try {
        const q = await appApi.quote({ amount, installments });
        if (id === seq.current) setQuote(q);
      } catch (e) {
        if (id === seq.current) setQuoteError(messageFor(e));
      } finally {
        if (id === seq.current) setQuoting(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [amount, installments, valid]);

  const submit = async () => {
    if (!quote || quote.would_be_rejected) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await appApi.requestCredit({ amount, installments });
      router.replace({
        pathname: '/result',
        params: {
          status: res.status,
          id: res.id ?? '',
          amount: res.amount ?? amount,
          amount_bs: res.amount_bs ?? quote.amount_bs ?? '',
          message: res.message ?? '',
        },
      });
    } catch (e) {
      setSendError({ msg: messageFor(e), retryable: e instanceof ApiError && e.retryable });
    } finally {
      setSending(false);
    }
  };

  const options = quote?.installment_options?.length ? quote.installment_options : DEFAULT_OPTIONS;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader
        title={simulate ? 'Simular crédito' : 'Solicitar crédito'}
        subtitle={`Disponible: ${formatUsd(profile?.credit_available)}`}
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
            {profile?.credit_available ? (
              <Pressable style={styles.chip} onPress={() => setRaw(profile.credit_available)}>
                <T variant="label">Máximo</T>
              </Pressable>
            ) : null}
          </View>

          <T variant="label" color={colors.textMuted} style={{ marginTop: space.lg, marginBottom: space.sm }}>
            Número de cuotas
          </T>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {options.map((n) => (
              <Pressable
                key={n}
                onPress={() => setInstallments(n)}
                style={[styles.inst, installments === n && styles.instActive]}
              >
                <T variant="h3" color={installments === n ? colors.white : colors.text}>
                  {n}
                </T>
              </Pressable>
            ))}
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
                {quote.installments} × {formatUsd(quote.installment_amount)}
              </T>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.sm }} />
              <Row label="Recibes" value={formatUsd(quote.amount)} />
              {quote.amount_bs ? <Row label="Equivalente" value={formatBs(quote.amount_bs)} /> : null}
              {quote.exchange_rate ? <Row label="Tasa BCV" value={`Bs. ${quote.exchange_rate}`} /> : null}
              {quote.first_due_date ? (
                <Row label="Primera cuota" value={formatCivilDate(quote.first_due_date)} />
              ) : null}
              <Row label="Total a pagar" value={formatUsd(quote.total)} strong />
              {quote.would_be_rejected ? (
                <View style={{ marginTop: space.sm }}>
                  <Banner
                    tone="warning"
                    title="No podemos aprobar este monto"
                    message={quote.rejection_reason ?? 'Prueba con un monto menor o más cuotas.'}
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
          title={sendError?.retryable ? 'Reintentar' : quote ? `Recibir ${formatUsd(quote.amount)}` : 'Solicitar'}
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
            <Image
              source={require('../../assets/images/hero-phone.png')}
              style={{ width: 130, height: 140 }}
              resizeMode="contain"
            />
            <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: space.md }} />
            <T variant="h3" style={{ marginTop: space.md, textAlign: 'center' }}>
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
  inst: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instActive: { backgroundColor: colors.primary, borderColor: colors.primary },
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
