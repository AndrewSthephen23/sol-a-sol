'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';

import { errorMessage, NETWORK_ERROR, problemCode } from '@/shared/api/problem';
import { useApi } from '@/shared/session/session-provider';

import { INPUT } from './field';
import { categoryGroups, paymentMethodOptions } from './form-options';
import {
  type CategoryChoice,
  categoryKey,
  checkDecisions,
  IMPORT_MAX_BYTES,
  type ImportPreview,
  importErrorMessage,
  importRequest,
  type ImportResult,
  KIND_LABELS,
  type MethodChoice,
  type NewMethod,
  type PaymentMethodKind,
  type PendingCategory,
  type PendingMethod,
  proposedDecisions,
  rowProblemMessage,
} from './import-model';
import { TYPE_LABELS } from './labels';
import { type Category, type PaymentMethod, useCategories, usePaymentMethods } from './queries';

/** Cuántos problemas se listan: con miles de filas malas, los primeros ya dicen qué corregir. */
const PROBLEMS_SHOWN = 100;
const TEMPLATE =
  'fecha,tipo,categoria,subcategoria,monto,moneda,descripcion,metodo_pago,comercio,destino,monto_destino,etiquetas';
const CARD = 'rounded-lg border border-stone-200 bg-white p-4';
const BUTTON =
  'rounded-md bg-amber-500 px-4 py-3 font-semibold text-white hover:bg-amber-600 disabled:opacity-50';

type Answer<T> = { ok: true; data: T } | { ok: false; message: string };

function failure(problem: unknown): Answer<never> {
  const code = problemCode(problem);

  return { ok: false, message: importErrorMessage(code) ?? errorMessage(code) };
}

function lines(count: number): string {
  return count === 1 ? '1 fila' : `${String(count)} filas`;
}

/**
 * Importar un CSV en dos pasos (decisión 5 de H3): la vista previa no guarda nada y muestra qué
 * entraría, cada problema por línea y lo que falta en la cuenta; la confirmación guarda **todo o
 * nada**, con una decisión por cada categoría y método pendiente.
 *
 * El archivo se lee aquí como texto y viaja en el JSON. No se guarda en ningún sitio.
 */
export function ImportScreen() {
  const api = useApi();
  const client = useQueryClient();
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewing = useMutation({
    mutationFn: async (csv: string): Promise<Answer<ImportPreview>> => {
      const { data, error: problem } = await api.POST('/api/v1/transactions/import/preview', {
        body: { csv },
      });

      return data === undefined ? failure(problem) : { ok: true, data };
    },
  });
  const confirming = useMutation({
    mutationFn: async (body: Parameters<typeof importRequest>): Promise<Answer<ImportResult>> => {
      const { data, error: problem } = await api.POST('/api/v1/transactions/import', {
        body: importRequest(...body),
      });

      return data === undefined ? failure(problem) : { ok: true, data };
    },
    // Pueden haber entrado movimientos, categorías, métodos y etiquetas: todo se vuelve a pedir.
    onSuccess: () => client.invalidateQueries(),
  });

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (chosen === undefined) return;
    setPreview(null);
    setError(null);
    if (chosen.size > IMPORT_MAX_BYTES) {
      setError(importErrorMessage('IMPORT_FILE_TOO_LARGE'));

      return;
    }
    const csv = await chosen.text();
    if (csv.trim() === '') {
      setError('El archivo está vacío.');

      return;
    }
    try {
      const answer = await previewing.mutateAsync(csv);
      if (answer.ok) {
        setFile({ name: chosen.name, csv });
        setPreview(answer.data);
      } else {
        setError(answer.message);
      }
    } catch {
      setError(NETWORK_ERROR);
    }
  }

  async function confirm(...args: Parameters<typeof importRequest>) {
    setError(null);
    try {
      const answer = await confirming.mutateAsync(args);
      if (answer.ok) setResult(answer.data);
      else setError(answer.message);
    } catch {
      setError(NETWORK_ERROR);
    }
  }

  if (result !== null) return <ImportDone result={result} />;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <Link href="/transactions" className="text-sm text-stone-600 underline">
        ← Transacciones
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Importar un CSV</h1>

      <section className={`${CARD} flex flex-col gap-3 text-sm`}>
        <p>
          Una fila por movimiento, con esta cabecera. Fechas <code>AAAA-MM-DD</code>, montos con
          punto decimal y hasta 1 MB o 5 000 filas. Guárdalo como «CSV UTF-8».
        </p>
        <code className="overflow-x-auto rounded bg-stone-100 p-2 text-xs whitespace-nowrap">
          {TEMPLATE}
        </code>
        <label className="flex flex-col gap-1 font-medium">
          <span>{file === null ? 'Elige el archivo' : 'Elegir otro archivo'}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={previewing.isPending || confirming.isPending}
            onChange={(event) => void choose(event)}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-amber-100 file:px-3 file:py-2 file:font-medium file:text-amber-900"
          />
        </label>
        <p className="text-stone-500">
          Primero verás qué entraría y qué no. No se guarda nada hasta que confirmes.
        </p>
      </section>

      {previewing.isPending && (
        <output className="text-sm text-stone-600">Revisando el archivo…</output>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {preview !== null && file !== null && (
        <PreviewStep
          key={file.csv}
          fileName={file.name}
          preview={preview}
          pending={confirming.isPending}
          onConfirm={(categories, methods) => void confirm(file.csv, preview, categories, methods)}
        />
      )}
    </main>
  );
}

