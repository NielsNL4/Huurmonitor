import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { cloud } from './cloud';
import { createAccountPassword, initialAccountPassword, type AccountScope } from './account-password';
import { PasswordField } from './PasswordField';

export function AccountPassword({ owner, scope, mobile }: { owner: string; scope: AccountScope; mobile: boolean }) {
  const password = useRef<HTMLInputElement>(null), confirmation = useRef<HTMLInputElement>(null);
  const requirementsId = useId();
  const matchId = useId();
  const [passwordVisible, setPasswordVisible] = useState(false), [confirmationVisible, setConfirmationVisible] = useState(false);
  const [match, setMatch] = useState<'empty' | 'match' | 'mismatch'>('empty');
  const [state, setState] = useState(initialAccountPassword);
  const [actions] = useState(() => createAccountPassword(cloud?.auth ?? null, scope, owner, setState));
  const clearFields = () => {
    for (const input of [password.current, confirmation.current]) if (input) { input.value = ''; input.type = 'password'; }
  };
  const clear = () => { clearFields(); setPasswordVisible(false); setConfirmationVisible(false); setMatch('empty'); };
  function updateMatch() {
    setMatch(!password.current?.value || !confirmation.current?.value ? 'empty'
      : password.current.value === confirmation.current.value ? 'match' : 'mismatch');
  }
  useLayoutEffect(() => {
    const unsubscribe = scope.subscribe(clear);
    return () => { unsubscribe(); clearFields(); actions.invalidate(); };
  }, [scope, actions]);
  function submit(event: FormEvent) {
    event.preventDefault();
    // The helper consumes exact values synchronously up to its SDK call.
    void actions.submit(password.current?.value ?? '', confirmation.current?.value ?? '');
    clear();
  }
  return <section className={mobile ? 'm-profile m-profile-section' : 'profile-page'} aria-label="Wachtwoord instellen">
    <h2>Wachtwoord instellen</h2>
    <p className={mobile ? 'm-note' : 'field-note'}>Stel een wachtwoord in voor je bestaande account.</p>
    <p id={requirementsId} className={mobile ? 'm-note' : 'field-note'}>Minimaal 8 tekens, met minstens één kleine letter en één hoofdletter.</p>
    <form onSubmit={submit} aria-busy={state.busy} noValidate>
      <div className={mobile ? undefined : 'form-grid'}>
        <PasswordField label="Nieuw wachtwoord" inputRef={password} visible={passwordVisible} toggle={() => setPasswordVisible(value => !value)} onInput={updateMatch} autoComplete="new-password" minLength={8} aria-describedby={requirementsId} required disabled={state.busy}/>
        <PasswordField label="Herhaal nieuw wachtwoord" inputRef={confirmation} visible={confirmationVisible} toggle={() => setConfirmationVisible(value => !value)} onInput={updateMatch} autoComplete="new-password" minLength={8} aria-describedby={`${requirementsId} ${matchId}`} required disabled={state.busy}/>
      </div>
      <p id={matchId} className="password-match" role="status" aria-live="polite">{match === 'match' ? 'Wachtwoorden komen overeen' : match === 'mismatch' ? 'Wachtwoorden komen nog niet overeen' : ''}</p>
      <button className={mobile ? 'm-primary' : 'primary'} type="submit" disabled={state.busy}>{state.busy ? 'Wachtwoord instellen…' : 'Wachtwoord instellen'}</button>
      {state.error && <p className={mobile ? 'm-error' : 'error'} role="alert">{state.error}</p>}
      <p role="status" aria-live="polite">{state.success}</p>
    </form>
  </section>;
}
