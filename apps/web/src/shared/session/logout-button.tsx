'use client';

import { useState } from 'react';

import { useSession } from './session-provider';

/**
 * Cierra la sesión aquí y en las demás pestañas. No navega: al quedar la sesión en `anonymous`,
 * `RequireSession` lleva al login con `replace`, así el botón atrás no vuelve a la pantalla.
 */
export function LogoutButton() {
  const session = useSession();
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    setLeaving(true);
    await session.logout();
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={leaving}
      className="font-medium text-stone-500 hover:text-amber-600 disabled:opacity-50"
    >
      Cerrar sesión
    </button>
  );
}
