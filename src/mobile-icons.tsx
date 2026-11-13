export function MobileIcon({ name, size = 18 }: { name: 'new' | 'favourite' | 'dismissed' | 'map' | 'profile' | 'account' | 'back' | 'external' | 'check' | 'search' | 'undo'; size?: number }) {
  const paths = {
    map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
    new: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 12 2-5 4-1-2 5-4 1Z',
    favourite: 'M6 3h12v18l-6-4-6 4V3Z',
    dismissed: 'M4 7h16v14H4V7Zm-1-4h18v4H3V3Zm6 8h6',
    profile: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M8 15v6',
    account: 'M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0ZM4 21v-2a8 8 0 0 1 16 0v2H4Z',
    back: 'm10 5-7 7 7 7M3 12h18',
    external: 'M13 4h7v7m0-7L9 15M8 4H4v16h16v-4',
    check: 'm5 12 4 4L19 6', search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6', undo: 'M4 8h10a6 6 0 0 1 0 12H8M4 8l5-5M4 8l5 5',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
