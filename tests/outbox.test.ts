import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestText, retryKey, sendDigest } from '../worker/outbox';
test('email opt-in gate never contacts provider when disabled', async () => {
  await assert.rejects(sendDigest('id', [], 'nobody@example.invalid', {}), /disabled/);
  await assert.rejects(sendDigest('id', [], 'nobody@example.invalid', { ENABLE_EMAIL: 'true' }), /incomplete/);
});
test('provider retry uses the durable outbox key (mock transport, no actual mail)', async () => {
  const original = globalThis.fetch;
  const keys: string[] = [];
  globalThis.fetch = (async (_url, init) => { keys.push((init!.headers as Record<string,string>)['Idempotency-Key']); return new Response('{}', { status: keys.length === 1 ? 503 : 200 }); }) as typeof fetch;
  try {
    const env = { ENABLE_EMAIL: 'true', EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 'fake-test-key', EMAIL_FROM: 'fixture@example.invalid' };
    await assert.rejects(sendDigest('durable', [], 'fixture@example.invalid', env), /503/);
    await sendDigest('durable', [], 'fixture@example.invalid', env);
    assert.deepEqual(keys, [retryKey('durable'), retryKey('durable')]);
    assert.match(digestText([]), /Controleer beschikbaarheid/);
  } finally { globalThis.fetch = original; }
});
test('Gmail validates before transport creation; no implicit provider fallback', async () => {
  let contacts=0;const dependencies={smtp:()=>{contacts++;throw Error('must not connect');},resend:(async()=>{contacts++;throw Error('must not fetch');}) as typeof fetch};
  for(const env of [{},{ENABLE_EMAIL:'true'},{ENABLE_EMAIL:'true',EMAIL_TRANSPORT:'gmail'},{ENABLE_EMAIL:'true',EMAIL_TRANSPORT:'gmail',GMAIL_USER:'sender@example.invalid',GMAIL_APP_PASSWORD:'normal-password'}]) await assert.rejects(sendDigest('id',[],'owner@example.invalid',env,dependencies));
  assert.equal(contacts,0);
});
test('Gmail uses strict implicit TLS, bounded single connection, authenticated sender and one owner recipient', async () => {
  const env={ENABLE_EMAIL:'true',EMAIL_TRANSPORT:'gmail',GMAIL_USER:'sender@example.invalid',GMAIL_APP_PASSWORD:'abcd efgh ijkl mnop',EMAIL_FROM:'ignored@example.invalid'};
  const options:any[]=[],messages:any[]=[];let closed=0;
  const dependencies={smtp:(config:any)=>{options.push(config);return{sendMail:async(message:any)=>{messages.push(message);return{accepted:['owner@example.invalid'],rejected:[]};},close:()=>{closed++;}};}};
  await sendDigest('durable',[],'owner@example.invalid',env,dependencies);await sendDigest('durable',[],'owner@example.invalid',env,dependencies);
  assert.deepEqual({host:options[0].host,port:options[0].port,secure:options[0].secure,pool:options[0].pool},{host:'smtp.gmail.com',port:465,secure:true,pool:false});
  assert.deepEqual(options[0].auth,{user:'sender@example.invalid',pass:'abcdefghijklmnop'});assert.equal(options[0].tls.rejectUnauthorized,true);assert.equal(options[0].tls.minVersion,'TLSv1.2');assert.equal(options[0].debug,false);assert.equal(options[0].logger,false);
  assert.equal(options[0].connectionTimeout,10000);assert.equal(options[0].greetingTimeout,10000);assert.equal(options[0].socketTimeout,30000);
  assert.equal(messages[0].from,env.GMAIL_USER);assert.deepEqual(messages[0].to,['owner@example.invalid']);assert.deepEqual(messages[0].envelope,{from:env.GMAIL_USER,to:['owner@example.invalid']});assert.equal(messages[0].messageId,messages[1].messageId);assert.equal(messages[0].disableFileAccess,true);assert.equal(messages[0].disableUrlAccess,true);assert.equal(closed,2);
  assert.equal(env.GMAIL_APP_PASSWORD,'abcd efgh ijkl mnop'); // Never rewrite configured secret.
});
test('SMTP protocol errors/rejection are sanitized and never fall back to Resend', async () => {
  const env={ENABLE_EMAIL:'true',EMAIL_TRANSPORT:'gmail',GMAIL_USER:'sender@example.invalid',GMAIL_APP_PASSWORD:'abcdefghijklmnop'};
  let fallback=0,closed=0;
  for(const fail of [true,false]){
    await assert.rejects(sendDigest('id',[],'owner@example.invalid',env,{smtp:()=>({sendMail:async()=>{if(fail)throw Error('sensitive protocol details');return{accepted:[],rejected:['owner@example.invalid']};},close:()=>{closed++;}}),resend:(async()=>{fallback++;return new Response('{}');}) as typeof fetch}),error=>error instanceof Error&&/manual review/.test(error.message)&&!/sensitive|owner@/.test(error.message));
  }
  assert.equal(fallback,0);assert.equal(closed,2);
  await assert.rejects(sendDigest('id',[],'one@example.invalid,two@example.invalid',env),/owner email/);
});
