import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountPassword, createAccountScope, initialAccountPassword, type AccountPasswordState } from '../src/account-password';

type Auth = NonNullable<Parameters<typeof createAccountPassword>[0]>;
function setup(enabled = true) {
  const scope = createAccountScope(); scope.switchOwner('owner');
  let state: AccountPasswordState = { ...initialAccountPassword };
  const states: AccountPasswordState[] = [], requests: { password: string }[] = [];
  const auth: Auth = { async updateUser(input) { requests.push(input); return { error: null }; } };
  const actions = createAccountPassword(enabled ? auth : null, scope, 'owner', next => { state = next; states.push(next); });
  return { scope, auth, actions, states, requests, get state() { return state; } };
}
function deferred() {
  let resolve!: (value: { error: unknown }) => void;
  const promise = new Promise<{ error: unknown }>(yes => { resolve = yes; });
  return { promise, resolve };
}
test('explicit update passes only exact unchanged password, with no credentials in state', async () => {
  const h = setup(), password = '  leading password\t ';
  assert.equal(h.requests.length, 0);
  await h.actions.submit(password, password);
  assert.deepEqual(h.requests, [{ password }]);
  assert.equal(h.state.busy, false);
  assert.match(h.state.success, /Wachtwoord ingesteld/);
  for (const state of h.states) assert.deepEqual(Object.keys(state).sort(), ['busy', 'error', 'success']);
  assert.ok(!JSON.stringify(h.states).includes(password));
});
test('empty, short, and mismatched credentials make zero calls; 12 characters accepted', async () => {
  const h = setup();
  for (const [password, confirmation] of [['', ''], ['12345678901', '12345678901'], ['123456789012', '123456789013'], ['123456789012', '']]) {
    await h.actions.submit(password, confirmation);
    assert.ok(h.state.error);
  }
  assert.equal(h.requests.length, 0);
  await h.actions.submit('123456789012', '123456789012');
  assert.equal(h.requests.length, 1);
});
test('absent SDK, demo, signed out and wrong owner cannot submit even through stale actions', async () => {
  for (const mode of ['disabled', 'demo', 'signedout', 'otherowner']) {
    const h = setup(mode !== 'disabled');
    if (mode !== 'disabled') h.scope.switchOwner(mode === 'otherowner' ? 'other' : null);
    await h.actions.submit('123456789012', '123456789012');
    assert.equal(h.requests.length, 0);
    assert.equal(h.states.length, 0);
  }
});
test('duplicate calls blocked until update settles', async () => {
  const h = setup(), pending = deferred();
  h.auth.updateUser = input => { h.requests.push(input); return pending.promise; };
  const first = h.actions.submit('123456789012', '123456789012');
  assert.equal(h.state.busy, true);
  await h.actions.submit('123456789012', '123456789012');
  assert.equal(h.requests.length, 1);
  pending.resolve({ error: null }); await first;
  assert.equal(h.state.busy, false);
});
test('returned and thrown failures use identical safe generic errors without retry', async () => {
  const messages: string[] = [];
  for (const throws of [false, true]) {
    const h = setup();
    h.auth.updateUser = async input => {
      h.requests.push(input);
      const error = new Error('private provider detail secret-password');
      if (throws) throw error;
      return { error };
    };
    await h.actions.submit('secret-password', 'secret-password');
    assert.equal(h.requests.length, 1);
    assert.equal(h.state.busy, false);
    assert.match(h.state.error, /Wachtwoord niet ingesteld/);
    assert.doesNotMatch(JSON.stringify(h.states), /private provider|secret-password/);
    messages.push(h.state.error);
  }
  assert.equal(messages[0], messages[1]);
});
test('recognized reauthentication errors explain extra verification without starting it', async () => {
  for (const code of ['reauthentication_needed', 'reauthentication_not_valid']) {
    const h = setup();
    h.auth.updateUser = async input => { h.requests.push(input); return { error: { code, message: 'private detail' } }; };
    await h.actions.submit('123456789012', '123456789012');
    assert.match(h.state.error, /extra verificatie/);
    assert.match(h.state.error, /Log opnieuw in/);
    assert.match(h.state.error, /stop dan/);
    assert.equal(h.requests.length, 1);
  }
});
test('stale success and error ignored after owner switch, signout, demo or component unmount', async () => {
  for (const boundary of ['owner', 'signout', 'demo', 'unmount']) for (const error of [null, new Error('stale secret')]) {
    const h = setup(), pending = deferred();
    h.auth.updateUser = () => pending.promise;
    const first = h.actions.submit('123456789012', '123456789012');
    if (boundary === 'unmount') h.actions.invalidate();
    else h.scope.switchOwner(boundary === 'owner' ? 'other' : null);
    // Even returning to the original owner must not revive the old operation.
    if (boundary !== 'unmount') h.scope.switchOwner('owner');
    const count = h.states.length;
    pending.resolve({ error }); await first;
    assert.equal(h.states.length, count);
  }
});
test('same-owner USER_UPDATED/token refresh boundary clears fields but preserves pending and saved success', async () => {
  const h = setup(), pending = deferred(); let clears = 0;
  const unsubscribe = h.scope.subscribe(() => { clears++; });
  h.auth.updateUser = () => pending.promise;
  const first = h.actions.submit('123456789012', '123456789012');
  // Models App passing the unchanged owner on both auth event types.
  h.scope.switchOwner('owner');
  pending.resolve({ error: null }); await first;
  assert.match(h.state.success, /Wachtwoord ingesteld/);
  h.scope.switchOwner('owner');
  assert.match(h.state.success, /Wachtwoord ingesteld/);
  assert.equal(clears, 2);
  unsubscribe(); h.scope.switchOwner(null);
  assert.equal(clears, 2);
});
