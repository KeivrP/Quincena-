import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { ApiError, messageFor } from '../../api/errors';
import { appApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { Banner, Button, Card, Field, OrangeHeader, Row, Screen, T, webNoOutline } from '../../components/ui';
import { formatUsd, isValidAmount, normalizeAmountInput, toBig } from '../../lib/money';
import { confirmSensitiveAction } from '../../security/device';
import { colors, fonts, space } from '../../theme';

const NOTE_MAX = 500;

type SendError =
  | { kind: 'within_limit'; msg: string }
  | { kind: 'pending'; msg: string }
  | { kind: 'other'; msg: string; retryable: boolean };

/**
 * Extra-crédito: un monto por encima del cupo normal. No desembolsa en el acto: queda pendiente
 * hasta que RRHH lo aprueba (por el monto pedido o uno menor) o lo rechaza.
 */
export default function NewExtraCredit() {
  const { amount: initial } = useLocalSearchParams<{ amount?: string }>();
  const { profile } = useAuth();
  const [raw, setRaw] = useState(initial ?? '');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<SendError | null>(null);

  const amount = normalizeAmountInput(raw);
  const valid = isValidAmount(amount);
  const available = profile?.credit_available_usd;
  const excess = valid && available ? toBig(amount).minus(toBig(available)) : null;

  const submit = async () => {
    if (!valid) return setError({ kind: 'other', msg: 'Escribe un monto válido.', retryable: false });
    setError(null);
    const check = await confirmSensitiveAction(`Confirma la solicitud de ${formatUsd(amount)}`);
    if (!check.ok) return setError({ kind: 'other', msg: check.message, retryable: false });
    setSending(true);
    try {
      const req = await appApi.requestExtraCredit(amount, note.trim() || undefined);
      router.replace({ pathname: '/extra-credit/[id]', params: { id: req.id, created: '1' } });
    } catch (e) {
      if (e instanceof ApiError && e.reason === 'within_credit_limit') {
        setError({ kind: 'within_limit', msg: messageFor(e) });
      } else if (e instanceof ApiError && e.reason === 'extra_credit_request_pending') {
        setError({ kind: 'pending', msg: messageFor(e) });
      } else {
        setError({ kind: 'other', msg: messageFor(e), retryable: e instanceof ApiError && e.retryable });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Pedir extra-crédito" subtitle={`Tu cupo disponible: ${formatUsd(available)}`} />
      <Screen edges={['bottom']}>
        <Banner
          tone="info"
          title="¿Qué es un extra-crédito?"
          message="Es un monto mayor a tu cupo. No se envía de inmediato: RRHH de tu empresa lo revisa y puede aprobarlo completo, por un monto menor o rechazarlo. Te avisamos por correo."
        />

        <Card style={{ marginTop: space.md }}>
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
              placeholderTextColor={colors.border}
              style={styles.amountInput}
              accessibilityLabel="Monto del extra-crédito"
            />
          </View>
          {excess && excess.gt(0) ? (
            <>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.sm }} />
              <Row label="Tu cupo disponible" value={formatUsd(available)} />
              <Row label="Por encima del cupo" value={formatUsd(excess.toFixed(2))} strong />
            </>
          ) : null}
        </Card>

        <Card style={{ marginTop: space.md }}>
          <Field
            label="¿Para qué lo necesitas? (opcional)"
            icon="chatbubble-ellipses-outline"
            value={note}
            onChangeText={(v) => setNote(v.slice(0, NOTE_MAX))}
            placeholder="Ej. Una emergencia médica"
            multiline
            hint={`Lo lee RRHH al revisar tu solicitud. ${note.length}/${NOTE_MAX}`}
          />
        </Card>

        {error ? (
          <View style={{ marginTop: space.md, gap: space.sm }}>
            <Banner
              tone={error.kind === 'other' ? 'error' : 'warning'}
              title={
                error.kind === 'within_limit'
                  ? 'Este monto entra en tu cupo'
                  : error.kind === 'pending'
                    ? 'Ya tienes una solicitud en revisión'
                    : error.retryable
                      ? 'No pudimos confirmar'
                      : undefined
              }
              message={
                error.kind === 'other' && error.retryable
                  ? `${error.msg} Reintentar no duplica la solicitud.`
                  : error.kind === 'pending'
                    ? `${error.msg} Puedes cancelarla y pedir otra.`
                    : error.msg
              }
            />
            {error.kind === 'within_limit' ? (
              <Button
                title="Pedir como crédito normal"
                variant="outline"
                icon="flash"
                onPress={() => router.replace('/request')}
              />
            ) : null}
            {error.kind === 'pending' ? (
              <Button
                title="Ver mi solicitud"
                variant="outline"
                icon="time-outline"
                onPress={() => router.replace('/extra-credit')}
              />
            ) : null}
          </View>
        ) : null}

        <Button
          title={error?.kind === 'other' && error.retryable ? 'Reintentar' : 'Enviar solicitud a RRHH'}
          icon="paper-plane"
          style={{ marginTop: space.lg }}
          disabled={!valid}
          loading={sending}
          onPress={submit}
        />
        <T variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.sm }}>
          Solo puedes tener una solicitud en revisión a la vez.
        </T>
      </Screen>
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
});
