'use strict';

const fs = require('node:fs');

async function applyCloseDecision({
  decision,
  repository,
  issueNumber,
  token,
  apiUrl = 'https://api.github.com',
  fetchImpl = fetch,
} = {}) {
  if (!decision || !decision.shouldClose) {
    return { closed: false };
  }
  if (!repository || !issueNumber || !token) {
    throw new Error(
      'repository, issueNumber, and token are required to close an issue.',
    );
  }

  const baseUrl = String(apiUrl).replace(/\/+$/, '');
  const issueEndpoint = `${baseUrl}/repos/${repository}/issues/${issueNumber}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'lnreader-issue-automation',
  };

  async function postJson(url, method, payload, stepName) {
    const response = await fetchImpl(url, {
      method,
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(
        `GitHub API ${stepName} failed with HTTP ${response.status}.`,
      );
    }
  }

  const label = decision.label || 'invalid';
  await postJson(
    `${issueEndpoint}/labels`,
    'POST',
    { labels: [label] },
    'add-label',
  );
  await postJson(
    `${issueEndpoint}/comments`,
    'POST',
    { body: decision.comment },
    'post-comment',
  );
  await postJson(
    issueEndpoint,
    'PATCH',
    { state: 'closed', state_reason: 'not_planned' },
    'close-issue',
  );

  return { closed: true, label };
}

async function runCli(argv = process.argv.slice(2)) {
  const decisionPath = argv[0];
  if (!decisionPath) {
    throw new Error('Usage: close-invalid-issue.cjs <decisionJsonPath>');
  }

  const decision = JSON.parse(fs.readFileSync(decisionPath, 'utf8'));
  const result = await applyCloseDecision({
    decision,
    repository: process.env.REPOSITORY || process.env.REPO || '',
    issueNumber: process.env.ISSUE_NUMBER || '',
    token: process.env.GH_TOKEN || '',
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  runCli().catch(err => {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { applyCloseDecision };
