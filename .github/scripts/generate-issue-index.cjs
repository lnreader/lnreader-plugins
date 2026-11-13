'use strict';

const fs = require('node:fs');

const CATEGORY_CODES = new Map([
  ['wrong formatting', 1],
  ['wrong content', 2],
  ['missing chapter', 3],
  ['missing images', 4],
  ["can't load novels", 5],
  ['domain changed', 6],
]);
const DIRECTIONAL_CONTROLS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

function comparisonValue(value) {
  return value
    .replace(DIRECTIONAL_CONTROLS, '')
    .trim()
    .toLocaleLowerCase('en-US');
}

function extractSection(body, name) {
  const lines = (body || '').replace(/\r\n?/g, '\n').split('\n');
  const heading = new RegExp(`^\\s{0,3}###\\s+${name}\\s*#*\\s*$`, 'i');
  const start = lines.findIndex(line =>
    heading.test(line.replace(DIRECTIONAL_CONTROLS, '')),
  );
  if (start < 0) return { present: false, lines: [] };
  let end = start + 1;
  while (
    end < lines.length &&
    !/^\s{0,3}#{1,6}(?:\s|$)/.test(lines[end].replace(DIRECTIONAL_CONTROLS, ''))
  )
    end += 1;
  return { present: true, lines: lines.slice(start + 1, end) };
}

function createLookups(pluginKeys) {
  const prototype =
    pluginKeys && typeof pluginKeys === 'object'
      ? Object.getPrototypeOf(pluginKeys)
      : undefined;
  if (
    !pluginKeys ||
    typeof pluginKeys !== 'object' ||
    Array.isArray(pluginKeys) ||
    (prototype !== Object.prototype && prototype !== null)
  ) {
    throw new TypeError(
      'Plugin dictionary must be an object mapping display keys to ids.',
    );
  }
  const idsByCandidate = new Map();
  const canonicalIds = new Map();
  for (const [displayKey, id] of Object.entries(pluginKeys)) {
    if (
      typeof id !== 'string' ||
      !comparisonValue(displayKey) ||
      !comparisonValue(id)
    ) {
      throw new TypeError(
        'Plugin dictionary entries must have nonempty string keys and ids.',
      );
    }
    const canonicalId = id;
    const normalizedId = comparisonValue(id);
    if (!canonicalIds.has(normalizedId))
      canonicalIds.set(normalizedId, new Set());
    canonicalIds.get(normalizedId).add(canonicalId);
    const candidates = [displayKey, id];
    const prefix = displayKey.indexOf(': ');
    if (prefix >= 0) candidates.push(displayKey.slice(prefix + 2));
    for (const candidate of candidates) {
      const normalized = comparisonValue(candidate);
      if (!normalized) continue;
      if (!idsByCandidate.has(normalized))
        idsByCandidate.set(normalized, new Set());
      idsByCandidate.get(normalized).add(canonicalId);
    }
  }
  const candidates = [...idsByCandidate.entries()]
    .map(([value, ids]) => ({ value, ids }))
    .sort(
      (a, b) =>
        b.value.length - a.value.length ||
        (a.value < b.value ? -1 : a.value > b.value ? 1 : 0),
    );
  return { idsByCandidate, canonicalIds, candidates };
}

function resolveSelection(lines, lookups, issueNumber, warn) {
  const selection = lines
    .map(line => line.trim())
    .filter(Boolean)
    .join(', ');
  const normalized = comparisonValue(selection);
  const alternatives = lookups.candidates
    .map(candidate => candidate.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!alternatives) return { ids: new Set(), unresolved: selection };
  const regex = new RegExp(`(?:^|, )(${alternatives})(?=, |$)`, 'g');
  const ids = new Set();
  const spans = [];
  let match;
  while ((match = regex.exec(normalized)) !== null) {
    const start = match.index + (match[0].startsWith(', ') ? 2 : 0);
    const found = lookups.idsByCandidate.get(match[1]);
    if (found && found.size === 1) {
      ids.add(found.values().next().value);
      spans.push([start, start + match[1].length]);
    }
  }
  let unresolved = '';
  let cursor = 0;
  for (const [start, end] of spans) {
    unresolved += normalized.slice(cursor, start);
    cursor = end;
  }
  unresolved += normalized.slice(cursor);
  unresolved = unresolved
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .join(', ');
  if (unresolved)
    warn(`Issue #${issueNumber}: unresolved plugin selection: ${unresolved}`);
  return { ids, unresolved };
}

