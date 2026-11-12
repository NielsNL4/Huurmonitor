import type { Listing } from '../shared/model';
import { mapLinks } from '../shared/location';

export function PropertyMap({ listing }: { listing: Listing }) {
  const links = mapLinks(listing.location);
  // Replace the embedded map when the selected property or source point changes.
  return <MapContent key={`${listing.key}:${links?.embed ?? 'unknown'}`} listing={listing} links={links}/>;
}

function MapContent({ listing, links }: { listing: Listing; links: ReturnType<typeof mapLinks> }) {
  return <section className="property-map" aria-label="Locatie op kaart">
    <h3>Locatie op kaart</h3>
    {links ? <>
      <p>Locatie volgens de bron. Het punt is niet gegarandeerd de exacte ingang.</p>
      <p>Deze kaart laadt automatisch. OpenStreetMap ontvangt je IP-adres en de bekeken locatie, niet je zoekprofiel. Dit geldt ook voor de grotere kaart.</p>
      <iframe src={links.embed} title={`Locatie volgens de bron: ${listing.title}`} referrerPolicy="no-referrer"/>
      <a href={links.larger} target="_blank" rel="noreferrer">Grotere kaart bij OpenStreetMap</a>
    </> : <p>Locatie op kaart niet beschikbaar. Bekijk de originele advertentie via de bronlink hieronder.</p>}
  </section>;
}
