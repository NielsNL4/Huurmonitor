import { useLayoutEffect, useRef, useState, type ComponentType, type Dispatch, type SetStateAction, type PointerEvent, type ReactNode } from 'react';
import { money, type Decision, type Home, type Listing, type Profile, type SourceRun } from '../shared/model';
import { listingPresentation } from '../shared/listing-presentation';
import { cbsDocumentation, cbsLicence } from '../shared/official-geography';
import { CollectionMap } from './CollectionMap';
import { closeMapDetail, openMapDetail, type MapSession } from './map-model';
import { PropertyMap } from './PropertyMap';
import { MobileProfile, MobileSources } from './MobileProfile';
import { MobileIcon } from './mobile-icons';
import { archiveMatches, mobileScreenKey, openDossier, type ArchiveFilter, type CollectionView, type DossierSelection, type MobileView } from './mobile-navigation';
import './mobile.css';

const labels = { new:'Nieuw', favourite:'Favorieten', dismissed:'Afgewezen', map:'Kaart', profile:'Profiel' };
const sources = { gruno:'Gruno Verhuur', solide:'Solide Verhuur', maxx:'Maxx' };
type GalleryComponent = ComponentType<{ listing: Listing; demo: boolean; presentation?: 'story' | 'dossier' }>;
interface Props {
  mapState: MapSession; setMapState: Dispatch<SetStateAction<MapSession>>;
  view: MobileView; switchView: (view: MobileView) => void;
  homes: Home[]; active: Home | undefined; filtered: Home[]; selectHome: (key: string) => void;
  profile: Profile; demo: boolean; busy: boolean; loading: boolean;
  error: string; notice: string; undo: { key:string;decision:Decision } | null;
  changeDecision: (key:string,decision:Decision,remember?:boolean) => void;
  save: (profile:Profile) => void; runs: SourceRun[]; delivery: string;
  themeButton: ReactNode; accountActions: ReactNode; accountSettings: ReactNode; refresh: (() => void) | undefined; Gallery: GalleryComponent;
}
const verdictText = { pass:'Voldoet', fail:'Voldoet niet', unknown:'Onbekend' };
const area = (listing: Listing) => listing.area === null ? 'Niet vermeld' : `${listing.area.toLocaleString('nl-NL')} m²`;
const availability = (listing: Listing, demo: boolean) => listing.available === true ? demo ? 'Beschikbaar in voorbeeld' : 'Beschikbaar bij laatste check' : listing.available === false ? 'Niet beschikbaar' : 'Beschikbaarheid onbekend';

