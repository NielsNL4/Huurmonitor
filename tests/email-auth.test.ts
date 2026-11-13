import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailAuth, initialEmailAuth, type EmailAuthState } from '../src/email-auth';

type Auth = NonNullable<Parameters<typeof createEmailAuth>[0]>;
function deferred() {
  let resolve!: (value: { error: unknown }) => void;
  const promise = new Promise<{ error: unknown }>(yes => { resolve = yes; });
  return { promise, resolve };
}
function setup() {
  let state: EmailAuthState = { ...initialEmailAuth };
  const states: EmailAuthState[] = [], requests: Parameters<Auth['signInWithPassword']>[0][] = [];
  const auth: Auth = { async signInWithPassword(input) { requests.push(input); return { error: null }; } };
  const actions = createEmailAuth(auth, next => { state = next; states.push(next); });
  return { auth, actions, requests, states, get state() { return state; } };
}
test('only explicit login calls SDK with normalized email and exact whitespace password; state has no password', async () => {
  const h = setup();
  h.actions.reset('  Owner@Example.test  ');
  assert.equal(h.requests.length, 0);
  await h.actions.signIn('  exact password\t ');
  assert.deepEqual(h.requests, [{ email: 'owner@example.test', password: '  exact password\t ' }]);
  assert.equal(h.state.busy, false);
  assert.equal(h.state.error, '');
  for (const state of h.states) assert.deepEqual(Object.keys(state).sort(), ['busy', 'email', 'error']);
  assert.ok(!JSON.stringify(h.states).includes('exact password'));
});
test('missing credentials or absent SDK make no login request', async () => {
  const h = setup();
  await h.actions.signIn('password');
  h.actions.reset('owner@example.test');
  await h.actions.signIn('');
  assert.equal(h.requests.length, 0);
  const absent = createEmailAuth(null, () => assert.fail('unexpected publication'));
  await absent.signIn('password');
});
test('duplicate submissions are blocked until the SDK settles, including across reset', async () => {
  const h = setup(), pending = deferred();
  h.actions.reset('owner@example.test');
  h.auth.signInWithPassword = input => { h.requests.push(input); return pending.promise; };
  const first = h.actions.signIn('first');
  assert.equal(h.state.busy, true);
  await h.actions.signIn('duplicate');
  h.actions.reset('new@example.test');
  await h.actions.signIn('duplicate after reset');
  assert.equal(h.requests.length, 1);
  pending.resolve({ error: null }); await first;
  assert.equal(h.state.email, 'new@example.test');
  await h.actions.signIn('next explicit attempt');
  assert.equal(h.requests.length, 2);
});
test('returned and thrown errors are identical and generic, with no automatic retry', async () => {
  const errors: string[] = [];
  for (const throws of [false, true]) {
    const h = setup(); h.actions.reset('owner@example.test');
    h.auth.signInWithPassword = async input => {
      h.requests.push(input);
      const error = new Error('Account missing: secret-password owner@example.test');
      if (throws) throw error;
      return { error };
    };
    await h.actions.signIn('secret-password');
    assert.equal(h.requests.length, 1);
    assert.equal(h.state.busy, false);
    assert.match(h.state.error, /Inloggen is niet gelukt/);
    assert.doesNotMatch(JSON.stringify(h.states), /secret-password|Account missing/);
    errors.push(h.state.error);
    // Only another explicit submission retries.
    await h.actions.signIn('corrected-password');
    assert.equal(h.requests.length, 2);
  }
  assert.equal(errors[0], errors[1]);
});
test('stale success/error cannot publish after email, auth, demo, signout, reset or unmount boundaries', async () => {
  for (const boundary of ['email', 'auth', 'demo', 'signout', 'reset', 'unmount']) for (const error of [null, new Error('stale secret')]) {
    const h = setup(), pending = deferred(); h.actions.reset('old@example.test');
    h.auth.signInWithPassword = () => pending.promise;
    const first = h.actions.signIn('ephemeral-password');
    if (boundary === 'unmount') h.actions.invalidate();
    else h.actions.reset(boundary === 'email' ? 'new@example.test' : '');
    const publications = h.states.length;
    pending.resolve({ error }); await first;
    assert.equal(h.states.length, publications);
    if (boundary !== 'unmount') {
      assert.equal(h.state.busy, false);
      assert.equal(h.state.error, '');
      assert.equal(h.state.email, boundary === 'email' ? 'new@example.test' : '');
    }
  }
});
