type Auth = {
  signInWithPassword(input: { email: string; password: string }): PromiseLike<{ error: unknown }>;
};
export const initialEmailAuth = { email: '', busy: false, error: '' };
export type EmailAuthState = typeof initialEmailAuth;

/** Passwords pass straight to the SDK, never into helper state or storage. */
export function createEmailAuth(auth: Auth | null, publish: (state: EmailAuthState) => void) {
  let state = { ...initialEmailAuth }, revision = 0, inFlight = false;
  const update = (patch: Partial<EmailAuthState>) => { state = { ...state, ...patch }; publish(state); };
  async function signIn(password: string) {
    if (!auth || inFlight) return;
    const email = state.email.trim().toLowerCase();
    if (!email || !password) return;
    const captured = revision;
    inFlight = true;
    update({ email, busy: true, error: '' });
    try {
      const result = await auth.signInWithPassword({ email, password });
      if (captured !== revision) return;
      if (result.error) throw result.error;
      // onAuthStateChange, not this completion, owns the session.
    } catch {
      if (captured === revision) update({ error: 'Inloggen is niet gelukt. Controleer je e-mailadres en wachtwoord of probeer het later opnieuw.' });
    } finally {
      inFlight = false;
      if (captured === revision) update({ busy: false });
    }
  }
  return {
    signIn,
    // Revision suppresses stale UI completions; it cannot cancel SDK authentication.
    reset(email = '') { revision++; update({ ...initialEmailAuth, email }); },
    invalidate() { revision++; },
  };
}
