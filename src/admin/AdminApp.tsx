// Admin area — Netlify Identity login gate in front of the usage dashboard.
//
// Reached at /admin (and on any Identity e-mail link, whose token arrives in
// the URL hash). Handles invite acceptance and password recovery so the first
// admin can be onboarded entirely from the Netlify UI invite e-mail. Only users
// whose app_metadata grants the `admin` role see the data; the API enforces the
// same rule server-side.

import { useEffect, useState, type FormEvent } from 'react';
import {
  AuthError,
  MissingIdentityError,
  acceptInvite,
  getUser,
  handleAuthCallback,
  login,
  logout,
  requestPasswordRecovery,
  updateUser,
  type User,
} from '@netlify/identity';
import Dashboard from './Dashboard';
import styles from './Admin.module.css';

type View =
  | { kind: 'loading' }
  | { kind: 'login' }
  | { kind: 'invite'; token: string }
  | { kind: 'recovery' }
  | { kind: 'signedIn'; user: User };

function describeError(error: unknown): string {
  if (error instanceof MissingIdentityError) {
    return 'Netlify Identity non è attivo su questo sito.';
  }
  if (error instanceof AuthError) {
    if (error.status === 401) return 'Email o password non validi.';
    return error.message;
  }
  return 'Si è verificato un errore imprevisto.';
}

export default function AdminApp() {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await handleAuthCallback();
        if (result) {
          // Drop the token from the URL and land on the dashboard route.
          window.history.replaceState(null, '', '/admin');
          if (result.type === 'invite' && result.token) {
            if (!cancelled) setView({ kind: 'invite', token: result.token });
            return;
          }
          if (result.type === 'recovery') {
            if (!cancelled) setView({ kind: 'recovery' });
            return;
          }
        }
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      }
      const user = await getUser();
      if (!cancelled) setView(user ? { kind: 'signedIn', user } : { kind: 'login' });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await action();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const onLogin = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const user = await login(email, password);
      setPassword('');
      setView({ kind: 'signedIn', user });
    });
  };

  const onSetPassword = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const user =
        view.kind === 'invite'
          ? await acceptInvite(view.token, password)
          : await updateUser({ password });
      setPassword('');
      setView({ kind: 'signedIn', user });
    });
  };

  const onForgot = () => {
    if (!email) {
      setError('Inserisci la tua email per ricevere il link di reset.');
      return;
    }
    void run(async () => {
      await requestPasswordRecovery(email);
      setInfo('Controlla la tua email: ti abbiamo inviato il link per reimpostare la password.');
    });
  };

  const onLogout = () => {
    void run(async () => {
      await logout();
      setView({ kind: 'login' });
    });
  };

  let body;
  if (view.kind === 'loading') {
    body = <p className={styles.muted}>Caricamento…</p>;
  } else if (view.kind === 'signedIn') {
    body = view.user.roles?.includes('admin') ? (
      <Dashboard />
    ) : (
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Accesso non autorizzato</h2>
        <p className={styles.muted}>
          L'account {view.user.email} non ha il ruolo <code>admin</code>.
          Assegnalo dalla sezione Identity del pannello Netlify, poi esci e
          accedi di nuovo.
        </p>
      </section>
    );
  } else if (view.kind === 'login') {
    body = (
      <form className={styles.authForm} onSubmit={onLogin}>
        <h2 className={styles.cardTitle}>Accesso amministratore</h2>
        <label className={styles.field}>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className={styles.primary} type="submit" disabled={busy}>
          {busy ? 'Accesso…' : 'Accedi'}
        </button>
        <button className={styles.link} type="button" onClick={onForgot} disabled={busy}>
          Password dimenticata?
        </button>
      </form>
    );
  } else {
    body = (
      <form className={styles.authForm} onSubmit={onSetPassword}>
        <h2 className={styles.cardTitle}>
          {view.kind === 'invite' ? 'Completa la registrazione' : 'Imposta una nuova password'}
        </h2>
        <label className={styles.field}>
          Nuova password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className={styles.primary} type="submit" disabled={busy}>
          Salva password
        </button>
      </form>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Tournament Bracket Creator</p>
          <h1 className={styles.title}>Dashboard utilizzo</h1>
        </div>
        <div className={styles.headerActions}>
          <a className={styles.headerLink} href="/">
            Torna all'app
          </a>
          {view.kind === 'signedIn' && (
            <button className={styles.ghost} type="button" onClick={onLogout} disabled={busy}>
              Esci
            </button>
          )}
        </div>
      </header>
      <main className={styles.main}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className={styles.info} role="status">
            {info}
          </p>
        )}
        {body}
      </main>
    </div>
  );
}
