import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ApiError, messageFor } from '../api/errors';
import { appApi } from '../api/endpoints';
import type { CreditSummary, PaymentReport } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Banner, Button, Card, EmptyState, Field, OrangeHeader, Screen, T } from '../components/ui';
import { formatUsd, isValidAmount, normalizeAmountInput } from '../lib/money';
import { colors, radius, space } from '../theme';

export default function ReportPayment() {
  const params = useLocalSearchParams<{ creditId?: string; amount?: string }>();
  const { profile } = useAuth();
  const [credits, setCredits] = useState<CreditSummary[]>([]);
  const [creditId, setCreditId] = useState(params.creditId ?? '');
  const [amount, setAmount] = useState(params.amount ?? '');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentReport | null>(null);
  const pay = profile?.company_payment_account;

  useEffect(() => {
    appApi
      .credits()
      .then((list) => {
        const active = list.filter((c) => c.status === 'active');
        setCredits(active);
        if (!params.creditId && active[0]) setCreditId(active[0].id);
      })
      .catch((e) => setError(messageFor(e)));
  }, [params.creditId]);

  const submit = async () => {
    const amt = normalizeAmountInput(amount);
    if (!creditId) return setError('Elige el crédito que estás pagando.');
    if (!isValidAmount(amt)) return setError('Escribe un monto válido.');
    if (reference.trim().length < 4) return setError('Escribe la referencia del pago móvil.');
    setLoading(true);
    setError(null);
    try {
      setResult(await appApi.reportPayment({ credit_id: creditId, amount: amt, reference: reference.trim() }));
    } catch (e) {
      setError(
        e instanceof ApiError && e.retryable ? `${messageFor(e)} Reintentar no duplica el abono.` : messageFor(e),
      );
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    const ok = result.status === 'validated';
    const pending = result.status === 'pending';
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <OrangeHeader title="Abono reportado" back={false} />
        <Screen edges={['bottom']}>
          <Card style={{ alignItems: 'center', padding: space.lg }}>
            <Ionicons
              name={ok ? 'checkmark-circle' : pending ? 'time' : 'close-circle'}
              size={56}
              color={ok ? colors.success : pending ? colors.warning : colors.danger}
            />
            <T variant="h2" style={{ marginTop: space.sm, textAlign: 'center' }}>
              {ok ? 'Abono validado' : pending ? 'Validando con el banco' : 'No pudimos validar el pago'}
            </T>
            <T variant="amount" style={{ marginTop: space.xs }}>
              {formatUsd(result.amount)}
            </T>
            <T color={colors.textMuted}>Ref. {result.reference}</T>
            {result.message ? (
              <T color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.sm }}>
                {result.message}
              </T>
            ) : null}
          </Card>
          {!ok && !pending ? (
            <Button
              title="Corregir y reenviar"
              variant="outline"
              style={{ marginTop: space.lg }}
              onPress={() => setResult(null)}
            />
          ) : null}
          <Button title="Listo" style={{ marginTop: space.sm }} onPress={() => router.replace('/payments')} />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Reportar un abono" subtitle="Paga por pago móvil y reporta la referencia" />
      <Screen edges={['bottom']}>
        {pay ? (
          <Card style={{ backgroundColor: colors.navy }}>
            <T variant="label" color="rgba(255,255,255,0.7)">
              1. Haz un pago móvil a
            </T>
            <T variant="h3" color={colors.white} style={{ marginTop: 4 }}>
              {pay.bank_name ?? pay.bank_code} ({pay.bank_code})
            </T>
            <T color={colors.white}>Teléfono {pay.phone}</T>
            <T color={colors.white}>RIF {pay.rif}</T>
          </Card>
        ) : null}

        <T variant="label" color={colors.textMuted} style={{ marginTop: space.lg, marginBottom: space.sm }}>
          2. ¿Qué crédito estás pagando?
        </T>
        {credits.length ? (
          <View style={{ gap: space.sm, marginBottom: space.md }}>
            {credits.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setCreditId(c.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: space.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.white,
                  borderWidth: 1.5,
                  borderColor: creditId === c.id ? colors.primary : colors.border,
                }}
              >
                <Ionicons
                  name={creditId === c.id ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={creditId === c.id ? colors.primary : colors.textMuted}
                />
                <View style={{ flex: 1, marginLeft: space.sm }}>
                  <T variant="label">
                    {c.id} · {formatUsd(c.amount)}
                  </T>
                  <T variant="caption" color={colors.textMuted}>
                    Saldo {formatUsd(c.outstanding)} · cuota {formatUsd(c.installment_amount)}
                  </T>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <Card>
            <EmptyState icon="checkmark-done" title="Nada por pagar" message="No tienes créditos activos." />
          </Card>
        )}

        {credits.length ? (
          <>
            <T variant="label" color={colors.textMuted} style={{ marginBottom: space.sm }}>
              3. Datos del pago
            </T>
            <Card>
              {error ? (
                <View style={{ marginBottom: space.md }}>
                  <Banner tone="error" message={error} />
                </View>
              ) : null}
              <Field
                label="Monto pagado (USD)"
                icon="cash-outline"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                placeholder="0,00"
              />
              <Field
                label="Referencia"
                icon="barcode-outline"
                autoCapitalize="characters"
                value={reference}
                onChangeText={setReference}
                placeholder="Ej. 004512"
                hint="Los últimos dígitos que te dio tu banco."
              />
              <Button title="Reportar abono" onPress={submit} loading={loading} />
            </Card>
          </>
        ) : null}
      </Screen>
    </View>
  );
}