function validateIssue(issue) {
  if (
    !issue ||
    typeof issue !== 'object' ||
    Array.isArray(issue) ||
    !Number.isInteger(issue.number) ||
    issue.number <= 0
  ) {
    throw new TypeError('Every issue must have a positive integer number.');
  }
  if (issue.state !== 'open' && issue.state !== 'closed')
    throw new TypeError('Every issue must have state "open" or "closed".');
}

function buildIssueIndex(issues, pluginKeys, warn = console.warn) {
  const lookups = createLookups(pluginKeys);
  if (!Array.isArray(issues)) throw new TypeError('Issues must be an array.');
  const index = new Map();
  for (const issue of issues) {
    validateIssue(issue);
    if (issue.state !== 'open' || Object.hasOwn(issue, 'pull_request'))
      continue;
    const labels = Array.isArray(issue.labels)
      ? issue.labels
          .map(label =>
            typeof label === 'string' ? label : label && label.name,
          )
          .filter(Boolean)
      : [];
    const pluginSection = extractSection(issue.body, 'Plugin');
    const sourceSection = extractSection(issue.body, 'Source information');
    let pluginIds = new Set();
    let pluginBearing = false;
    if (pluginSection.present) {
      const resolved = resolveSelection(
        pluginSection.lines,
        lookups,
        issue.number,
        warn,
      );
      pluginIds = resolved.ids;
      pluginBearing =
        pluginSection.lines.some(line => line.trim()) ||
        Boolean(resolved.unresolved);
    } else {
      if (sourceSection.present) {
        const resolved = resolveSelection(
          sourceSection.lines,
          lookups,
          issue.number,
          warn,
        );
        pluginIds = resolved.ids;
        pluginBearing =
          sourceSection.lines.some(line => line.trim()) ||
          Boolean(resolved.unresolved);
      }
      if (pluginIds.size === 0) {
        for (const label of labels) {
          const match = /^plugin: .*\[([^\]]+)\]$/i.exec(label.trim());
          if (!match) continue;
          pluginBearing = true;
          const ids = lookups.canonicalIds.get(comparisonValue(match[1]));
          if (ids && ids.size === 1) pluginIds.add(ids.values().next().value);
          else
            warn(`Issue #${issue.number}: unresolved plugin label: ${label}`);
        }
      }
    }
    if (pluginBearing && pluginIds.size === 0) {
      warn(`Issue #${issue.number}: plugin association could not be resolved.`);
    }
    if (pluginIds.size === 0) continue;

    const severitySection = extractSection(issue.body, 'Severity');
    let categoryCode = 0;
    if (severitySection.present) {
      const severity = severitySection.lines
        .map(line => line.trim())
        .find(Boolean);
      categoryCode = severity
        ? CATEGORY_CODES.get(comparisonValue(severity)) || 0
        : 0;
    } else {
      const severityLabels = labels.filter(label =>
        /^severity:\s*/i.test(label.trim()),
      );
      const values = severityLabels.map(label =>
        comparisonValue(label.trim().replace(/^severity:\s*/i, '')),
      );
      const codes = values.map(value => CATEGORY_CODES.get(value));
      if (values.length === 1 && codes[0] !== undefined)
        categoryCode = codes[0];
    }
    for (const id of pluginIds) {
      if (!index.has(id)) index.set(id, new Map());
      const issueNumbers = index.get(id);
      const previousCode = issueNumbers.get(issue.number);
      if (previousCode === undefined) {
        issueNumbers.set(issue.number, categoryCode);
      } else if (previousCode !== categoryCode) {
        warn(
          `Issue #${issue.number}: conflicting category codes for plugin ${id}; using Other (0).`,
        );
        issueNumbers.set(issue.number, 0);
      }
    }
  }
  return formatIssueIndex(index);
}

