'use client';

import Link from 'next/link';

import { pendingCapturesText } from './capture-model';
import { usePendingCaptureCount } from './queries';

/**
 * El aviso en «Inicio» cuando hay capturas por revisar (decisión 17): lo que llegó del teléfono
 * todavía no cuenta en el mes. Sin pendientes no aparece.
 */
export function PendingCapturesNotice() {
  const pending = usePendingCaptureCount();
  if (!pending.isSuccess || pending.data.count === 0) return null;

  return (
    <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-stone-800">
      Tienes {pendingCapturesText(pending.data)} por revisar: lo que llegó del teléfono todavía no
      cuenta en el mes.{' '}
      <Link href="/capture" className="font-semibold text-amber-800 underline">
        Ir a la bandeja
      </Link>
    </p>
  );
}
