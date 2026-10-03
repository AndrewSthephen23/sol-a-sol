import { formatMonth, shiftMonth } from './dates';

/**
 * Un periodo con sus botones de anterior y siguiente. Lo comparten el selector de mes y el de año,
 * para no repetir los botones ni su accesibilidad.
 */
export function PeriodNavigator({
  label,
  unit,
  canGoBack = true,
  canGoForward = true,
  onStep,
}: Readonly<{
  label: string;
  /** «Mes» o «Año»: nombra los botones para un lector de pantalla. */
  unit: 'Mes' | 'Año';
  canGoBack?: boolean;
  canGoForward?: boolean;
  onStep: (delta: -1 | 1) => void;
}>) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        aria-label={`${unit} anterior`}
        disabled={!canGoBack}
        onClick={() => {
          onStep(-1);
        }}
        className="rounded-md px-3 py-2 text-xl hover:bg-stone-100 disabled:opacity-30"
      >
        ‹
      </button>
      <p aria-live="polite" className="font-semibold first-letter:uppercase">
        {label}
      </p>
      <button
        type="button"
        aria-label={`${unit} siguiente`}
        disabled={!canGoForward}
        onClick={() => {
          onStep(1);
        }}
        className="rounded-md px-3 py-2 text-xl hover:bg-stone-100 disabled:opacity-30"
      >
        ›
      </button>
    </div>
  );
}

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
    <PeriodNavigator
      label={formatMonth(month)}
      unit="Mes"
      canGoForward={max === undefined || month < max}
      onStep={(delta) => {
        onChange(shiftMonth(month, delta));
      }}
    />
  );
}