interface PreviewStepProps {
  fileName: string;
  preview: ImportPreview;
  pending: boolean;
  onConfirm: (
    categories: Record<string, CategoryChoice>,
    methods: Record<string, MethodChoice>,
  ) => void;
}

function PreviewStep({ fileName, preview, pending, onConfirm }: Readonly<PreviewStepProps>) {
  const categoryTree = useCategories();
  const paymentMethods = usePaymentMethods();
  const proposed = useMemo(() => proposedDecisions(preview), [preview]);
  const [categories, setCategories] = useState(proposed.categories);
  const [methods, setMethods] = useState(proposed.methods);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const entering = preview.transactions + preview.transfers;
  const hasProblems = preview.problems.length > 0;

  function submit() {
    const found = checkDecisions(categories, methods);
    setErrors(found);
    if (Object.keys(found).length === 0) onConfirm(categories, methods);
  }

  return (
    <section aria-labelledby="preview-title" className="flex flex-col gap-4">
      <div className={CARD}>
        <h2 id="preview-title" className="font-semibold">
          Vista previa de «{fileName}»
        </h2>
        <ul className="mt-2 list-disc pl-5 text-sm">
          <li>
            {lines(preview.rows)} leídas: {String(preview.transactions)}{' '}
            {preview.transactions === 1 ? 'transacción' : 'transacciones'} y{' '}
            {String(preview.transfers)}{' '}
            {preview.transfers === 1 ? 'transferencia' : 'transferencias'}.
          </li>
          {preview.alreadyImported.length > 0 && (
            <li>
              {preview.alreadyImported.length === 1
                ? '1 fila ya se importó antes y se omitirá.'
                : `${String(preview.alreadyImported.length)} filas ya se importaron antes y se omitirán.`}
            </li>
          )}
          {preview.newTags.length > 0 && <li>Etiquetas nuevas: {preview.newTags.join(', ')}.</li>}
          {preview.ignoredColumns.length > 0 && (
            <li>
              Columnas que no son del formato y se ignoran: {preview.ignoredColumns.join(', ')}. Si
              alguna era un error de tipeo, corrígela en el archivo.
            </li>
          )}
        </ul>
      </div>

      {hasProblems ? (
        <ProblemList problems={preview.problems} />
      ) : (
        <>
          {preview.categories.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="font-semibold">Categorías que no están en tu cuenta</h2>
              {preview.categories.map((pending) => {
                const key = categoryKey(pending);
                const choice = categories[key] ?? { action: 'create' };

                return (
                  <CategoryDecision
                    key={key}
                    pending={pending}
                    choice={choice}
                    error={errors[key]}
                    tree={categoryTree.data ?? []}
                    onChange={(next) => {
                      setCategories((current) => ({ ...current, [key]: next }));
                    }}
                  />
                );
              })}
            </div>
          )}
          {preview.paymentMethods.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="font-semibold">Métodos de pago que no están en tu cuenta</h2>
              {preview.paymentMethods.map((pending) => (
                <MethodDecision
                  key={pending.alias}
                  pending={pending}
                  choice={methods[pending.alias] ?? { action: 'restore' }}
                  error={errors[pending.alias]}
                  methods={paymentMethods.data ?? []}
                  onChange={(next) => {
                    setMethods((current) => ({ ...current, [pending.alias]: next }));
                  }}
                />
              ))}
            </div>
          )}
          {Object.keys(errors).length > 0 && (
            <p role="alert" className="text-sm text-red-700">
              Revisa las decisiones marcadas antes de importar.
            </p>
          )}
          <button
            type="button"
            disabled={pending || entering === 0}
            onClick={submit}
            className={BUTTON}
          >
            {pending
              ? 'Importando…'
              : entering === 0
                ? 'No hay nada nuevo que importar'
                : `Importar ${String(entering)} ${entering === 1 ? 'movimiento' : 'movimientos'}`}
          </button>
        </>
      )}
    </section>
  );
}

