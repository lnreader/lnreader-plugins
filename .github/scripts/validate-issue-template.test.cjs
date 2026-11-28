'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  TEMPLATES,
  validateIssueTemplate,
  validateLiveIssue,
} = require('./validate-issue-template.cjs');

const VALID_REPORT_ISSUE_BODY = [
  '### Plugin',
  '',
  'English: Ranobes',
  '',
  '### Severity',
  '',
  "Can't Load Novels",
  '',
  '### Steps To Reproduce',
  '',
  'chapter list wont load',
  '',
  '### Expected Behavior',
  '',
  'it should load chapter list',
  '',
  '### Actual Behavior',
  '',
  'its just empty cant see the chapters',
  '',
  '### LNReader Version',
  '',
  '2.1.4',
  '',
  '### Plugin Version',
  '',
  '2.0.3',
  '',
  '### Android Version',
  '',
  '13',
  '',
  '### Other Details',
  '',
  '_No response_',
  '',
  '### Acknowledgements',
  '',
  '- [x] I have searched existing issues and confirmed this is not a duplicate.',
  '- [x] I have written a clear and descriptive title.',
  '- [x] I have updated the app to the **[latest version](https://github.com/LNReader/lnreader/releases/latest)**.',
  '- [x] I have updated all installed plugins to the latest version.',
  '- [x] I understand that app-specific issues should be reported in the [app repository](https://github.com/LNReader/lnreader/issues/new/choose).',
].join('\n');

const VALID_PLUGIN_REQUEST_BODY = [
  '### Plugin Name',
  '',
  'Puffberry',
  '',
  '### Website URL',
  '',
  'https://example.com',
  '',
  '### Language',
  '',
  'English',
  '',
  '### Other Details',
  '',
  '_No response_',
  '',
  '### Acknowledgements',
  '',
  '- [x] I have searched existing issues and confirmed this plugin has not been requested before.',
  '- [x] I have used the plugin name as the issue title.',
  '- [x] I have verified this plugin does not already exist in the [repository](https://github.com/LNReader/lnreader-plugins).',
  '- [X] I have provided all requested information in this form.',
].join('\n');

const VALID_FEATURE_REQUEST_BODY = [
  '### Feature Description',
  '',
  'Add a toggle to hide disabled books.',
  '',
  '### Other Details',
  '',
  '_No response_',
  '',
  '### Acknowledgements',
  '',
  '- [x] I have searched existing issues and confirmed this is not a duplicate.',
  '- [x] I have written a clear and descriptive title.',
  '- [x] I understand that app-specific features should be requested in the [app repository](https://github.com/LNReader/lnreader/issues/new/choose).',
  '- [x] I have updated the app to the **[latest version](https://github.com/LNReader/lnreader/releases/latest)**.',
  '- [x] I have provided all requested information in this form.',
].join('\n');

function parseIssueTemplateSchema(filePath) {
  const lines = fs
    .readFileSync(filePath, 'utf8')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  let label = null;
  const requiredSections = [];
  const optionalSections = [];
  let requiredAcknowledgements = 0;

  let inBody = false;
  let currentType = null;
  let currentLabel = null;
  let currentRequired = false;
  let inValidations = false;
  let inOptions = false;

  const flushBlock = () => {
    if (
      currentType &&
      currentType !== 'markdown' &&
      currentType !== 'checkboxes' &&
      currentLabel
    ) {
      if (currentRequired) {
        requiredSections.push(currentLabel);
      } else {
        optionalSections.push(currentLabel);
      }
    }
    currentType = null;
    currentLabel = null;
    currentRequired = false;
    inValidations = false;
    inOptions = false;
  };

  for (const line of lines) {
    const topLabelMatch = /^labels:\s*\[([^\]]+)\]/.exec(line);
    if (topLabelMatch) {
      label = topLabelMatch[1].split(',')[0].trim().toLowerCase();
      continue;
    }
    if (/^body:\s*$/.test(line)) {
      inBody = true;
      continue;
    }
    if (!inBody) continue;

    const itemMatch = /^ {2}- type:\s*(\S+)/.exec(line);
    if (itemMatch) {
      flushBlock();
      currentType = itemMatch[1];
      continue;
    }

    const labelMatch = /^ {6}label:\s*(.+)$/.exec(line);
    if (labelMatch && !inOptions) {
      currentLabel = labelMatch[1].trim();
      continue;
    }

    if (/^ {4}validations:\s*$/.test(line)) {
      inValidations = true;
      inOptions = false;
      continue;
    }
    if (/^ {6}options:\s*$/.test(line)) {
      inOptions = true;
      inValidations = false;
      continue;
    }
    if (/^ {4}[a-z]+:/.test(line)) {
      inValidations = false;
      inOptions = false;
    }

    if (inValidations && /^\s+required:\s*true\s*$/.test(line)) {
      currentRequired = true;
    }
    if (
      currentType === 'checkboxes' &&
      inOptions &&
      /^\s+required:\s*true\s*$/.test(line)
    ) {
      requiredAcknowledgements += 1;
    }
  }
  flushBlock();

  return {
    label,
    requiredSections,
    optionalSections,
    requiredAcknowledgements,
  };
}

