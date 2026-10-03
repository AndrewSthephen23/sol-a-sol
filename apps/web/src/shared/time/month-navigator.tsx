import { formatMonth, shiftMonth } from './dates';

/**
 * Mes anterior y siguiente, con el mes en español (`es-PE`: «setiembre»). Con `max`, no se pasa
 * de ese mes: un resumen de un mes que no empezó no existe.
 */
export function MonthNavigator({
  month,
  max,
  onChange,
}: Readonly<{ month: string; max?: string; onChange: (month: string) => void }>) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        aria-label="Mes anterior"
        onClick={() => {
          onChange(shiftMonth(month, -1));
        }}
        className="rounded-md px-3 py-2 text-xl hover:bg-stone-100"
      >
        ‹
      </button>
      <p aria-live="polite" className="font-semibold first-letter:uppercase">
        {formatMonth(month)}
      </p>
      <button
        type="button"
        aria-label="Mes siguiente"
        disabled={max !== undefined && month >= max}
        onClick={() => {
          onChange(shiftMonth(month, 1));
        }}
        className="rounded-md px-3 py-2 text-xl hover:bg-stone-100 disabled:opacity-30"
      >
        ›
      </button>
    </div>
  );
}
