import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { ApiError, messageFor } from '../api/errors';
import { appApi } from '../api/endpoints';
import type { Bank, Loan, PaymentTransaction } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { BankPicker } from '../components/BankPicker';
import { Banner, Button, Card, EmptyState, Field, OrangeHeader, Row, Screen, T } from '../components/ui';
import { formatUsd, isValidAmount, normalizeAmountInput, toBig } from '../lib/money';
import { loanOutstanding } from '../lib/schedule';
import { formatInstantDateTime, isValidPhone, normalizePhone, todayInCaracas } from '../lib/validators';
import { colors, radius, space } from '../theme';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reportar un abono (guía §10). La plataforma no cobra: valida con el banco, en la misma llamada,
 * que el pago existe y lo aplica (mora → interés/comisión → capital, desde la cuota más antigua).
 * Antes de enviar se valida aquí lo que el servidor comprueba DESPUÉS de consultar al banco (préstamo
 * activo y monto ≤ deuda), para no gastar una consulta que va a fallar.
 */
export default function ReportPayment() {
  const params = useLocalSearchParams<{ loanId?: string }>();
  const { profile, refreshProfile } = useAuth();
  const [loans, setLoans] = useState<Loan[] | null>(null);
  const [loanId, setLoanId] = useState(params.loanId ?? '');
  // Deuda del crédito elegido, guardada con su id: si se cambia de crédito, la anterior ya no vale.
  const [debtOf, setDebtOf] = useState<{ loanId: string; amount: string } | null>(null);
  const debt = debtOf && debtOf.loanId === loanId ? debtOf.amount : null;
  const [banks, setBanks] = useState<Bank[]>([]);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayInCaracas());
  const [payerBank, setPayerBank] = useState<Bank | null>(null);
  const [payerPhone, setPayerPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ msg: string; suggestUsd?: string } | null>(null);
  const [result, setResult] = useState<PaymentTransaction | null>(null);
  const pay = profile?.payment_destination ?? null;
  const payBankName = banks.find((b) => b.code === pay?.bank_code)?.name;

  useEffect(() => {
    appApi
      .loans()
      .then((list) => {
        // Solo se abona a préstamos `active` (los "en revisión" no son deuda exigible; §9.1).
        const active = list.filter((c) => c.status === 'active');
        setLoans(active);
        if (!active.some((c) => c.id === params.loanId)) setLoanId(active[0]?.id ?? '');
      })
      .catch((e) => {
        setLoans([]);
        setError({ msg: messageFor(e) });
      });
    appApi
      .banks()
      .then(setBanks)
      .catch(() => {});
  }, [params.loanId]);

  // Deuda total del préstamo elegido = suma de `outstanding_usd` (= máximo del abono; §9.2).
  useEffect(() => {
    if (!loanId) return;
    let cancelled = false;
    appApi
      .loan(loanId)
      .then((d) => {
        if (!cancelled) setDebtOf({ loanId, amount: loanOutstanding(d.installments) });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loanId]);

  const submit = async () => {
    const amt = normalizeAmountInput(amount);
    const ref = reference.replace(/\s+/g, '');
    const next: Record<string, string | undefined> = {
      amount: !isValidAmount(amt)
        ? 'Escribe un monto válido.'
        : debt && toBig(amt).gt(debt)
          ? `No puede superar lo que debes en este crédito (${formatUsd(debt)}).`
          : undefined,
      reference: !ref ? 'Escribe la referencia del pago.' : ref.length > 50 ? 'Máximo 50 caracteres.' : undefined,
      date: !DATE_RE.test(paymentDate)
        ? 'Formato AAAA-MM-DD.'
        : paymentDate > todayInCaracas()
          ? 'La fecha no puede ser futura.'
          : undefined,
      bank: payerBank ? undefined : 'Elige el banco desde el que pagaste.',
      phone: isValidPhone(payerPhone) ? undefined : 'Debe ser un móvil venezolano (0412, 0414, 0416, 0424, 0426).',
    };
    setErrors(next);
    setError(null);
    if (!loanId) return setError({ msg: 'Elige el crédito que estás pagando.' });
    if (Object.values(next).some(Boolean)) return;
    setLoading(true);
    try {
      const r = await appApi.reportPayment(loanId, {
        amount_usd: amt,
        reference: ref,
        payment_date: paymentDate,
        payer_bank_code: payerBank!.code,
        payer_account: normalizePhone(payerPhone),
      });
      setResult(r);
      // Cambian saldos, estados y cupo (§10.2).
      refreshProfile().catch(() => null);
    } catch (e) {
      const suggest = e instanceof ApiError ? e.extra<string>('outstanding_usd') : undefined;
      const retry = e instanceof ApiError && e.keepsIdempotencyKey ? ' Reintentar no duplica el abono.' : '';
      setError({ msg: messageFor(e) + retry, suggestUsd: suggest });
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <OrangeHeader title="Abono aplicado" back={false} />
        <Screen edges={['bottom']}>
          <Card style={{ alignItems: 'center', padding: space.lg }}>
            <Ionicons name="checkmark-circle" size={56} color={colors.success} />
            <T variant="h2" style={{ marginTop: space.sm, textAlign: 'center' }}>
              Abono validado y aplicado
            </T>
            <T variant="amount" style={{ marginTop: space.xs }}>
              {formatUsd(result.amount_usd)}
            </T>
            <T variant="caption" color={colors.textMuted}>
              {formatInstantDateTime(result.confirmed_at)}
            </T>
          </Card>
          <Card style={{ marginTop: space.md }}>
            <T variant="h3" style={{ marginBottom: space.xs }}>
              Comprobante
            </T>
            <Row label="Referencia que reportaste" value={result.provider_reference} />
            {result.bank_reference ? <Row label="Referencia del banco" value={result.bank_reference} /> : null}
          </Card>
          {result.applied ? (
            <Card style={{ marginTop: space.md }}>
              <T variant="h3" style={{ marginBottom: space.xs }}>
                ¿A qué se fue tu abono?
              </T>
              <T variant="caption" color={colors.textMuted} style={{ marginBottom: space.sm }}>
                Primero se cubre la mora, luego el interés o la comisión, y el resto baja tu deuda.
              </T>
              {toBig(result.applied.mora_usd).gt(0) ? (
                <Row label="Mora" value={formatUsd(result.applied.mora_usd)} />
              ) : null}
              <Row label="Interés o comisión" value={formatUsd(result.applied.interest_or_fee_usd)} />
              <Row label="Capital (baja tu deuda)" value={formatUsd(result.applied.principal_usd)} strong />
            </Card>
          ) : null}
          {result.loan_id ? (
            <Button
              title="Ver mi crédito"
              variant="outline"
              style={{ marginTop: space.lg }}
              onPress={() => router.replace({ pathname: '/credit/[id]', params: { id: result.loan_id! } })}
            />
          ) : null}
          <Button title="Listo" style={{ marginTop: space.sm }} onPress={() => router.replace('/home')} />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Reportar un abono" subtitle="Paga por pago móvil y reporta la referencia" />
      <Screen edges={['bottom']}>
        {!pay ? (
          // Sin destino de pago no se ofrece abonar (§10.1).
          <Card>
            <EmptyState
              icon="business-outline"
              title="Todavía no puedes reportar abonos"
              message="Tu empresa todavía no tiene una cuenta configurada para recibir pagos. Consulta con RRHH."
            />
          </Card>
        ) : (
          <>
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
            <View style={{ marginTop: space.sm }}>
              <Banner
                tone="warning"
                message="Paga desde una cuenta a TU nombre (tu cédula). Un pago hecho desde la cuenta de otra persona probablemente no se pueda validar."
              />
            </View>

            <T variant="label" color={colors.textMuted} style={{ marginTop: space.lg, marginBottom: space.sm }}>
              2. ¿Qué crédito estás pagando?
            </T>
            {loans === null ? (
              <ActivityIndicator color={colors.primary} />
            ) : loans.length ? (
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
                      {loanId === c.id && debt ? (
                        <T variant="caption" color={colors.primary}>
                          Debes {formatUsd(debt)}
                        </T>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Card>
                <EmptyState icon="checkmark-done" title="Nada por pagar" message="No tienes créditos activos." />
              </Card>
            )}

            {loans?.length ? (
              <>
                <T variant="label" color={colors.textMuted} style={{ marginBottom: space.sm }}>
                  3. Datos del pago
                </T>
                <Card>
                  {error ? (
                    <View style={{ marginBottom: space.md, gap: space.sm }}>
                      <Banner tone="error" message={error.msg} />
                      {error.suggestUsd ? (
                        <Button
                          title={`Usar ${formatUsd(error.suggestUsd)}`}
                          variant="outline"
                          onPress={() => {
                            setAmount(error.suggestUsd!.replace('.', ','));
                            setError(null);
                          }}
                        />
                      ) : null}
                    </View>
                  ) : null}
                  <Field
                    label="Monto pagado (USD)"
                    icon="cash-outline"
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0,00"
                    error={errors.amount}
                    hint="El banco valida el equivalente en bolívares a la tasa BCV del día del pago."
                  />
                  {debt ? (
                    <T
                      variant="label"
                      color={colors.primary}
                      style={{ marginTop: -space.sm, marginBottom: space.md }}
                      onPress={() => setAmount(debt.replace('.', ','))}
                    >
                      Pagar todo lo que debo ({formatUsd(debt)})
                    </T>
                  ) : null}
                  <Field
                    label="Referencia"
                    icon="barcode-outline"
                    autoCapitalize="characters"
                    maxLength={60}
                    value={reference}
                    onChangeText={setReference}
                    placeholder="Ej. 004512"
                    error={errors.reference}
                    hint="El número de referencia del comprobante. Cada referencia se usa una sola vez."
                  />
                  <Field
                    label="Fecha del pago"
                    icon="calendar-outline"
                    value={paymentDate}
                    onChangeText={setPaymentDate}
                    placeholder="2026-11-16"
                    error={errors.date}
                    hint="El día en que hiciste el pago (AAAA-MM-DD)."
                  />
                  <BankPicker banks={banks} value={payerBank} onChange={setPayerBank} error={errors.bank} />
                  <Field
                    label="Teléfono desde el que pagaste"
                    icon="call-outline"
                    keyboardType="phone-pad"
                    value={payerPhone}
                    onChangeText={setPayerPhone}
                    placeholder="0414 1234567"
                    error={errors.phone}
                    hint="El pago móvil de origen (puede ser distinto al de cobro)."
                  />
                  <Button title="Reportar abono" onPress={submit} loading={loading} />
                  {loading ? (
                    <T variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.sm }}>
                      Validando con el banco… puede tardar unos segundos.
                    </T>
                  ) : null}
                </Card>
              </>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}
