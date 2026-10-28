import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ApiError, messageFor } from '../api/errors';
import { appApi } from '../api/endpoints';
import type { Bank, Loan, PaymentTransaction } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { BankPicker } from '../components/BankPicker';
import { Banner, Button, Card, EmptyState, Field, OrangeHeader, Screen, T } from '../components/ui';
import { formatUsd, isValidAmount, normalizeAmountInput } from '../lib/money';
import { colors, radius, space } from '../theme';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportPayment() {
  const params = useLocalSearchParams<{ loanId?: string }>();
  const { profile } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loanId, setLoanId] = useState(params.loanId ?? '');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [payerBank, setPayerBank] = useState<Bank | null>(null);
  const [payerAccount, setPayerAccount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentTransaction | null>(null);
  const pay = profile?.payment_destination;
  const payBankName = banks.find((b) => b.code === pay?.bank_code)?.name;

  useEffect(() => {
    appApi
      .loans()
      .then((list) => {
        const active = list.filter((c) => c.status === 'active');
        setLoans(active);
        if (!params.loanId && active[0]) setLoanId(active[0].id);
      })
      .catch((e) => setError(messageFor(e)));
    appApi.banks().then(setBanks).catch(() => {});
  }, [params.loanId]);

  const submit = async () => {
    const amt = normalizeAmountInput(amount);
    if (!loanId) return setError('Elige el crédito que estás pagando.');
    if (!isValidAmount(amt)) return setError('Escribe un monto válido.');
    if (reference.trim().length < 1) return setError('Escribe la referencia del pago móvil.');
    if (!payerBank) return setError('Elige el banco desde el que pagaste.');
    if (payerAccount.trim().length < 1) return setError('Escribe el teléfono o cuenta desde donde pagaste.');
    setLoading(true);
    setError(null);
    try {
      setResult(
        await appApi.reportPayment(loanId, {
          amount_usd: amt,
          reference: reference.trim(),
          payment_date: paymentDate,
          payer_bank_code: payerBank.code,
          payer_account: payerAccount.trim(),
        }),
      );
    } catch (e) {
      setError(
        e instanceof ApiError && e.retryable ? `${messageFor(e)} Reintentar no duplica el abono.` : messageFor(e),
      );
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <OrangeHeader title="Abono reportado" back={false} />
        <Screen edges={['bottom']}>
          <Card style={{ alignItems: 'center', padding: space.lg }}>
            <Ionicons name="checkmark-circle" size={56} color={colors.success} />
            <T variant="h2" style={{ marginTop: space.sm, textAlign: 'center' }}>
              Abono validado
            </T>
            <T variant="amount" style={{ marginTop: space.xs }}>
              {formatUsd(result.amount_usd)}
            </T>
            <T color={colors.textMuted}>Ref. {result.provider_reference}</T>
          </Card>
          <Button title="Listo" style={{ marginTop: space.lg }} onPress={() => router.replace('/home')} />
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
              {payBankName ?? pay.bank_code} ({pay.bank_code})
            </T>
            <T color={colors.white}>Teléfono {pay.phone}</T>
            <T color={colors.white}>Cédula/RIF {pay.national_id}</T>
          </Card>
        ) : null}

        <T variant="label" color={colors.textMuted} style={{ marginTop: space.lg, marginBottom: space.sm }}>
          2. ¿Qué crédito estás pagando?
        </T>
        {loans.length ? (
          <View style={{ gap: space.sm, marginBottom: space.md }}>
            {loans.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setLoanId(c.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: space.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.white,
                  borderWidth: 1.5,
                  borderColor: loanId === c.id ? colors.primary : colors.border,
                }}
              >
                <Ionicons
                  name={loanId === c.id ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={loanId === c.id ? colors.primary : colors.textMuted}
                />
                <View style={{ flex: 1, marginLeft: space.sm }}>
                  <T variant="label">{formatUsd(c.principal_usd)}</T>
                  <T variant="caption" color={colors.textMuted}>
                    {c.installments_count} cuotas · total {formatUsd(c.total_payable_usd)}
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

        {loans.length ? (
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
              <Field
                label="Fecha del pago"
                icon="calendar-outline"
                value={paymentDate}
                onChangeText={setPaymentDate}
                placeholder="2026-10-28"
                hint="Formato AAAA-MM-DD."
              />
              <BankPicker banks={banks} value={payerBank} onChange={setPayerBank} />
              <Field
                label="Tu teléfono/cuenta de origen"
                icon="call-outline"
                keyboardType="phone-pad"
                value={payerAccount}
                onChangeText={setPayerAccount}
                placeholder="0414 1234567"
                hint="Desde donde hiciste el pago móvil (puede no ser el tuyo registrado)."
              />
              <Button title="Reportar abono" onPress={submit} loading={loading} />
            </Card>
          </>
        ) : null}
      </Screen>
    </View>
  );
}
