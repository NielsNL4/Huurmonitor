/** Invalidates private completions synchronously on auth/mode/unmount boundaries. */
export function createPrivateScope() {
  let owner: string | null = null, epoch = 0, request = 0;
  const capture = (expectedOwner: string) => {
    if (owner !== expectedOwner) return null;
    const captured = epoch;
    return { current: () => owner === expectedOwner && epoch === captured };
  };
  return {
    switchOwner(next: string | null) { owner = next; epoch++; request++; },
    capture,
    begin(expectedOwner: string) {
      const scope = capture(expectedOwner); if (!scope) return null;
      const id = ++request;
      return { current: () => scope.current() && request === id };
    },
  };
}
export async function loadPrivate<T>(scope: ReturnType<typeof createPrivateScope>, owner: string, read: () => Promise<T>, handlers: { start: () => void; commit: (value: T) => void; error: (error: unknown) => void; finish: () => void }) {
  const ticket = scope.begin(owner); if (!ticket) return;
  handlers.start();
  try { const value = await read(); if (ticket.current()) handlers.commit(value); }
  catch (error) { if (ticket.current()) handlers.error(error); }
  finally { if (ticket.current()) handlers.finish(); }
}
