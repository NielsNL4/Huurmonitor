import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { GeoJSONSource, Map as LibreMap, Marker } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Home, Profile } from '../shared/model';
import { money } from '../shared/model';
import { effectiveLocation } from '../shared/location';
import { priceDisplay } from '../shared/price-display';
import { listingPresentation } from '../shared/listing-presentation';
import { cartoStyleUrl, mapCollection, mapFeatures, mapStatus, type MapSession } from './map-model';
import 'maplibre-gl/dist/maplibre-gl.css';
import './collection-map.css';

interface Props {
  homes: Home[]; profile: Profile; demo: boolean; hidden?: boolean;
  state: MapSession; setState: Dispatch<SetStateAction<MapSession>>; open: (key: string)=>void;
}
const heartPath='M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z';
function heart() {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',heartPath);svg.append(path);return svg;
}
function Summary({home,demo,preview=false,open}:{home:Home;demo:boolean;preview?:boolean;open?:()=>void}) {
  const presentation=listingPresentation(home.listing), {price,point}=presentation;
  return <>
    {home.listing.photos[0] && <img src={home.listing.photos[0]} alt="" onError={e=>{e.currentTarget.style.visibility='hidden';}}/>}
    <span className="cm-home-text"><strong>{home.listing.title}</strong>{presentation.headerLocation&&<span>{presentation.headerLocation}</span>}<span className={home.decision==='favourite'?'cm-favourite':''}>{mapStatus(home,demo)}</span><span className="cm-price">{money(price.amount)} <small>{price.label} · {price.caveat}</small></span>{presentation.locationCaveat&&<span>{presentation.locationCaveat}</span>}{!point ? <span>Geen bruikbare kaartlocatie</span> : preview && !presentation.locationCaveat && <span>{point.provenance==='source'?'Bronlocatie · precisie onbekend':'PDOK/BAG-adreslocatie · geen gegarandeerde ingang'}</span>}{open&&<button onClick={open}>Bekijk woning</button>}</span>
  </>;
}

