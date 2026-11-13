export type Theme = 'light' | 'dark';
export const themeKey = 'huurmonitor-theme-v1';
export const validTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark';
export const themeAction = (theme: Theme) => theme === 'dark' ? 'Lichte modus inschakelen' : 'Donkere modus inschakelen';
export function createThemeStore(env: {
  read: () => unknown; write: (value: Theme) => void; dark: () => boolean; apply: (value: Theme) => void;
}, initial?: Theme) {
  let preference: Theme | null = null;
  try { const saved = env.read(); if (validTheme(saved)) preference = saved; } catch { /* Device preference remains usable. */ }
  let theme = preference ?? initial ?? (env.dark() ? 'dark' : 'light');
  const listeners = new Set<() => void>();
  const update = () => {
    theme = preference ?? (env.dark() ? 'dark' : 'light');
    env.apply(theme); listeners.forEach(listener => listener());
  };
  return {
    getSnapshot: () => theme,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    deviceChanged: () => { if (!preference) update(); },
    storageChanged: (value: unknown) => { preference = validTheme(value) ? value : null; update(); },
    toggle: () => {
      preference = theme === 'dark' ? 'light' : 'dark';
      try { env.write(preference); } catch { /* Keep explicit choice in memory. */ }
      update();
    },
  };
}
