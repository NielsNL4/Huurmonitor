import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateScope, loadPrivate } from '../src/private-load';
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
test('deferred private refresh cannot render or persist after signout then demo', async () => {
  const scope = createPrivateScope(); scope.switchOwner('owner');
  const response = deferred<string>(), commits: string[] = [], stored: string[] = [], errors: unknown[] = [];
  let visible = 'private before signout', finishes = 0;
  const pending = loadPrivate(scope, 'owner', () => response.promise, { start() {}, commit(value) { visible = value; commits.push(value); stored.push(value); }, error(e) { errors.push(e); }, finish() { finishes++; } });
  scope.switchOwner(null); visible = 'signed out';
  scope.switchOwner(null); visible = 'demo sample'; stored.push(visible);
  response.resolve('PRIVATE RETURNED TOO LATE'); await pending;
  assert.equal(visible, 'demo sample'); assert.deepEqual(commits, []); assert.deepEqual(stored, ['demo sample']); assert.deepEqual(errors, []); assert.equal(finishes, 0);
});
test('mode change, new auth session, unmount and newer refresh invalidate old loads', async () => {
  for (const boundary of ['demo', 'auth', 'unmount', 'refresh']) {
    const scope = createPrivateScope(); scope.switchOwner('owner');
    const first = deferred<string>(), values: string[] = [];
    const handlers = { start() {}, commit(value: string) { values.push(value); }, error() { values.push('stale error'); }, finish() {} };
    const pending = loadPrivate(scope, 'owner', () => first.promise, handlers);
    if (boundary === 'refresh') await loadPrivate(scope, 'owner', async () => 'new response', handlers);
    else scope.switchOwner(boundary === 'auth' ? 'owner' : null);
    first.reject(new Error('old response')); await pending;
    assert.deepEqual(values, boundary === 'refresh' ? ['new response'] : []);
  }
});