test('valid Report Issue, Request Plugin, and Request Feature pass validation', () => {
  const cases = [
    {
      body: VALID_REPORT_ISSUE_BODY.replace(/\n/g, '\r\n'),
      labels: ['bug'],
      expectedTemplate: 'Report Issue',
    },
    {
      body: VALID_PLUGIN_REQUEST_BODY,
      labels: ['plugin request'],
      expectedTemplate: 'Request Plugin',
    },
    {
      body: VALID_FEATURE_REQUEST_BODY,
      labels: ['feature request'],
      expectedTemplate: 'Request Feature',
    },
  ];

  for (const { body, labels, expectedTemplate } of cases) {
    const result = validateIssueTemplate({
      body,
      labels,
      author: 'reader123',
      authorAssociation: 'NONE',
      repository: 'lnreader/lnreader-plugins',
    });
    assert.equal(result.shouldClose, false);
    assert.equal(result.template, expectedTemplate);
    assert.deepEqual(result.reasons, []);
    assert.equal(result.comment, '');
  }
});

test('valid unlabeled issue matching a template passes validation', () => {
  const result = validateIssueTemplate({
    body: VALID_FEATURE_REQUEST_BODY,
    labels: [],
    author: 'reader123',
    authorAssociation: 'NONE',
    repository: 'lnreader/lnreader-plugins',
  });
  assert.equal(result.shouldClose, false);
  assert.equal(result.template, 'Request Feature');
});

test('blank body and freeform body with no labels are closed with template link', () => {
  for (const body of [
    '',
    'I cannot load the content but i can access the content from webview',
  ]) {
    const result = validateIssueTemplate({
      body,
      labels: [],
      author: 'some-user',
      authorAssociation: 'NONE',
      repository: 'lnreader/lnreader-plugins',
    });
    assert.equal(result.shouldClose, true);
    assert.equal(result.template, null);
    assert.ok(result.comment.includes('@some-user '));
    assert.ok(
      result.comment.includes(
        'https://github.com/lnreader/lnreader-plugins/issues/new/choose',
      ),
    );
  }
});

test('bug issue with missing heading or _No response_ in required field is closed with specific reasons', () => {
  const brokenBody = VALID_REPORT_ISSUE_BODY.replace(
    '### Plugin\n\nEnglish: Ranobes',
    '### Plugin\n\n_No response_',
  ).replace('### Android Version\n\n13\n\n', '');

  const result = validateIssueTemplate({
    body: brokenBody,
    labels: ['bug'],
    author: 'reader123',
    authorAssociation: 'NONE',
    repository: 'lnreader/lnreader-plugins',
  });

  assert.equal(result.shouldClose, true);
  assert.equal(result.template, 'Report Issue');
  assert.ok(
    result.reasons.some(
      reason =>
        reason.includes('`Plugin`') && reason.includes('`Android Version`'),
    ),
  );
  assert.ok(result.comment.includes('**Report Issue**'));
});

test('plugin request issue with unchecked box in Acknowledgements is closed', () => {
  const uncheckedBody = VALID_PLUGIN_REQUEST_BODY.replace(
    '- [x] I have used the plugin name as the issue title.',
    '- [ ] I have used the plugin name as the issue title.',
  );

  const result = validateIssueTemplate({
    body: uncheckedBody,
    labels: ['plugin request'],
    author: 'reader123',
    authorAssociation: 'NONE',
  });

  assert.equal(result.shouldClose, true);
  assert.equal(result.template, 'Request Plugin');
  assert.ok(
    result.reasons.some(reason =>
      reason.includes('All required checkboxes in `Acknowledgements`'),
    ),
  );
});

