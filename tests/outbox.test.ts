import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestHtml, digestText, retryKey, sendDigest } from '../worker/outbox';
import type { Event } from '../shared/model';

function event(): Event {
  return { id:'event-1',key:'gruno:1',revision:1,reason:'Nieuw passend aanbod',listing:{
    key:'gruno:1',source:'gruno',externalId:'1',title:'Voorbeeldstraat 1',url:'https://example.com/ad?one=1&two=2',
    city:'Groningen',type:'kamer',area:19.94,bedrooms:null,moveIn:null,available:true,description:'',
    photos:['https://example.com/first.jpg?one=1&two=2','https://example.com/second.jpg'],incomeMin:null,observedAt:'2026-11-12T12:00:00Z',
    rent:{base:70000,headline:80500,serviceAggregate:null,service:null,energy:null,knownMonthly:80500,comparison:null,utilities:'onbekend',complete:false,note:''},
  }};
}
test('digest matches the dark table preview with real ordered events and useful text facts', () => {
  const first=event(),second=event();second.listing.title='Tweede woning';second.reason='Prijs gedaald';
  first.listing.neighbourhood='Volgens bron';
  const html=digestHtml([first,second]),text=digestText([first,second]);
  assert.match(html,/bgcolor="#141412"/);assert.match(html,/role="presentation"/);assert.match(html,/\[if mso\]/);
  assert.match(html,/Georgia/);assert.match(html,/Arial/);assert.match(html,/width="600"/);
  for(const body of [html,text]){
    assert.ok(body.indexOf('Voorbeeldstraat 1')<body.indexOf('Tweede woning'));
    assert.match(body,/Nieuw passend aanbod/);assert.match(body,/Prijs gedaald/);
    assert.match(body,/bekend per maand/);assert.match(body,/geen all-in garantie/);
    assert.match(body,/Wijk volgens advertentie:/);assert.match(body,/Volgens bron/);assert.match(body,/19,94 m²/);
    assert.doesNotMatch(body,/Voorbeeld ·|geen actueel aanbod|Petrus Campersingel/);
  }
  assert.equal((html.match(/<h2 /g)??[]).length,2);
  assert.match(html,/first\.jpg\?one=1&amp;two=2/);assert.doesNotMatch(html,/second\.jpg/);
  assert.match(text,/Bekijk advertentie: https:\/\/example.com\/ad\?one=1&two=2/);
  assert.doesNotMatch(html,/<script|<link|<style|tracking|cid:/i);
});
test('all source text and URL attributes are escaped without losing plain-text facts', () => {
  const item=event();const hostile=`<img onerror="bad()"> & 'quoted'`;
  item.listing.title=hostile;item.reason=hostile;item.listing.neighbourhood=hostile;
  item.listing.url='https://example.com/"<bad>?x=1&y=2';
  item.listing.photos=['https://example.com/photo?value="<bad>&next=1'];
  const html=digestHtml([item]);
  assert.doesNotMatch(html,/<img onerror|<bad>|alt="Bronfoto: <|href="[^"]*"<|src="[^"]*"</);
  assert.match(html,/&lt;img onerror=&quot;bad\(\)&quot;&gt; &amp; &#39;quoted&#39;/);
  assert.match(html,/alt="Bronfoto: &lt;img/);assert.match(html,/&amp;next=1/);
  assert.match(digestText([item]),/<img onerror="bad\(\)">/);
});
test('unsafe first photos are omitted, not replaced; unsafe ad links never become links', () => {
  for(const url of ['./public/photo.jpg','/photo.jpg','data:image/png;base64,AA','javascript:alert(1)','file:///photo.jpg','cid:photo','http://example.com/photo.jpg','https://localhost/photo','https://127.0.0.1/photo','https://[::1]/photo','https://192.168.1.1/photo','https://2130706433/photo','https://intranet/photo','https://photos.local/photo','https://home.arpa/photo','https://foo.internal/photo','https://user:pass@example.com/photo']){
    const item=event();item.listing.photos=[url,'https://example.com/later.jpg'];
    const html=digestHtml([item]);assert.doesNotMatch(html,/<img /,url);assert.doesNotMatch(html,/later\.jpg/,url);
    assert.match(html,/Geen bruikbare bronfoto/);
  }
  for(const url of ['javascript:alert(1)','data:text/html,bad','file:///etc/passwd','//example.com/ad','/local','https://user:pass@example.com/ad']){
    const item=event();item.listing.url=url;
    assert.doesNotMatch(digestHtml([item]),/<a /);assert.match(digestText([item]),/Advertentielink niet beschikbaar/);
    assert.ok(!digestText([item]).includes(url));
  }
  const item=event();item.listing.url='http://example.com/ad';
  assert.match(digestHtml([item]),/href="http:\/\/example.com\/ad"/);
});
test('legacy missing facts stay explicit, source neighbourhood never comes from CBS', () => {
  const item=event();item.listing.photos=[];item.listing.area=null;
  item.listing.officialGeography={buurt:{name:'CBS-only buurt'},wijk:{name:'CBS-only wijk'}} as NonNullable<Event['listing']['officialGeography']>;
  item.listing.rent.knownMonthly=null;item.listing.rent.headline=null;
  for(const body of [digestHtml([item]),digestText([item])]){
    assert.match(body,/Onbekend/);assert.match(body,/Niet vermeld/);assert.doesNotMatch(body,/CBS-only|700/);
  }
  assert.match(digestText([item]),/Wijk volgens advertentie: Niet vermeld\nOppervlakte: Niet vermeld/);
});
test('email reuses headline fallback semantics rather than relabelling headline or base as known monthly', () => {
  const item=event();item.listing.rent.knownMonthly=null;
  for(const body of [digestHtml([item]),digestText([item])]){
    assert.match(body,/Geadverteerde huurprijs/);assert.match(body,/kostenbasis niet bevestigd/);assert.doesNotMatch(body,/bekend per maand|700/);
  }
  item.listing.rent.headlineConflict=true;
  assert.match(digestText([item]),/Onbekend/);assert.doesNotMatch(digestText([item]),/805/);
  item.listing.source='solide';item.listing.rent.headlineConflict=false;
  assert.match(digestText([item]),/Onbekend/);
});
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
  const events=[event()];
  await sendDigest('durable',events,'owner@example.invalid',env,dependencies);await sendDigest('durable',events,'owner@example.invalid',env,dependencies);
  assert.equal(messages[0].text,digestText(events));assert.equal(messages[0].html,digestHtml(events));assert.equal(messages[0].subject,'Huurmonitor: 1 relevante wijziging');
  assert.equal(messages[0].attachments,undefined);
  assert.deepEqual({host:options[0].host,port:options[0].port,secure:options[0].secure,pool:options[0].pool},{host:'smtp.gmail.com',port:465,secure:true,pool:false});
  assert.deepEqual(options[0].auth,{user:'sender@example.invalid',pass:'abcdefghijklmnop'});assert.equal(options[0].tls.rejectUnauthorized,true);assert.equal(options[0].tls.minVersion,'TLSv1.2');assert.equal(options[0].debug,false);assert.equal(options[0].logger,false);
  assert.equal(options[0].connectionTimeout,10000);assert.equal(options[0].greetingTimeout,10000);assert.equal(options[0].socketTimeout,30000);
  assert.equal(messages[0].from,env.GMAIL_USER);assert.deepEqual(messages[0].to,['owner@example.invalid']);assert.deepEqual(messages[0].envelope,{from:env.GMAIL_USER,to:['owner@example.invalid']});assert.equal(messages[0].messageId,messages[1].messageId);assert.equal(messages[0].disableFileAccess,true);assert.equal(messages[0].disableUrlAccess,true);assert.equal(closed,2);
  assert.equal(env.GMAIL_APP_PASSWORD,'abcd efgh ijkl mnop'); // Never rewrite configured secret.
});
test('Resend payload contains equivalent HTML and text without changing subject, owner or retry key', async () => {
  const events=[event(),event()];let calls=0;
  await sendDigest('durable',events,'owner@example.invalid',{ENABLE_EMAIL:'true',EMAIL_TRANSPORT:'resend',RESEND_API_KEY:'fake',EMAIL_FROM:'sender@example.invalid'}, {
    resend:(async(url,init)=>{
      calls++;assert.equal(url,'https://api.resend.com/emails');
      assert.equal((init!.headers as Record<string,string>)['Idempotency-Key'],retryKey('durable'));
      assert.deepEqual(JSON.parse(init!.body as string),{from:'sender@example.invalid',to:['owner@example.invalid'],subject:'Huurmonitor: 2 relevante wijzigingen',text:digestText(events),html:digestHtml(events)});
      return new Response('{}',{status:200});
    }) as typeof fetch,
  });
  assert.equal(calls,1);
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
