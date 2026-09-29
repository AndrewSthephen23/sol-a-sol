import { formatMonth, shiftMonth } from './dates';

/** Mes anterior y siguiente, con el mes en español (`es-PE`: «setiembre»). */
export function MonthNavigator({
  month,
  onChange,
}: Readonly<{ month: string; onChange: (month: string) => void }>) {
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
        onClick={() => {
          onChange(shiftMonth(month, 1));
        }}
        className="rounded-md px-3 py-2 text-xl hover:bg-stone-100"
      >
        ›
      </button>
    </div>
  );
}
