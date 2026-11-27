'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  VALID_SEVERITIES,
  comparisonValue,
  escapeRegExp,
  extractSection,
  nonEmptySectionLines,
} = require('./issue-parsing.cjs');

const LANGUAGE_ALIASES = new Map([
  // Arabic
  ['arabic', 'arabic'],
  ['ar', 'arabic'],
  ['العربية', 'arabic'],
  ['عربي', 'arabic'],
  // Bengali
  ['bengali', 'bengali'],
  ['bangla', 'bengali'],
  ['bn', 'bengali'],
  ['বাংলা', 'bengali'],
  // Chinese
  ['chinese', 'chinese'],
  ['zh', 'chinese'],
  ['zh-cn', 'chinese'],
  ['zh-tw', 'chinese'],
  ['cn', 'chinese'],
  ['中文', 'chinese'],
  ['汉语', 'chinese'],
  ['漢語', 'chinese'],
  ['简体中文', 'chinese'],
  ['繁體中文', 'chinese'],
  // French
  ['french', 'french'],
  ['fr', 'french'],
  ['français', 'french'],
  ['francais', 'french'],
  // German
  ['german', 'german'],
  ['de', 'german'],
  ['deutsch', 'german'],
  // Indonesian
  ['indonesian', 'indonesian'],
  ['id', 'indonesian'],
  ['bahasa indonesia', 'indonesian'],
  ['indo', 'indonesian'],
  // Italian
  ['italian', 'italian'],
  ['it', 'italian'],
  ['italiano', 'italian'],
  // Japanese
  ['japanese', 'japanese'],
  ['ja', 'japanese'],
  ['jp', 'japanese'],
  ['日本語', 'japanese'],
  // Korean
  ['korean', 'korean'],
  ['ko', 'korean'],
  ['kr', 'korean'],
  ['한국어', 'korean'],
  ['조선말', 'korean'],
  // Polish
  ['polish', 'polish'],
  ['pl', 'polish'],
  ['polski', 'polish'],
  // Portuguese
  ['portuguese', 'portuguese'],
  ['pt', 'portuguese'],
  ['pt-br', 'portuguese'],
  ['português', 'portuguese'],
  ['portugues', 'portuguese'],
  // Russian
  ['russian', 'russian'],
  ['ru', 'russian'],
  ['русский', 'russian'],
  // Spanish
  ['spanish', 'spanish'],
  ['es', 'spanish'],
  ['español', 'spanish'],
  ['espanol', 'spanish'],
  // Thai
  ['thai', 'thai'],
  ['th', 'thai'],
  ['ไทย', 'thai'],
  ['ภาษาไทย', 'thai'],
  // Turkish
  ['turkish', 'turkish'],
  ['tr', 'turkish'],
  ['türkçe', 'turkish'],
  ['turkce', 'turkish'],
  // Ukrainian
  ['ukrainian', 'ukrainian'],
  ['uk', 'ukrainian'],
  ['ua', 'ukrainian'],
  ['українська', 'ukrainian'],
  // Vietnamese
  ['vietnamese', 'vietnamese'],
  ['vi', 'vietnamese'],
  ['vn', 'vietnamese'],
  ['tiếng việt', 'vietnamese'],
  ['tieng viet', 'vietnamese'],
]);

function formatPluginLabel(displayKey, id) {
  const idx = displayKey.indexOf(': ');
  const rawName = idx >= 0 ? displayKey.slice(idx + 2) : displayKey;
  const name = comparisonValue(rawName);
  const cleanId = comparisonValue(id);
  if (!name || !cleanId) return null;
  return `plugin: ${name}[${cleanId}]`;
}

function matchPluginLabels(lines, pluginKeys) {
  if (!pluginKeys || typeof pluginKeys !== 'object' || lines.length === 0) {
    return [];
  }

  const entriesByKey = new Map();
  for (const [displayKey, id] of Object.entries(pluginKeys)) {
    if (typeof id !== 'string') continue;
    const normalizedKey = comparisonValue(displayKey);
    if (!normalizedKey || !comparisonValue(id)) continue;
    entriesByKey.set(normalizedKey, { displayKey, id });
  }

  if (entriesByKey.size === 0) return [];

  const sortedKeys = [...entriesByKey.keys()].sort(
    (a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0),
  );
  const alternatives = sortedKeys.map(escapeRegExp).join('|');
  const selection = comparisonValue(lines.join(', '));
  const regex = new RegExp(`(?:^|, )(${alternatives})(?=, |$)`, 'g');

  const labels = [];
  let match;
  while ((match = regex.exec(selection)) !== null) {
    const entry = entriesByKey.get(match[1]);
    if (!entry) continue;
    const label = formatPluginLabel(entry.displayKey, entry.id);
    if (label) labels.push(label);
  }
  return labels;
}

function computeIssueLabels({ body, existingLabels = [], pluginKeys = {} }) {
  const normalizedExisting = new Set(
    (Array.isArray(existingLabels) ? existingLabels : [])
      .filter(label => typeof label === 'string')
      .map(comparisonValue),
  );

  const result = [];
  const seen = new Set();
  const addLabel = label => {
    if (!label || seen.has(label)) return;
    seen.add(label);
    result.push(label);
  };

  const pluginSection = extractSection(body, 'Plugin');
  if (normalizedExisting.has('bug') && pluginSection.present) {
    const severityLines = nonEmptySectionLines(
      extractSection(body, 'Severity'),
    );
    const rawSeverity =
      severityLines.length > 0 ? comparisonValue(severityLines[0]) : '';
    const severity = VALID_SEVERITIES.has(rawSeverity) ? rawSeverity : 'other';
    addLabel(`severity: ${severity}`);

    for (const pluginLabel of matchPluginLabels(
      nonEmptySectionLines(pluginSection),
      pluginKeys,
    )) {
      addLabel(pluginLabel);
    }
  }

  const languageSection = extractSection(body, 'Language');
  if (normalizedExisting.has('plugin request') && languageSection.present) {
    const languageLines = nonEmptySectionLines(languageSection);
    const rawLanguage =
      languageLines.length > 0 ? comparisonValue(languageLines[0]) : '';
    const canonical = LANGUAGE_ALIASES.get(rawLanguage);
    if (canonical) {
      addLabel(`language: ${canonical}`);
    }
  }

  return result;
}

if (require.main === module) {
  const keysPath = path.join(__dirname, 'keys.json');
  const pluginKeys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  const body = process.env.ISSUE_BODY || '';
  const existingLabels = JSON.parse(process.env.ISSUE_LABELS || '[]');
  const labels = computeIssueLabels({ body, existingLabels, pluginKeys });
  process.stdout.write(`${JSON.stringify({ labels })}\n`);
}

module.exports = { computeIssueLabels };
