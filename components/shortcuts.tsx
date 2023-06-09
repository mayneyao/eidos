'use client'

import { useKeyPress } from 'ahooks';
import { useTheme } from 'next-themes';

export function ShortCuts() {
  const { setTheme, theme } = useTheme();

  useKeyPress('shift.ctrl.l', (e) => {
    e.preventDefault();
    setTheme(theme === 'dark' ? 'light' : 'dark');
  });

  return <div>

  </div>
}