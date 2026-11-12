import * as cheerio from 'cheerio';
import type { SourceLocation } from '../shared/model';
import { validCoordinates } from '../shared/location';

// Lex static script text, never evaluate it. Strings/comments remain single tokens,
// so config-like text inside a title/comment cannot supply a coordinate.
function tokens(text: string) {
  return (text.match(/\/\*[\s\S]*?\*\/|\/\/[^\n\r]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[^\s]/g) ?? [])
    .filter(t => !t.startsWith('//') && !t.startsWith('/*'));
}

/** Direct object properties only; expressions, spreads and duplicate keys are rejected. */
function properties(value: string[]): Map<string, string[]> | null {
  if (value[0] !== '{' || value.at(-1) !== '}') return null;
  const result = new Map<string, string[]>();
  let i = 1;
  while (i < value.length - 1) {
    const rawKey = value[i++];
    const key = /^[A-Za-z_$][\w$]*$/.test(rawKey) ? rawKey : /^['"][A-Za-z_$][\w$]*['"]$/.test(rawKey) ? rawKey.slice(1,-1) : null;
    if (!key || value[i++] !== ':' || result.has(key)) return null;
    const start = i, stack: string[] = [];
    while (i < value.length - 1) {
      const t = value[i];
      if (!stack.length && t === ',') break;
      if (['{','[','('].includes(t)) stack.push(t);
      else if (['}',']',')'].includes(t)) {
        const open = stack.pop();
        if (open !== ({'}':'{',']':'[',')':'('} as Record<string,string>)[t]) return null;
      }
      i++;
    }
    if (stack.length || start === i) return null;
    result.set(key, value.slice(start,i));
    if (value[i] === ',') i++;
  }
  return result;
}

export function parseGrunoLocation(html: string): SourceLocation | null {
  const $ = cheerio.load(html), points: SourceLocation[] = [];
  let assignments = 0;
  for (const script of $('script:not([src])').toArray()) {
    const ts = tokens($(script).text());
    for (let i = 0; i < ts.length; i++) {
      if (ts.slice(i,i+4).join(' ') !== 'window . MAP_POC_CONFIG =') continue;
      assignments++;
      const start = i + 4;
      if (ts[start] !== '{') return null;
      let end = start, depth = 0;
      for (; end < ts.length; end++) {
        if (ts[end] === '{') depth++;
        if (ts[end] === '}' && --depth === 0) break;
      }
      if (end === ts.length || ![';',undefined].includes(ts[end+1])) return null;
      const listing = properties(ts.slice(start,end+1))?.get('listing');
      const fields = listing ? properties(listing) : null;
      const numeric = (key: string) => {
        const value = fields?.get(key);
        return value?.length === 1 && /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value[0]) ? Number(value[0]) : null;
      };
      const lat = numeric('lat'), lon = numeric('lng');
      if (!validCoordinates(lat,lon)) return null;
      points.push({lat,lon:lon as number,provenance:'source',precision:'unknown'});
      i = end;
    }
  }
  // More than one assignment is ambiguous even when their current literals agree.
  return assignments === 1 && points.length === 1 ? points[0] : null;
}
