const core = require('@actions/core');
const github = require('@actions/github');
const https = require('https');

function extractIssueKey(branchName) {
  const match = branchName.match(/[A-Z]+-[0-9]+/);
  return match ? match[0] : null;
}

function shouldSkip(labels, skipLabel) {
  return labels.some(label => label.name === skipLabel);
}

function postJiraComment({ url, issueKey, message, auth }) {
  const data = JSON.stringify({
    body: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: message,
              marks: [
                {
                  type: "strong"
                }
              ]
            }
          ]
        }
      ]
    }
  });

  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const request = https.request(`${url}/rest/api/3/issue/${issueKey}/comment`, options, res => {
    let responseData = '';
    res.on('data', chunk => responseData += chunk);
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log(`Successfully commented on ${issueKey}`);
      } else {
        core.setFailed(`Failed to comment on issue ${issueKey}: ${res.statusCode} ${responseData}`);
      }
    });
  });

  request.on('error', err => core.setFailed(`Request error: ${err.message}`));
  request.write(data);
  request.end();
}

async function run() {
  try {
    const email = core.getInput('email');
    const token = core.getInput('token');
    const url = core.getInput('url');
    const successText = core.getInput('success');
    const failedText = core.getInput('failed');
    const skipLabel = core.getInput('label');

    const branchName = github.context.ref.replace('refs/heads/', '');
    const issueKey = extractIssueKey(branchName);
    if (!issueKey) {
      core.warning(`Cannot extract JIRA issue key from branch: ${branchName}`);
      return;
    }

    const pullRequest = github.context.payload.pull_request;
    const labels = pullRequest ? pullRequest.labels || [] : [];

    if (shouldSkip(labels, skipLabel)) {
      console.log(`Skipping step due to label: ${skipLabel}`);
      return;
    }

    const auth = Buffer.from(`${email}:${token}`).toString('base64');

    if (core.getInput('status') === 'success') {
      postJiraComment({ url, issueKey, message: successText, auth });
    } else {
      postJiraComment({ url, issueKey, message: failedText, auth });
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
