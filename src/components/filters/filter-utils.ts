const HORIZONTAL_MARGIN = 16;
const VERTICAL_MARGIN = 8;
const ANCHOR_GAP = 4;

// Rows are single-line, so their height only varies with font scaling. The
// estimate decides whether to flip above the field and how far the list can
// grow; the inner scroll area absorbs any error.
export const SUGGESTION_ITEM_HEIGHT = 40;
export const MAX_SUGGESTIONS_HEIGHT = 240;

export const getEstimatedSuggestionsHeight = (count: number) =>
  Math.min(count * SUGGESTION_ITEM_HEIGHT + 2, MAX_SUGGESTIONS_HEIGHT);

export const addMultiTextValues = (
  current: readonly string[],
  rawValues: readonly string[],
): string[] => {
  const next = [...current];
  rawValues.forEach(rawValue => {
    const value = rawValue.trim();
    if (value && !next.includes(value)) {
      next.push(value);
    }
  });
  return next;
};

export type SuggestionAnchor = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type SuggestionPlacement = {
  left: number;
  maxHeight: number;
  top: number;
  width: number;
};

type SuggestionPlacementInput = {
  anchor: SuggestionAnchor;
  contentHeight: number;
  viewport: { height: number; width: number };
};

// The list is portaled to the window, so it is positioned in viewport
// coordinates: keep it on screen and flip it above the field when the space
// below cannot hold it.
export const getSuggestionsPlacement = ({
  anchor,
  contentHeight,
  viewport,
}: SuggestionPlacementInput): SuggestionPlacement => {
  const minLeft = HORIZONTAL_MARGIN;
  const maxRight = viewport.width - HORIZONTAL_MARGIN;
  const minTop = VERTICAL_MARGIN;
  const maxBottom = viewport.height - VERTICAL_MARGIN;

  // A field wider than the usable area is clamped.
  const width = Math.max(0, Math.min(anchor.width, maxRight - minLeft));
  const left = Math.max(minLeft, Math.min(anchor.left, maxRight - width));

  const belowTop = anchor.top + anchor.height + ANCHOR_GAP;
  const spaceBelow = Math.max(0, maxBottom - belowTop);
  const aboveBottom = Math.min(anchor.top - ANCHOR_GAP, maxBottom);
  const spaceAbove = Math.max(0, aboveBottom - minTop);

  const desiredHeight = Math.min(contentHeight, MAX_SUGGESTIONS_HEIGHT);
  const opensAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
  const maxHeight = Math.min(
    desiredHeight,
    opensAbove ? spaceAbove : spaceBelow,
  );
  const top = opensAbove ? aboveBottom - maxHeight : belowTop;

  return { left, maxHeight, top, width };
};