export function MobileRoot(props: Props) {
  const { view, homes, active, filtered, profile, demo, busy, loading, error, notice, undo, runs, delivery, Gallery } = props;
  const [dossier,setDossier] = useState<DossierSelection | null>(null);
  const [source,setSource] = useState('all');
  const [query,setQuery] = useState('');
  const [archiveFilter,setArchiveFilter] = useState<ArchiveFilter>('all');
  const reading = useRef<HTMLElement>(null);
  const restore = useRef<number | null>(null);
  const detail = view==='map' ? homes.find(h=>h.listing.key===props.mapState.detailKey) : dossier ? homes.find(h=>h.listing.key===dossier.key) : undefined;
  const screenKey = view==='map' && detail ? `map-dossier:${detail.listing.key}` : mobileScreenKey(view,active?.listing.key,dossier);
  useLayoutEffect(()=>{
    reading.current?.scrollTo({top:restore.current ?? 0,behavior:'instant'});
    restore.current=null;
  },[screenKey]);
  function navigate(next: MobileView) { setDossier(null); restore.current=null; props.switchView(next); if(next===view)reading.current?.scrollTo({top:0,behavior:'instant'}); }
  function back() { if(view==='map'){props.setMapState(previous=>closeMapDetail(previous));return;} if(!dossier)return; restore.current=dossier.scrollTop; props.switchView(dossier.origin); setDossier(null); }
  function open(home:Home,origin:CollectionView) { setDossier(openDossier(home.listing.key,origin,reading.current?.scrollTop ?? 0)); }
  const favouriteHomes=homes.filter(h=>h.decision==='favourite');
  const archivedHomes=homes.filter(h=>h.decision==='dismissed');
  const collection=view==='favourite'?favouriteHomes:archivedHomes;
  const selectedSource=collection.some(h=>h.listing.source===source)?source:'all';
  const selectedArchiveFilter=archiveFilter==='all'||collection.some(h=>archiveMatches(h,'',archiveFilter))?archiveFilter:'all';
  const collectionVisible=view==='favourite'?collection.filter(h=>selectedSource==='all'||h.listing.source===selectedSource):collection.filter(h=>archiveMatches(h,query,selectedArchiveFilter));
  const totalNew=homes.filter(h=>h.decision==='new'&&h.evaluation.eligible).length;
  const activeIndex=active?filtered.indexOf(active):0;
  return <div className={`mobile-root m-${detail?'dossier':view}`}>
    <a className="skip-link" href="#main">Naar inhoud</a>
    <header className="m-masthead">
      {detail?<button className="m-detail-back" onClick={back}><MobileIcon name="back"/><span>{view==='map'?'Terug naar kaart':'Woning Details'}</span></button>:<button className="m-wordmark" onClick={()=>navigate('new')}>Huurmonitor</button>}
      {view==='new'&&!detail&&<><span className="m-header-meta">Groningen · {demo?'Demo':'Overzicht'}</span><span className="m-header-count">{active?activeIndex+1:0} van {filtered.length}</span></>}
      {view==='favourite'&&!detail&&<><span className="m-header-meta">Groningen</span><span className="m-saved-count">{favouriteHomes.length} bewaard</span></>}
      {(detail||view==='favourite'||view==='dismissed')&&<button className="m-account" aria-label="Naar profiel" onClick={()=>navigate('profile')}><MobileIcon name="account" size={16}/></button>}
      {props.themeButton}
    </header>
    <main id="main" ref={reading} tabIndex={-1} className="m-reading" data-screen={screenKey}>
      {demo&&<p className="m-demo">Demo · publieke voorbeelden, geen live aanbod</p>}
      {error&&<div className="m-feedback m-error" role="alert">{error}</div>}
      <div className="m-announcement" role="status" aria-live="polite">{notice&&<p>{notice}</p>}{undo&&<button disabled={busy} onClick={()=>props.changeDecision(undo.key,undo.decision,false)}><MobileIcon name="undo" size={15}/>Ongedaan maken</button>}</div>
      {!demo&&runs.some(r=>r.status==='failed')&&<p className="m-feedback">Een of meer bronnen konden niet worden gelezen. Eerdere woningen blijven bewaard; controleer de bronstatus.</p>}
      {view==='map'&&!detail&&<CollectionMap homes={homes} profile={profile} demo={demo} state={props.mapState} setState={props.setMapState} open={key=>props.setMapState(previous=>openMapDetail(previous,key))}/>}
      {detail?<>
        <div className="m-overview-row"><button onClick={back}><MobileIcon name="back" size={12}/>{view==='map'?'Terug naar kaart':'Terug naar overzicht'}</button><button disabled={busy} aria-label={detail.decision==='favourite'?'Uit favorieten':'Bewaren'} aria-pressed={detail.decision==='favourite'} onClick={()=>props.changeDecision(detail.listing.key,detail.decision==='favourite'?'new':'favourite')}><MobileIcon name="favourite"/></button></div>
        <MobileProperty home={detail} demo={demo} busy={busy} dossier Gallery={Gallery} onDecision={d=>props.changeDecision(detail.listing.key,d)}/>
      </>:view==='map'?null:view==='profile'?<MobileProfile value={profile} busy={busy} demo={demo} save={props.save} accountActions={props.accountActions} accountSettings={props.accountSettings} runs={runs} delivery={delivery}/>:view==='new'?<>
        {active?<>
          <div className="m-source-strip"><span>{sources[active.listing.source]} · {listingPresentation(active.listing).headerLocation||active.listing.city||'Locatie niet vermeld'}</span><div><span>{demo?'Waarneming':'Laatst gezien'} {new Date(active.listing.observedAt).toLocaleDateString('nl-NL')}</span><div className="m-home-pager"><button aria-label="Vorige woning" disabled={activeIndex===0} onClick={()=>props.selectHome(filtered[activeIndex-1].listing.key)}><MobileIcon name="back" size={12}/></button><button aria-label="Volgende woning" disabled={activeIndex===filtered.length-1} onClick={()=>props.selectHome(filtered[activeIndex+1].listing.key)}><MobileIcon name="back" size={12}/></button></div></div></div>
          <MobileProperty home={active} demo={demo} busy={busy} Gallery={Gallery} onDecision={d=>props.changeDecision(active.listing.key,d)}/>
        </>:<Empty loading={loading} title="Je bent bij met je matches" description="Dit betekent niet dat er geen aanbod is. Controleer bronstatus en je zoekprofiel; onbekende vereiste gegevens worden standaard niet toegelaten." action={()=>navigate('profile')} actionLabel="Bekijk zoekprofiel"/>}
        <MobileSources runs={runs} demo={demo} delivery={delivery}/>
      </>:<>
        <header className="m-collection-heading"><div><h1>{view==='favourite'?'Bewaarde woningen':'Archief'}</h1>{view==='favourite'?<span className="m-selection-caption">Jouw selectie</span>:<span className="m-archive-count">{archivedHomes.length} gearchiveerd</span>}</div><p>{view==='favourite'?'Jouw selectie, ook wanneer gegevens veranderen.':'Niet voor nu? Herstel een woning direct naar je nieuwe matches.'}</p>{props.refresh&&<button disabled={loading} onClick={props.refresh}>{loading?'Laden…':'Overzicht vernieuwen'}</button>}</header>
        {view==='favourite'?<div className="m-source-filters" aria-label="Filter favorieten op bron"><button aria-pressed={selectedSource==='all'} onClick={()=>setSource('all')}>Alle ({collection.length})</button>{([...new Set(collection.map(h=>h.listing.source))]).map(s=><button key={s} aria-pressed={selectedSource===s} onClick={()=>setSource(s)}>{sources[s]} ({collection.filter(h=>h.listing.source===s).length})</button>)}</div>:<div className="m-archive-controls"><label className="m-search"><MobileIcon name="search" size={16}/><input type="search" aria-label="Zoeken in archief" placeholder="Zoek op straatnaam, wijk of criterium…" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="m-archive-filters" aria-label="Filter op huidige beoordeling">{([['all','Alles'],['budget','Buiten budget'],['area','Te klein'],['income','Inkomen']] as const).filter(([key])=>key==='all'||collection.some(h=>archiveMatches(h,'',key))).map(([key,label])=><button key={key} aria-pressed={selectedArchiveFilter===key} onClick={()=>setArchiveFilter(key)}>{label}{key==='all'&&` (${collection.length})`}</button>)}</div></div>}
        <div className="m-collection">{collectionVisible.map(h=><CollectionCard key={h.listing.key} home={h} archive={view==='dismissed'} demo={demo} busy={busy} open={()=>open(h,view as CollectionView)} onDecision={d=>props.changeDecision(h.listing.key,d)}/>)}</div>
        {!collectionVisible.length&&<Empty loading={loading} title={collection.length?'Geen woningen met dit filter':view==='favourite'?'Nog geen favorieten':'Nog niets afgewezen'} description={collection.length?'Pas de zoekterm of het filter aan.':'Je keuzes verschijnen hier. Bij Nieuw kun je woningen bekijken en bewaren of afwijzen.'} action={()=>navigate('new')} actionLabel="Naar nieuwe matches"/>}
        {view==='dismissed'&&<p className="m-retention">Afgewezen woningen blijven bewaard. Herstellen toont alleen passende woningen bij Nieuw.</p>}
      </>}
    </main>
    <nav className="m-navigation" aria-label="Hoofdnavigatie">{(Object.keys(labels) as MobileView[]).map(v=><button key={v} aria-current={view===v?'page':undefined} onClick={()=>navigate(v)}><MobileIcon name={v} size={18}/><span>{labels[v]}</span>{v==='new'&&totalNew>0&&<span className="m-nav-count">{totalNew}</span>}</button>)}</nav>
  </div>;
}