function formatIssueIndex(index) {
  const result = {};
  const pluginIds = [...index.keys()].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  for (const id of pluginIds) {
    const groups = new Map();
    for (const [number, code] of index.get(id)) {
      if (!groups.has(code)) groups.set(code, []);
      groups.get(code).push(number);
    }
    const value = [...groups.entries()]
      .sort(([a], [b]) => b - a)
      .map(([code, numbers]) => [code, ...numbers.sort((a, b) => a - b)]);
    if (value.length === 0) continue;
    Object.defineProperty(result, id, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function updateIssueIndex(
  index,
  issueNumber,
  issue,
  pluginKeys,
  warn = console.warn,
) {
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0)
    throw new TypeError('Issue number must be a positive safe integer.');
  if (index === null || typeof index !== 'object' || Array.isArray(index))
    throw new Error('Issue index format is invalid.');
  for (const groups of Object.values(index)) {
    if (!Array.isArray(groups))
      throw new Error('Issue index format is invalid.');
    let previousCode = Infinity;
    const seen = new Set();
    for (const group of groups) {
      if (!Array.isArray(group) || group.length < 2)
        throw new Error('Issue index format is invalid.');
      const [code, ...numbers] = group;
      if (
        !Number.isInteger(code) ||
        code < 0 ||
        code > 6 ||
        code >= previousCode
      )
        throw new Error('Issue index format is invalid.');
      previousCode = code;
      let previousNumber = 0;
      for (const number of numbers) {
        if (
          !Number.isSafeInteger(number) ||
          number <= 0 ||
          number <= previousNumber ||
          seen.has(number)
        )
          throw new Error('Issue index format is invalid.');
        previousNumber = number;
        seen.add(number);
      }
    }
  }
  if (issue !== null) {
    validateIssue(issue);
    if (issue.number !== issueNumber)
      throw new Error(
        'Fetched issue number does not match the requested issue.',
      );
  }
  const remaining = new Map();
  for (const [id, groups] of Object.entries(index)) {
    const issues = new Map();
    for (const [code, ...numbers] of groups) {
      for (const number of numbers) {
        if (number !== issueNumber) issues.set(number, code);
      }
    }
    if (issues.size) remaining.set(id, issues);
  }
  const replacement = buildIssueIndex(
    issue === null ? [] : [issue],
    pluginKeys,
    warn,
  );
  for (const [id, groups] of Object.entries(replacement)) {
    if (!remaining.has(id)) remaining.set(id, new Map());
    for (const [code, ...numbers] of groups) {
      for (const number of numbers) remaining.get(id).set(number, code);
    }
  }
  return formatIssueIndex(remaining);
}

function flattenIssuePages(value) {
  if (!Array.isArray(value))
    throw new TypeError('Issue JSON must be an array or an array of pages.');
  if (value.every(Array.isArray)) return value.flat();
  if (value.some(Array.isArray))
    throw new TypeError('Issue JSON cannot mix issue objects and pages.');
  return value;
}

function runCli(args) {
  const usage =
    'Usage: node .github/scripts/generate-issue-index.cjs full <issues-json-path> <output-path> | update <index-json-path> <issue-number> <issue-json-path> <output-path>';
  const [mode, ...modeArgs] = args;
  if (
    (mode === 'full' && modeArgs.length !== 2) ||
    (mode === 'update' && modeArgs.length !== 4) ||
    (mode !== 'full' && mode !== 'update')
  )
    throw new Error(usage);
  const pluginKeys = JSON.parse(
    fs.readFileSync('.github/scripts/keys.json', 'utf8'),
  );
  let index;
  let outputPath;
  if (mode === 'full') {
    const [issuesPath, targetPath] = modeArgs;
    const issues = flattenIssuePages(
      JSON.parse(fs.readFileSync(issuesPath, 'utf8')),
    );
    for (const issue of issues) validateIssue(issue);
    index = buildIssueIndex(issues, pluginKeys, message =>
      process.stderr.write(`${message}\n`),
    );
    outputPath = targetPath;
  } else {
    const [indexPath, numberText, issuePath, targetPath] = modeArgs;
    if (!/^[1-9][0-9]*$/.test(numberText))
      throw new TypeError('Issue number must be a positive safe integer.');
    const issueNumber = Number(numberText);
    if (!Number.isSafeInteger(issueNumber))
      throw new TypeError('Issue number must be a positive safe integer.');
    const previous = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const issue = JSON.parse(fs.readFileSync(issuePath, 'utf8'));
    if (issue !== null && (Array.isArray(issue) || typeof issue !== 'object'))
      throw new TypeError('Fetched issue must be an object or null.');
    index = updateIssueIndex(
      previous,
      issueNumber,
      issue,
      pluginKeys,
      message => process.stderr.write(`${message}\n`),
    );
    outputPath = targetPath;
  }
  const serialized = JSON.stringify(index);
  fs.writeFileSync(outputPath, serialized);
}

if (require.main === module) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { buildIssueIndex, updateIssueIndex };
