import type { Rent } from './model';
export function coverageSignature(rent: Rent): string | null {
  if (!rent.comparison || !rent.coverage) return null;
  const components = (['gas', 'water', 'electricity', 'internet'] as const).map(key => rent.coverage![key]);
  if (components.some(value => value !== 'included' && value !== 'excluded')) return null;
  return JSON.stringify([rent.comparison, ...components]);
}
