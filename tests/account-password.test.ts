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
  const h = setup(), password = '  Leading password\t ';
  assert.equal(h.requests.length, 0);
  await h.actions.submit(password, password);
  assert.deepEqual(h.requests, [{ password }]);
  assert.equal(h.state.busy, false);
  assert.equal(h.state.success, 'Wachtwoord opgeslagen.');
  for (const state of h.states) assert.deepEqual(Object.keys(state).sort(), ['busy', 'error', 'success']);
  assert.ok(!JSON.stringify(h.states).includes(password));
});
test('empty and mismatched credentials make zero calls', async () => {
  const h = setup();
  for (const [password, confirmation] of [['', ''], ['Abcdefgh', 'Abcdefgi'], ['Abcdefgh', '']]) {
    await h.actions.submit(password, confirmation);
    assert.ok(h.state.error);
  }
  assert.equal(h.requests.length, 0);
});
test('eight mixed-case letters accepted without digits or special characters', async () => {
  const h = setup();
  await h.actions.submit('Abcdefgh', 'Abcdefgh');
  assert.deepEqual(h.requests, [{ password: 'Abcdefgh' }]);
  assert.equal(h.state.success, 'Wachtwoord opgeslagen.');
});
test('seven mixed-case, eight lowercase-only and eight uppercase-only characters rejected accurately', async () => {
  for (const [password, error] of [
    ['Abcdefg', 'Gebruik minimaal 8 tekens.'],
    ['abcdefgh', 'Gebruik minstens één hoofdletter.'],
    ['ABCDEFGH', 'Gebruik minstens één kleine letter.'],
  ]) {
    const h = setup();
    await h.actions.submit(password, password);
    assert.equal(h.state.error, error);
    assert.equal(h.requests.length, 0);
  }
});
test('absent SDK, demo, signed out and wrong owner cannot submit even through stale actions', async () => {
  for (const mode of ['disabled', 'demo', 'signedout', 'otherowner']) {
    const h = setup(mode !== 'disabled');
    if (mode !== 'disabled') h.scope.switchOwner(mode === 'otherowner' ? 'other' : null);
    await h.actions.submit('Abcdefgh', 'Abcdefgh');
    assert.equal(h.requests.length, 0);
    assert.equal(h.states.length, 0);
  }
});
test('duplicate calls blocked until update settles', async () => {
  const h = setup(), pending = deferred();
  h.auth.updateUser = input => { h.requests.push(input); return pending.promise; };
  const first = h.actions.submit('Abcdefgh', 'Abcdefgh');
  assert.equal(h.state.busy, true);
  await h.actions.submit('Abcdefgh', 'Abcdefgh');
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
    await h.actions.submit('Secret-password', 'Secret-password');
    assert.equal(h.requests.length, 1);
    assert.equal(h.state.busy, false);
    assert.equal(h.state.error, 'Er ging iets mis. Probeer opnieuw.');
    assert.doesNotMatch(JSON.stringify(h.states), /private provider|secret-password/i);
    messages.push(h.state.error);
  }
  assert.equal(messages[0], messages[1]);
});
test('recognized reauthentication errors explain extra verification without starting it', async () => {
  for (const [code, expected] of [
    ['reauthentication_needed', 'Extra verificatie nodig.'],
    ['reauthentication_not_valid', 'Verificatie mislukt.'],
  ]) {
    const h = setup();
    h.auth.updateUser = async input => { h.requests.push(input); return { error: { code, message: 'private detail' } }; };
    await h.actions.submit('Abcdefgh', 'Abcdefgh');
    assert.equal(h.state.error, expected);
    assert.ok(!h.state.error.includes(code));
    assert.doesNotMatch(h.state.error, /Log opnieuw in/);
    assert.equal(h.requests.length, 1);
  }
});
test('allowlisted diagnostics are identical for returned and thrown errors without retry or success', async () => {
  const cases: [object, string, string][] = [
    [{ code: 'weak_password' }, 'Dit wachtwoord voldoet niet aan de wachtwoordeisen.', 'weak_password'],
    [{ code: 'same_password' }, 'Dit wachtwoord gebruik je al.', 'same_password'],
    [{ code: 'reauthentication_needed' }, 'Extra verificatie nodig.', 'reauthentication_needed'],
    [{ code: 'reauthentication_not_valid' }, 'Verificatie mislukt.', 'reauthentication_not_valid'],
    ...['session_expired', 'refresh_token_already_used'].map(code => [{ code }, 'Je sessie is verlopen.', code] as [object, string, string]),
    ...['session_not_found', 'refresh_token_not_found'].map(code => [{ code }, 'Geen actieve sessie.', code] as [object, string, string]),
    ...['bad_jwt', 'no_authorization'].map(code => [{ code }, 'Je sessie is ongeldig.', code] as [object, string, string]),
    [{ name: 'AuthSessionMissingError' }, 'Geen actieve sessie.', 'AuthSessionMissingError'],
    [{ code: 'validation_failed' }, 'Wachtwoord instellen mislukt.', 'validation_failed'],
    ...['over_request_rate_limit', 'over_email_send_rate_limit', 'over_sms_send_rate_limit'].map(code => [{ code }, 'Te veel pogingen. Probeer het later opnieuw.', code] as [object, string, string]),
    [{ status: 429 }, 'Te veel pogingen. Probeer het later opnieuw.', 'HTTP 429'],
    [{ name: 'AuthRetryableFetchError' }, 'Geen verbinding. Probeer opnieuw.', 'AuthRetryableFetchError'],
  ];
  for (const [fields, expected, diagnostic] of cases) {
    const messages: string[] = [];
    for (const throws of [false, true]) {
      const h = setup();
      h.auth.updateUser = async input => {
        h.requests.push(input);
        const error = { ...fields, message: 'private-message Secret-password https://private.invalid', headers: { authorization: 'private-token' } };
        if (throws) throw error;
        return { error };
      };
      await h.actions.submit('Secret-password', 'Secret-password');
      assert.equal(h.state.error, expected);
      assert.ok(!h.state.error.includes(diagnostic));
      assert.equal(h.state.success, '');
      assert.equal(h.state.busy, false);
      assert.equal(h.requests.length, 1);
      assert.doesNotMatch(JSON.stringify(h.states), /private-|Secret-password|https:|"authorization"|Log opnieuw in/);
      messages.push(h.state.error);
    }
    assert.equal(messages[0], messages[1]);
  }
});
test('unknown codes, names, messages, objects and unsafe statuses never reach the fallback', async () => {
  const messages: string[] = [];
  for (const error of [
    { code: 'unknown-private-code', name: 'unknown-private-name', message: 'Secret-password', status: 500, url: 'https://private.invalid', headers: { authorization: 'private-token' } },
    { code: 'toString', name: 'constructor', status: '429' },
    { code: { private: 'detail' }, name: { private: 'detail' }, status: 600 },
    { status: 99 }, { status: NaN }, { status: Infinity }, null, 'Secret-password',
  ]) for (const throws of [false, true]) {
    const h = setup();
    h.auth.updateUser = async input => {
      h.requests.push(input);
      // A returned null is success in the SDK contract; use an unknown Error instead.
      const failure = error ?? new Error('Secret-password');
      if (throws) throw failure;
      return { error: failure };
    };
    await h.actions.submit('Secret-password', 'Secret-password');
    assert.equal(h.state.success, '');
    assert.equal(h.state.busy, false);
    assert.equal(h.requests.length, 1);
    assert.doesNotMatch(JSON.stringify(h.states), /private|Secret-password|toString|constructor|429|500|600|99|NaN|Infinity|https:|authorization/);
    messages.push(h.state.error);
  }
  assert.ok(messages.every(message => message === 'Er ging iets mis. Probeer opnieuw.'));
});
test('stale success and error ignored after owner switch, signout, demo or component unmount', async () => {
  for (const boundary of ['owner', 'signout', 'demo', 'unmount']) for (const error of [null, new Error('stale secret')]) {
    const h = setup(), pending = deferred();
    h.auth.updateUser = () => pending.promise;
    const first = h.actions.submit('Abcdefgh', 'Abcdefgh');
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
  const first = h.actions.submit('Abcdefgh', 'Abcdefgh');
  // Models App passing the unchanged owner on both auth event types.
  h.scope.switchOwner('owner');
  pending.resolve({ error: null }); await first;
  assert.equal(h.state.success, 'Wachtwoord opgeslagen.');
  h.scope.switchOwner('owner');
  assert.equal(h.state.success, 'Wachtwoord opgeslagen.');
  assert.equal(clears, 2);
  unsubscribe(); h.scope.switchOwner(null);
  assert.equal(clears, 2);
});
