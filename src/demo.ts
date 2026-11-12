import { neutralProfile, type Listing, type SourceRun } from '../shared/model';
import { reconcile } from '../shared/state';
const observedAt = '2026-11-11T00:00:00Z'; // date-only public observation, NOT a live refresh
const gruno: Listing = {
  key: 'gruno:01853', externalId: '01853', source: 'gruno', title: 'Petrus Campersingel 145A',
  city: 'Groningen', type: 'kamer', area: 19.94, bedrooms: 1, moveIn: '01-12-2026', available: true, incomeMin: null, observedAt,
  url: 'https://www.grunoverhuur.nl/woningaanbod/huur/groningen/petrus-campersingel/145-a',
  photos: ['photos/gruno-room.jpg', 'photos/gruno-kitchen.jpg', 'photos/gruno-shared.jpg'].map(s => `${import.meta.env.BASE_URL}${s}`),
  rent: { base: null, headline: 80500, serviceAggregate: 7500, service: null, energy: null, knownMonthly: 80500, comparison: 'headline-includes-advance', utilities: 'Voorschot gas, water, elektra en internet inbegrepen', complete: false, note: '€75 voorschot zit al in €805. Kale huur niet afzonderlijk bevestigd; overige kosten kunnen ontbreken.' },
  description: `Per 01-12-2026 komt er een studentenkamer beschikbaar aan de Petrus Campersingel 145a in Groningen.

Locatie:
De Petrus Campersingel is gelegen in de leuke buurt Oosterparkwijk. Het centrum van Groningen en het station zijn op fietsafstand.

Indeling:
Bij binnenkomst kom je in de gemeenschappelijke hal. Via de hal bereik je alle kamers en de gemeenschappelijke ruimtes. Kamer 2 bevindt zich op de eerste verdieping en heeft een oppervlakte van circa 19,94 m². Ook is er een gedeelde keuken aanwezig, voorzien van een inductiekookplaat, afzuigkap, koelkast en combioven. Daarnaast is er een gedeelde badkamer met een douche en dubbele wasbak, het toilet bevindt zich op de hal. Tot slot is er een balkon aanwezig. De gemeenschappelijke ruimtes deel je met 3 andere huisgenoten.

Huurprijs en borg:
De huurprijs voor kamer 2 bedraagt €805,- per maand inclusief een voorschot van €75,- voor gas, water, elektra en internet.
De waarborgsom bedraagt één maand huur.

Let op: voor kamerverhuur is het niet mogelijk om huurtoeslag aan te vragen.

Beschikbaarheid en huurperiode:
De kamer is per 01-12-2026 beschikbaar. De huurovereenkomst wordt aangegaan voor onbepaalde tijd.

Interesse:
Reacties kunnen uitsluitend via onze website worden ingediend door te klikken op ‘Reageer op dit object’. Telefonische reacties kunnen wij helaas niet in behandeling nemen. Wij nodigen doorgaans circa 5 kandidaten uit voor een bezichtiging. We kunnen helaas niet iedereen persoonlijk beantwoorden of uitnodigen.`
};
const solide: Listing = {
  key: 'solide:17837', externalId: '17837', source: 'solide', title: 'Hardewikerstraat 29', city: 'Groningen', type: 'studio', area: 24, bedrooms: null, moveIn: '01-12-2026', available: true, incomeMin: null, observedAt,
  url: 'https://solideverhuur.nl/huurwoningen/groningen/29-hardewikerstraat-9712gr/', photos: [],
  rent: { base: 68475, headline: 68500, serviceAggregate: 10000, service: 2000, energy: 8000, knownMonthly: 78475, comparison: 'base+aggregate-service-energy', utilities: 'Energievoorschot €80; dekking controleren', complete: false, note: '€100 service-totaal bestaat uit €20 service en €80 energie. Internet, televisie en gemeentelijke belastingen niet inbegrepen.' },
  description: `Deze recent gerenoveerde studio aan de Hardewikerstraat is per 01-12-2026 beschikbaar en is gelegen op een uitstekende locatie binnen de grachten van Groningen. De studio heeft een woonoppervlakte van circa 24 m² en bevindt zich op slechts zes minuten loopafstand van de Grote Markt.

De studio is volledig gerenoveerd en beschikt over een nieuwe, moderne keuken die van alle gemakken is voorzien. De keuken beschikt over voldoende kastruimte en diverse inbouwapparatuur, waaronder een combimagnetron, inductiekookplaat, afzuigkap en koelkast.

Daarnaast beschikt de studio over een nieuwe badkamer met moderne sanitaire voorzieningen. Dankzij de praktische indeling wordt de beschikbare ruimte optimaal benut, waardoor de studio een prettige en comfortabele woonomgeving biedt.

Dankzij de centrale ligging bevinden gezellige restaurants, cafés, supermarkten en winkels zich op loopafstand. Ook de Grote Markt, de Rijksuniversiteit Groningen en diverse andere voorzieningen zijn eenvoudig bereikbaar. De ligging maakt deze studio ideaal voor wie graag midden in het bruisende stadsleven van Groningen woont.

Bijzonderheden:
– Woonoppervlakte: circa 24 m²
– Nieuwe keuken met moderne inbouwapparatuur
– Keuken voorzien van combimagnetron, inductiekookplaat, afzuigkap en koelkast
– Gelegen binnen de grachten van Groningen
– Internet, televisie en gemeentelijke belastingen niet bij de huurprijs inbegrepen

Deze studio is ideaal voor wie op zoek is naar een moderne, comfortabele en centraal gelegen woonruimte in hartje Groningen.

Interesse? Vraag dan direct een bezichtiging aan!`
};
export const demoListings = [gruno, solide];
export const initialDemo = () => ({ profile: neutralProfile, homes: reconcile([], demoListings, neutralProfile).homes });
export const demoRuns: SourceRun[] = (['gruno', 'solide', 'maxx'] as const).map(source => ({ source, status: 'disabled', at: observedAt, count: 0, message: source === 'maxx' ? 'Detailcheck gaf HTTP 403; adapter niet live bevestigd.' : source === 'solide' ? 'Schriftelijke toestemming vereist vóór automatische verwerking.' : 'Live monitoring uit; toegang beoordelen vóór inschakelen.' }));
