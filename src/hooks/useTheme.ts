import { useEffect } from 'react';
import { useAppStore, AppStore } from '@/store';

export function useTheme() {
  const theme = useAppStore((state: AppStore) => state.theme);
  const setTheme = useAppStore((state: AppStore) => state.setTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return { theme, setTheme };
}
