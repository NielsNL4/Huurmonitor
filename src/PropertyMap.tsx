import { lazy, Suspense } from 'react';
import type { Listing } from '../shared/model';
import { listingPresentation } from '../shared/listing-presentation';

// Keep browser theme globals and MapLibre out of Node/SSR imports.
const PropertyMapLibre=lazy(()=>import('./PropertyMapLibre'));
export function PropertyMap({ listing }: { listing: Listing }) {
  const {point}=listingPresentation(listing);
  return <section className="property-map" aria-label="Locatie op kaart">
    <h3>Locatie op kaart</h3>
    {point ? <>
      <p>{point.provenance==='source' ? 'Locatie volgens de bron · precisie onbekend. Het punt is niet gegarandeerd de exacte ingang.' : point.precision==='house-number' ? 'Benaderde locatie op huisnummerniveau; geen exacte woninglocatie.' : 'PDOK/BAG-adreslocatie; geen gegarandeerde ingang.'}</p>
      <p>Deze kaart laadt automatisch. CARTO ontvangt je IP-adres en het bekeken kaartgebied, niet je zoekprofiel of adresgegevens. Het woningpunt blijft lokaal in de kaart.</p>
      <Suspense fallback={<p role="status">Kaart laden…</p>}><PropertyMapLibre key={`${listing.key}:${point.lon}:${point.lat}`} listing={listing}/></Suspense>
    </> : <p>Locatie op kaart niet beschikbaar. Bekijk de originele advertentie via de bronlink hieronder.</p>}
  </section>;
}