test('feature request issue with missing or plain-text Acknowledgements is closed', () => {
  const fewerBoxes = VALID_FEATURE_REQUEST_BODY.replace(
    '- [x] I have provided all requested information in this form.',
    '',
  );
  const plainTextAck = VALID_FEATURE_REQUEST_BODY.replace(
    /### Acknowledgements[\s\S]*$/,
    '### Acknowledgements\n\nYes I agree',
  );

  for (const body of [fewerBoxes, plainTextAck]) {
    const result = validateIssueTemplate({
      body,
      labels: ['feature request'],
      author: 'reader123',
      authorAssociation: 'NONE',
    });
    assert.equal(result.shouldClose, true);
    assert.equal(result.template, 'Request Feature');
    assert.ok(
      result.reasons.some(reason =>
        reason.includes('expected at least 5 checked items'),
      ),
    );
  }
});

test('unlabeled partial template reports specific missing sections for matched template', () => {
  const partialBug = [
    '### Plugin',
    '',
    'English: Ranobes',
    '',
    '### Severity',
    '',
    "Can't Load Novels",
  ].join('\n');

  const result = validateIssueTemplate({
    body: partialBug,
    labels: [],
    author: 'reader123',
    authorAssociation: 'NONE',
  });

  assert.equal(result.shouldClose, true);
  assert.equal(result.template, 'Report Issue');
  assert.ok(
    result.reasons.some(reason => reason.includes('`Steps To Reproduce`')),
  );
});

test('exempt authors (OWNER, MEMBER, COLLABORATOR, Bot) are skipped even with blank body', () => {
  for (const [authorAssociation, authorType] of [
    ['OWNER', 'User'],
    ['MEMBER', 'User'],
    ['COLLABORATOR', 'User'],
    ['NONE', 'Bot'],
  ]) {
    const result = validateIssueTemplate({
      body: '',
      labels: [],
      author: 'maintainer',
      authorAssociation,
      authorType,
    });
    assert.equal(result.shouldClose, false);
    assert.equal(result.skipped, 'exempt-author');
  }
});

test('already closed issues are skipped', () => {
  const result = validateIssueTemplate({
    body: '',
    labels: [],
    state: 'closed',
    author: 'reader123',
    authorAssociation: 'NONE',
  });
  assert.equal(result.shouldClose, false);
  assert.equal(result.skipped, 'not-open');
});

test('invalid or unsafe author login is omitted instead of interpolated', () => {
  const result = validateIssueTemplate({
    body: '',
    labels: [],
    author: 'bad user @everyone\n<script>',
    authorAssociation: 'NONE',
    repository: 'lnreader/lnreader-plugins',
  });
  assert.equal(result.shouldClose, true);
  assert.ok(!result.comment.includes('@bad'));
  assert.ok(!result.comment.includes('<script>'));
  assert.ok(result.comment.startsWith('this issue was automatically closed'));
});

test('required textareas containing markdown headings pass while empty required sections still fail', () => {
  const bugWithHeadings = VALID_REPORT_ISSUE_BODY.replace(
    'chapter list wont load',
    '#### Step 1\nOpen plugin\n# Extra Heading',
  ).replace(
    'its just empty cant see the chapters',
    '## Observed Error\nEmpty chapter list',
  );
  const featureWithHeadings = VALID_FEATURE_REQUEST_BODY.replace(
    'Add a toggle to hide disabled books.',
    '# Summary\nAdd a toggle to hide disabled books.',
  );

  for (const [body, label, expectedTemplate] of [
    [bugWithHeadings, 'bug', 'Report Issue'],
    [featureWithHeadings, 'feature request', 'Request Feature'],
  ]) {
    const validResult = validateIssueTemplate({
      body,
      labels: [label],
      author: 'reader123',
      authorAssociation: 'NONE',
    });
    assert.equal(validResult.shouldClose, false);
    assert.equal(validResult.template, expectedTemplate);
  }

  const emptyBeforeOptional = VALID_FEATURE_REQUEST_BODY.replace(
    'Add a toggle to hide disabled books.',
    '',
  );
  const invalidResult = validateIssueTemplate({
    body: emptyBeforeOptional,
    labels: ['feature request'],
    author: 'reader123',
    authorAssociation: 'NONE',
  });
  assert.equal(invalidResult.shouldClose, true);
  assert.ok(
    invalidResult.reasons.some(reason =>
      reason.includes('`Feature Description`'),
    ),
  );
});

test('multi-label issue prioritizes the template with most matched sections', () => {
  const bugBodyMissingSteps = VALID_REPORT_ISSUE_BODY.replace(
    'chapter list wont load',
    '_No response_',
  ).replace(
    '- [x] I understand that app-specific issues should be reported in the [app repository](https://github.com/LNReader/lnreader/issues/new/choose).',
    '',
  );

  const result = validateIssueTemplate({
    body: bugBodyMissingSteps,
    labels: ['bug', 'plugin request'],
    author: 'reader123',
    authorAssociation: 'NONE',
  });

  assert.equal(result.shouldClose, true);
  assert.equal(result.template, 'Report Issue');
  assert.ok(result.comment.includes('**Report Issue**'));
});

