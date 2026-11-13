import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { cloud, configurationError } from './cloud';
import { demoRuns, initialDemo } from './demo';
import { money, neutralProfile, type Decision, type Home, type Housing, type Listing, type Profile, type SourceRun } from '../shared/model';
import { evaluate } from '../shared/matcher';
import { decide, reconcile } from '../shared/state';
import { createPrivateScope, loadPrivate } from './private-load';
import { priceDisplay } from '../shared/price-display';
import { PropertyMap } from './PropertyMap';
import { cbsDocumentation, cbsLicence } from '../shared/official-geography';
import { listingPresentation } from '../shared/listing-presentation';
import { MobileRoot } from './MobileRoot';
import { createEmailAuth, initialEmailAuth } from './email-auth';
import { AccountPassword } from './AccountPassword';
import { createAccountScope } from './account-password';

type View = 'new' | 'favourite' | 'dismissed' | 'profile';
const labels: Record<View, string> = { new: 'Nieuw', favourite: 'Favorieten', dismissed: 'Afgewezen', profile: 'Profiel' };
const sources = { gruno: 'Gruno', solide: 'Solide', maxx: 'Maxx' };
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = { home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9', new: 'M4 5h16v15H4zM8 2v6m8-6v6M4 11h16m-12 4h3', favourite: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z', dismissed: 'M5 5l14 14M19 5 5 19', profile: 'M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', next: 'm9 5 7 7-7 7', prev: 'm15 5-7 7 7 7', external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7', pause: 'M9 4v16m6-16v16', play: 'm8 4 12 8-12 8Z', undo: 'M3 10h10a7 7 0 0 1 0 14M3 10l6-6m-6 6 6 6', refresh: 'M20 8a8 8 0 1 0 0 8m0-13v5h-5', location: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0' };
  return <svg width={size} height={size} viewBox="0 0 24 26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.home}/></svg>;
}
function readDemo() {
  try { const raw = localStorage.getItem('huurmonitor-demo-v1'); if (raw) return JSON.parse(raw) as ReturnType<typeof initialDemo>; } catch { /* Storage may be unavailable. */ }
  return initialDemo();
}
function Gallery({ listing, demo, presentation }: { listing: Listing; demo: boolean; presentation?: 'story' | 'dossier' }) {
  const [index, setIndex] = useState(0), [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [held, setHeld] = useState(false), [visible, setVisible] = useState(true), [onscreen, setOnscreen] = useState(true), [focused, setFocused] = useState(false);
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = listing.photos.length;
  const running = !paused && !held && !focused && visible && onscreen && count > 1;
  const move = (n: number) => { setIndex(i => (i + n + count) % count); setElapsed(0); setBroken(false); };
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility); visibility();
    const observer = new IntersectionObserver(([entry]) => setOnscreen(entry.isIntersecting), { threshold: 0.4 });
    if (ref.current) observer.observe(ref.current);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => { if (media.matches) setPaused(true); }; media.addEventListener('change', reduce);
    return () => { document.removeEventListener('visibilitychange', visibility); observer.disconnect(); media.removeEventListener('change', reduce); };
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setElapsed(t => t + 100), 100);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => { if (elapsed >= 6000) move(1); }, [elapsed]);
  return <div className={presentation ? `gallery m-gallery m-gallery-${presentation}` : 'gallery'} ref={ref} onFocus={() => setFocused(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
    {count > 0 && !broken ? <button className="photo-tap" aria-label="Foto: tik links voor vorige, rechts voor volgende. Gebruik ook de fotoknoppen."
      onPointerDown={() => setHeld(true)} onPointerUp={() => setHeld(false)} onPointerCancel={() => setHeld(false)} onPointerLeave={() => setHeld(false)}
      onClick={e => { const rect = e.currentTarget.getBoundingClientRect(); move(e.clientX && e.clientX < rect.left + rect.width / 2 ? -1 : 1); }}>
      <img src={listing.photos[index]} alt={`${listing.title} · bronfoto ${index + 1}`} onError={() => setBroken(true)} draggable="false"/>
    </button> : <div className="photo-fallback"><Icon name="home" size={44}/><strong>{broken ? 'Deze bronfoto kon niet laden' : 'Geen foto beschikbaar'}</strong><span>Bekijk de originele advertentie voor beeld.</span>{broken && count > 1 && <button onClick={() => move(1)}>Probeer volgende foto</button>}</div>}
    {count > 1 && <div className="story-progress" aria-label={`Foto ${index + 1} van ${count}`}>{listing.photos.map((_, i) => <span key={i}><i style={{ width: `${i < index ? 100 : i > index ? 0 : elapsed / 60}%` }}/></span>)}</div>}
    <span className="photo-label">{demo ? 'Demo · bronfoto, mogelijk verouderd' : `Bronfoto · ${sources[listing.source]}`}</span>
    {presentation && count > 0 && <span className="m-gallery-counter">{index + 1} / {count} · bronfoto</span>}
    {count > 1 && <div className="photo-controls"><button onClick={() => move(-1)} aria-label="Vorige foto"><Icon name="prev"/></button><span>{index + 1} / {count}</span><button onClick={() => setPaused(p => !p)} aria-label={paused ? 'Fotostory afspelen' : 'Fotostory pauzeren'} aria-pressed={paused}><Icon name={paused ? 'play' : 'pause'}/></button><button onClick={() => move(1)} aria-label="Volgende foto"><Icon name="next"/></button></div>}
  </div>;
}
function Property({ home, profile, demo, busy, onDecision }: { home: Home; profile: Profile; demo: boolean; busy: boolean; onDecision: (decision: Decision) => void }) {
  const l = home.listing, evaluation = evaluate(l, profile), presentation = listingPresentation(l), {price} = presentation;
  const start = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const pointerDown = (e: PointerEvent<HTMLElement>) => { if (e.isPrimary && e.button === 0 && !busy) start.current = { x: e.clientX, y: e.clientY }; };
  const pointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!start.current) return;
    const x = e.clientX - start.current.x, y = e.clientY - start.current.y;
    if (Math.abs(y) > 25 && Math.abs(y) > Math.abs(x)) { start.current = null; setDrag(0); return; }
    if (Math.abs(x) > 20 && Math.abs(x) > Math.abs(y) * 1.8) { e.currentTarget.setPointerCapture(e.pointerId); setDrag(Math.max(-80, Math.min(80, x))); }
  };
  const pointerUp = (e: PointerEvent<HTMLElement>) => {
    if (start.current) { const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y; if (Math.abs(dx) >= 100 && Math.abs(dx) > Math.abs(dy) * 2) onDecision(dx > 0 ? 'favourite' : 'dismissed'); }
    start.current = null; setDrag(0);
  };
  return <article className="property" aria-label={l.title}>
    <Gallery key={l.key} listing={l} demo={demo}/>
    <div className="property-body">
      <div className="property-source"><span>{sources[l.source]} · {l.type || 'Type onbekend'}</span><span className={l.available === true ? 'available' : 'uncertain'}>{l.available === true ? demo ? 'Beschikbaar in voorbeeld' : 'Beschikbaar bij laatste check' : l.available === false ? 'Niet beschikbaar' : 'Beschikbaarheid onbekend'}</span></div>
      <header className="swipe-zone" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { start.current = null; setDrag(0); }} style={{ transform: `translateX(${drag}px)` }} aria-describedby="swipe-help">
        <h2>{l.title}</h2><p className="address"><Icon name="location" size={15}/>{l.city || 'Plaats niet vermeld'}</p>
        <p id="swipe-help" className="swipe-help">Sleep hier: links afwijzen · rechts bewaren</p>
        {Math.abs(drag) > 25 && <span className="drag-label">{drag > 0 ? 'Bewaren' : 'Afwijzen'}</span>}
      </header>
      <div className="price-line"><strong>{money(price.amount)}</strong><span>{price.label}<br/><small>{price.caveat}</small></span></div>
      <dl className="facts"><div><dt>Oppervlakte</dt><dd>{l.area === null ? 'Onbekend' : `${l.area.toLocaleString('nl-NL')} m²`}</dd></div><div><dt>Beschikbaar per</dt><dd>{l.moveInDate ? <time dateTime={l.moveInDate}>{l.moveIn}</time> : l.moveIn || 'Niet vermeld'}</dd></div><div><dt>Slaapkamers</dt><dd>{l.bedrooms ?? 'Niet vermeld'}</dd></div>{presentation.locationFacts.map(({label,value})=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}<div><dt>Aangeboden door</dt><dd>{l.advertiser || sources[l.source]}</dd></div><div><dt>Verhuurder</dt><dd>{l.landlord || 'Niet afzonderlijk vermeld'}</dd></div><div><dt>Gas, water & elektra</dt><dd>{l.rent.utilities}</dd></div></dl>
      {presentation.attribution && <p className="field-note">{presentation.attribution}. <a href={cbsDocumentation} target="_blank" rel="noreferrer">Bron</a> · <a href={cbsLicence} target="_blank" rel="noreferrer">Licentie</a>{presentation.refreshNote && ` · ${presentation.refreshNote}`}</p>}
      <section className="costs" aria-label="Huur en bijkomende kosten"><h3>Huur en bijkomende kosten</h3><dl><div><dt>Geadverteerde huurprijs</dt><dd>{money(l.rent.headline)}</dd></div><div><dt>Kale huur</dt><dd>{money(l.rent.base)}</dd></div><div><dt>Service totaal / voorschot</dt><dd>{money(l.rent.serviceAggregate)}</dd></div>{l.rent.service !== null && <div><dt>Waarvan service</dt><dd>{money(l.rent.service)}</dd></div>}{l.rent.energy !== null && <div><dt>Waarvan energie</dt><dd>{money(l.rent.energy)}</dd></div>}<div><dt>Bekend maandbedrag</dt><dd>{money(l.rent.knownMonthly)}</dd></div></dl>{l.source === 'gruno' && l.rent.headlineText && <p>Bronnotatie: {l.rent.headlineText}</p>}<p>{l.rent.note}</p><p>Een onbekende post is geen €0. Controleer ook borg, belastingen en eigen aansluitingen.</p></section>
      <section className="bio"><h3>Over deze woning</h3><p>{l.description}</p></section>
      <PropertyMap listing={l}/>
      <section className="match-details" aria-label="Beoordeling zoekprofiel"><div className="section-heading"><h3>Past bij mijn profiel</h3><strong className={evaluation.verdict}>{evaluation.verdict === 'pass' ? 'Voldoet' : evaluation.verdict === 'fail' ? 'Voldoet niet' : 'Onzeker'}</strong></div><ul>{evaluation.criteria.map(c => <li key={c.label}><span>{c.label}</span><strong className={c.verdict}>{c.verdict === 'pass' ? 'Voldoet' : c.verdict === 'fail' ? 'Voldoet niet' : 'Onbekend'}</strong></li>)}</ul><p>Niet vermelde inkomenseisen blijven onbekend. Geen inkomensscreening of kansscore.</p></section>
      {home.dismissal && <p className="history">Eerder afgewezen op {new Date(home.dismissal.at).toLocaleDateString('nl-NL')}. De eerdere woninggegevens en beoordeling blijven bewaard.</p>}
      <div className="source-link"><a href={l.url} target="_blank" rel="noreferrer">Bekijk bij {sources[l.source]} <Icon name="external" size={17}/></a><p>{demo ? 'Voorbeeld uit publieke observatie 11 november 2026. Geen actuele match.' : `Laatst gezien: ${new Date(l.observedAt).toLocaleString('nl-NL')}. Controleer de bron voor je reageert.`}</p></div>
    </div>
    <div className="decision-bar">{home.decision === 'dismissed' ? <button className="primary" disabled={busy} onClick={() => onDecision('new')}><Icon name="undo"/>Herstellen</button> : <><button disabled={busy} onClick={() => onDecision('dismissed')}><Icon name="dismissed"/>Afwijzen</button><button className="primary" disabled={busy} onClick={() => onDecision(home.decision === 'favourite' ? 'new' : 'favourite')}><Icon name={home.decision === 'favourite' ? 'undo' : 'favourite'}/>{home.decision === 'favourite' ? 'Uit favorieten' : 'Bewaren'}</button></>}</div>
  </article>;
}
function ProfileForm({ value, busy, demo, save }: { value: Profile; busy: boolean; demo: boolean; save: (profile: Profile) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const number = (key: 'minBudget' | 'maxBudget' | 'minArea' | 'minBedrooms' | 'income', label: string, isMoney = false) => <label>{label}<input type="number" min="0" step={key === 'minBedrooms' ? '1' : '0.01'} value={draft[key] === null ? '' : draft[key]! / (isMoney ? 100 : 1)} placeholder="Geen voorkeur" onChange={e => setDraft({ ...draft, [key]: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) / (isMoney ? 1 : 100) })}/></label>;
  const submit = (e: FormEvent) => { e.preventDefault(); if (draft.minBudget !== null && draft.maxBudget !== null && draft.minBudget > draft.maxBudget) return; save(draft); };
  return <div className="profile-page"><h1>Jouw zoekprofiel</h1><p>Eén opgeslagen profiel voor je overzicht én dagelijkse e-mail. Lege velden betekenen geen voorkeur, niet een aangenomen persoonlijk budget.</p><form onSubmit={submit}>
    <fieldset><legend>Waar en wat</legend><label>Plaats<select value={draft.city} onChange={e => setDraft({ ...draft, city: e.target.value })}><option>Groningen</option></select></label><div className="form-grid">{number('minArea', 'Minimaal oppervlak (m²)')}{number('minBedrooms', 'Minimaal slaapkamers')}</div><div className="type-options"><span>Woningtypen · leeg = alle typen</span>{(['kamer','studio','appartement','huis'] as Housing[]).map(type => <label key={type}><input type="checkbox" checked={draft.types.includes(type)} onChange={e => setDraft({ ...draft, types: e.target.checked ? [...draft.types, type] : draft.types.filter(t => t !== type) })}/>{type}</label>)}</div></fieldset>
    <fieldset><legend>Huur per maand</legend><label>Vergelijk mijn budget met<select value={draft.basis} onChange={e => setDraft({ ...draft, basis: e.target.value as Profile['basis'] })}><option value="knownMonthly">Bekende maandlasten (geen volledig all-in)</option><option value="base">Expliciet vermelde kale huur</option></select></label><div className="form-grid">{number('minBudget', 'Minimum (€)', true)}{number('maxBudget', 'Maximum (€)', true)}</div>{draft.minBudget !== null && draft.maxBudget !== null && draft.minBudget > draft.maxBudget && <p className="error">Het minimum mag niet hoger zijn dan het maximum.</p>}<p className="field-note">Bekende maandlasten tellen verplichte vermelde voorschotten één keer. Niet vermelde kosten blijven onbekend.</p></fieldset>
    <fieldset><legend>Onzekerheid en inkomen</legend><label className="check"><input type="checkbox" checked={draft.includeUnknown} onChange={e => setDraft({ ...draft, includeUnknown: e.target.checked })}/><span>Ook tonen bij onbekende vereiste gegevens<small>Expliciete keuze: dit zijn onzekere matches. Onbekende beschikbaarheid wordt nooit toegelaten.</small></span></label><label className="check"><input type="checkbox" checked={draft.checkIncome} onChange={e => setDraft({ ...draft, checkIncome: e.target.checked })}/><span>Expliciete inkomenseisen vergelijken<small>Geen eis vermeld betekent onbekend, niet automatisch geschikt.</small></span></label>{draft.checkIncome && number('income', 'Bruto maandinkomen (€) · optioneel', true)}</fieldset>
    <fieldset><legend>Dagelijkse melding</legend><label className="check"><input type="checkbox" checked={draft.emailEnabled} onChange={e => setDraft({ ...draft, emailEnabled: e.target.checked })}/><span>E-mail over nieuw kwalificerende wijzigingen<small>{demo ? 'Demo: er wordt nooit een e-mail verstuurd.' : 'Alleen werkzaam na handmatige worker- en mailconfiguratie. Instellen hier alleen is niet genoeg.'}</small></span></label><p className="field-note">Een eerste match, gecorrigeerde feiten of profielwijziging waardoor een woning nu past, vergelijkbare prijsdaling en bevestigde herbeschikbaarheid tellen. Een andere beschrijving niet. Afgewezen woningen kunnen hierdoor terugkeren; favorieten blijven favoriet.</p></fieldset>
    <button className="primary" disabled={busy} type="submit">{busy ? 'Opslaan…' : 'Zoekprofiel opslaan'}</button><p className="field-note">{demo ? 'Alleen opgeslagen in deze browser, apart van je echte profiel.' : 'Privé opgeslagen in Supabase. Dit scherm herberekent meteen; de worker verwerkt meldingen bij de volgende run.'} Standaardtaal: Nederlands.</p>
  </form></div>;
}
export default function App() {
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const media = matchMedia('(max-width: 760px)');
    const change = () => setMobile(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const [demo, setDemo] = useState(!cloud), [session, setSession] = useState<Session | null>(null);
  const [homes, setHomes] = useState<Home[]>(() => !cloud ? readDemo().homes : []), [profile, setProfile] = useState<Profile>(() => !cloud ? readDemo().profile : neutralProfile);
  const [runs, setRuns] = useState<SourceRun[]>(() => !cloud ? demoRuns : []), [delivery, setDelivery] = useState('');
  const [view, setView] = useState<View>('new'), [selected, setSelected] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const [error, setError] = useState(configurationError || ''), [notice, setNotice] = useState(''), [undo, setUndo] = useState<{ key: string; decision: Decision } | null>(null);
  const [emailAuth, setEmailAuth] = useState(initialEmailAuth);
  const [emailActions] = useState(() => createEmailAuth(cloud?.auth ?? null, setEmailAuth));
  const passwordInput = useRef<HTMLInputElement>(null);
  function resetEmailAuth(email = '') {
    if (passwordInput.current) passwordInput.current.value = '';
    emailActions.reset(email);
  }
  const [authRevision, setAuthRevision] = useState(0);
  const reading = useRef<HTMLElement>(null);
  const privateScope = useRef(createPrivateScope());
  const accountScope = useRef(createAccountScope());
  const accountOwner = useRef<string | null>(null);
  const mode = useRef<'demo' | 'private' | 'signedout'>(!cloud ? 'demo' : 'signedout');
  function clearPrivateState() {
    setHomes([]); setProfile(neutralProfile); setRuns([]); setDelivery(''); setUndo(null);
    setNotice(''); setError(configurationError || ''); setBusy(false); setLoading(false); setSelected('');
  }
  async function load(owner: string) {
    const db = cloud; if (!db) return;
    await loadPrivate(privateScope.current, owner, async () => {
      const [p, h, r, o] = await Promise.all([db.from('profiles').select('config').eq('owner_id',owner).single(), db.from('homes').select('data').eq('owner_id',owner), db.from('source_runs').select('data').eq('owner_id',owner), db.from('outbox').select('status').eq('owner_id',owner)]);
      for (const result of [p,h,r,o]) if (result.error) throw result.error;
      const statuses = o.data!.map(row => row.status as string);
      return { profile: p.data!.config as Profile, homes: h.data!.map(row => row.data as Home), runs: r.data!.map(row => row.data as SourceRun), delivery: `${statuses.filter(s => s === 'pending' || s === 'sending').length} in wachtrij · ${statuses.filter(s => s === 'sent').length} verstuurd · ${statuses.filter(s => s === 'review').length} handmatig controleren` };
    }, {
      start() { setLoading(true); setError(''); },
      commit(data) { setProfile(data.profile); setHomes(data.homes); setRuns(data.runs); setDelivery(data.delivery); },
      error(e) { setError(`Privégegevens niet geladen: ${e instanceof Error ? e.message : (e as {message?:string}).message || 'onbekende fout'}. Controleer Supabase en probeer vernieuwen.`); },
      finish() { setLoading(false); },
    });
  }
  useEffect(() => {
    if (!cloud) return;
    const { data } = cloud.auth.onAuthStateChange((event, next) => {
      resetEmailAuth();
      const owner = mode.current !== 'demo' && next ? next.user.id : null;
      accountScope.current.switchOwner(owner);
      const sameOwner = owner !== null && owner === accountOwner.current;
      accountOwner.current = owner;
      if (sameOwner && (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED')) {
        setSession(next);
        return;
      }
      privateScope.current.switchOwner(mode.current !== 'demo' && next ? next.user.id : null);
      setSession(next);
      setAuthRevision(revision => revision + 1);
      if (mode.current !== 'demo') { clearPrivateState(); mode.current = next ? 'private' : 'signedout'; setDemo(false); }
    });
    return () => { emailActions.invalidate(); accountScope.current.switchOwner(null); accountOwner.current = null; privateScope.current.switchOwner(null); data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => { if (session && !demo) void load(session.user.id); }, [session?.user.id, demo, authRevision]);
  useEffect(() => { if (demo) { try { localStorage.setItem('huurmonitor-demo-v1', JSON.stringify({ homes, profile })); } catch { setError('Demo kon niet lokaal worden opgeslagen. Je browser blokkeert opslag.'); } } }, [homes, profile, demo]);
  const displayed = homes.map(h => ({ ...h, evaluation: evaluate(h.listing, profile) }));
  const filtered = displayed.filter(h => view === 'new' ? h.decision === 'new' && h.evaluation.eligible : h.decision === view);
  const active = filtered.find(h => h.listing.key === selected) || filtered[0];
  const activeIndex = active ? filtered.indexOf(active) : 0;
  const activeKey = active?.listing.key;
  useLayoutEffect(() => {
    // Both layouts scroll the main reading viewport, not the document or detail column.
    if (activeKey) reading.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeKey]);
  function switchView(next: View) { setView(next); setSelected(''); window.scrollTo({ top: 0 }); document.getElementById('main')?.scrollTo({ top: 0 }); }
  async function changeDecision(key: string, decision: Decision, remember = true) {
    const old = homes.find(h => h.listing.key === key); if (!old) return;
    const operation = !demo && session ? privateScope.current.capture(session.user.id) : null;
    if (!demo && !operation) return;
    setBusy(true); setError('');
    try {
      if (!demo) { if (!cloud || !session) throw new Error('Log eerst in.'); const { error } = await cloud.rpc('set_decision', { p_key: key, p_decision: decision }); if (error) throw error; }
      if (operation && !operation.current()) return;
      setHomes(hs => hs.map(h => h.listing.key === key ? decide(h, decision, undefined, profile) : h));
      if (remember) setUndo({ key, decision: old.decision }); else setUndo(null);
      setNotice(decision === 'favourite' ? `${old.listing.title} bewaard.` : decision === 'dismissed' ? `${old.listing.title} afgewezen; bewaard bij Afgewezen.` : 'Keuze hersteld. Alleen passende woningen verschijnen bij Nieuw.');
    } catch (e) { if (!operation || operation.current()) setError(`Niet opgeslagen: ${(e as {message:string}).message}. Je vorige keuze blijft staan.`); }
    finally { if (!operation || operation.current()) setBusy(false); }
  }
  async function saveProfile(next: Profile) {
    const operation = !demo && session ? privateScope.current.capture(session.user.id) : null;
    if (!demo && !operation) return;
    setBusy(true); setError('');
    try {
      if (!demo) { if (!cloud || !session) throw new Error('Log eerst in.'); const { error } = await cloud.rpc('save_profile', { p_config: next }); if (error) throw error; }
      else setHomes(hs => reconcile(hs, [], next).homes);
      if (operation && !operation.current()) return;
      setProfile(next); setNotice('Zoekprofiel opgeslagen. Je matches zijn opnieuw beoordeeld.');
    } catch (e) { if (!operation || operation.current()) setError(`Profiel niet opgeslagen: ${(e as {message:string}).message}`); }
    finally { if (!operation || operation.current()) setBusy(false); }
  }
  function signIn(e: FormEvent) {
    e.preventDefault();
    const input = passwordInput.current;
    if (!input) return;
    void emailActions.signIn(input.value);
    input.value = '';
  }
  function switchAccountOwner(owner: string | null) { accountScope.current.switchOwner(owner); accountOwner.current = owner; }
  const enterDemo = () => { resetEmailAuth(); switchAccountOwner(null); privateScope.current.switchOwner(null); mode.current = 'demo'; clearPrivateState(); const saved = readDemo(); setDemo(true); setHomes(saved.homes); setProfile(saved.profile); setRuns(demoRuns); setView('new'); };
  const leaveDemo = () => { resetEmailAuth(); switchAccountOwner(session?.user.id ?? null); privateScope.current.switchOwner(session?.user.id ?? null); mode.current = session ? 'private' : 'signedout'; clearPrivateState(); setDemo(false); };
  const signOut = () => { resetEmailAuth(); switchAccountOwner(null); privateScope.current.switchOwner(null); mode.current = 'signedout'; clearPrivateState(); setSession(null); setDemo(false); void cloud?.auth.signOut().then(({ error }) => { if (error && mode.current === 'signedout') setError('Uitloggen niet bevestigd. Sluit deze browser of probeer opnieuw voordat je het apparaat deelt.'); }); };
  const selectHome = (key: string) => { setSelected(key); };
  const totalNew = displayed.filter(h => h.decision === 'new' && h.evaluation.eligible).length;
  const accountSettings = cloud && session && !demo ? <AccountPassword key={session.user.id} owner={session.user.id} scope={accountScope.current} mobile={mobile}/> : null;
  if (mobile && (demo || session)) return <MobileRoot accountSettings={accountSettings} view={view} switchView={switchView} homes={displayed} active={active} filtered={filtered} selectHome={selectHome} profile={profile} demo={demo} busy={busy} loading={loading} error={error} notice={notice} undo={undo} changeDecision={(key,decision,remember) => void changeDecision(key,decision,remember)} save={p => void saveProfile(p)} runs={runs} delivery={delivery} Gallery={Gallery} refresh={!demo && session ? () => void load(session.user.id) : undefined} accountActions={<>{session && !demo && <button onClick={signOut}>Uitloggen</button>}{cloud && demo && <button onClick={leaveDemo}>Naar privéprofiel</button>}</>}/>;
  return <>
    <a className="skip-link" href="#main">Naar inhoud</a><header className="app-header"><a className="brand" href="#" onClick={e => { e.preventDefault(); switchView('new'); }}><span className="brand-mark"><Icon name="home" size={23}/></span>Huurmonitor</a><div className="account">{demo ? <span className="demo-tag">Demomodus</span> : <span className="private-tag">Privé</span>}{session && !demo && <button onClick={signOut}>Uitloggen</button>}{cloud && demo && <button onClick={leaveDemo}>Naar privéprofiel</button>}</div></header>
    <nav className="navigation" aria-label="Hoofdnavigatie">{(Object.keys(labels) as View[]).map(v => <button key={v} onClick={() => switchView(v)} aria-current={view === v ? 'page' : undefined}><Icon name={v}/><span>{labels[v]}</span>{v === 'new' && totalNew > 0 && <span className="count">{totalNew}</span>}</button>)}</nav>
    <main id="main" className={`app-main desktop-view-${view}`} ref={reading} tabIndex={-1}>
      {demo && <div className="demo-banner"><strong>Rustig uitproberen.</strong> Voorbeeldwoningen, geen live aanbod. Keuzes blijven alleen in deze browser.</div>}
      {error && <div className="error" role="alert">{error}</div>}
      <div className="announcement" role="status" aria-live="polite">{notice}{undo && <button disabled={busy} onClick={() => void changeDecision(undo.key, undo.decision, false)}><Icon name="undo" size={16}/>Ongedaan maken</button>}</div>
      {!demo && session && runs.some(r => r.status === 'failed') && <div className="error" role="status">Een of meer bronnen konden niet worden gelezen. Eerdere woningen blijven bewaard; dit overzicht is mogelijk niet actueel. Bekijk Bronnen & actualiteit.</div>}
      {!demo && !session ? <section className="signin"><h1>Inloggen</h1><p>Gebruik het e-mailadres en wachtwoord van je bestaande account.</p>
        <form onSubmit={signIn} aria-busy={emailAuth.busy}>
          <label>E-mailadres<input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required disabled={emailAuth.busy} value={emailAuth.email} onChange={e => resetEmailAuth(e.target.value)}/></label>
          <label>Wachtwoord<input ref={passwordInput} type="password" autoComplete="current-password" required disabled={emailAuth.busy}/></label>
          <button className="primary" type="submit" disabled={emailAuth.busy || !cloud}>{emailAuth.busy ? 'Inloggen…' : 'Inloggen'}</button>
          {emailAuth.error && <p className="error" role="alert">{emailAuth.error}</p>}
        </form>
        <button onClick={enterDemo}>Eerst de demo bekijken</button></section> : view === 'profile' ? <><ProfileForm value={profile} busy={busy} demo={demo} save={p => void saveProfile(p)}/>{accountSettings}</> : <>
        <div className="view-heading"><div><h1>{labels[view] === 'Nieuw' ? 'Nieuwe matches' : labels[view]}</h1><p>{view === 'new' ? 'Bekijk één woning tegelijk. Bewaar wat bij je past.' : view === 'favourite' ? 'Jouw bewaarde woningen. Ook als feiten of beschikbaarheid veranderen.' : 'Niet voor nu. Je kunt elke woning herstellen.'}</p></div>{!demo && session && <button disabled={loading} onClick={() => void load(session.user.id)}><Icon name="refresh"/>{loading ? 'Laden…' : 'Vernieuwen'}</button>}</div>
        <div className="workspace"><aside className="listing-column"><div className="list-header"><strong>{filtered.length} {view === 'new' ? demo ? 'passende voorbeelden' : 'matches' : 'woningen'}</strong><button className="text-button" onClick={() => switchView('profile')}>Zoekprofiel</button></div><div className="property-list">{filtered.map(h => { const price = priceDisplay(h.listing); return <button key={h.listing.key} className={`list-item ${active?.listing.key === h.listing.key ? 'selected' : ''}`} onClick={() => selectHome(h.listing.key)} aria-pressed={active?.listing.key === h.listing.key}>{h.listing.photos[0] ? <img src={h.listing.photos[0]} alt="" onError={e => { e.currentTarget.style.visibility = 'hidden'; }}/>: <span className="list-photo-fallback"><Icon name="home" size={24}/></span>}<span className="list-item-text"><span className="list-source">{sources[h.listing.source]} · {h.listing.type || 'Type onbekend'}</span><strong>{h.listing.title}</strong><span>{money(price.amount)} <small>{price.advertisedFallback ? `${price.label} · ${price.caveat}` : 'bekend / mnd'}</small></span><small>{h.listing.area === null ? 'Oppervlak onbekend' : `${h.listing.area.toLocaleString('nl-NL')} m²`} · {h.listing.city || 'Locatie onbekend'}</small>{h.evaluation.verdict !== 'pass' && <small className="uncertain">{h.evaluation.verdict === 'unknown' ? 'Vereiste gegevens onzeker' : 'Voldoet nu niet'}</small>}</span></button>; })}</div><SourceStatus runs={runs} demo={demo} delivery={delivery}/></aside>
        <div className="detail-column">{loading && !homes.length ? <div className="loading-state" aria-busy="true">Privéwoningen laden…</div> : active ? <><div className="property-pager"><span>{activeIndex + 1} van {filtered.length} {demo ? 'voorbeelden' : 'woningen'}</span><div><button disabled={activeIndex === 0} onClick={() => selectHome(filtered[activeIndex - 1].listing.key)} aria-label="Vorige woning"><Icon name="prev"/></button><button disabled={activeIndex === filtered.length - 1} onClick={() => selectHome(filtered[activeIndex + 1].listing.key)} aria-label="Volgende woning"><Icon name="next"/></button></div></div><Property key={active.listing.key} home={active} profile={profile} demo={demo} busy={busy} onDecision={d => void changeDecision(active.listing.key,d)}/></> : <div className="empty-state"><Icon name={view} size={36}/><h2>{view === 'new' ? 'Je bent bij met je matches' : view === 'favourite' ? 'Nog geen favorieten' : 'Nog niets afgewezen'}</h2><p>{view === 'new' ? 'Dit betekent niet dat er geen aanbod is. Controleer bronstatus en je zoekprofiel; onbekende vereiste gegevens worden standaard niet toegelaten.' : 'Je keuzes verschijnen hier. Bij Nieuw kun je woningen bekijken en bewaren of afwijzen.'}</p><button onClick={() => switchView(view === 'new' ? 'profile' : 'new')}>{view === 'new' ? 'Bekijk zoekprofiel' : 'Naar nieuwe matches'}</button></div>}</div></div>
        <div className="mobile-status"><SourceStatus runs={runs} demo={demo} delivery={delivery}/></div>
      </>}
      {(demo || session) && view === 'profile' && <SourceStatus runs={runs} demo={demo} delivery={delivery}/>}
    </main><footer className="app-footer">Persoonlijke woningmonitor · Controleer altijd de originele advertentie.</footer>
  </>;
}
function SourceStatus({ runs, demo, delivery }: { runs: SourceRun[]; demo: boolean; delivery: string }) {
  return <section className="source-status"><h2>Bronnen & actualiteit</h2><p>{demo ? 'Geen dagelijkse checks actief. Dit is een lokale demonstratie.' : 'Dagelijkse checks vereisen een ingestelde worker. Een fout of verdwenen advertentie bewijst geen onbeschikbaarheid.'}</p>{(['gruno','solide','maxx'] as const).map(source => { const run = runs.find(r => r.source === source); return <div className="source-row" key={source}><div className="section-heading"><h3>{sources[source]}</h3><span className={run?.status === 'failed' ? 'fail' : run?.status === 'ok' ? 'pass' : ''}>{run?.coverage === 'blocked' ? 'Geblokkeerd' : run?.coverage === 'partial' ? 'Deels gelezen' : run?.coverage === 'complete' ? 'Volledig gelezen' : run?.status === 'ok' ? 'Gelezen' : run?.status === 'failed' ? 'Leesfout' : 'Uitgeschakeld'}</span></div><p>{run?.message || 'Nog geen run geregistreerd. Controleer handmatige setup.'}</p>{run?.status !== 'disabled' && run && <p>{new Date(run.at).toLocaleString('nl-NL')}</p>}</div>; })}<p className="delivery-status">{demo ? 'E-mail: uit in demo' : delivery ? `E-mail: ${delivery}. Providerconfiguratie en expliciet ENABLE_EMAIL blijven vereist.` : 'E-mail: operationele status onbekend; externe setup vereist.'}</p></section>;
}
