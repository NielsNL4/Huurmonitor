type Auth = { updateUser(input: { password: string }): PromiseLike<{ error: unknown }> };
export const initialAccountPassword = { busy: false, error: '', success: '' };
export type AccountPasswordState = typeof initialAccountPassword;

/** Independent of private-data reloads. Same-owner auth events preserve operations. */
export function createAccountScope() {
  let owner: string | null = null, epoch = 0;
  const boundaries = new Set<() => void>();
  return {
    switchOwner(next: string | null) {
      if (next !== owner) { owner = next; epoch++; }
      for (const clear of boundaries) clear();
    },
    capture(expected: string) {
      const captured = epoch;
      return owner === expected ? () => epoch === captured && owner === expected : null;
    },
    subscribe(clear: () => void) { boundaries.add(clear); return () => { boundaries.delete(clear); }; },
  };
}
export type AccountScope = ReturnType<typeof createAccountScope>;

function safeError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  // Only fixed, allowlisted diagnostics may reach the UI; never use error.message.
  switch (code) {
    case 'weak_password':
      return 'Dit wachtwoord voldoet niet aan de wachtwoordeisen.';
    case 'same_password':
      return 'Dit wachtwoord gebruik je al.';
    case 'reauthentication_needed':
      return 'Extra verificatie nodig.';
    case 'reauthentication_not_valid':
      return 'Verificatie mislukt.';
    case 'session_expired':
      return 'Je sessie is verlopen.';
    case 'session_not_found':
      return 'Geen actieve sessie.';
    case 'refresh_token_not_found':
      return 'Geen actieve sessie.';
    case 'refresh_token_already_used':
      return 'Je sessie is verlopen.';
    case 'bad_jwt':
      return 'Je sessie is ongeldig.';
    case 'no_authorization':
      return 'Je sessie is ongeldig.';
    case 'validation_failed':
      return 'Wachtwoord instellen mislukt.';
    case 'over_request_rate_limit':
      return 'Te veel pogingen. Probeer het later opnieuw.';
    case 'over_email_send_rate_limit':
      return 'Te veel pogingen. Probeer het later opnieuw.';
    case 'over_sms_send_rate_limit':
      return 'Te veel pogingen. Probeer het later opnieuw.';
  }
  const name = error && typeof error === 'object' && 'name' in error ? error.name : null;
  if (name === 'AuthSessionMissingError')
    return 'Geen actieve sessie.';
  const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
  if (status === 429)
    return 'Te veel pogingen. Probeer het later opnieuw.';
  if (name === 'AuthRetryableFetchError')
    return 'Geen verbinding. Probeer opnieuw.';
  return 'Er ging iets mis. Probeer opnieuw.';
}

/** Credentials exist only as transient arguments, never in controller state. */
export function createAccountPassword(auth: Auth | null, scope: AccountScope, owner: string, publish: (state: AccountPasswordState) => void) {
  let revision = 0, inFlight = false;
  async function submit(password: string, confirmation: string) {
    const current = scope.capture(owner), captured = revision;
    if (!auth || !current || inFlight) return;
    const passwordError = password.length < 8 ? 'Gebruik minimaal 8 tekens.'
      : !/[a-z]/.test(password) ? 'Gebruik minstens één kleine letter.'
      : !/[A-Z]/.test(password) ? 'Gebruik minstens één hoofdletter.' : '';
    if (passwordError || password !== confirmation) {
      publish({ ...initialAccountPassword, error: passwordError || 'De wachtwoorden zijn niet gelijk.' });
      return;
    }
    inFlight = true;
    publish({ ...initialAccountPassword, busy: true });
    try {
      const result = await auth.updateUser({ password });
      if (!current() || captured !== revision) return;
      if (result.error) throw result.error;
      publish({ ...initialAccountPassword, success: 'Wachtwoord opgeslagen.' });
    } catch (error) {
      if (current() && captured === revision) publish({ ...initialAccountPassword, error: safeError(error) });
    } finally { inFlight = false; }
  }
  return { submit, invalidate() { revision++; } };
}
