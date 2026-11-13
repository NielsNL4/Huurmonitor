import { useEffect, useRef, useState } from 'react';
import type { Map as LibreMap, MapOptions } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { cartoStyleUrl } from './map-model';
import { useTheme } from './useTheme';
import 'maplibre-gl/dist/maplibre-gl.css';

type Library = typeof import('maplibre-gl');
interface Options {
  label: string;
  fallback: string;
  initial: () => Partial<MapOptions>;
  created: (map: LibreMap, lib: Library) => (() => void) | void;
  styleLoaded: (map: LibreMap, lib: Library) => void;
  styleChanging?: () => void;
}

/** Shared canvas ownership only. Sources, markers and camera policy stay with callers. */
export function useMapLibreCanvas(options: Options) {
  const theme=useTheme(), styleUrl=cartoStyleUrl(import.meta.env.VITE_CARTO_BASEMAPS_KEY,theme);
  const latest=useRef(options);latest.current=options;
  const requested=useRef({theme,styleUrl});requested.current={theme,styleUrl};
  const applied=useRef<string | null>(null);
  const container=useRef<HTMLDivElement>(null), map=useRef<LibreMap | null>(null);
  const [status,setStatus]=useState(styleUrl?'Kaart laden…':`Kaart niet ingesteld: een eigen gratis CARTO-basemapkey ontbreekt. ${options.fallback}`);
  const [failed,setFailed]=useState(false);
  const configured=!!styleUrl;
  useEffect(()=>{
    if(!configured || !container.current)return;
    let disposed=false, instance:LibreMap | null=null, observer:ResizeObserver | null=null, cleanup:(()=>void) | void;
    const fail=(message:string)=>{if(!disposed){setFailed(true);setStatus(`${message} ${latest.current.fallback}`);}};
    void import('maplibre-gl').then(lib=>{
      if(disposed || !container.current)return;
      try {
        // Vite emits a same-origin, base-aware module worker for MapLibre 6.
        lib.setWorkerUrl(workerUrl);
        applied.current=requested.current.styleUrl;
        instance=new lib.Map({...latest.current.initial(),container:container.current,style:applied.current!,attributionControl:false,renderWorldCopies:false,maxZoom:20});
        map.current=instance;
        instance.addControl(new lib.NavigationControl({showCompass:false}),'top-right');
        instance.getCanvas().setAttribute('aria-label',latest.current.label);
        cleanup=latest.current.created(instance,lib);
        instance.on('style.load',()=>{
          if(disposed || !instance)return;
          if(requested.current.theme==='dark')for(const layer of instance.getStyle().layers){
            if(layer.type==='background')instance.setPaintProperty(layer.id,'background-color','#141412');
            else if(layer.type==='fill' && /water/i.test(layer.id))instance.setPaintProperty(layer.id,'fill-color','#213331');
            else if(layer.type==='line' && /road|street|transportation/i.test(layer.id))instance.setPaintProperty(layer.id,'line-color','#49473f');
            else if(layer.type==='symbol' && layer.layout?.['text-field']){instance.setPaintProperty(layer.id,'text-color','#c4c0b5');instance.setPaintProperty(layer.id,'text-halo-color','#141412');}
          }
          latest.current.styleLoaded(instance,lib);
          setFailed(false);setStatus('');
        });
        instance.on('error',()=>fail('Kaart niet beschikbaar. Controleer CARTO-key, domeinbeperking of gratis quotum; ook WebGL of de verbinding kan ontbreken.'));
        observer=new ResizeObserver(()=>instance?.resize());observer.observe(container.current);
      } catch {fail('Kaart niet beschikbaar in deze browser (WebGL).');}
    }).catch(()=>fail('Kaartmodule niet geladen.'));
    return ()=>{disposed=true;observer?.disconnect();cleanup?.();instance?.remove();map.current=null;};
  },[configured]);
  useEffect(()=>{
    if(!map.current || !styleUrl || applied.current===styleUrl)return;
    latest.current.styleChanging?.();applied.current=styleUrl;
    setFailed(false);setStatus('Kaart laden…');
    // MapLibre 6's diff path does not emit style.load. Rebuild only the style.
    try {map.current.setStyle(styleUrl,{diff:false});}
    catch {setFailed(true);setStatus(`Kaartstijl niet geladen. ${latest.current.fallback}`);}
  },[styleUrl]);
  return {container,map,status,failed,setStatus};
}