function ProblemList({ problems }: Readonly<{ problems: ImportPreview['problems'] }>) {
  return (
    <div className={`${CARD} border-red-200`}>
      <h2 className="font-semibold text-red-800">
        {problems.length === 1 ? 'Hay 1 problema' : `Hay ${String(problems.length)} problemas`}
      </h2>
      <p className="mt-1 text-sm text-stone-600">
        La importación entra toda o nada: corrige estas filas en tu archivo y vuelve a elegirlo.
      </p>
      <table className="mt-3 w-full text-left text-sm">
        <thead className="text-stone-500">
          <tr>
            <th scope="col" className="pr-3 font-medium">
              Línea
            </th>
            <th scope="col" className="pr-3 font-medium">
              Columna
            </th>
            <th scope="col" className="font-medium">
              Qué pasa
            </th>
          </tr>
        </thead>
        <tbody>
          {problems.slice(0, PROBLEMS_SHOWN).map((problem) => (
            <tr
              key={`${String(problem.line)}-${problem.field}-${problem.code}`}
              className="align-top"
            >
              <td className="pr-3">{problem.line}</td>
              <td className="pr-3">
                <code>{problem.field}</code>
              </td>
              <td>{rowProblemMessage(problem)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {problems.length > PROBLEMS_SHOWN && (
        <p className="mt-2 text-sm text-stone-600">
          Y {String(problems.length - PROBLEMS_SHOWN)} más. Corrige estos primero.
        </p>
      )}
    </div>
  );
}

/** Un grupo de opciones excluyentes, con su error asociado. */
function Choices<A extends string>({
  legend,
  options,
  value,
  error,
  onChange,
  children,
}: Readonly<{
  legend: string;
  options: readonly [A, string][];
  value: A;
  error: string | undefined;
  onChange: (value: A) => void;
  children?: React.ReactNode;
}>) {
  const id = useId();

  return (
    <fieldset
      className={`${CARD} flex flex-col gap-3 text-sm`}
      aria-describedby={error === undefined ? undefined : `${id}-error`}
    >
      <legend className="float-left mb-1 w-full font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map(([option, label]) => (
          <label key={option} className="flex items-center gap-2">
            <input
              type="radio"
              name={id}
              value={option}
              checked={value === option}
              onChange={() => {
                onChange(option);
              }}
            />
            {label}
          </label>
        ))}
      </div>
      {children}
      {error !== undefined && (
        <p id={`${id}-error`} className="text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function CategoryDecision({
  pending,
  choice,
  error,
  tree,
  onChange,
}: Readonly<{
  pending: PendingCategory;
  choice: CategoryChoice;
  error: string | undefined;
  tree: readonly Category[];
  onChange: (choice: CategoryChoice) => void;
}>) {
  const type = pending.type;
  const name =
    pending.subcategory === null
      ? pending.category
      : `${pending.category} › ${pending.subcategory}`;
  const missing = pending.status === 'missing';
  // Solo categorías activas del mismo tipo: una de otro tipo no puede recibir estas filas.
  const options = categoryGroups(tree.filter((category) => category.type === type)).flatMap(
    (group) => group.options,
  );

  return (
    <Choices
      legend={`${TYPE_LABELS[type]} · ${name} — ${lines(pending.lines.length)}, ${missing ? 'no existe' : 'está archivada'}`}
      options={[
        [missing ? 'create' : 'restore', missing ? 'Crearla' : 'Restaurarla'],
        ['use', 'Usar otra'],
      ]}
      value={choice.action}
      error={error}
      onChange={(action) => {
        onChange(action === 'use' ? { action, categoryId: '' } : { action });
      }}
    >
      {choice.action === 'use' && (
        <select
          aria-label={`Categoría para ${name}`}
          value={choice.categoryId}
          onChange={(event) => {
            onChange({ action: 'use', categoryId: event.target.value });
          }}
          className={INPUT}
        >
          <option value="">Elige una categoría</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Choices>
  );
}

const KINDS = Object.keys(KIND_LABELS) as PaymentMethodKind[];

function MethodDecision({
  pending,
  choice,
  error,
  methods,
  onChange,
}: Readonly<{
  pending: PendingMethod;
  choice: MethodChoice;
  error: string | undefined;
  methods: readonly PaymentMethod[];
  onChange: (choice: MethodChoice) => void;
}>) {
  const missing = pending.status === 'missing';
  const empty: NewMethod = { kind: '', institution: '', last4: '', currency: '' };

  return (
    <Choices
      legend={`«${pending.alias}» — ${lines(pending.lines.length)}, ${missing ? 'no existe' : 'está archivado'}`}
      options={[
        [missing ? 'create' : 'restore', missing ? 'Crearlo' : 'Restaurarlo'],
        ['use', 'Usar otro'],
      ]}
      value={choice.action}
      error={error}
      onChange={(action) => {
        if (action === 'use') onChange({ action, paymentMethodId: '' });
        else if (action === 'create') onChange({ action, ...empty });
        else onChange({ action });
      }}
    >
      {choice.action === 'use' && (
        <select
          aria-label={`Método de pago para «${pending.alias}»`}
          value={choice.paymentMethodId}
          onChange={(event) => {
            onChange({ action: 'use', paymentMethodId: event.target.value });
          }}
          className={INPUT}
        >
          <option value="">Elige un método de pago</option>
          {paymentMethodOptions(methods).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      {choice.action === 'create' && (
        <NewMethodFields
          alias={pending.alias}
          value={choice}
          onChange={(next) => {
            onChange({ action: 'create', ...next });
          }}
        />
      )}
    </Choices>
  );
}

/**
 * Los datos de un método nuevo, solo los que su tipo admite: el efectivo no tiene banco, los
 * últimos 4 son de tarjetas y cuentas, y solo tarjeta y efectivo pueden aceptar las dos monedas.
 * Nunca se piden más que los últimos 4 dígitos de una tarjeta.
 */
function NewMethodFields({
  alias,
  value,
  onChange,
}: Readonly<{ alias: string; value: NewMethod; onChange: (value: NewMethod) => void }>) {
  const set = (patch: Partial<NewMethod>) => {
    onChange({ ...value, ...patch });
  };
  const both = value.kind === 'CREDIT_CARD' || value.kind === 'CASH';
  const last4 = value.kind === 'CREDIT_CARD' || value.kind === 'ACCOUNT';

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span>Tipo</span>
        <select
          value={value.kind}
          onChange={(event) => {
            const kind = event.target.value as PaymentMethodKind | '';
            // Lo que el tipo nuevo no admite se borra, para no mandarlo.
            set({
              kind,
              ...(kind === 'CASH' ? { institution: '' } : {}),
              ...(kind === 'CREDIT_CARD' || kind === 'ACCOUNT' ? {} : { last4: '' }),
              ...(value.currency === 'BOTH' && kind !== 'CREDIT_CARD' && kind !== 'CASH'
                ? { currency: '' }
                : {}),
            });
          }}
          className={INPUT}
          aria-label={`Tipo de «${alias}»`}
        >
          <option value="">Elige el tipo</option>
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span>Moneda</span>
        <select
          value={value.currency}
          onChange={(event) => {
            set({ currency: event.target.value as NewMethod['currency'] });
          }}
          className={INPUT}
          aria-label={`Moneda de «${alias}»`}
        >
          <option value="">Elige la moneda</option>
          <option value="PEN">Soles (S/)</option>
          <option value="USD">Dólares (US$)</option>
          {both && <option value="BOTH">Soles y dólares</option>}
        </select>
      </label>
      {value.kind !== 'CASH' && value.kind !== '' && (
        <label className="flex flex-col gap-1">
          <span>Banco o entidad (opcional)</span>
          <input
            value={value.institution}
            maxLength={60}
            onChange={(event) => {
              set({ institution: event.target.value });
            }}
            className={INPUT}
            aria-label={`Banco de «${alias}»`}
          />
        </label>
      )}
      {last4 && (
        <label className="flex flex-col gap-1">
          <span>Últimos 4 dígitos{value.kind === 'ACCOUNT' ? ' (opcional)' : ''}</span>
          <input
            value={value.last4}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            onChange={(event) => {
              set({ last4: event.target.value });
            }}
            className={INPUT}
            aria-label={`Últimos 4 dígitos de «${alias}»`}
          />
        </label>
      )}
    </div>
  );
}

function ImportDone({ result }: Readonly<{ result: ImportResult }>) {
  const total = result.transactions + result.transfers;
  const created = result.createdCategories + result.createdPaymentMethods;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Importación lista</h1>
      <div className={CARD}>
        <p role="status" className="font-medium">
          Se importaron {String(total)} {total === 1 ? 'movimiento' : 'movimientos'}:{' '}
          {String(result.transactions)}{' '}
          {result.transactions === 1 ? 'transacción' : 'transacciones'} y {String(result.transfers)}{' '}
          {result.transfers === 1 ? 'transferencia' : 'transferencias'}.
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm text-stone-600">
          {result.alreadyImported.length > 0 && (
            <li>
              {result.alreadyImported.length === 1
                ? '1 fila ya estaba importada y se omitió.'
                : `${String(result.alreadyImported.length)} filas ya estaban importadas y se omitieron.`}
            </li>
          )}
          {created > 0 && (
            <li>
              Se crearon {String(result.createdCategories)}{' '}
              {result.createdCategories === 1 ? 'categoría' : 'categorías'} y{' '}
              {String(result.createdPaymentMethods)}{' '}
              {result.createdPaymentMethods === 1 ? 'método de pago' : 'métodos de pago'}.
            </li>
          )}
          {result.restored > 0 && <li>Se restauraron {String(result.restored)} archivados.</li>}
        </ul>
      </div>
      <Link href="/transactions" className={`${BUTTON} text-center`}>
        Ver transacciones
      </Link>
    </main>
  );
}
