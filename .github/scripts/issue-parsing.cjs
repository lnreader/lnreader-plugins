'use strict';

const DIRECTIONAL_CONTROLS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

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

function extractSection(body, headingName) {
  const lines = String(body || '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const heading = new RegExp(
    `^\\s{0,3}###\\s+${escapeRegExp(headingName)}\\s*#*\\s*$`,
    'i',
  );
  const start = lines.findIndex(line => heading.test(stripDirectional(line)));
  if (start < 0) return { present: false, lines: [] };

  let end = start + 1;
  while (
    end < lines.length &&
    !/^\s{0,3}#{1,6}(?:\s|$)/.test(stripDirectional(lines[end]))
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

module.exports = {
  DIRECTIONAL_CONTROLS,
  CATEGORY_CODES,
  VALID_SEVERITIES,
  stripDirectional,
  comparisonValue,
  escapeRegExp,
  extractSection,
  nonEmptySectionLines,
};
