'use strict';

const DIRECTIONAL_CONTROLS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

const EXEMPT_ASSOCIATIONS = new Set(['owner', 'member', 'collaborator']);

const TEMPLATE_BOUNDARIES = Object.freeze({
  reportIssue: [
    'Plugin',
    'Severity',
    'Steps To Reproduce',
    'Expected Behavior',
    'Actual Behavior',
    'LNReader Version',
    'Plugin Version',
    'Android Version',
    'Other Details',
    'Acknowledgements',
  ],
  requestPlugin: [
    'Plugin Name',
    'Website URL',
    'Language',
    'Other Details',
    'Acknowledgements',
  ],
  requestFeature: ['Feature Description', 'Other Details', 'Acknowledgements'],
});

const CATEGORY_CODES = new Map([
  ['wrong formatting', 1],
  ['wrong content', 2],
  ['missing chapter', 3],
  ['missing images', 4],
  ["can't load novels", 5],
  ['domain changed', 6],
]);

const VALID_SEVERITIES = new Set([...CATEGORY_CODES.keys(), 'other']);

function stripDirectional(value) {
  return String(value || '').replace(DIRECTIONAL_CONTROLS, '');
}

function comparisonValue(value) {
  return stripDirectional(value).trim().toLocaleLowerCase('en-US');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSelectionMatcher(normalizedKeys) {
  const sorted = [...new Set(normalizedKeys)].sort(
    (a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0),
  );
  if (sorted.length === 0) return null;
  const alternatives = sorted.map(escapeRegExp).join('|');
  return new RegExp(`(?:^|, )(${alternatives})(?=, |$)`, 'g');
}

function extractSection(body, headingName, boundaryHeadings) {
  const lines = String(body || '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const heading = new RegExp(
    `^\\s{0,3}###\\s+${escapeRegExp(headingName)}\\s*#*\\s*$`,
    'i',
  );
  const start = lines.findIndex(line => heading.test(stripDirectional(line)));
  if (start < 0) return { present: false, lines: [] };

  const validBoundaries = Array.isArray(boundaryHeadings)
    ? [...new Set(boundaryHeadings.filter(Boolean))]
    : [];
  const stopHeading =
    validBoundaries.length > 0
      ? new RegExp(
          `^\\s{0,3}###\\s+(?:${validBoundaries.map(escapeRegExp).join('|')})\\s*#*\\s*$`,
          'i',
        )
      : /^\s{0,3}#{1,6}(?:\s|$)/;

  let end = start + 1;
  while (
    end < lines.length &&
    !stopHeading.test(stripDirectional(lines[end]))
  ) {
    end += 1;
  }

  return { present: true, lines: lines.slice(start + 1, end) };
}

function nonEmptySectionLines(section) {
  if (!section || !Array.isArray(section.lines)) return [];
  return section.lines
    .map(line => stripDirectional(line).trim())
    .filter(
      line => line.length > 0 && comparisonValue(line) !== '_no response_',
    );
}

function isValidAuthor(author) {
  return (
    typeof author === 'string' &&
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(author)
  );
}

function isValidRepository(repository) {
  if (typeof repository !== 'string') return false;
  const parts = repository.split('/');
  if (parts.length !== 2) return false;
  const [owner, repo] = parts;
  return (
    isValidAuthor(owner) &&
    /^[a-zA-Z0-9._-]+$/.test(repo) &&
    repo !== '.' &&
    repo !== '..'
  );
}

function normalizeLabelNames(labels) {
  return new Set(
    (Array.isArray(labels) ? labels : [])
      .map(label => (typeof label === 'string' ? label : label && label.name))
      .filter(label => typeof label === 'string')
      .map(comparisonValue)
      .filter(Boolean),
  );
}

function parseJsonOrDefault(rawValue, fallback) {
  if (!rawValue) return fallback;
  try {
    const parsed = JSON.parse(rawValue);
    return parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function isExemptAuthor({ authorAssociation = '', authorType = '' } = {}) {
  return (
    EXEMPT_ASSOCIATIONS.has(comparisonValue(authorAssociation)) ||
    comparisonValue(authorType) === 'bot'
  );
}

function matchPluginEntries(lines, pluginKeys) {
  if (
    !pluginKeys ||
    typeof pluginKeys !== 'object' ||
    !Array.isArray(lines) ||
    lines.length === 0
  ) {
    return [];
  }

  const entriesByKey = new Map();
  for (const [displayKey, id] of Object.entries(pluginKeys)) {
    if (typeof id !== 'string') continue;
    const normalizedKey = comparisonValue(displayKey);
    if (!normalizedKey || !comparisonValue(id)) continue;
    entriesByKey.set(normalizedKey, { displayKey, id });
  }

  const regex = buildSelectionMatcher(entriesByKey.keys());
  if (!regex) return [];
  const selection = comparisonValue(lines.join(', '));

  const matched = [];
  const seenIds = new Set();
  let match;
  while ((match = regex.exec(selection)) !== null) {
    const entry = entriesByKey.get(match[1]);
    if (!entry) continue;
    const normId = comparisonValue(entry.id);
    if (seenIds.has(normId)) continue;
    seenIds.add(normId);
    const sepIdx = entry.displayKey.indexOf(': ');
    const name =
      sepIdx >= 0 ? entry.displayKey.slice(sepIdx + 2) : entry.displayKey;
    matched.push({
      displayKey: entry.displayKey,
      name,
      id: entry.id,
    });
  }
  return matched;
}

module.exports = {
  CATEGORY_CODES,
  VALID_SEVERITIES,
  EXEMPT_ASSOCIATIONS,
  TEMPLATE_BOUNDARIES,
  stripDirectional,
  comparisonValue,
  buildSelectionMatcher,
  extractSection,
  nonEmptySectionLines,
  isValidAuthor,
  isValidRepository,
  normalizeLabelNames,
  parseJsonOrDefault,
  isExemptAuthor,
  matchPluginEntries,
};
