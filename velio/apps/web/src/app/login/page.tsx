'use client';

import { PasswordLoginInput } from '@velio/contracts';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useState } from 'react';
import { Button, Field, InlineAlert, Input } from '@/components/ui';
import { homeForRoles, useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import s from './login.module.css';

function LoginForm() {
  const { status, roles, login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace(next && next.startsWith('/') ? next : homeForRoles(roles));
  }, [status, roles, next, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = PasswordLoginInput.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      const fe: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'email') fe.email = 'Informe um e-mail válido.';
        if (issue.path[0] === 'password') fe.password = 'A senha tem pelo menos 8 caracteres.';
      }
      setFieldErrors(fe);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const tokens = await login(parsed.data.email, parsed.data.password);
      const userRoles = tokens.user.roles;
      if (!userRoles.includes('operator') && !userRoles.includes('admin')) {
        router.replace('/forbidden');
        return;
      }
      router.replace(next && next.startsWith('/') ? next : homeForRoles(userRoles));
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível entrar. Verifique e-mail e senha.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={s.card} onSubmit={onSubmit} noValidate>
      <div>
        <h1 className={s.title}>Entrar</h1>
        <p className={s.desc}>Acesso para operadores e administradores.</p>
      </div>
      {error ? <InlineAlert>{error}</InlineAlert> : null}
      <Field label="E-mail" htmlFor="email" required error={fieldErrors.email}>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          autoFocus
        />
      </Field>
      <Field label="Senha" htmlFor="password" required error={fieldErrors.password}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? 'password-error' : undefined}
        />
      </Field>
      <Button type="submit" variant="primary" size="lg" block loading={submitting}>
        Entrar
      </Button>
      <p className={s.foot}>Problemas para entrar? Fale com a administração da plataforma.</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className={s.page}>
      <aside className={s.aside} aria-hidden>
        <div className={s.brand}>VÉLIO</div>
        <div>
          <p className={s.tagline}>Operação e configuração da plataforma em um só lugar.</p>
          <p className={s.sub}>Mapa ao vivo, filas de exceção, catálogo, preços e regras de matching.</p>
        </div>
        <div className="small" style={{ opacity: 0.7 }}>
          Acesso restrito à equipe.
        </div>
      </aside>
      <div className={s.main}>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
