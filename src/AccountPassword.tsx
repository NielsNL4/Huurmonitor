import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { cloud } from './cloud';
import { createAccountPassword, initialAccountPassword, type AccountScope } from './account-password';

export function AccountPassword({ owner, scope, mobile }: { owner: string; scope: AccountScope; mobile: boolean }) {
  const password = useRef<HTMLInputElement>(null), confirmation = useRef<HTMLInputElement>(null);
  const [state, setState] = useState(initialAccountPassword);
  const [actions] = useState(() => createAccountPassword(cloud?.auth ?? null, scope, owner, setState));
  const clear = () => { if (password.current) password.current.value = ''; if (confirmation.current) confirmation.current.value = ''; };
  useLayoutEffect(() => {
    const unsubscribe = scope.subscribe(clear);
    return () => { clear(); actions.invalidate(); unsubscribe(); };
  }, [scope, actions]);
  function submit(event: FormEvent) {
    event.preventDefault();
    // The helper consumes exact values synchronously up to its SDK call.
    void actions.submit(password.current?.value ?? '', confirmation.current?.value ?? '');
    clear();
  }
  return <section className={mobile ? 'm-profile m-profile-section' : 'profile-page'} aria-label="Wachtwoord instellen">
    <h2>Wachtwoord instellen</h2>
    <p className={mobile ? 'm-note' : 'field-note'}>Voor je bestaande account. Gebruik minimaal 12 tekens; de provider kan strengere eisen stellen. Je hoeft geen huidig wachtwoord in te vullen.</p>
    <form onSubmit={submit} aria-busy={state.busy} noValidate>
      <div className={mobile ? undefined : 'form-grid'}>
        <label>Nieuw wachtwoord<input ref={password} type="password" autoComplete="new-password" minLength={12} required disabled={state.busy}/></label>
        <label>Herhaal nieuw wachtwoord<input ref={confirmation} type="password" autoComplete="new-password" minLength={12} required disabled={state.busy}/></label>
      </div>
      <button className={mobile ? 'm-primary' : 'primary'} type="submit" disabled={state.busy}>{state.busy ? 'Wachtwoord instellen…' : 'Wachtwoord instellen'}</button>
      {state.error && <p className={mobile ? 'm-error' : 'error'} role="alert">{state.error}</p>}
      <p role="status" aria-live="polite">{state.success}</p>
    </form>
  </section>;
}
