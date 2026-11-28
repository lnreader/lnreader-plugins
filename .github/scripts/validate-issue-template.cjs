'use strict';

const {
  comparisonValue,
  extractSection,
  nonEmptySectionLines,
  stripDirectional,
} = require('./issue-parsing.cjs');

const EXEMPT_ASSOCIATIONS = new Set(['owner', 'member', 'collaborator']);

const TEMPLATES = [
  {
    name: 'Report Issue',
    label: 'bug',
    requiredSections: [
      'Plugin',
      'Severity',
      'Steps To Reproduce',
      'Expected Behavior',
      'Actual Behavior',
      'LNReader Version',
      'Plugin Version',
      'Android Version',
    ],
    requiredAcknowledgements: 5,
  },
  {
    name: 'Request Plugin',
    label: 'plugin request',
    requiredSections: ['Plugin Name', 'Website URL', 'Language'],
    requiredAcknowledgements: 4,
  },
  {
    name: 'Request Feature',
    label: 'feature request',
    requiredSections: ['Feature Description'],
    requiredAcknowledgements: 5,
  },
];

function checkAcknowledgements(body, expectedCount) {
  const section = extractSection(body, 'Acknowledgements');
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
  let matchedSections = 0;
  const missingOrEmpty = [];

  for (const heading of template.requiredSections) {
    const section = extractSection(body, heading);
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
    ...checkAcknowledgements(body, template.requiredAcknowledgements),
  );

  return {
    template: template.name,
    valid: reasons.length === 0,
    matchedSections,
    missingOrEmpty,
    reasons,
  };
}

function buildCloseComment({ author, repository, templateName, reasons }) {
  const safeAuthor =
    typeof author === 'string' &&
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(author)
      ? author
      : '';
  const mention = safeAuthor ? `@${safeAuthor} ` : '';

  const safeRepo =
    typeof repository === 'string' &&
    /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repository)
      ? repository
      : '';
  const chooseUrl = safeRepo
    ? `https://github.com/${safeRepo}/issues/new/choose`
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
    return {
      shouldClose: false,
      skipped: 'not-open',
      template: null,
      reasons: [],
      comment: '',
    };
  }

  if (
    EXEMPT_ASSOCIATIONS.has(comparisonValue(authorAssociation)) ||
    comparisonValue(authorType) === 'bot'
  ) {
    return {
      shouldClose: false,
      skipped: 'exempt-author',
      template: null,
      reasons: [],
      comment: '',
    };
  }

  const normalizedLabels = new Set(
    (Array.isArray(labels) ? labels : [])
      .filter(label => typeof label === 'string')
      .map(comparisonValue)
      .filter(Boolean),
  );

  const labeledTemplates = TEMPLATES.filter(template =>
    normalizedLabels.has(template.label),
  );

  if (labeledTemplates.length > 0) {
    const evaluations = labeledTemplates.map(template =>
      evaluateTemplate(body, template),
    );
    const validMatch = evaluations.find(evaluation => evaluation.valid);
    if (validMatch) {
      return {
        shouldClose: false,
        skipped: null,
        template: validMatch.template,
        reasons: [],
        comment: '',
      };
    }

    evaluations.sort(
      (a, b) =>
        a.reasons.length - b.reasons.length ||
        b.matchedSections - a.matchedSections,
    );
    const best = evaluations[0];
    return {
      shouldClose: true,
      skipped: null,
      template: best.template,
      reasons: best.reasons,
      comment: buildCloseComment({
        author,
        repository,
        templateName: best.template,
        reasons: best.reasons,
      }),
    };
  }

  const evaluations = TEMPLATES.map(template =>
    evaluateTemplate(body, template),
  );
  const validMatch = evaluations.find(evaluation => evaluation.valid);
  if (validMatch) {
    return {
      shouldClose: false,
      skipped: null,
      template: validMatch.template,
      reasons: [],
      comment: '',
    };
  }

  evaluations.sort(
    (a, b) =>
      b.matchedSections - a.matchedSections ||
      a.reasons.length - b.reasons.length,
  );
  const best = evaluations[0];
  if (best.matchedSections > 0) {
    return {
      shouldClose: true,
      skipped: null,
      template: best.template,
      reasons: best.reasons,
      comment: buildCloseComment({
        author,
        repository,
        templateName: best.template,
        reasons: best.reasons,
      }),
    };
  }

  const reasons = [
    "The issue body does not use one of the repository's issue templates (Report Issue, Request Plugin, or Request Feature).",
  ];
  return {
    shouldClose: true,
    skipped: null,
    template: null,
    reasons,
    comment: buildCloseComment({
      author,
      repository,
      templateName: null,
      reasons,
    }),
  };
}

if (require.main === module) {
  const result = validateIssueTemplate({
    body: process.env.ISSUE_BODY || '',
    labels: JSON.parse(process.env.ISSUE_LABELS || '[]'),
    author: process.env.ISSUE_AUTHOR || '',
    authorAssociation: process.env.ISSUE_AUTHOR_ASSOCIATION || '',
    authorType: process.env.ISSUE_AUTHOR_TYPE || '',
    state: process.env.ISSUE_STATE || 'open',
    repository: process.env.REPOSITORY || '',
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

module.exports = { TEMPLATES, validateIssueTemplate };
