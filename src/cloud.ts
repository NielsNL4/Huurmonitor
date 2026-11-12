import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
function isPublicKey(k: string) {
  if (k.startsWith('sb_publishable_')) return true;
  try { return JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch { return false; }
}
export const configurationError = (url || key) && (!url || !key || !isPublicKey(key)) ? 'Ongeldige cloudconfiguratie. Gebruik alleen een Supabase publishable key (of legacy anon), nooit een service-key.' : '';
export const cloud = url && key && !configurationError ? createClient(url, key) : null;