test('unsafe repository slug omits issues/new/choose URL', () => {
  for (const repository of [
    '../..',
    'lnreader/..',
    'bad owner/repo',
    'a/b/c',
  ]) {
    const result = validateIssueTemplate({
      body: '',
      labels: [],
      author: 'reader123',
      authorAssociation: 'NONE',
      repository,
    });
    assert.equal(result.shouldClose, true);
    assert.ok(!result.comment.includes('https://github.com/'));
    assert.ok(
      result.comment.includes(
        "Please open a new issue using one of the repository's issue templates",
      ),
    );
  }
});

test('validate-issue-template CLI outputs JSON decision', () => {
  const stdout = execFileSync(
    process.execPath,
    [path.join(__dirname, 'validate-issue-template.cjs')],
    {
      env: {
        ...process.env,
        ISSUE_BODY: 'not a template',
        ISSUE_LABELS: JSON.stringify([]),
        ISSUE_AUTHOR: 'reader123',
        ISSUE_AUTHOR_ASSOCIATION: 'NONE',
        ISSUE_AUTHOR_TYPE: 'User',
        ISSUE_STATE: 'open',
        REPOSITORY: 'lnreader/lnreader-plugins',
      },
      encoding: 'utf8',
    },
  );
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.shouldClose, true);
  assert.equal(parsed.template, null);
  assert.ok(parsed.comment.includes('@reader123 '));
});

test('validateLiveIssue respects live edited issue state and --issue-file CLI flag', () => {
  const validLiveIssue = {
    state: 'open',
    labels: [{ name: 'feature request' }],
    user: { login: 'reader123', type: 'User' },
    author_association: 'NONE',
    body: [
      '### Feature Description',
      'Add dark theme option.',
      '',
      '### Acknowledgements',
      '- [x] I have searched existing issues and confirmed this is not a duplicate.',
      '- [x] I have written a clear and descriptive title.',
      '- [x] I understand that app-specific features should be requested in the app repository.',
      '- [x] I have updated the app to the latest version.',
      '- [x] I have provided all requested information in this form.',
    ].join('\n'),
  };
  assert.equal(
    validateLiveIssue(validLiveIssue, 'lnreader/lnreader-plugins').shouldClose,
    false,
  );

  assert.equal(
    validateLiveIssue({ ...validLiveIssue, body: '', state: 'closed' }).skipped,
    'not-open',
  );
  assert.equal(
    validateLiveIssue({ ...validLiveIssue, pull_request: {} }).skipped,
    'pull-request',
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-live-'));
  try {
    const issuePath = path.join(tmpDir, 'live-issue.json');
    fs.writeFileSync(
      issuePath,
      JSON.stringify({ ...validLiveIssue, body: 'not a template' }),
    );
    const out = execFileSync(
      process.execPath,
      [
        path.join(__dirname, 'validate-issue-template.cjs'),
        '--issue-file',
        issuePath,
      ],
      {
        env: { ...process.env, REPOSITORY: 'lnreader/lnreader-plugins' },
        encoding: 'utf8',
      },
    );
    const decision = JSON.parse(out);
    assert.equal(decision.shouldClose, true);
    assert.match(decision.comment, /@reader123 /);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TEMPLATES schema stays in sync with YAML issue template files', () => {
  const templateFiles = [
    path.join(__dirname, 'blank_report_issue.yml'),
    path.join(__dirname, '..', 'ISSUE_TEMPLATE', 'request_plugin.yml'),
    path.join(__dirname, '..', 'ISSUE_TEMPLATE', 'request_feature.yml'),
  ];

  const parsedSchemas = templateFiles.map(parseIssueTemplateSchema);
  assert.equal(TEMPLATES.length, parsedSchemas.length);

  for (let i = 0; i < TEMPLATES.length; i += 1) {
    assert.equal(TEMPLATES[i].label, parsedSchemas[i].label);
    assert.deepEqual(
      TEMPLATES[i].requiredSections,
      parsedSchemas[i].requiredSections,
    );
    assert.deepEqual(
      TEMPLATES[i].optionalSections,
      parsedSchemas[i].optionalSections,
    );
    assert.equal(
      TEMPLATES[i].requiredAcknowledgements,
      parsedSchemas[i].requiredAcknowledgements,
    );
  }
});
