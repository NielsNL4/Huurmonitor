import type { Listing, OfficialGeography, SourceLocation } from '../shared/model';
import { cbsYear, cbsVersion, currentOfficialGeography, geographyKey, sourcePoint, validOfficialNames } from '../shared/official-geography';
import { validCoordinates } from '../shared/location';

const endpoint = 'https://api.pdok.nl/cbs/wijken-en-buurten-2026/ogc/v1/collections/buurten/items';
const day = 86_400_000;
type Status = OfficialGeography['status'];
type Point = [number,number];

export function geographyUrl(point: SourceLocation) {
  if (!sourcePoint(point)) throw new Error('A valid source point is required');
  const url = new URL(endpoint);
  url.search = new URLSearchParams({f:'json',limit:'2','filter-lang':'cql2-text',filter:`S_INTERSECTS(geometry,POINT(${point.lon} ${point.lat}))`}).toString();
  return url.href;
}
function empty(point: SourceLocation, at: string, status: Status): OfficialGeography {
  return {provider:'pdok-cbs',year:cbsYear,version:cbsVersion,input:{...point},retrievedAt:at,lastAttemptAt:at,lastAttemptStatus:status === 'error' || status === 'invalid-response' ? 'error' : 'ok',status,buurt:null,wijk:null,municipality:null};
}
// GeoJSON defaults to CRS84 (lon,lat). Independently check returned polygons so a
// server/filter/axis mistake cannot silently classify an unrelated source point.
function ringRelation(raw: unknown, point: Point): 'inside' | 'outside' | 'boundary' | 'invalid' {
  if (!Array.isArray(raw) || raw.length < 4 || raw.some(p=>!Array.isArray(p) || ![2,3].includes(p.length) || !validCoordinates(p[1],p[0]) || (p.length === 3 && (typeof p[2] !== 'number' || !Number.isFinite(p[2]))))) return 'invalid';
  const ring = raw as Point[];
  if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) return 'invalid';
  let inside = false;
  for (let i=0; i<ring.length-1; i++) {
    const [ax,ay]=ring[i], [bx,by]=ring[i+1], [x,y]=point;
    const cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax);
    if (Math.abs(cross) <= 1e-12 && x >= Math.min(ax,bx)-1e-12 && x <= Math.max(ax,bx)+1e-12 && y >= Math.min(ay,by)-1e-12 && y <= Math.max(ay,by)+1e-12) return 'boundary';
    if ((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
  }
  return inside ? 'inside' : 'outside';
}
function geometryRelation(geometry: any, point: Point): ReturnType<typeof ringRelation> {
  if (!geometry || !['Polygon','MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) return 'invalid';
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!polygons.length) return 'invalid';
  let inside = false, boundary = false;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) return 'invalid';
    const rings = polygon.map((ring: unknown)=>ringRelation(ring,point));
    if (rings.includes('invalid')) return 'invalid';
    if (rings.includes('boundary')) boundary=true;
    if (rings[0] === 'inside' && rings.slice(1).every((r: string)=>r === 'outside')) inside=true;
  }
  return boundary ? 'boundary' : inside ? 'inside' : 'outside';
}
export function parseOfficialGeography(body: unknown, point: SourceLocation, at: string): OfficialGeography {
  const result = empty(point,at,'invalid-response'), data = body as any;
  if (!sourcePoint(point) || !data || data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !Number.isInteger(data.numberReturned) || data.numberReturned !== data.features.length || data.crs || (data.links !== undefined && (!Array.isArray(data.links) || data.links.some((link: any)=>!link || typeof link !== 'object')))) return result;
  if (data.features.length > 1 || (typeof data.numberMatched === 'number' && data.numberMatched > 1) || data.links?.some((link: any)=>link.rel === 'next')) return empty(point,at,'ambiguous');
  if (!data.features.length) return empty(point,at,'no-match');
  const feature = data.features[0], p = feature?.properties;
  if (feature?.type !== 'Feature' || !p || ![cbsYear,String(cbsYear)].includes(p.jaar) || !['NEE','JA'].includes(p.water)) return result;
  const named = {...result,status:'known' as const,buurt:{code:p.bu_code,name:p.bu_naam},wijk:{code:p.wk_code,name:p.wk_naam},municipality:{code:p.gm_code,name:p.gm_naam}};
  if (!validOfficialNames(named)) return result;
  const relation = geometryRelation(feature.geometry,[point.lon,point.lat]);
  if (relation === 'boundary') return empty(point,at,'ambiguous');
  if (relation !== 'inside') return result;
  if (p.water === 'JA') return empty(point,at,'water');
  return {...named,lastAttemptStatus:'ok'};
}

