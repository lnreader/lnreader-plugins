'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { computeIssueLabels } = require('./auto-label-issue.cjs');

const pluginKeys = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'keys.json'), 'utf8'),
);

test('bug issue with single English plugin and valid severity', () => {
  const body = [
    '### Plugin',
    '',
    'English: Novel Fire',
    '',
    '### Severity',
    '',
    "Can't Load Novels",
  ].join('\n');

  assert.deepEqual(
    computeIssueLabels({ body, existingLabels: ['bug'], pluginKeys }),
    ["severity: can't load novels", 'plugin: novel fire[novelfire]'],
  );
});

test('bug issue with comma-containing Chinese and Korean plugin keys', () => {
  const body = [
    '### Plugin',
    '',
    '中文, 汉语, 漢語: 69书吧, 조선말, 한국어: Agitoon',
    '',
    '### Severity',
    '',
    'Wrong Formatting',
  ].join('\n');

  assert.deepEqual(
    computeIssueLabels({ body, existingLabels: ['bug'], pluginKeys }),
    [
      'severity: wrong formatting',
      'plugin: 69书吧[69shu]',
      'plugin: agitoon[agit.xyz]',
    ],
  );
});

test('bug issue with Arabic plugin with or without leading LRM directional control', () => {
  const withLrm = [
    '### Plugin',
    '',
    '\u200eالعربية: ArNovel',
    '',
    '### Severity',
    '',
    'Missing Chapter',
  ].join('\n');

  const withoutLrm = [
    '### Plugin',
    '',
    'العربية: ArNovel',
    '',
    '### Severity',
    '',
    'Missing Chapter',
  ].join('\n');

  assert.deepEqual(
    computeIssueLabels({ body: withLrm, existingLabels: ['bug'], pluginKeys }),
    ['severity: missing chapter', 'plugin: arnovel[arnovel]'],
  );
  assert.deepEqual(
    computeIssueLabels({
      body: withoutLrm,
      existingLabels: ['bug'],
      pluginKeys,
    }),
    ['severity: missing chapter', 'plugin: arnovel[arnovel]'],
  );
});

test('bug issue with colon inside plugin name preserves colon after language prefix', () => {
  const body = [
    '### Plugin',
    '',
    'English: Re:Library',
    '',
    '### Severity',
    '',
    'Wrong Content',
  ].join('\n');

  assert.deepEqual(
    computeIssueLabels({ body, existingLabels: ['bug'], pluginKeys }),
    ['severity: wrong content', 'plugin: re:library[relib]'],
  );
});

test('bug issue with unmatched plugin or _No response_ never emits bare plugin: label', () => {
  const staleBody = [
    '### Plugin',
    '',
    'English: NonExistentPlugin',
    '',
    '### Severity',
    '',
    'Unknown Severity',
  ].join('\n');

  const noResponseBody = [
    '### Plugin',
    '',
    '_No response_',
    '',
    '### Severity',
    '',
    '_No response_',
  ].join('\n');

  for (const body of [staleBody, noResponseBody]) {
    const labels = computeIssueLabels({
      body,
      existingLabels: ['bug'],
      pluginKeys,
    });
    assert.deepEqual(labels, ['severity: other']);
    assert.ok(!labels.some(label => label.trim() === 'plugin:'));
  }
});

test('bug issue handles CRLF line endings and extra blank lines', () => {
  const body = [
    '### Plugin',
    '',
    '',
    '  English: NovelBuddy  ',
    '',
    '### Severity',
    '',
    '',
    '  Domain Changed  ',
    '',
  ].join('\r\n');

  assert.deepEqual(
    computeIssueLabels({ body, existingLabels: ['bug'], pluginKeys }),
    ['severity: domain changed', 'plugin: novelbuddy[novelbuddy]'],
  );
});

test('plugin request issue maps non-English language names and native aliases', () => {
  const cases = [
    ['Arabic', 'language: arabic'],
    ['Vietnamese', 'language: vietnamese'],
    ['Tiếng Việt', 'language: vietnamese'],
    ['中文', 'language: chinese'],
  ];

  for (const [languageInput, expectedLabel] of cases) {
    const body = ['### Language', '', languageInput].join('\n');
    assert.deepEqual(
      computeIssueLabels({
        body,
        existingLabels: ['plugin request'],
        pluginKeys,
      }),
      [expectedLabel],
    );
  }
});

test('plugin request issue with English, Multi, empty, _No response_, or unrecognized language emits []', () => {
  for (const languageInput of [
    'English',
    'en',
    'Multi',
    '',
    '_No response_',
    'Please add support for this website soon',
  ]) {
    const body = ['### Language', '', languageInput].join('\n');
    assert.deepEqual(
      computeIssueLabels({
        body,
        existingLabels: ['plugin request'],
        pluginKeys,
      }),
      [],
    );
  }
});

test('unrelated issue emits []', () => {
  const body = [
    '### Feature Description',
    '',
    'Add dark mode',
    '',
    '### Language',
    '',
    'English',
  ].join('\n');

  assert.deepEqual(
    computeIssueLabels({
      body,
      existingLabels: ['feature request'],
      pluginKeys,
    }),
    [],
  );
});
