'use client';

import { useEffect, useRef, useState } from 'react';

import { NETWORK_ERROR } from '@/shared/api/problem';

import { categoriesById } from '@/features/transactions/labels';
import type { Category } from '@/features/transactions/queries';

import { captureErrorMessage } from './capture-model';
import { useDeleteRule } from './queries';
import { RuleForm } from './rule-form';
import type { Rule } from './rules-model';

const SECONDARY =
  'rounded-md border border-stone-300 px-3 py-1 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50';
const NOTICE = 'rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600';

/** El id del elemento de una regla, para resaltarla desde la bandeja. */
export function ruleElementId(ruleId: string): string {
  return `regla-${ruleId}`;
}

function RuleItem({
  rule,
  categories,
  highlighted,
}: Readonly<{ rule: Rule; categories: readonly Category[]; highlighted: boolean }>) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = useDeleteRule();
  const element = useRef<HTMLLIElement>(null);
  const category = categoriesById(categories).get(rule.categoryId);

  useEffect(() => {
    if (highlighted) element.current?.scrollIntoView({ block: 'center' });
  }, [highlighted]);

  async function onDelete() {
    setError(null);
    const outcome = await remove.mutateAsync(rule.id).catch(() => null);
    if (outcome === null) setError(NETWORK_ERROR);
    else if (!outcome.ok) setError(captureErrorMessage(outcome.code));
  }

  return (
    <li
      ref={element}
      id={ruleElementId(rule.id)}
      aria-label={`Regla «${rule.pattern}»`}
      className={`flex flex-col gap-3 rounded-lg border bg-white p-4 ${highlighted ? 'border-amber-500 ring-2 ring-amber-300' : 'border-stone-200'}`}
    >
      {editing ? (
        <RuleForm
          rule={rule}
          categories={categories}
          onDone={() => {
            setEditing(false);
          }}
        />
      ) : (
        <>
          <p className="text-sm">
            Si el comercio contiene <strong>«{rule.pattern}»</strong> →{' '}
            <strong>{category?.name ?? 'Categoría borrada'}</strong>
            {category?.archivedAt != null && ' (archivada: no sugiere)'}
          </p>
          <p className="text-xs text-stone-500">Prioridad {rule.priority}</p>
          {confirming ? (
            <div role="group" aria-label="Confirmar el borrado" className="flex flex-col gap-2">
              <p className="text-sm">
                ¿Borrar la regla «{rule.pattern}»? Lo que ya sugirió se queda.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => void onDelete()}
                  className="rounded-md bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Sí, borrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                  }}
                  className={SECONDARY}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                }}
                className={SECONDARY}
              >
                Corregir
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(true);
                }}
                className={SECONDARY}
              >
                Borrar
              </button>
            </div>
          )}
          {error !== null && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </>
      )}
    </li>
  );
}

/**
 * Las reglas de categorización (decisiones 12 y 13), en su pestaña de la bandeja (decidido el
 * 2026-10-04): primero la de mayor prioridad. Crear o corregir una vuelve a sugerir en las
 * capturas sin categoría.
 */
export function RulesPanel({
  rules,
  categories,
  highlighted,
}: Readonly<{
  rules: readonly Rule[];
  categories: readonly Category[];
  highlighted: string | null;
}>) {
  const [creating, setCreating] = useState(false);

  return (
    <section aria-label="Reglas" className="flex flex-col gap-4">
      <p className="text-sm text-stone-600">
        Sugieren la categoría de lo que llega del teléfono según el comercio. También se crean al
        confirmar con «Recordar la categoría».
      </p>
      {creating ? (
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <RuleForm
            rule={null}
            categories={categories}
            onDone={() => {
              setCreating(false);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setCreating(true);
          }}
          className="self-start rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
        >
          Nueva regla
        </button>
      )}
      {rules.length === 0 ? (
        <p className={NOTICE}>Todavía no tienes reglas.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rules.map((rule) => (
            <RuleItem
              key={rule.id}
              rule={rule}
              categories={categories}
              highlighted={rule.id === highlighted}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