async function readPDOK(url: string): Promise<unknown> {
  const response = await fetch(url,{headers:{Accept:'application/geo+json, application/json','User-Agent':'Huurmonitor-personal/0.1'},redirect:'error',signal:AbortSignal.timeout(15_000)});
  if (!response.ok || !/\b(?:geo\+)?json\b/i.test(response.headers.get('content-type') ?? '')) throw new Error('PDOK response unavailable');
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error('PDOK response too large');
  return JSON.parse(text);
}
function reusable(value: OfficialGeography | null, now: number): value is OfficialGeography {
  if (!value || !['known','no-match','ambiguous','water','invalid-response','error'].includes(value.status)) return false;
  const retrieved = Date.parse(value.retrievedAt), attempted = Date.parse(value.lastAttemptAt);
  if (!Number.isFinite(retrieved) || !Number.isFinite(attempted) || retrieved > now || attempted > now || !['ok','error'].includes(value.lastAttemptStatus)) return false;
  return value.status === 'known' || (value.buurt === null && value.wijk === null && value.municipality === null);
}
function fresh(value: OfficialGeography, now: number) {
  if (value.lastAttemptStatus === 'error') return now-Date.parse(value.lastAttemptAt) < day;
  return now-Date.parse(value.retrievedAt) < (value.status === 'known' ? 30 : 7)*day;
}

interface Options { at?: string; read?: (url: string)=>Promise<unknown>; pause?: (ms: number)=>Promise<void> }
export async function enrichOfficialGeography(listings: Listing[], stored: Listing[], options: Options = {}) {
  const at = options.at ?? new Date().toISOString(), now = Date.parse(at);
  const read = options.read ?? readPDOK, pause = options.pause ?? (ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  const cache = new Map<string,OfficialGeography>(), resolved = new Map<string,OfficialGeography>();
  const stats = {withSourcePoint:0,missingSourcePoint:0,uniquePoints:0,queries:0,cacheHits:0,duplicatePoints:0,refreshFailures:0,deferred:0,known:0,'no-match':0,ambiguous:0,water:0,'invalid-response':0,error:0};
  for (const listing of [...stored,...listings]) {
    const value = currentOfficialGeography(listing), key = geographyKey(listing.location);
    if (!key || !reusable(value,now)) continue;
    const old = cache.get(key);
    if (!old || (value.status === 'known' && old.status !== 'known') || ((value.status === 'known') === (old.status === 'known') && Date.parse(value.lastAttemptAt)>Date.parse(old.lastAttemptAt))) cache.set(key,value);
  }
  const enriched: Listing[] = []; let transportFailed = false;
  for (const listing of listings) {
    const point = sourcePoint(listing.location), key = geographyKey(point);
    if (!point || !key) { stats.missingSourcePoint++; enriched.push({...listing,officialGeography:null}); continue; }
    stats.withSourcePoint++;
    let value = resolved.get(key);
    if (value) stats.duplicatePoints++;
    else {
      stats.uniquePoints++;
      const cached = cache.get(key);
      if (cached && fresh(cached,now)) { stats.cacheHits++; value=cached; }
      else {
        try {
          if (transportFailed) { stats.deferred++; throw new Error('PDOK circuit stopped for this pass'); }
          if (stats.queries) await pause(2000);
          stats.queries++;
          value=parseOfficialGeography(await read(geographyUrl(point)),point,at);
        } catch {
          transportFailed=true;
          value=empty(point,at,'error');
        }
        // A failed refresh must not destroy a validated classification for this
        // exact point/year; retain it, recording a one-day retry cooldown.
        if (value.status === 'error' || value.status === 'invalid-response') {
          stats.refreshFailures++;
          if (cached?.status === 'known') value={...cached,lastAttemptAt:at,lastAttemptStatus:'error'};
        }
      }
      resolved.set(key,value);
    }
    stats[value.status]++;
    enriched.push({...listing,officialGeography:structuredClone(value)});
  }
  return {listings:enriched,stats};
}
