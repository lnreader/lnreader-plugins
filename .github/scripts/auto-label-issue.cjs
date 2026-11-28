'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  VALID_SEVERITIES,
  comparisonValue,
  extractSection,
  matchPluginEntries,
  nonEmptySectionLines,
} = require('./issue-parsing.cjs');

const MAX_LABEL_LENGTH = 50;

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
  // Burmese
  ['burmese', 'burmese'],
  ['my', 'burmese'],
  ['မြန်မာ', 'burmese'],
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
  // Czech
  ['czech', 'czech'],
  ['cs', 'czech'],
  ['čeština', 'czech'],
  ['cestina', 'czech'],
  // Dutch
  ['dutch', 'dutch'],
  ['nl', 'dutch'],
  ['nederlands', 'dutch'],
  // Filipino / Tagalog
  ['filipino', 'filipino'],
  ['tagalog', 'filipino'],
  ['tl', 'filipino'],
  ['fil', 'filipino'],
  // French
  ['french', 'french'],
  ['fr', 'french'],
  ['français', 'french'],
  ['francais', 'french'],
  // German
  ['german', 'german'],
  ['de', 'german'],
  ['deutsch', 'german'],
  // Greek
  ['greek', 'greek'],
  ['el', 'greek'],
  ['ελληνικά', 'greek'],
  ['ellinika', 'greek'],
  // Hebrew
  ['hebrew', 'hebrew'],
  ['he', 'hebrew'],
  ['עברית', 'hebrew'],
  // Hindi
  ['hindi', 'hindi'],
  ['hi', 'hindi'],
  ['हिन्दी', 'hindi'],
  ['हिंदी', 'hindi'],
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
  // Malay
  ['malay', 'malay'],
  ['ms', 'malay'],
  ['bahasa melayu', 'malay'],
  // Persian / Farsi
  ['persian', 'persian'],
  ['farsi', 'persian'],
  ['fa', 'persian'],
  ['فارسی', 'persian'],
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
  // Romanian
  ['romanian', 'romanian'],
  ['ro', 'romanian'],
  ['română', 'romanian'],
  ['romana', 'romanian'],
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

const MANAGED_LANGUAGE_LABELS = new Set(
  [...LANGUAGE_ALIASES.values()].map(lang => `language: ${lang}`),
);

function resolveLanguageAlias(rawLanguage) {
  if (!rawLanguage) return null;
  const direct = LANGUAGE_ALIASES.get(rawLanguage);
  if (direct) return direct;
  const firstSegment = comparisonValue(rawLanguage.split(/[,/(]/)[0]);
  return firstSegment ? LANGUAGE_ALIASES.get(firstSegment) || null : null;
}

function formatPluginLabel(displayKey, id) {
  const idx = displayKey.indexOf(': ');
  const rawName = idx >= 0 ? displayKey.slice(idx + 2) : displayKey;
  const name = comparisonValue(rawName);
  const cleanId = comparisonValue(id);
  if (!name || !cleanId) return null;
  const full = `plugin: ${name}[${cleanId}]`;
  if (full.length <= MAX_LABEL_LENGTH) return full;

  const suffix = `[${cleanId}]`;
  const maxNameLen = MAX_LABEL_LENGTH - 'plugin: '.length - suffix.length;
  if (maxNameLen >= 4) {
    const truncated = name.slice(0, maxNameLen - 1).trimEnd();
    if (truncated) return `plugin: ${truncated}…${suffix}`;
  }
  const maxIdLen = MAX_LABEL_LENGTH - 'plugin: []'.length;
  return `plugin: [${cleanId.slice(0, maxIdLen)}]`;
}

function matchPluginLabels(lines, pluginKeys) {
  return matchPluginEntries(lines, pluginKeys)
    .map(entry => formatPluginLabel(entry.displayKey, entry.id))
    .filter(Boolean);
}

function computeLabelPlan({ body, existingLabels = [], pluginKeys = {} }) {
  const rawExisting = (
    Array.isArray(existingLabels) ? existingLabels : []
  ).filter(label => typeof label === 'string');
  const normalizedExisting = new Set(rawExisting.map(comparisonValue));

  const desired = [];
  const seenDesired = new Set();
  const addLabel = label => {
    const normalized = comparisonValue(label);
    if (!normalized || seenDesired.has(normalized)) return;
    seenDesired.add(normalized);
    desired.push(label);
  };

  const pluginSection = extractSection(body, 'Plugin');
  const manageBug = normalizedExisting.has('bug') && pluginSection.present;
  if (manageBug) {
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
  const manageLanguage =
    normalizedExisting.has('plugin request') && languageSection.present;
  if (manageLanguage) {
    const languageLines = nonEmptySectionLines(languageSection);
    const rawLanguage =
      languageLines.length > 0 ? comparisonValue(languageLines[0]) : '';
    const canonical = resolveLanguageAlias(rawLanguage);
    if (canonical) {
      addLabel(`language: ${canonical}`);
    }
  }

  const isManagedLabel = normalized => {
    if (
      manageBug &&
      (normalized === 'plugin:' ||
        normalized.startsWith('plugin: ') ||
        normalized.startsWith('severity: '))
    ) {
      return true;
    }
    return manageLanguage && MANAGED_LANGUAGE_LABELS.has(normalized);
  };

  const add = desired.filter(
    label => !normalizedExisting.has(comparisonValue(label)),
  );

  const remove = [];
  const seenRemove = new Set();
  for (const label of rawExisting) {
    const normalized = comparisonValue(label);
    if (
      !normalized ||
      !isManagedLabel(normalized) ||
      seenDesired.has(normalized) ||
      seenRemove.has(normalized)
    ) {
      continue;
    }
    seenRemove.add(normalized);
    remove.push(label);
  }

  return { desired, add, remove };
}

if (require.main === module) {
  const keysPath = path.join(__dirname, 'keys.json');
  const pluginKeys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  const body = process.env.ISSUE_BODY || '';
  const existingLabels = JSON.parse(process.env.ISSUE_LABELS || '[]');
  const plan = computeLabelPlan({ body, existingLabels, pluginKeys });
  process.stdout.write(
    `${JSON.stringify({ add: plan.add, remove: plan.remove })}\n`,
  );
}

module.exports = { computeLabelPlan };
