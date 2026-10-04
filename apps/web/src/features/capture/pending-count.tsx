'use client';

import { pendingCountLabel } from './capture-model';
import { usePendingCaptureCount } from './queries';

/**
 * El contador de «Bandeja» en el menú (decisión 17). Sin pendientes, o mientras carga o si falla,
 * no se muestra nada: el menú no avisa de lo que no sabe.
 */
export function PendingCount() {
  const pending = usePendingCaptureCount();
  if (!pending.isSuccess || pending.data.count === 0) return null;

  return (
    <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
      {pendingCountLabel(pending.data)}
      <span className="sr-only"> por revisar</span>
    </span>
  );
}
