import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UNDO_WINDOW_MS, type UndoNotice, UndoProvider, useUndoNotice } from './undo-toast';

function Trigger({ notice }: Readonly<{ notice: UndoNotice }>) {
  const show = useUndoNotice();

  return (
    <button
      type="button"
      onClick={() => {
        show(notice);
      }}
    >
      Borrar
    </button>
  );
}

function renderWith(undo: () => Promise<boolean>) {
  render(
    <UndoProvider>
      <Trigger notice={{ message: 'Movimiento borrado.', undo }} />
    </UndoProvider>,
  );
}

describe('UndoProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('offers to undo for a few seconds, then goes away', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWith(() => Promise.resolve(true));

    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    expect(screen.getByText('Movimiento borrado.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS);
    });
    expect(screen.queryByText('Movimiento borrado.')).not.toBeInTheDocument();
  });

  it('says when it could not undo, and that message goes away too', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    renderWith(() => Promise.reject(new Error('offline')));

    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));

    expect(await screen.findByText('No se pudo deshacer. Inténtalo de nuevo.')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS);
    });
    expect(screen.queryByText(/No se pudo deshacer/)).not.toBeInTheDocument();
  });

  it('fails loudly outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() =>
      render(<Trigger notice={{ message: 'x', undo: () => Promise.resolve(true) }} />),
    ).toThrow('useUndoNotice must be used inside <UndoProvider>.');
  });
});
