'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { Clock } from '@sol-a-sol/domain';

import { useUndoNotice } from '@/shared/feedback/undo-toast';
import { currentMonth, systemClock, todayIn } from '@/shared/time/dates';

import { lastPaymentMethod } from './form-options';
import type { TransactionValues, TransferValues } from './movement-form-model';
import { type MovementKind, useDeleteMovement, useMovement } from './mutations';
import { useCategories, usePaymentMethods } from './queries';
import { TransactionForm } from './transaction-form';
import { TransferForm } from './transfer-form';

const NOTICE = 'rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600';

/** La lista del mes del movimiento: al guardar o borrar se vuelve a donde se lo ve. */
export function listUrl(date: string, clock: Clock): string {
  const month = date.slice(0, 7);

  return month === currentMonth(clock) ? '/transactions' : `/transactions?month=${month}`;
}

/** Borra un movimiento y ofrece «Deshacer» unos segundos. Devuelve si se borró. */
export function useDeleteWithUndo(): (kind: MovementKind, id: string) => Promise<boolean> {
  const { remove, restore } = useDeleteMovement();
  const notify = useUndoNotice();

  return async (kind, id) => {
    const outcome = await remove.mutateAsync({ kind, id }).catch(() => ({ ok: false as const }));
    if (!outcome.ok) return false;
    notify({
      message: kind === 'transaction' ? 'Movimiento borrado.' : 'Transferencia borrada.',
      undo: async () => (await restore.mutateAsync({ kind, id })).ok,
    });

    return true;
  };
}

function useCatalog() {
  const categories = useCategories();
  const paymentMethods = usePaymentMethods();

  return {
    ready: categories.isSuccess && paymentMethods.isSuccess,
    failed: categories.isError || paymentMethods.isError,
    categories: categories.data ?? [],
    paymentMethods: paymentMethods.data ?? [],
  };
}

