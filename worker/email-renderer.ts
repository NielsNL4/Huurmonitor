import type { Event, Listing } from '../shared/model';
import { money } from '../shared/model';
import { priceDisplay } from '../shared/price-display';

const intro = 'Wijzigingen die nu aan je opgeslagen profiel voldoen. Controleer beschikbaarheid en bijkomende kosten bij de bron.';
const sans = 'font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px;';
const serif = "font-family:Georgia, 'Times New Roman', serif;";
function escape(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
function adUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
/** No resolution or fetching. Reject local/reserved literals and non-public host forms. */
function photoUrl(value: string | undefined): string | null {
  if (!value) return null;
  const safe = adUrl(value);
  if (!safe) return null;
  const url = new URL(safe), host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host) ||
      /\.(?:localhost|local|internal|lan|home|test|invalid|example)$/.test(host) ||
      host === 'home.arpa' || host.endsWith('.home.arpa')) return null;
  return safe;
}
function facts(listing: Listing) {
  const price = priceDisplay(listing);
  return {
    price: `${money(price.amount)} · ${price.label}`,
    caveat: `${price.caveat}; overige kosten kunnen ontbreken.`,
    neighbourhood: listing.neighbourhood?.trim() || 'Niet vermeld',
    area: listing.area === null || !Number.isFinite(listing.area) ? 'Niet vermeld' : `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(listing.area)} m²`,
    url: adUrl(listing.url),
  };
}
export function digestText(events: Event[]) {
  return ['Huurmonitor', '', intro, '', ...events.map(event => {
    const fact = facts(event.listing);
    return [event.listing.title, `Wijziging: ${event.reason}`, fact.price, fact.caveat,
      `Wijk volgens advertentie: ${fact.neighbourhood}`, `Oppervlakte: ${fact.area}`,
      fact.url ? `Bekijk advertentie: ${fact.url}` : 'Advertentielink niet beschikbaar.', ''].join('\n');
  })].join('\n');
}
function listingHtml(event: Event) {
  const listing = event.listing, fact = facts(listing), price = priceDisplay(listing);
  // Deliberately inspect only the first source photo; never substitute a later one.
  const photo = photoUrl(listing.photos?.[0]);
  const row = (label: string, value: string) => `<tr><td style="padding:16px 0; border-bottom:1px solid #292826; color:#f4f3ef; ${sans} font-size:16px; line-height:24px;"><span style="color:#aaa8a1; font-size:14px; line-height:22px;">${label}</span><br>${escape(value)}</td></tr>`;
  return `<tr><td style="padding:0 24px 48px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse; table-layout:fixed; overflow-wrap:anywhere;">
      <tr><td style="padding:28px 0 0; border-top:1px solid #292826; color:#aaa8a1; ${sans}">${photo
        ? `<img src="${escape(photo)}" alt="${escape(`Bronfoto: ${listing.title}`)}" width="552" border="0" style="display:block; width:100%; max-width:552px; height:auto; border:0; color:#aaa8a1; ${sans}">`
        : 'Geen bruikbare bronfoto beschikbaar.'}</td></tr>
      <tr><td style="padding:26px 0 12px;"><h2 style="margin:0; color:#f4f3ef; ${serif} font-size:34px; font-weight:normal; line-height:40px;">${escape(listing.title)}</h2></td></tr>
      <tr><td style="padding:0 0 20px; color:#aaa8a1; ${sans}">Wijziging: ${escape(event.reason)}</td></tr>
      <tr><td style="padding:0; color:#f4f3ef; ${serif} font-size:38px; line-height:44px;">${escape(money(price.amount))} <span style="color:#aaa8a1; ${sans}">${escape(price.label)}</span></td></tr>
      <tr><td style="padding:8px 0 26px; border-bottom:1px solid #292826; color:#aaa8a1; ${sans}">${escape(fact.caveat)}</td></tr>
      ${row('Wijk volgens advertentie:', fact.neighbourhood)}
      ${row('Oppervlakte', fact.area)}
      <tr><td style="padding:28px 0 8px; color:#f4f3ef; ${sans} font-size:16px; line-height:24px;">${fact.url
        ? `<a href="${escape(fact.url)}" style="color:#f4f3ef; text-decoration:underline;">Bekijk advertentie</a>`
        : 'Advertentielink niet beschikbaar.'}</td></tr>
    </table>
  </td></tr>`;
}
export function digestHtml(events: Event[]) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Huurmonitor</title></head>
  <body bgcolor="#141412" style="margin:0; padding:0; background-color:#141412; color:#f4f3ef;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#141412" style="width:100%; background-color:#141412; border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt;"><tr><td align="center" valign="top">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#141412" style="width:100%; max-width:600px; background-color:#141412; border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt;">
        <tr><td style="padding:28px 24px 22px;">
          <h1 style="margin:0 0 12px; color:#f4f3ef; ${serif} font-size:34px; font-weight:normal; font-style:italic; line-height:42px;">Huurmonitor</h1>
          <p style="margin:0; color:#aaa8a1; ${sans}">${intro}</p>
        </td></tr>
        ${events.map(listingHtml).join('\n')}
      </table><!--[if mso]></td></tr></table><![endif]-->
    </td></tr></table>
  </body></html>`;
}