function Empty({loading,title,description,action,actionLabel}:{loading:boolean;title:string;description:string;action:()=>void;actionLabel:string}) {
  return <section className="m-empty" aria-busy={loading}><h2>{loading?'Woningen laden…':title}</h2><p>{description}</p><button onClick={action}>{actionLabel}</button></section>;
}
function CollectionCard({home,archive,demo,busy,open,onDecision}:{home:Home;archive:boolean;demo:boolean;busy:boolean;open:()=>void;onDecision:(d:Decision)=>void}) {
  const l=home.listing, presentation=listingPresentation(l), {price}=presentation;
  const issues=home.evaluation.criteria.filter(c=>c.verdict!=='pass');
  return <article className="m-collection-card" aria-label={l.title}>
    <button className="m-card-open" onClick={open} aria-label={`Open dossier ${l.title}`}>
      <div className="m-card-photo">{l.photos[0]?<img src={l.photos[0]} alt={`${l.title} · bronfoto`} onError={e=>{e.currentTarget.style.visibility='hidden';}}/>:<span className="m-no-photo">Geen bronfoto beschikbaar</span>}{archive&&home.dismissal&&<time className="m-archived-date" dateTime={home.dismissal.at}>Gearchiveerd · {new Date(home.dismissal.at).toLocaleDateString('nl-NL')}</time>}{l.photos.length>0&&<span className="m-photo-count">1 / {l.photos.length}</span>}</div>
      <div className="m-card-content"><div className="m-card-summary"><div><p className="m-eyebrow">{presentation.headerLocation?`${presentation.headerLocation} · `:''}{sources[l.source]}</p><h2>{l.title}</h2></div><div className="m-card-price"><strong>{money(price.amount)}</strong><span>/ mnd</span></div></div><p className="m-card-price-note">{price.label} · {price.caveat}</p><dl className="m-card-facts"><div><dt>Oppervlak</dt><dd>{area(l)}</dd></div><div><dt>Slaapkamers</dt><dd>{l.bedrooms??'Onbekend'}</dd></div><div><dt>Type</dt><dd>{l.type??'Onbekend'}</dd></div></dl></div>
    </button>
    <div className="m-card-lower"><p className="m-card-context">{archive?'Huidige beoordeling: ':''}{issues.length?issues.map(c=>`${c.label}: ${verdictText[c.verdict].toLowerCase()}`).join(' · '):'Voldoet aan je huidige zoekprofiel.'}</p>{!archive&&<p className="m-note">{availability(l,demo)}. {l.rent.note}</p>}<div className="m-card-actions">{!archive&&<a href={l.url} target="_blank" rel="noreferrer">Bekijk advertentie <MobileIcon name="external" size={13}/></a>}<button disabled={busy} onClick={()=>onDecision('new')}>{archive&&<MobileIcon name="undo" size={14}/>} {archive?'Herstel naar Nieuw':'Uit favorieten'}</button></div></div>
  </article>;
}

