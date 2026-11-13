import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createThemeStore, themeAction, themeKey } from '../src/theme';
function setup(saved: unknown = null, dark = false, blocked = false) {
  const state = { saved, dark, applied: '' };
  const store = createThemeStore({ read: () => { if(blocked)throw Error(); return state.saved; }, write: value => { if(blocked)throw Error(); state.saved=value; }, dark: () => state.dark, apply: value => { state.applied=value; } });
  return { state, store };
}
test('initially follows device; malformed storage is not an explicit choice', () => {
  for(const saved of [null, undefined, '', 'system', 'LIGHT', '{}']) {
    assert.equal(setup(saved).store.getSnapshot(),'light');
    assert.equal(setup(saved,true).store.getSnapshot(),'dark');
  }
});
test('device changes are live until an explicit choice; choice survives reload', () => {
  const {state,store}=setup();let notices=0;const off=store.subscribe(()=>notices++);
  state.dark=true;store.deviceChanged();assert.equal(store.getSnapshot(),'dark');
  store.toggle();assert.equal(state.saved,'light');state.dark=false;store.deviceChanged();state.dark=true;store.deviceChanged();
  assert.equal(store.getSnapshot(),'light');assert.equal(notices,2);off();
  assert.equal(setup(state.saved,true).store.getSnapshot(),'light');
});
test('storage exceptions preserve explicit in-memory choice', () => {
  const {state,store}=setup(null,false,true);store.toggle();state.dark=false;store.deviceChanged();assert.equal(store.getSnapshot(),'dark');assert.equal(state.applied,'dark');
});
test('cross-tab choice and removal update theme without account state', () => {
  const {state,store}=setup();store.storageChanged('dark');assert.equal(store.getSnapshot(),'dark');
  store.storageChanged(null);assert.equal(store.getSnapshot(),'light');state.dark=true;store.deviceChanged();assert.equal(store.getSnapshot(),'dark');
});
test('bootstrap sets actual theme, native scheme and every meta before React', () => {
  const source=readFileSync(new URL('../public/theme-bootstrap.js',import.meta.url),'utf8');
  for(const saved of [null,'light','dark','invalid']) for(const dark of [false,true]) for(const blocked of [false,true]) {
    const root={dataset:{theme:''},style:{colorScheme:''}},metas=[{content:''},{content:''}];
    runInNewContext(source,{localStorage:{getItem:(key:string)=>{assert.equal(key,themeKey);if(blocked)throw Error();return saved;}},matchMedia:()=>({matches:dark}),document:{documentElement:root,querySelectorAll:()=>metas}});
    const expected=!blocked&&(saved==='light'||saved==='dark')?saved:dark?'dark':'light';
    assert.equal(root.dataset.theme,expected);assert.equal(root.style.colorScheme,expected);assert.ok(metas.every(meta=>meta.content===(expected==='light'?'#f5f3ed':'#141412')));
  }
});
test('shared theme control is Dutch, decorative-icon-only and auth-independent', () => {
  assert.equal(themeAction('dark'),'Lichte modus inschakelen');assert.equal(themeAction('light'),'Donkere modus inschakelen');
  const source=readFileSync(new URL('../src/useTheme.tsx',import.meta.url),'utf8');
  assert.match(source,/type="button"/);assert.match(source,/aria-hidden="true"/);assert.match(source,/aria-label=\{themeAction\(theme\)\}/);assert.doesNotMatch(source,/cloud|supabase|signOut|session|password/i);
});
