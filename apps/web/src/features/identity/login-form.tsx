'use client';

import { useState } from 'react';
import type { SubmitEvent } from 'react';

import {
  errorMessage,
  NETWORK_ERROR,
  problemCode,
  tooManyAttemptsMessage,
} from '@/shared/api/problem';
import { useApi, useSession } from '@/shared/session/session-provider';

/** `credentials`: correo y contraseña. Los otros dos, cuando la cuenta pide segundo factor. */
type Step = 'credentials' | 'totp' | 'recovery';

interface LoginFormProps {
  onSignedIn: () => void;
}

const INPUT =
  'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-base focus:border-amber-500 focus:outline-none';

/**
 * Inicio de sesión. Si la cuenta tiene segundo factor, la API responde `TOTP_REQUIRED` y el
 * formulario pide el código de la app autenticadora, o uno de recuperación en su lugar.
 *
 * No cuenta intentos ni decide bloqueos: eso lo hace la API, y duplicarlo aquí sería tener dos
 * verdades. Solo muestra lo que la API responde, traducido.
 */
export function LoginForm({ onSignedIn }: LoginFormProps) {
  const api = useApi();
  const session = useSession();
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function missingField(): string | null {
    if (email.trim() === '') return 'Escribe tu correo.';
    if (password === '') return 'Escribe tu contraseña.';
    if (step !== 'credentials' && code.trim() === '') return 'Escribe el código.';

    return null;
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = missingField();
    setError(missing);
    if (missing !== null) return;

    setPending(true);
    try {
      const {
        data,
        error: problem,
        response,
      } = await api.POST('/api/v1/auth/login', {
        body: {
          email: email.trim(),
          password,
          ...(step === 'totp' ? { totpCode: code } : {}),
          ...(step === 'recovery' ? { recoveryCode: code } : {}),
        },
      });
      if (data) {
        session.signIn(data.accessToken);
        onSignedIn();

        return;
      }
      if (response.status === 429) {
        setError(tooManyAttemptsMessage(response.headers.get('Retry-After')));

        return;
      }
      const errorCode = problemCode(problem);
      if (errorCode === 'TOTP_REQUIRED') {
        setStep('totp');
        setError(null);

        return;
      }
      if (errorCode === 'INVALID_TOTP_CODE') setCode('');
      setError(errorMessage(errorCode));
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  function switchTo(next: Step) {
    setStep(next);
    setCode('');
    setError(null);
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      {step === 'credentials' ? (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Correo
            <input
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Contraseña
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              className={INPUT}
            />
          </label>
        </>
      ) : (
        <label className="flex flex-col gap-1 text-sm font-medium">
          {step === 'totp' ? 'Código de tu app autenticadora' : 'Código de recuperación'}
          <input
            name="code"
            autoComplete="one-time-code"
            {...(step === 'totp' ? { inputMode: 'numeric' as const, maxLength: 6 } : {})}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
            className={INPUT}
          />
        </label>
      )}

      {error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-amber-500 px-4 py-2 font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>

      {step === 'totp' && (
        <button
          type="button"
          onClick={() => {
            switchTo('recovery');
          }}
          className="text-sm text-stone-600 underline"
        >
          No tengo el teléfono: usar un código de recuperación
        </button>
      )}
      {step === 'recovery' && (
        <button
          type="button"
          onClick={() => {
            switchTo('totp');
          }}
          className="text-sm text-stone-600 underline"
        >
          Usar el código de la app autenticadora
        </button>
      )}
    </form>
  );
}
