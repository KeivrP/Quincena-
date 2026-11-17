import { View } from 'react-native';
import type { AmortizationMethod, LoanFee } from '../api/types';
import { formatUsd, toBig, type Money } from '../lib/money';
import { formatPercent, methodLabel } from '../lib/schedule';
import { colors, space } from '../theme';
import { Row, T } from './ui';

/**
 * Desglose del costo: intereses + cada comisión por nombre. Si el servidor todavía no manda el
 * desglose (campos de las tandas 2026-11-07/08), muestra solo el costo total.
 */
export function ChargeBreakdown({
  method,
  totalCharge,
  totalInterest,
  totalFees,
  fees,
}: {
  method?: AmortizationMethod | null;
  totalCharge?: Money;
  totalInterest?: Money;
  totalFees?: Money;
  fees?: LoanFee[];
}) {
  const hasBreakdown = totalInterest != null || totalFees != null || (fees?.length ?? 0) > 0;
  return (
    <View>
      {method ? <Row label="Modalidad" value={methodLabel(method) ?? method} /> : null}
      {method === 'flat_interest' ? (
        <T variant="caption" color={colors.textMuted} style={{ marginTop: -space.xs }}>
          Interés fijo sobre el monto por todo el crédito, repartido en partes iguales en cada cuota.
        </T>
      ) : null}
      {hasBreakdown ? (
        <>
          {toBig(totalInterest).gt(0) ? <Row label="Intereses" value={formatUsd(totalInterest)} /> : null}
          {fees?.map((f) => (
            <View key={f.name}>
              <Row label={`${f.name} (${formatPercent(f.percent)})`} value={formatUsd(f.amount_usd)} />
              {f.applied_on_installment ? (
                <T variant="caption" color={colors.textMuted} style={{ marginTop: -space.xs }}>
                  Se cobra en la cuota {f.applied_on_installment}
                </T>
              ) : null}
            </View>
          ))}
          {!fees?.length && toBig(totalFees).gt(0) ? <Row label="Comisiones" value={formatUsd(totalFees)} /> : null}
        </>
      ) : totalCharge != null ? (
        <Row label="Costo del crédito" value={formatUsd(totalCharge)} />
      ) : null}
    </View>
  );
}
