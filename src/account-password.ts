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
  if (code === 'reauthentication_needed' || code === 'reauthentication_not_valid')
    return 'De provider vereist extra verificatie. Log opnieuw in voordat je het opnieuw probeert. Als een verificatiecode of e-mail nodig is, stop dan: deze app ondersteunt die extra verificatie niet.';
  return 'Wachtwoord niet ingesteld. Probeer opnieuw of log opnieuw in. De provider kan strengere wachtwoordeisen stellen.';
}

/** Credentials exist only as transient arguments, never in controller state. */
export function createAccountPassword(auth: Auth | null, scope: AccountScope, owner: string, publish: (state: AccountPasswordState) => void) {
  let revision = 0, inFlight = false;
  async function submit(password: string, confirmation: string) {
    const current = scope.capture(owner), captured = revision;
    if (!auth || !current || inFlight) return;
    if (password.length < 12 || password !== confirmation) {
      publish({ ...initialAccountPassword, error: password.length < 12 ? 'Gebruik minimaal 12 tekens.' : 'De wachtwoorden zijn niet gelijk.' });
      return;
    }
    inFlight = true;
    publish({ ...initialAccountPassword, busy: true });
    try {
      const result = await auth.updateUser({ password });
      if (!current() || captured !== revision) return;
      if (result.error) throw result.error;
      publish({ ...initialAccountPassword, success: 'Wachtwoord ingesteld. Je kunt hiermee op je andere apparaat inloggen met hetzelfde e-mailadres.' });
    } catch (error) {
      if (current() && captured === revision) publish({ ...initialAccountPassword, error: safeError(error) });
    } finally { inFlight = false; }
  }
  return { submit, invalidate() { revision++; } };
}