export function CollectionMap({homes,profile,demo,hidden=false,state,setState,open}: Props) {
  const collection=useMemo(()=>mapCollection(homes,profile),[homes,profile]);
  const data=useMemo(()=>mapFeatures(collection),[collection]);
  const selected=collection.find(home=>home.listing.key===state.selectedKey) ?? collection[0];
  const styleUrl=cartoStyleUrl(import.meta.env.VITE_CARTO_BASEMAPS_KEY);
  const requestedStyle=useRef({styleUrl}); requestedStyle.current={styleUrl};
  const appliedStyle=useRef<string | null>(null), generation=useRef(0);
  const configured=!!styleUrl;
  const [status,setStatus]=useState(styleUrl?'Kaart laden…':'Kaart niet ingesteld: een eigen gratis CARTO-basemapkey ontbreekt. Gebruik de lijst.');
  const [failed,setFailed]=useState(false), [group,setGroup]=useState<string[]>([]);
  const container=useRef<HTMLDivElement>(null), list=useRef<HTMLDivElement>(null), map=useRef<LibreMap | null>(null);
  const latest=useRef({collection,data,selected,state,setState,demo});
  latest.current={collection,data,selected,state,setState,demo};
  const refreshMarkers=useRef<()=>void>(()=>{});
  const clearMarkers=useRef<()=>void>(()=>{});
  const missing=collection.length-data.features.length;
  function select(key:string) {
    setState(previous=>({...previous,selectedKey:key}));
    const point=effectiveLocation(collection.find(home=>home.listing.key===key)!.listing);
    if (point && map.current) map.current.easeTo({center:[point.lon,point.lat],duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:350});
  }
  useLayoutEffect(()=>{if(list.current)list.current.scrollTop=state.listScroll;},[hidden,state.mode]);
  useEffect(()=>{
    if (!configured || !container.current) return;
    let disposed=false, fitted=false, instance:LibreMap | null=null, observer:ResizeObserver | null=null;
    const markers=new Map<string,Marker>();
    clearMarkers.current=()=>{for(const marker of markers.values())marker.remove();markers.clear();};
    void import('maplibre-gl').then(lib=>{
      if(disposed || !container.current)return;
      try {
        // MapLibre 6's sibling-worker URL is not preserved by Vite chunking.
        // Let Vite emit a base-aware same-origin module-worker asset instead.
        lib.setWorkerUrl(workerUrl);
        const camera=latest.current.state.camera;
        appliedStyle.current=requestedStyle.current.styleUrl;
        instance=new lib.Map({container:container.current,style:appliedStyle.current!,center:camera?.center ?? [6.57,53.22],zoom:camera?.zoom ?? 12,bearing:camera?.bearing ?? 0,pitch:camera?.pitch ?? 0,attributionControl:false,renderWorldCopies:false,maxZoom:20});
        map.current=instance;
        instance.addControl(new lib.NavigationControl({showCompass:false}),'top-right');
        instance.getCanvas().setAttribute('aria-label','Woningkaart. Gebruik de lijst voor alle woningen en toetsenbordselectie.');
        const update=()=>{
          if(!instance || !instance.isStyleLoaded() || !instance.getSource('homes'))return;
          const revision=generation.current;
          const current=latest.current, visible=new Set<string>();
          for(const feature of instance.querySourceFeatures('homes')){
            if(feature.geometry.type!=='Point')continue;
            const properties=feature.properties!, cluster=!!properties.cluster;
            const id=cluster?`cluster:${properties.cluster_id}`:String(properties.key);
            if(visible.has(id))continue;visible.add(id);
            let marker=markers.get(id);
            const home=cluster?undefined:current.collection.find(home=>home.listing.key===properties.key);
            if(!cluster && !home)continue;
            const kind=cluster?'cluster':home!.decision;
            if(marker && marker.getElement().dataset.kind!==kind){marker.remove();markers.delete(id);marker=undefined;}
            if(!marker){
              const button=document.createElement('button');button.type='button';button.className='cm-pin';
              button.dataset.kind=kind;
              if(cluster){
                button.textContent=String(properties.point_count);button.classList.add('cm-cluster');
                button.setAttribute('aria-label',`${properties.point_count} woningen: toon woningen in deze groep`);
                const source=instance.getSource('homes') as GeoJSONSource;
                void source.getClusterLeaves(Number(properties.cluster_id),Number(properties.point_count),0).then(leaves=>{
                  if(disposed || revision!==generation.current || !button.isConnected)return;
                  button.dataset.members=JSON.stringify(leaves.map(leaf=>String(leaf.properties?.key)));
                  const active=leaves.some(leaf=>leaf.properties?.key===latest.current.selected?.listing.key);
                  button.classList.toggle('cm-selected',active);button.setAttribute('aria-pressed',String(active));
                }).catch(()=>{}); // The complete React list remains the fallback.
                button.addEventListener('click',()=>{
                  const source=instance?.getSource('homes') as GeoJSONSource | undefined;
                  if(!source)return;
                  void source.getClusterLeaves(Number(properties.cluster_id),Number(properties.point_count),0).then(leaves=>{
                    if(disposed || revision!==generation.current)return;
                    setGroup(leaves.map(leaf=>String(leaf.properties?.key)));
                  }).catch(()=>{if(!disposed && revision===generation.current)setStatus('Groep niet geladen. Selecteer een woning in de lijst.');});
                });
              } else {
                if(!home)continue;
                if(home.decision==='favourite'){button.append(heart());button.classList.add('cm-saved-pin');}
                else {const dot=document.createElement('span');dot.className='cm-pin-dot';button.append(dot);}
                const price=priceDisplay(home.listing);
                const label=document.createElement('span');label.className='cm-pin-label';label.textContent=money(price.amount);button.append(label);
                button.addEventListener('click',()=>{latest.current.setState(previous=>({...previous,selectedKey:String(properties.key)}));setGroup([]);});
              }
              marker=new lib.Marker({element:button}).setLngLat(feature.geometry.coordinates as [number,number]).addTo(instance);markers.set(id,marker);
            }
            if(home){
              const price=priceDisplay(home.listing);
              marker.getElement().setAttribute('aria-label',`${home.listing.title} · ${mapStatus(home,current.demo)} · ${money(price.amount)} · ${price.label} · ${price.caveat}`);
            }
            const active=cluster ? (JSON.parse(marker.getElement().dataset.members ?? '[]') as string[]).includes(current.selected?.listing.key ?? '') : properties.key===current.selected?.listing.key;
            marker.getElement().classList.toggle('cm-selected',active);
            marker.getElement().setAttribute('aria-pressed',String(active));
          }
          for(const [id,marker] of markers)if(!visible.has(id)){marker.remove();markers.delete(id);}
        };
        refreshMarkers.current=update;
        instance.on('style.load',()=>{
          if(!instance || disposed)return;
          // Managed CARTO style, with only safe layer-type/role palette changes.
          // Glyphs, sprites, sources, labels and provider attribution stay intact.
          for(const layer of instance.getStyle().layers){
            if(layer.type==='background')instance.setPaintProperty(layer.id,'background-color','#141412');
            else if(layer.type==='fill' && /water/i.test(layer.id))instance.setPaintProperty(layer.id,'fill-color','#213331');
            else if(layer.type==='line' && /road|street|transportation/i.test(layer.id))instance.setPaintProperty(layer.id,'line-color','#49473f');
            else if(layer.type==='symbol' && layer.layout?.['text-field']){instance.setPaintProperty(layer.id,'text-color','#c4c0b5');instance.setPaintProperty(layer.id,'text-halo-color','#141412');}
          }
          if(!instance.getSource('homes'))instance.addSource('homes',{type:'geojson',data:latest.current.data,maxzoom:22,cluster:true,clusterRadius:55,clusterMaxZoom:20});
          if(!instance.getLayer('home-anchors'))instance.addLayer({id:'home-anchors',type:'circle',source:'homes',paint:{'circle-radius':1,'circle-opacity':0}});
          if(!fitted && !camera && latest.current.data.features.length){
            const bounds=new lib.LngLatBounds();for(const feature of latest.current.data.features)bounds.extend(feature.geometry.coordinates as [number,number]);
            instance.fitBounds(bounds,{padding:65,maxZoom:14,duration:0});
          }
          fitted=true;setFailed(false);setStatus('');update();
        });
        instance.on('idle',update);instance.on('moveend',()=>{
          if(!instance || disposed)return;const center=instance.getCenter();
          latest.current.setState(previous=>({...previous,camera:{center:[center.lng,center.lat],zoom:instance!.getZoom(),bearing:instance!.getBearing(),pitch:instance!.getPitch()}}));update();
        });
        instance.on('error',()=>{if(!disposed){setFailed(true);setStatus('Kaart niet beschikbaar. Controleer CARTO-key, domeinbeperking of gratis quotum; ook WebGL of de verbinding kan ontbreken. De lijst blijft bruikbaar.');}});
        observer=new ResizeObserver(()=>instance?.resize());observer.observe(container.current);
      } catch {setFailed(true);setStatus('Kaart niet beschikbaar in deze browser (WebGL). Gebruik de lijst.');}
    }).catch(()=>{if(!disposed){setFailed(true);setStatus('Kaartmodule niet geladen. Gebruik de lijst of herlaad de pagina.');}});
    return ()=>{disposed=true;observer?.disconnect();clearMarkers.current();instance?.remove();map.current=null;refreshMarkers.current=()=>{};clearMarkers.current=()=>{};};
  },[configured]);
  useEffect(()=>{
    const source=map.current?.getSource('homes') as GeoJSONSource | undefined;
    generation.current++;
    if(source){clearMarkers.current();source.setData(data);}
  },[data]);
  useEffect(()=>{refreshMarkers.current();},[selected?.listing.key]);
  const groupHomes=group.map(key=>collection.find(home=>home.listing.key===key)).filter((home):home is Home=>!!home);
  return <section className={`collection-map cm-mode-${state.mode}`} hidden={hidden} aria-label="Kaart van matches en favorieten">
    <header className="cm-heading"><div><h1>Kaart</h1><p>Nieuwe matches en alle favorieten, samen in beeld.</p></div><div className="cm-toggle" aria-label="Weergave">{(['map','list'] as const).map(mode=><button key={mode} aria-pressed={state.mode===mode} onClick={()=>setState(previous=>({...previous,mode}))}>{mode==='map'?'Kaart':'Lijst'}</button>)}</div></header>
    <div className="cm-legend"><span><i className="cm-match-symbol"/>Nieuwe match</span><span className="cm-favourite"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={heartPath}/></svg>Favoriet</span><span>{missing} van {collection.length} zonder bruikbare locatie</span></div>
    <div className="cm-workspace">
      <div className="cm-list" ref={list} role="region" aria-label="Alle kaartwoningen, ook zonder locatie" onScroll={e=>{const top=e.currentTarget.scrollTop;setState(previous=>({...previous,listScroll:top}));}}>
        {!collection.length&&<p className="cm-empty">Geen nieuwe matches of favorieten. Bekijk je zoekprofiel of bewaar een woning bij Nieuw.</p>}
        {collection.map(home=><button className={`cm-list-home ${selected?.listing.key===home.listing.key?'cm-active':''}`} key={home.listing.key} aria-pressed={selected?.listing.key===home.listing.key} onClick={()=>select(home.listing.key)}><Summary home={home} demo={demo}/></button>)}
      </div>
      <div className="cm-map-panel">
        <div className="cm-map-area"><div className="cm-canvas" ref={container} aria-label="Interactieve kaart"/>{status&&<p className={`cm-status ${failed?'cm-map-error':''}`} role="status">{status}</p>}
          {groupHomes.length>0&&<section className="cm-group" aria-label="Woningen in kaartgroep"><div><strong>{groupHomes.length} woningen in deze groep</strong><button aria-label="Groep sluiten" onClick={()=>setGroup([])}>Sluiten</button></div>{groupHomes.map(home=><button key={home.listing.key} onClick={()=>{select(home.listing.key);setGroup([]);}}>{home.listing.title} · {home.decision==='favourite'?'Favoriet':'Nieuwe match'}</button>)}</section>}
          <p className="cm-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a></p>
        </div>
        {selected&&<article className="cm-preview" aria-label="Geselecteerde kaartwoning"><Summary home={selected} demo={demo} preview open={()=>open(selected.listing.key)}/></article>}
      </div>
    </div>
    <p className="cm-privacy">CARTO ontvangt bij het laden je IP-adres en het bekeken kaartgebied. Woningpunten en zoekprofiel blijven lokaal in de kaart; geen browsergeocoding of locatiebepaling. PDOK-adresopzoekingen gebeuren alleen gecachet door de worker. Bronlocaties hebben onbekende precisie; BAG-adrespunten garanderen geen ingang.</p>
  </section>;
}
