import type { AmortizationMethod, LoanInstallment, LoanQuoteInstallment } from '../api/types';
import { formatUsd, toBig, type Money } from './money';

type Inst = Pick<
  LoanQuoteInstallment,
  | 'total_amount_usd'
  | 'principal_component_usd'
  | 'interest_or_fee_component_usd'
  | 'interest_component_usd'
  | 'fee_component_usd'
>;

export const METHOD_LABEL: Record<AmortizationMethod, string> = {
  french: 'Cuota fija',
  german: 'Cuota decreciente',
  flat_prorated: 'Comisión prorrateada',
  flat_interest: 'Interés fijo prorrateado',
};

/** Etiqueta del método; si el servidor manda uno nuevo, el texto crudo (guía §3.2). */
export const methodLabel = (m: string | null | undefined): string | null =>
  m ? (METHOD_LABEL[m as AmortizationMethod] ?? m) : null;

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

type OwedInst = Pick<LoanInstallment, 'status' | 'outstanding_usd' | 'due_date'>;

/**
 * Deuda total de un préstamo = suma de `outstanding_usd` de sus cuotas no pagadas (incluye la mora
 * devengada). Es también el máximo de un abono (guía §9.2).
 */
export function loanOutstanding(xs: OwedInst[]): Money {
  return xs
    .filter((i) => i.status !== 'paid' && i.status !== 'cancelled')
    .reduce((acc, i) => acc.plus(toBig(i.outstanding_usd)), toBig('0'))
    .toFixed(2);
}

/** Próximo vencimiento: la cuota `scheduled` u `overdue` con menor `due_date` (guía §9.2). */
export function nextDue<T extends OwedInst>(xs: T[]): T | null {
  const open = xs.filter((i) => i.status === 'scheduled' || i.status === 'overdue');
  return open.sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;
}

export type InstallmentAlert =
  { kind: 'grace'; until: string } | { kind: 'mora'; mora: Money } | { kind: 'overdue' } | null;

/**
 * Cómo presentar una cuota (guía §9.2 y §11.5): en gracia (venció pero aún no genera mora), en mora
 * o vencida. La gracia perdona el recargo, no el estado: igual bloquea pedir créditos nuevos.
 */
export function installmentAlert(
  i: Pick<
    LoanInstallment,
    'status' | 'in_mora_grace_period' | 'mora_grace_ends_on' | 'mora_accrued_usd' | 'mora_paid_usd'
  >,
): InstallmentAlert {
  if (i.in_mora_grace_period && i.mora_grace_ends_on) return { kind: 'grace', until: i.mora_grace_ends_on };
  if (i.status !== 'overdue') return null;
  const mora = toBig(i.mora_accrued_usd).minus(toBig(i.mora_paid_usd));
  return mora.gt(0) ? { kind: 'mora', mora: mora.toFixed(2) } : { kind: 'overdue' };
}

/** "5 %" a partir de "5.000". */
export const formatPercent = (p: Money) => `${toBig(p).toString().replace('.', ',')} %`;
