import type { AmortizationMethod, LoanQuoteInstallment } from '../api/types';
import { formatUsd, toBig, type Money } from './money';

type Inst = Pick<
  LoanQuoteInstallment,
  'total_amount_usd' | 'principal_component_usd' | 'interest_or_fee_component_usd' | 'interest_component_usd' | 'fee_component_usd'
>;

export const METHOD_LABEL: Record<AmortizationMethod, string> = {
  french: 'Cuota fija',
  german: 'Cuota decreciente',
  flat_prorated: 'Comisión prorrateada',
};

/**
 * Cómo se ve el cronograma, a partir de los montos (no del método: con `french` + comisiones la
 * cuota 1 es más alta, y la última cuota puede diferir por un centavo de ajuste).
 */
export type ScheduleShape =
  | { kind: 'even'; amount: Money }
  | { kind: 'first_higher'; first: Money; rest: Money }
  | { kind: 'declining'; first: Money; last: Money }
  | { kind: 'irregular'; first: Money };

const CENT = toBig('0.01');
const near = (a: Money, b: Money) => toBig(a).minus(b).abs().lte(CENT);

/** Iguales salvo la última, que puede moverse un centavo. */
function isEven(xs: Inst[]): boolean {
  if (xs.length <= 1) return true;
  const ref = xs[0].total_amount_usd;
  return xs.every((x, i) => (i === xs.length - 1 ? near(x.total_amount_usd, ref) : toBig(x.total_amount_usd).eq(ref)));
}

export function scheduleShape(xs: Inst[]): ScheduleShape {
  const first = xs[0]?.total_amount_usd ?? '0';
  const last = xs[xs.length - 1]?.total_amount_usd ?? '0';
  if (isEven(xs)) return { kind: 'even', amount: first };
  const rest = xs.slice(1);
  if (rest.length && isEven(rest) && toBig(first).gt(rest[0].total_amount_usd))
    return { kind: 'first_higher', first, rest: rest[0].total_amount_usd };
  const declining = xs.every((x, i) => i === 0 || toBig(x.total_amount_usd).lte(xs[i - 1].total_amount_usd));
  if (declining) return { kind: 'declining', first, last };
  return { kind: 'irregular', first };
}

/** Texto corto que acompaña al titular "Pagarás…" cuando la cuota no es pareja. */
export function shapeHint(shape: ScheduleShape, count: number): string | null {
  switch (shape.kind) {
    case 'first_higher':
      return `La primera cuota incluye las comisiones; luego ${count - 1} cuota${count - 1 === 1 ? '' : 's'} de ${formatUsd(shape.rest)}.`;
    case 'declining':
      return `Pagas más al principio y menos al final: las cuotas bajan hasta ${formatUsd(shape.last)}.`;
    case 'irregular':
      return 'El monto de cada cuota varía. Revisa el cronograma.';
    default:
      return null;
  }
}

/**
 * "Capital $X · Interés $Y · Comisión $Z" de una cuota. Si el servidor aún no manda el desglose,
 * cae al total combinado.
 */
export function installmentBreakdown(i: Inst): string {
  const parts = [`Capital ${formatUsd(i.principal_component_usd)}`];
  if (i.interest_component_usd != null || i.fee_component_usd != null) {
    if (toBig(i.interest_component_usd).gt(0)) parts.push(`Interés ${formatUsd(i.interest_component_usd)}`);
    if (toBig(i.fee_component_usd).gt(0)) parts.push(`Comisión ${formatUsd(i.fee_component_usd)}`);
  } else if (toBig(i.interest_or_fee_component_usd).gt(0)) {
    parts.push(`Interés/comisión ${formatUsd(i.interest_or_fee_component_usd)}`);
  }
  return parts.join(' · ');
}

/** "5 %" a partir de "5.000". */
export const formatPercent = (p: Money) => `${toBig(p).toString().replace('.', ',')} %`;
