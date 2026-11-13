import { useRef } from 'react';
import type { Marker } from 'maplibre-gl';
import type { Listing } from '../shared/model';
import { propertyMapFeatures } from './map-model';
import { useMapLibreCanvas } from './useMapLibreCanvas';
import './property-map.css';

export default function PropertyMapLibre({listing}:{listing:Listing}) {
  const data=propertyMapFeatures(listing), feature=data.features[0];
  const marker=useRef<Marker | null>(null);
  const {container,status,failed}=useMapLibreCanvas({
    label:'Locatie van deze advertentie. Gebruik de plus- en minknoppen om te zoomen.',
    fallback:'De kaartlocatie hierboven blijft bekend. Bekijk de originele advertentie via de bronlink hieronder.',
    initial:()=>({center:feature.geometry.coordinates as [number,number],zoom:15}),
    created:()=>()=>{marker.current?.remove();marker.current=null;},
    styleChanging:()=>{marker.current?.remove();marker.current=null;},
    styleLoaded:(map,lib)=>{
      if(!map.getSource('property'))map.addSource('property',{type:'geojson',data});
      if(!map.getLayer('property-anchor'))map.addLayer({id:'property-anchor',type:'circle',source:'property',paint:{'circle-radius':1,'circle-opacity':0}});
      marker.current?.remove();
      const pin=document.createElement('div');pin.className='property-map-pin';
      pin.setAttribute('role','img');pin.setAttribute('aria-label','Locatie van deze advertentie');
      const dot=document.createElement('span');pin.append(dot);
      marker.current=new lib.Marker({element:pin}).setLngLat(feature.geometry.coordinates as [number,number]).addTo(map);
    },
  });
  return <div className="property-map-frame">
    <div className="property-map-canvas" ref={container}/>
    {status&&<p className={`property-map-status${failed?' property-map-error':''}`} role="status">{status}</p>}
    <div className="property-map-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a></div>
  </div>;
}
