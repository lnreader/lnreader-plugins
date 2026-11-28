'use strict';

const {
  EXEMPT_ASSOCIATIONS,
  TEMPLATE_BOUNDARIES,
  comparisonValue,
  extractSection,
  isExemptAuthor,
  isValidAuthor,
  isValidRepository,
  nonEmptySectionLines,
  normalizeLabelNames,
  parseJsonOrDefault,
  stripDirectional,
} = require('./issue-parsing.cjs');

const TEMPLATES = [
  {
    name: 'Report Issue',
    label: 'bug',
    requiredSections: TEMPLATE_BOUNDARIES.reportIssue.slice(0, 8),
    optionalSections: ['Other Details'],
    requiredAcknowledgements: 5,
  },
  {
    name: 'Request Plugin',
    label: 'plugin request',
    requiredSections: TEMPLATE_BOUNDARIES.requestPlugin.slice(0, 3),
    optionalSections: ['Other Details'],
    requiredAcknowledgements: 4,
  },
  {
    name: 'Request Feature',
    label: 'feature request',
    requiredSections: TEMPLATE_BOUNDARIES.requestFeature.slice(0, 1),
    optionalSections: ['Other Details'],
    requiredAcknowledgements: 5,
  },
];

function checkAcknowledgements(body, expectedCount, boundaryHeadings) {
  const section = extractSection(body, 'Acknowledgements', boundaryHeadings);
  if (!section.present) {
    return ['Missing required section: `Acknowledgements`.'];
  }

  let checked = 0;
  let unchecked = 0;
  for (const line of section.lines) {
    const trimmed = stripDirectional(line).trim();
    if (/^[-*]\s+\[[xX]\]\s+\S/.test(trimmed)) {
      checked += 1;
    } else if (/^[-*]\s+\[\s*\]\s+\S/.test(trimmed)) {
      unchecked += 1;
    }
  }

  if (unchecked > 0) {
    return ['All required checkboxes in `Acknowledgements` must be checked.'];
  }
  if (checked < expectedCount) {
    return [
      `Incomplete \`Acknowledgements\` section (expected at least ${expectedCount} checked items).`,
    ];
  }
  return [];
}

function evaluateTemplate(body, template) {
  const boundaryHeadings = [
    ...template.requiredSections,
    ...template.optionalSections,
    'Acknowledgements',
  ];
  let matchedSections = 0;
  const missingOrEmpty = [];

  for (const heading of template.requiredSections) {
    const section = extractSection(body, heading, boundaryHeadings);
    if (section.present) {
      matchedSections += 1;
    }
    if (!section.present || nonEmptySectionLines(section).length === 0) {
      missingOrEmpty.push(heading);
    }
  }

  const reasons = [];
  if (missingOrEmpty.length > 0) {
    const formatted = missingOrEmpty
      .map(heading => `\`${heading}\``)
      .join(', ');
    reasons.push(`Missing or empty required section(s): ${formatted}.`);
  }
  reasons.push(
    ...checkAcknowledgements(
      body,
      template.requiredAcknowledgements,
      boundaryHeadings,
    ),
  );

  return {
    template: template.name,
    valid: reasons.length === 0,
    matchedSections,
    reasons,
  };
}

function buildCloseComment({ author, repository, templateName, reasons }) {
  const mention = isValidAuthor(author) ? `@${author} ` : '';
  const chooseUrl = isValidRepository(repository)
    ? `https://github.com/${repository}/issues/new/choose`
    : '';

  const intro = templateName
    ? `${mention}this issue was automatically closed because it does not match the **${templateName}** template requirements:`
    : `${mention}this issue was automatically closed because it does not follow one of the repository's issue templates:`;

  const bulletList = reasons.map(reason => `- ${reason}`).join('\n');
  const instructions = chooseUrl
    ? `Please open a new issue using one of the [issue templates](${chooseUrl}) and fill out all required fields.`
    : "Please open a new issue using one of the repository's issue templates and fill out all required fields.";

  return [
    intro,
    '',
    bulletList,
    '',
    instructions,
    '',
    '*If you believe this was closed in error, please comment below so a maintainer can review and reopen it.*',
  ].join('\n');
}