function Screen({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-6">
      <Link href="/transactions" className="text-sm text-stone-600 underline">
        ← Transacciones
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}

/** Registrar: una transacción (lo más común) o una transferencia entre cuentas propias. */
export function NewMovementScreen({ clock = systemClock }: Readonly<{ clock?: Clock }>) {
  const router = useRouter();
  const catalog = useCatalog();
  const [kind, setKind] = useState<MovementKind>('transaction');
  const today = useMemo(() => todayIn(clock), [clock]);

  const lastMethod = useMemo(() => {
    const id = lastPaymentMethod.read();
    const method = catalog.paymentMethods.find((candidate) => candidate.id === id);

    return method?.archivedAt === null ? method.id : null;
  }, [catalog.paymentMethods]);

  const onSaved = (date: string) => {
    router.push(listUrl(date, clock));
  };

  return (
    <Screen title="Registrar">
      <fieldset className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1 text-sm font-medium">
        <legend className="sr-only">Qué registrar</legend>
        {(['transaction', 'transfer'] as const).map((option) => (
          <label
            key={option}
            className={`cursor-pointer rounded-md px-3 py-2 text-center has-focus-visible:ring-2 has-focus-visible:ring-amber-500 ${
              kind === option ? 'bg-white shadow-sm' : 'text-stone-600'
            }`}
          >
            <input
              type="radio"
              name="kind"
              value={option}
              checked={kind === option}
              onChange={() => {
                setKind(option);
              }}
              className="sr-only"
            />
            {option === 'transaction' ? 'Gasto o ingreso' : 'Transferencia'}
          </label>
        ))}
      </fieldset>

      {catalog.failed && (
        <p role="alert" className={NOTICE}>
          No se pudieron cargar tus categorías y métodos de pago.
        </p>
      )}
      {!catalog.ready && !catalog.failed && <output className={NOTICE}>Cargando…</output>}
      {catalog.ready &&
        (kind === 'transaction' ? (
          <TransactionForm
            id={null}
            initial={{
              date: today,
              categoryId: '',
              amount: '',
              currency: null,
              paymentMethodId: lastMethod,
              description: '',
              merchant: '',
              tags: '',
            }}
            categories={catalog.categories}
            paymentMethods={catalog.paymentMethods}
            today={today}
            onSaved={onSaved}
          />
        ) : (
          <TransferForm
            id={null}
            initial={{
              date: today,
              fromPaymentMethodId: lastMethod ?? '',
              toPaymentMethodId: '',
              amount: '',
              currency: null,
              receivedAmount: '',
              description: '',
            }}
            paymentMethods={catalog.paymentMethods}
            today={today}
            onSaved={onSaved}
          />
        ))}
    </Screen>
  );
}

interface EditMovementScreenProps {
  kind: MovementKind;
  id: string;
  clock?: Clock;
}

/** Corregir o borrar un movimiento existente. Los de meses pasados también (decisión 6 de H3). */
export function EditMovementScreen({
  kind,
  id,
  clock = systemClock,
}: Readonly<EditMovementScreenProps>) {
  const router = useRouter();
  const catalog = useCatalog();
  const movement = useMovement(kind, id);
  const deleteWithUndo = useDeleteWithUndo();
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const today = useMemo(() => todayIn(clock), [clock]);
  const title = kind === 'transaction' ? 'Corregir movimiento' : 'Corregir transferencia';

  if (movement.isError || catalog.failed) {
    return (
      <Screen title={title}>
        <p role="alert" className={NOTICE}>
          No se pudo cargar el movimiento.
        </p>
      </Screen>
    );
  }
  if (movement.data === null) {
    return (
      <Screen title={title}>
        <p className={NOTICE}>Este movimiento no existe o ya se borró.</p>
      </Screen>
    );
  }
  if (movement.data === undefined || !catalog.ready) {
    return (
      <Screen title={title}>
        <output className={NOTICE}>Cargando…</output>
      </Screen>
    );
  }

  const data = movement.data;
  const back = () => {
    router.push(listUrl(data.date, clock));
  };

  async function remove() {
    setDeleting(true);
    setDeleteFailed(false);
    if (await deleteWithUndo(kind, id)) {
      back();
    } else {
      setDeleting(false);
      setDeleteFailed(true);
    }
  }

  return (
    <Screen title={title}>
      {'categoryId' in data ? (
        <TransactionForm
          id={id}
          initial={transactionValues(data)}
          categories={catalog.categories}
          paymentMethods={catalog.paymentMethods}
          today={today}
          onSaved={back}
        />
      ) : (
        <TransferForm
          id={id}
          initial={transferValues(data)}
          paymentMethods={catalog.paymentMethods}
          today={today}
          onSaved={back}
        />
      )}
      {deleteFailed && (
        <p role="alert" className="text-sm text-red-700">
          No se pudo borrar. Inténtalo de nuevo.
        </p>
      )}
      <button
        type="button"
        disabled={deleting}
        onClick={() => void remove()}
        className="rounded-md border border-red-300 px-4 py-2 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {deleting ? 'Borrando…' : 'Borrar'}
      </button>
    </Screen>
  );
}

type LoadedMovement = NonNullable<ReturnType<typeof useMovement>['data']>;

function transactionValues(
  data: Extract<LoadedMovement, { categoryId: string }>,
): TransactionValues {
  return {
    date: data.date,
    categoryId: data.categoryId,
    amount: data.amount,
    currency: data.currency,
    paymentMethodId: data.paymentMethodId,
    description: data.description,
    merchant: data.merchant ?? '',
    tags: data.tags.join(', '),
  };
}

function transferValues(data: Exclude<LoadedMovement, { categoryId: string }>): TransferValues {
  return {
    date: data.date,
    fromPaymentMethodId: data.fromPaymentMethodId,
    toPaymentMethodId: data.toPaymentMethodId,
    amount: data.amount,
    currency: data.currency,
    receivedAmount: data.receivedCurrency === data.currency ? '' : data.receivedAmount,
    description: data.description,
  };
}
