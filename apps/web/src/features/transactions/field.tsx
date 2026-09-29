import { useId } from 'react';
import type { ReactElement } from 'react';

export const INPUT =
  'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-base focus:border-amber-500 focus:outline-none aria-invalid:border-red-600';

export interface ControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
}

interface FieldProps {
  label: string;
  error: string | undefined;
  hint?: string;
  /** Recibe lo que asocia el control con su etiqueta y su error. */
  children: (control: ControlProps) => ReactElement;
}

/**
 * Un campo con su etiqueta, una pista opcional y su error **asociado al control**
 * (`aria-describedby`): un lector de pantalla lo lee al llegar al campo, no solo arriba.
 */
export function Field({ label, error, hint, children }: Readonly<FieldProps>) {
  const id = useId();
  const described = [
    hint === undefined ? null : `${id}-hint`,
    error === undefined ? null : `${id}-error`,
  ]
    .filter((part) => part !== null)
    .join(' ');

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error !== undefined,
        ...(described === '' ? {} : { 'aria-describedby': described }),
      })}
      {hint !== undefined && (
        <p id={`${id}-hint`} className="text-stone-500">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={`${id}-error`} className="text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
