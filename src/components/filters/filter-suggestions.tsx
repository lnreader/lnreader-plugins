import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import type { FilterOption } from '@libs/filterInputs';
import { cn } from '@/lib/utils';
import {
  getEstimatedSuggestionsHeight,
  getSuggestionsPlacement,
  type SuggestionPlacement,
} from './filter-utils';

type FilterSuggestionsProps = {
  anchorRef: React.RefObject<HTMLElement>;
  onDismiss: () => void;
  onSelect: (option: FilterOption) => void;
  suggestions: FilterOption[];
  visible: boolean;
};

/**
 * Anchors a suggestion list to a text field and renders it in a portal, so the
 * list is not clipped by the scroll container that holds the filters.
 */
export function FilterSuggestions({
  anchorRef,
  onDismiss,
  onSelect,
  suggestions,
  visible,
}: FilterSuggestionsProps) {
  const [placement, setPlacement] = useState<SuggestionPlacement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    setPlacement(
      getSuggestionsPlacement({
        anchor: {
          height: rect.height,
          left: rect.left,
          top: rect.top,
          width: rect.width,
        },
        contentHeight: getEstimatedSuggestionsHeight(suggestions.length),
        viewport: { height: window.innerHeight, width: window.innerWidth },
      }),
    );
  }, [anchorRef, suggestions.length]);

  useLayoutEffect(() => {
    if (visible) {
      measure();
    }
  }, [measure, visible]);

  // The sheet can scroll or resize while the list is open; close it on scroll
  // and reposition it on resize so it stays attached to its field.
  useEffect(() => {
    if (!visible) return;

    const handleScroll = (event: Event) => {
      if (listRef.current?.contains(event.target as Node)) {
        return;
      }
      onDismiss();
    };

    window.addEventListener('resize', measure);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('resize', measure);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [measure, onDismiss, visible]);

  if (!visible || !placement) return null;

  // Stay inside the sheet's dialog subtree so the modal focus trap and outside
  // dismissal treat the list as part of the sheet, not as an outside click.
  const container =
    anchorRef.current?.closest<HTMLElement>('[role="dialog"]') ?? document.body;

  return createPortal(
    <div
      ref={listRef}
      role="listbox"
      // Keep the input focused so choosing an option does not hide the list
      // through the blur handler before the click lands.
      onMouseDown={event => event.preventDefault()}
      className={cn(
        'fixed z-[60] overflow-y-auto rounded-md border border-border',
        'bg-popover p-1 text-popover-foreground shadow-lg',
      )}
      style={{
        left: placement.left,
        maxHeight: placement.maxHeight,
        top: placement.top,
        width: placement.width,
      }}
    >
      {suggestions.map(option => (
        <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onSelect(option)}
          className={cn(
            'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm',
            'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
          )}
        >
          <span className="truncate">{option.label}</span>
        </button>
      ))}
    </div>,
    container,
  );
}
