'use client';

import { useState } from 'react';
import type { SubmitEvent } from 'react';

import { errorMessage, NETWORK_ERROR } from '@/shared/api/problem';

import type { SaveOutcome } from './queries';

type Errors<F extends string> = Partial<Record<F, string>>;

interface CheckedFormOptions<V, B, F extends string> {
  initial: V;
  /** Revisa lo escrito y arma el cuerpo, o dice qué campos están mal. */
  check: (values: V) => { body: B } | { errors: Errors<F> };
  save: (body: B) => Promise<SaveOutcome>;
  /** Dónde va cada error de la API: junto a su campo, o arriba del botón (`field: null`). */
  place: (code: string | null) => { field: F | null; message: string } | null;
  onSaved: () => void;
}

/**
 * Un formulario de metas: los valores, revisarlos, guardar **una sola vez** aunque se pulse de
 * nuevo, y poner cada error de la API junto a su campo (o arriba del botón si no tiene uno).
 */
export function useCheckedForm<V extends object, B, F extends string>({
  initial,
  check,
  save,
  place,
  onSaved,
}: CheckedFormOptions<V, B, F>) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Errors<F>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof V>(field: K, value: V[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const checked = check(values);
    setFormError(null);
    if ('errors' in checked) {
      setErrors(checked.errors);

      return;
    }
    setErrors({});
    setPending(true);
    try {
      const outcome = await save(checked.body);
      if (outcome.ok) {
        onSaved();

        return;
      }
      const placed = place(outcome.code);
      if (placed?.field != null) setErrors({ [placed.field]: placed.message } as Errors<F>);
      else setFormError(placed?.message ?? errorMessage(outcome.code));
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return { values, set, errors, formError, pending, submit };
}
