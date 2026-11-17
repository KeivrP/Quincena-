import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ApiError, messageFor } from '../../api/errors';
import { appApi } from '../../api/endpoints';
import type { ExtraCreditRequest } from '../../api/types';
import { approvedForLess, extraCreditPill } from '../../components/ExtraCreditCard';
import { Banner, Button, Card, OrangeHeader, Row, Screen, T } from '../../components/ui';
import { formatUsd, toBig } from '../../lib/money';
import { formatInstantDate } from '../../lib/validators';
import { colors, space } from '../../theme';

export default function ExtraCreditDetail() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const [req, setReq] = useState<ExtraCreditRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      const fresh = await appApi.extraCreditRequest(id);
      setReq(fresh);
      setError(null);
    } catch (e) {
      setError(messageFor(e));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const cancel = async () => {
    setCancelling(true);
    try {
      setReq(await appApi.cancelExtraCredit(id));
      setConfirmCancel(false);
    } catch (e) {
      // 409: RRHH la resolvió mientras tanto; recargamos para mostrar el estado real.
      if (e instanceof ApiError && e.status === 409) await load();
      setError(messageFor(e));
      setConfirmCancel(false);
    } finally {
      setCancelling(false);
    }
  };

  const excess = req
    ? toBig(req.requested_amount_usd)
        .minus(toBig(req.snapshot_credit_limit_usd).minus(toBig(req.snapshot_outstanding_principal_usd)))
        .toFixed(2)
    : '0.00';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OrangeHeader title="Extra-crédito" />
      <Screen edges={['bottom']}>
        {error ? (
          <View style={{ marginBottom: space.md }}>
            <Banner tone="error" message={error} />
          </View>
        ) : null}
        {!req && !error ? <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} /> : null}
        {req ? (
          <>
            {created && req.status === 'pending' ? (
              <View style={{ marginBottom: space.md }}>
                <Banner
                  tone="success"
                  title="Solicitud enviada"
                  message="RRHH de tu empresa la revisará. Te avisamos por correo cuando la resuelva."
                />
              </View>
            ) : null}

            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T variant="label" color={colors.textMuted}>
                  Monto pedido
                </T>
                {extraCreditPill(req.status)}
              </View>
              <T variant="amount">{formatUsd(req.requested_amount_usd)}</T>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.sm }} />
              <Row label="Tu cupo al pedirlo" value={formatUsd(req.snapshot_credit_limit_usd)} />
              <Row label="Deuda al pedirlo" value={formatUsd(req.snapshot_outstanding_principal_usd)} />
              {toBig(excess).gt(0) ? <Row label="Por encima del cupo" value={formatUsd(excess)} /> : null}
              <Row label="Fecha" value={formatInstantDate(req.created_at)} />
              {req.employee_note ? (
                <View style={{ marginTop: space.sm }}>
                  <T variant="caption" color={colors.textMuted}>
                    Tu nota
                  </T>
                  <T>{req.employee_note}</T>
                </View>
              ) : null}
            </Card>

            {req.status === 'approved' && req.approved_amount_usd ? (
              <View style={{ marginTop: space.md, gap: space.sm }}>
                <Banner
                  tone="success"
                  title={approvedForLess(req) ? 'Aprobado por un monto menor' : '¡Aprobado!'}
                  message={
                    approvedForLess(req)
                      ? `RRHH aprobó ${formatUsd(req.approved_amount_usd)} de los ${formatUsd(req.requested_amount_usd)} que pediste. El dinero se envió a tu pago móvil.`
                      : `Te enviamos ${formatUsd(req.approved_amount_usd)} a tu pago móvil.`
                  }
                />
                {req.loan_id ? (
                  <Button
                    title="Ver el crédito y sus cuotas"
                    icon="list"
                    onPress={() => router.push({ pathname: '/credit/[id]', params: { id: req.loan_id! } })}
                  />
                ) : null}
              </View>
            ) : null}

            {req.status === 'rejected' ? (
              <View style={{ marginTop: space.md }}>
                <Banner
                  tone="error"
                  title="RRHH rechazó la solicitud"
                  message={req.rejection_reason ?? 'Consulta con RRHH de tu empresa.'}
                />
              </View>
            ) : null}

            {req.resolved_at && req.status !== 'cancelled' ? (
              <T variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.sm }}>
                Resuelta el {formatInstantDate(req.resolved_at)}
                {req.resolved_by ? ` por ${req.resolved_by.full_name}` : ''}
              </T>
            ) : null}

            {req.status === 'pending' ? (
              confirmCancel ? (
                <Card style={{ marginTop: space.lg }}>
                  <T variant="h3">¿Cancelar la solicitud?</T>
                  <T color={colors.textMuted} style={{ marginTop: space.xs, marginBottom: space.md }}>
                    RRHH ya no la verá. Después puedes pedir otra.
                  </T>
                  <Button title="Sí, cancelar" variant="dark" loading={cancelling} onPress={cancel} />
                  <Button
                    title="No, mantenerla"
                    variant="ghost"
                    disabled={cancelling}
                    onPress={() => setConfirmCancel(false)}
                  />
                </Card>
              ) : (
                <View style={{ marginTop: space.lg, gap: space.sm }}>
                  <Button title="Actualizar estado" variant="outline" icon="refresh" onPress={load} />
                  <Button title="Cancelar solicitud" variant="ghost" onPress={() => setConfirmCancel(true)} />
                </View>
              )
            ) : null}

            {req.status === 'rejected' || req.status === 'cancelled' ? (
              <Button
                title="Pedir otro extra-crédito"
                variant="outline"
                icon="add"
                style={{ marginTop: space.lg }}
                onPress={() => router.replace('/extra-credit/new')}
              />
            ) : null}
          </>
        ) : null}
      </Screen>
    </View>
  );
}
