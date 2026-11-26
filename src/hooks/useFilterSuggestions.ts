import { useCallback, useEffect, useRef, useState } from 'react';

import type { FilterOption } from '@libs/filterInputs';

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_BACKOFF_MS = 8000;
const MAX_CACHED_QUERIES = 200;
const SUGGESTION_LIMIT = 6;

// Session cache of suggestions so re-typed queries don't refetch.
const suggestionsCache = new Map<string, FilterOption[]>();

const cacheKey = (pluginId: string, filterKey: string, query: string) =>
  `${pluginId}\u0000${filterKey}\u0000${query}`;

const setCached = (key: string, value: FilterOption[]) => {
  // Re-insert so a re-set key moves to the end of the eviction order.
  suggestionsCache.delete(key);
  suggestionsCache.set(key, value);
  if (suggestionsCache.size > MAX_CACHED_QUERIES) {
    const oldest = suggestionsCache.keys().next().value;
    if (oldest !== undefined) {
      suggestionsCache.delete(oldest);
    }
  }
};

const clearFilterSuggestionsCache = () => suggestionsCache.clear();

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

export type FilterSuggestionsResult = {
  suggestions: FilterOption[];
  isVisible: boolean;
  isLoading: boolean;
  dismiss: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onEdit: () => void;
  select: (option: FilterOption) => void;
};

type ResolvedSuggestions = {
  key: string;
  suggestions: FilterOption[];
};

export type FilterSuggestionSource = (
  filterKey: string,
  query: string,
) => Promise<FilterOption[]>;

type UseFilterSuggestionsOptions = {
  pluginId: string;
  filterKey: string;
  query: string;
  fetchSuggestions: FilterSuggestionSource;
  onSelect: (option: FilterOption) => void;
};

// Superseded responses are dropped; repeated failures back off, then degrade to
// plain free text.
export const useFilterSuggestions = ({
  pluginId,
  filterKey,
  query,
  fetchSuggestions,
  onSelect,
}: UseFilterSuggestionsOptions): FilterSuggestionsResult => {
  const [resolved, setResolved] = useState<ResolvedSuggestions>({
    key: '',
    suggestions: [],
  });
  const [isFocused, setIsFocused] = useState(false);
  // A pick or an outside dismissal closes the list without blurring the input,
  // so only an edit reopens it.
  const [isSuppressed, setIsSuppressed] = useState(false);
  const dismiss = useCallback(() => setIsSuppressed(true), []);

  // Guards against stale responses touching state.
  const requestIdRef = useRef(0);
  // Consecutive failures; drives the backoff delay.
  const failuresRef = useRef(0);
  // Keeps the fetch reference out of the effect deps so an inline callback
  // from the caller does not restart the debounce on every render.
  const fetchRef = useRef(fetchSuggestions);
  fetchRef.current = fetchSuggestions;

  const trimmedQuery = query.trim();
  const isActive = trimmedQuery.length >= MIN_QUERY_LENGTH;
  const key = cacheKey(pluginId, filterKey, trimmedQuery);

  // Backoff is per target; a different plugin/filter starts fresh.
  useEffect(() => {
    failuresRef.current = 0;
  }, [pluginId, filterKey]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      return;
    }
    // The cache is read during render, so a hit means nothing to fetch.
    if (suggestionsCache.has(key)) {
      return;
    }

    const delay = Math.min(
      DEBOUNCE_MS * 2 ** failuresRef.current,
      MAX_BACKOFF_MS,
    );

    const timer = setTimeout(() => {
      void (async () => {
        if (requestId !== requestIdRef.current) {
          return;
        }
        try {
          const result = await withTimeout(
            fetchRef.current(filterKey, trimmedQuery),
            REQUEST_TIMEOUT_MS,
          );
          if (requestId !== requestIdRef.current) {
            return;
          }
          failuresRef.current = 0;
          const limited = result.slice(0, SUGGESTION_LIMIT);
          setCached(key, limited);
          setResolved({ key, suggestions: limited });
        } catch {
          if (requestId !== requestIdRef.current) {
            return;
          }
          failuresRef.current += 1;
          setResolved({ key, suggestions: [] });
        }
      })();
    }, delay);

    return () => clearTimeout(timer);
  }, [filterKey, key, trimmedQuery]);

  const cached = isActive ? suggestionsCache.get(key) : undefined;
  const isCurrent = resolved.key === key;
  const suggestions = isActive
    ? isCurrent
      ? resolved.suggestions
      : cached ?? []
    : [];

  return {
    suggestions,
    isVisible: isFocused && !isSuppressed && suggestions.length > 0,
    isLoading: isActive && !isCurrent && !cached,
    dismiss,
    onFocus: () => {
      setIsFocused(true);
      setIsSuppressed(false);
    },
    onBlur: () => setIsFocused(false),
    onEdit: () => setIsSuppressed(false),
    select: option => {
      onSelect(option);
      setIsSuppressed(true);
    },
  };
};

export { clearFilterSuggestionsCache };

export default useFilterSuggestions;