function MobileProperty({home,demo,busy,dossier=false,Gallery,onDecision}:{home:Home;demo:boolean;busy:boolean;dossier?:boolean;Gallery:GalleryComponent;onDecision:(d:Decision)=>void}) {
  const l=home.listing, presentation=listingPresentation(l), {price}=presentation;
  const start=useRef<{x:number;y:number}|null>(null);
  const [drag,setDrag]=useState(0);
  const pointerDown=(e:PointerEvent<HTMLElement>)=>{if(!dossier&&e.isPrimary&&e.button===0&&!busy)start.current={x:e.clientX,y:e.clientY};};
  const pointerMove=(e:PointerEvent<HTMLElement>)=>{
    if(!start.current)return;
    const x=e.clientX-start.current.x,y=e.clientY-start.current.y;
    if(Math.abs(y)>25&&Math.abs(y)>Math.abs(x)){start.current=null;setDrag(0);return;}
    if(Math.abs(x)>20&&Math.abs(x)>Math.abs(y)*1.8){e.currentTarget.setPointerCapture(e.pointerId);setDrag(Math.max(-80,Math.min(80,x)));}
  };
  const pointerUp=(e:PointerEvent<HTMLElement>)=>{if(start.current){const x=e.clientX-start.current.x,y=e.clientY-start.current.y;if(Math.abs(x)>=100&&Math.abs(x)>Math.abs(y)*2)onDecision(x>0?'favourite':'dismissed');}start.current=null;setDrag(0);};
  const facts=<dl className="m-fact-rows"><Row label="Woonoppervlakte" value={area(l)}/><Row label="Slaapkamers" value={l.bedrooms===null?'Niet vermeld':String(l.bedrooms)}/><Row label="Woningtype" value={l.type??'Niet vermeld'}/><Row label="Beschikbaar per" value={l.moveIn??'Niet vermeld'}/><Row label="Beschikbaarheid" value={availability(l,demo)}/><Row label="Aangeboden door" value={l.advertiser||sources[l.source]}/><Row label="Verhuurder" value={l.landlord||'Niet afzonderlijk vermeld'}/></dl>;
  const costs=<><dl className="m-fact-rows"><Row label="Geadverteerde huurprijs" value={money(l.rent.headline)}/><Row label="Kale huur" value={money(l.rent.base)}/><Row label="Service totaal / voorschot" value={money(l.rent.serviceAggregate)}/>{l.rent.service!==null&&<Row label="Waarvan service" value={money(l.rent.service)}/ >}{l.rent.energy!==null&&<Row label="Waarvan energie" value={money(l.rent.energy)}/>}<Row label="Gas, water & elektra" value={l.rent.utilities}/><Row label="Bekend maandbedrag" value={money(l.rent.knownMonthly)} strong/></dl>{l.rent.headlineText&&<p className="m-note">Bronnotatie: {l.rent.headlineText}</p>}<p className="m-note">{l.rent.note}</p><p className="m-note">Een onbekende post is geen €0. Controleer ook borg, belastingen en eigen aansluitingen.</p></>;
  const environment=<><dl className="m-fact-rows">{presentation.locationFacts.map(({label,value})=><Row key={label} label={label} value={value}/>)}</dl>{presentation.attribution&&<p className="m-note">{presentation.attribution}. <a href={cbsDocumentation} target="_blank" rel="noreferrer">Bron</a> · <a href={cbsLicence} target="_blank" rel="noreferrer">Licentie</a>{presentation.refreshNote&&` · ${presentation.refreshNote}`}</p>}<PropertyMap listing={l}/>{dossier&&l.photos[1]&&<figure className="m-source-figure"><img src={l.photos[1]} alt={`${l.title} · tweede bronfoto`} onError={e=>{e.currentTarget.style.visibility='hidden';}}/><figcaption>Fig. 2 · bronfoto</figcaption></figure>}</>;
  const criteria=<><dl className="m-fact-rows"><Row label="Expliciete inkomenseis" value={l.incomeMin===null?'Niet vermeld':`${money(l.incomeMin)} bruto / mnd`}/>{home.evaluation.criteria.map(c=><Row key={c.label} label={c.label} value={verdictText[c.verdict]}/>)}</dl><p className="m-note">Beoordeling met je huidige zoekprofiel. Niet vermelde eisen blijven onbekend. Geen inkomensscreening, juridische toets of dossierverificatie.</p></>;
  return <article className="m-property" aria-label={l.title}>
    <div className="m-property-hero"><Gallery key={l.key} listing={l} demo={demo} presentation={dossier?'dossier':'story'}/>{dossier&&l.externalId&&<span className="m-dossier-id">Bron-ID {l.externalId}</span>}</div>
    <div className="m-property-intro">
      <header className="m-swipe-zone" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{start.current=null;setDrag(0);}} style={{transform:`translateX(${drag}px)`}} aria-describedby={dossier?undefined:'m-swipe-help'}><div className="m-location-line"><p className="m-eyebrow">{presentation.headerLocation?`${presentation.headerLocation}, `:''}{l.city||'Plaats niet vermeld'}{dossier&&` · ${sources[l.source]}`}</p>{dossier&&<span className="m-state">{home.decision==='dismissed'?'Archief':home.decision==='favourite'?'Favoriet':'Nieuw'}</span>}</div><h1>{l.title}</h1><div className="m-price"><strong>{money(price.amount)}</strong><span>/ maand</span></div><p className="m-price-qualifier">{price.label} · {price.caveat}</p></header>
      <div className="m-decisions">{dossier?<><button disabled={busy} onClick={()=>onDecision(home.decision==='dismissed'?'new':'dismissed')}>{home.decision==='dismissed'?'Herstel naar Nieuw':'Afwijzen'}</button><button className="m-primary" disabled={busy} onClick={()=>onDecision(home.decision==='favourite'?'new':'favourite')}>{home.decision==='favourite'?'Uit favorieten':'Bewaren'}</button></>:<><button disabled={busy} onClick={()=>onDecision('dismissed')}>Afwijzen</button><button className="m-primary" disabled={busy} onClick={()=>onDecision('favourite')}>Bewaren</button></>}</div>
      {!dossier&&<p id="m-swipe-help" className="m-swipe-help">Veeg de titel links om af te wijzen · rechts om te bewaren</p>}
    </div>
    {dossier?<><DetailSection title="01 / Technische specificaties">{facts}<h3 className="m-subsection-title">Kostenbasis</h3>{costs}</DetailSection><DetailSection title="02 / Toelatingscriteria">{criteria}</DetailSection><DetailSection title="03 / Locatie & omgeving">{environment}</DetailSection><DetailSection title="04 / Redactionele beschrijving" description><p>{l.description}</p></DetailSection></>:<><DetailSection title="Kenmerken">{facts}</DetailSection><DetailSection title="Kostenbasis">{costs}</DetailSection><DetailSection title="Locatie & omgeving">{environment}</DetailSection><DetailSection title="Voorwaarden">{criteria}</DetailSection><DetailSection title="Omschrijving" description><p>{l.description}</p></DetailSection></>}
    <footer className="m-original-source">{home.dismissal&&<p className="m-note">Eerder afgewezen op {new Date(home.dismissal.at).toLocaleDateString('nl-NL')}. Eerdere woninggegevens en beoordeling blijven bewaard.</p>}{dossier&&<><span className="m-eyebrow">Aangeboden door</span><h2>{l.advertiser||sources[l.source]}</h2><p className="m-note">Bron-ID {l.externalId}</p></>}<a href={l.url} target="_blank" rel="noreferrer">Bekijk origineel bij {sources[l.source]} <MobileIcon name="external" size={15}/></a><p className="m-note">{demo?'Publieke observatie 11 november 2026. Geen actuele match.':`Laatst gezien: ${new Date(l.observedAt).toLocaleString('nl-NL')}. Controleer de bron voor je reageert.`} Er worden geen documenten of aanvragen verstuurd.</p></footer>
  </article>;
}
function Row({label,value,strong=false}:{label:string;value:ReactNode;strong?:boolean}) { return <div className={strong?'m-total':undefined}><dt>{label}</dt><dd>{value}</dd></div>; }
function DetailSection({title,children,description=false}:{title:string;children:ReactNode;description?:boolean}) { return <section className={`m-detail-section${description?' m-description':''}`}><h2>{title}</h2>{children}</section>; }
