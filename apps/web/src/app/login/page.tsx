'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { LoginForm } from '@/features/identity/login-form';
import { safeNext } from '@/shared/session/safe-next';
import { useSessionStatus } from '@/shared/session/session-provider';

function Login() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const status = useSessionStatus();

  // Quien ya tiene sesión (por ejemplo, al recargar el login) sigue de largo.
  useEffect(() => {
    if (status === 'authenticated') router.replace(next);
  }, [status, router, next]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Entrar a Sol a Sol</h1>
      <LoginForm
        onSignedIn={() => {
          router.replace(next);
        }}
      />
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
