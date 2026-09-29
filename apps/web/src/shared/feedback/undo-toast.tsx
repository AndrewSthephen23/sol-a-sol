'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/** Cuánto se ofrece «Deshacer». Pasado esto el borrado queda; la API igual puede restaurar. */
export const UNDO_WINDOW_MS = 6000;

export interface UndoNotice {
  message: string;
  /** Devuelve si se pudo deshacer. */
  undo: () => Promise<boolean>;
}

const UndoContext = createContext<((notice: UndoNotice) => void) | null>(null);

/** Muestra un aviso con «Deshacer» (decisión 6 de H3: el borrado se deshace al momento). */
export function useUndoNotice(): (notice: UndoNotice) => void {
  const show = useContext(UndoContext);
  if (show === null) throw new Error('useUndoNotice must be used inside <UndoProvider>.');

  return show;
}

/**
 * Vive en el layout de las pantallas privadas, así el aviso sobrevive a volver del formulario a
 * la lista. Un aviso nuevo reemplaza al anterior.
 */
export function UndoProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [shown, setShown] = useState<UndoNotice | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const show = useCallback((notice: UndoNotice) => {
    setShown(notice);
    setMessage(null);
  }, []);

  useEffect(() => {
    if (shown === null) return;
    const timer = setTimeout(() => {
      setShown(null);
    }, UNDO_WINDOW_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [shown]);

  // El resultado de «Deshacer» también se va solo.
  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(() => {
      setMessage(null);
    }, UNDO_WINDOW_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [message]);

  async function undo(notice: UndoNotice) {
    setBusy(true);
    const undone = await notice.undo().catch(() => false);
    setBusy(false);
    setShown(null);
    setMessage(undone ? 'Listo, se deshizo.' : 'No se pudo deshacer. Inténtalo de nuevo.');
  }

  return (
    <UndoContext value={show}>
      {children}
      <div aria-live="polite" className="fixed inset-x-4 bottom-20 z-20 flex justify-center">
        {shown !== null && (
          <div className="flex items-center gap-4 rounded-lg bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">
            <span>{shown.message}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void undo(shown)}
              className="font-semibold text-amber-300 disabled:opacity-50"
            >
              Deshacer
            </button>
          </div>
        )}
        {shown === null && message !== null && (
          <p className="rounded-lg bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">
            {message}
          </p>
        )}
      </div>
    </UndoContext>
  );
}