function makeResult({
  shouldClose = false,
  skipped = null,
  template = null,
  reasons = [],
  comment = '',
} = {}) {
  return { shouldClose, skipped, template, reasons, comment };
}

function evaluateCandidates(body, candidates) {
  const evaluations = candidates.map(template =>
    evaluateTemplate(body, template),
  );
  const validMatch = evaluations.find(evaluation => evaluation.valid);
  if (validMatch) {
    return { valid: validMatch, best: null };
  }

  evaluations.sort(
    (a, b) =>
      b.matchedSections - a.matchedSections ||
      a.reasons.length - b.reasons.length,
  );
  return { valid: null, best: evaluations[0] || null };
}

function validateIssueTemplate({
  body = '',
  labels = [],
  author = '',
  authorAssociation = '',
  authorType = '',
  state = 'open',
  repository = '',
} = {}) {
  if (comparisonValue(state) !== 'open') {
    return makeResult({ skipped: 'not-open' });
  }

  if (isExemptAuthor({ authorAssociation, authorType })) {
    return makeResult({ skipped: 'exempt-author' });
  }

  const normalizedLabels = normalizeLabelNames(labels);

  const labeledTemplates = TEMPLATES.filter(template =>
    normalizedLabels.has(template.label),
  );
  const candidates = labeledTemplates.length > 0 ? labeledTemplates : TEMPLATES;

  const { valid, best } = evaluateCandidates(body, candidates);
  if (valid) {
    return makeResult({ template: valid.template });
  }

  if (best && (labeledTemplates.length > 0 || best.matchedSections > 0)) {
    return makeResult({
      shouldClose: true,
      template: best.template,
      reasons: best.reasons,
      comment: buildCloseComment({
        author,
        repository,
        templateName: best.template,
        reasons: best.reasons,
      }),
    });
  }

  const reasons = [
    "The issue body does not use one of the repository's issue templates (Report Issue, Request Plugin, or Request Feature).",
  ];
  return makeResult({
    shouldClose: true,
    reasons,
    comment: buildCloseComment({
      author,
      repository,
      templateName: null,
      reasons,
    }),
  });
}

function validateLiveIssue(issue, repository = '') {
  if (
    !issue ||
    typeof issue !== 'object' ||
    Array.isArray(issue) ||
    Object.hasOwn(issue, 'pull_request')
  ) {
    return makeResult({ skipped: 'pull-request' });
  }
  const labels = Array.isArray(issue.labels)
    ? issue.labels
        .map(label => (typeof label === 'string' ? label : label && label.name))
        .filter(Boolean)
    : [];
  return validateIssueTemplate({
    body: issue.body || '',
    labels,
    author: (issue.user && issue.user.login) || '',
    authorAssociation: issue.author_association || '',
    authorType: (issue.user && issue.user.type) || '',
    state: issue.state || 'open',
    repository,
  });
}

if (require.main === module) {
  const fs = require('node:fs');
  const argv = process.argv.slice(2);
  let result;
  if (argv[0] === '--issue-file') {
    if (!argv[1]) {
      throw new Error('Usage: validate-issue-template.cjs --issue-file <path>');
    }
    const liveIssue = JSON.parse(fs.readFileSync(argv[1], 'utf8'));
    result = validateLiveIssue(liveIssue, process.env.REPOSITORY || '');
  } else {
    result = validateIssueTemplate({
      body: process.env.ISSUE_BODY || '',
      labels: parseJsonOrDefault(process.env.ISSUE_LABELS, []),
      author: process.env.ISSUE_AUTHOR || '',
      authorAssociation: process.env.ISSUE_AUTHOR_ASSOCIATION || '',
      authorType: process.env.ISSUE_AUTHOR_TYPE || '',
      state: process.env.ISSUE_STATE || 'open',
      repository: process.env.REPOSITORY || '',
    });
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

module.exports = {
  EXEMPT_ASSOCIATIONS,
  TEMPLATES,
  validateIssueTemplate,
  validateLiveIssue,
};
