/**
 * upload-list.js — Upload a word list .txt file to GitHub
 *
 * Usage:   node upload-list.js <filename.txt>
 * Example: node upload-list.js hoofdstuk1.txt
 *
 * The file must be in the same folder as this script (C:\Flashcards\).
 * Your GitHub PAT must be saved in C:\Flashcards\.github-token
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const OWNER  = 'ChainJFA';
const REPO   = 'flashcards';
const BRANCH = 'main';
const FOLDER = 'lists';
const DIR    = __dirname;

// ── HELPERS ───────────────────────────────────────────────────────────────────
function readToken() {
  const tokenFile = path.join(DIR, '.github-token');
  if (!fs.existsSync(tokenFile)) {
    console.error('❌  .github-token file not found.');
    console.error('    Create C:\\Flashcards\\.github-token and paste your PAT inside it.');
    process.exit(1);
  }
  const token = fs.readFileSync(tokenFile, 'utf8').trim();
  if (!token || !token.startsWith('github_')) {
    console.error('❌  .github-token looks invalid. It should start with "github_".');
    process.exit(1);
  }
  return token;
}

function apiRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent':    'flashcards-upload-script',
        'Accept':        'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(options, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const filename = process.argv[2];
  if (!filename) {
    console.error('Usage: node upload-list.js <filename.txt>');
    process.exit(1);
  }
  if (!filename.endsWith('.txt')) {
    console.error('❌  File must be a .txt file.');
    process.exit(1);
  }

  const localPath = path.join(DIR, filename);
  if (!fs.existsSync(localPath)) {
    console.error(`❌  File not found: ${localPath}`);
    process.exit(1);
  }

  const token   = readToken();
  const content = fs.readFileSync(localPath);
  const encoded = content.toString('base64');
  const apiPath = `/repos/${OWNER}/${REPO}/contents/${FOLDER}/${filename}`;

  console.log(`📤  Uploading ${filename} to ${OWNER}/${REPO}/${FOLDER}/…`);

  // Check if file already exists (need sha for updates)
  const existing = await apiRequest('GET', `${apiPath}?ref=${BRANCH}`, null, token);
  const sha = (existing.status === 200 && existing.body.sha) ? existing.body.sha : undefined;

  if (sha) {
    console.log(`    File already exists — updating…`);
  } else {
    console.log(`    File is new — creating…`);
  }

  const payload = {
    message: sha ? `Update ${filename}` : `Add ${filename}`,
    content: encoded,
    branch:  BRANCH,
    ...(sha ? { sha } : {})
  };

  const result = await apiRequest('PUT', apiPath, payload, token);

  if (result.status === 200 || result.status === 201) {
    const url = result.body?.content?.html_url || `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/${FOLDER}/${filename}`;
    console.log(`✅  Done! View on GitHub: ${url}`);
    console.log(`\n💡  Reload the flashcard app to see "${filename.replace('.txt','')}".`);
  } else {
    console.error(`❌  GitHub API error ${result.status}:`);
    console.error(JSON.stringify(result.body, null, 2));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌  Unexpected error:', err.message);
  process.exit(1);
});
