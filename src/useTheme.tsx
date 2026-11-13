import { useSyncExternalStore } from 'react';
import { createThemeStore, themeAction, themeKey, validTheme } from './theme';
const media = matchMedia('(prefers-color-scheme: dark)');
const initial = document.documentElement.dataset.theme;
const store = createThemeStore({
  read: () => localStorage.getItem(themeKey), write: theme => localStorage.setItem(themeKey, theme), dark: () => media.matches,
  apply: theme => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => { meta.content = theme === 'light' ? '#f5f3ed' : '#141412'; });
  },
}, validTheme(initial) ? initial : undefined);
media.addEventListener('change', store.deviceChanged);
window.addEventListener('storage', event => { if (event.key === themeKey || event.key === null) store.storageChanged(event.newValue); });
export const useTheme = () => useSyncExternalStore(store.subscribe, store.getSnapshot);
export function ThemeButton() {
  const theme = useTheme();
  return <button type="button" className="theme-button" aria-label={themeAction(theme)} title={themeAction(theme)} onClick={store.toggle}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{theme === 'dark' ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></> : <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/>}</svg>
  </button>;
}
