export class ReadFailure extends Error {
  constructor(public kind: 'blocked' | 'http' | 'network' | 'format' | 'robots', public status?: number) { super(status ? `HTTP ${status}` : kind); }
}
export const crawler = 'Huurmonitor-personal';
interface Rule { allow: boolean; path: string }
export function robotsPolicy(text: string) {
  const groups: { agents: string[]; rules: Rule[]; delay: number }[] = []; let current = { agents: [] as string[], rules: [] as Rule[], delay: 0 }, directives = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim(), i = line.indexOf(':'); if (i < 0) continue;
    const name = line.slice(0,i).trim().toLowerCase(), value = line.slice(i+1).trim();
    if (name === 'user-agent') {
      if (directives) { groups.push(current); current = { agents: [], rules: [], delay: 0 }; directives = false; }
      current.agents.push(value.toLowerCase());
    } else if (current.agents.length) {
      directives = true;
      if ((name === 'allow' || name === 'disallow') && value) current.rules.push({ allow: name === 'allow', path: value });
      if (name === 'crawl-delay' && /^\d+(\.\d+)?$/.test(value)) current.delay = Number(value) * 1000;
    }
  }
  groups.push(current);
  const specificity = (agents: string[]) => Math.max(-1,...agents.map(a => a === '*' ? 0 : crawler.toLowerCase().includes(a) ? a.length : -1));
  const best = Math.max(-1,...groups.map(g=>specificity(g.agents))), relevant = groups.filter(g=>specificity(g.agents)===best && best>=0);
  return { delay: Math.max(2000,...relevant.map(g=>g.delay)), allowed(url: string) {
    const u = new URL(url), path = u.pathname + u.search;
    const matches = relevant.flatMap(g=>g.rules).filter(rule => {
      const pattern = rule.path.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\\\$$/,'$');
      return new RegExp('^'+pattern).test(path);
    }).sort((a,b)=>b.path.replace(/\*/g,'').length-a.path.replace(/\*/g,'').length || Number(b.allow)-Number(a.allow));
    return matches[0]?.allow ?? true;
  }};
}
export type Reader = (url: string) => Promise<string>;
export function publicReader(): Reader {
  let last = 0;
  return async url => {
    const delay = Math.max(0, 2000-(Date.now()-last)); if (delay) await new Promise(resolve=>setTimeout(resolve,delay)); last=Date.now();
    let response: Response;
    try { response=await fetch(url,{headers:{'User-Agent':`${crawler}/0.1 (personal rental monitor)`,Accept:'text/html,text/plain'},signal:AbortSignal.timeout(25000),redirect:'manual'}); }
    catch { throw new ReadFailure('network'); }
    if ([401,403,429].includes(response.status)) throw new ReadFailure('blocked',response.status);
    if (!response.ok) throw new ReadFailure('http',response.status); // Redirects are not followed into other routes/origins.
    if (!/text\/(html|plain)/i.test(response.headers.get('content-type') || '')) throw new ReadFailure('format');
    const text = await response.text(); if (text.length>2_000_000) throw new ReadFailure('format'); return text;
  };
}
