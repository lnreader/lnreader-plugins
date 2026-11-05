export type CategoryCode = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type IssueGroup = [CategoryCode, number, ...number[]];
export type IssueIndex = Record<string, IssueGroup[]>;

export const ISSUE_INDEX_URL =
  import.meta.env?.VITE_ISSUE_INDEX_URL ||
  'https://raw.githubusercontent.com/LNReader/lnreader-plugins/issue-index/issue-index.min.json';

export const CATEGORY_LABELS = [
  'Other',
  'Wrong Formatting',
  'Wrong Content',
  'Missing Chapter',
  'Missing Images',
  "Can't Load Novels",
  'Domain Changed',
] as const;

const EMPTY_ISSUE_GROUPS: readonly IssueGroup[] = [];
const INVALID_FORMAT = 'Issue index format is invalid.';

export function parseIssueIndex(value: unknown): IssueIndex {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(INVALID_FORMAT);
  }

  for (const groups of Object.values(value)) {
    if (!Array.isArray(groups)) throw new Error(INVALID_FORMAT);

    let previousCode = Infinity;
    const issueNumbers = new Set<number>();
    for (const group of groups) {
      if (!Array.isArray(group) || group.length < 2) {
        throw new Error(INVALID_FORMAT);
      }

      const [code, ...numbers] = group;
      if (
        !Number.isInteger(code) ||
        code < 0 ||
        code > 6 ||
        code >= previousCode ||
        numbers.length === 0
      ) {
        throw new Error(INVALID_FORMAT);
      }
      previousCode = code;

      let previousNumber = 0;
      for (const number of numbers) {
        if (
          !Number.isSafeInteger(number) ||
          number <= 0 ||
          number <= previousNumber ||
          issueNumbers.has(number)
        ) {
          throw new Error(INVALID_FORMAT);
        }
        previousNumber = number;
        issueNumbers.add(number);
      }
    }
  }

  return value as IssueIndex;
}

export async function fetchIssueIndex(): Promise<IssueIndex> {
  const response = await fetch(ISSUE_INDEX_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Issue index request failed (HTTP ${response.status}).`);
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error(INVALID_FORMAT);
  }
  return parseIssueIndex(value);
}

export function getIssueGroups(
  index: IssueIndex,
  pluginId: string,
): readonly IssueGroup[] {
  return Object.prototype.hasOwnProperty.call(index, pluginId)
    ? index[pluginId]
    : EMPTY_ISSUE_GROUPS;
}
