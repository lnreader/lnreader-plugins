import { useCallback } from 'react';

export const useQueryParams = () => {
  const getParam = useCallback((key: string): string | null => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(key);
  }, []);

  const setParam = useCallback((key: string, value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    window.history.pushState({}, '', url);
  }, []);

  const removeParam = useCallback((key: string) => {
    const url = new URL(window.location.href);
    url.searchParams.delete(key);
    window.history.pushState({}, '', url);
  }, []);

  const getAllParams = useCallback((): Record<string, string> => {
    const urlParams = new URLSearchParams(window.location.search);
    const result: Record<string, string> = {};
    urlParams.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }, []);

  return {
    getParam,
    setParam,
    removeParam,
    getAllParams,
  };
};
