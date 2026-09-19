/**
 * Build the web app and publish it to the gh-pages branch, which is what GitHub Pages
 * serves at https://<owner>.github.io/<repo>/.
 *
 * The CI workflow in .github/workflows/pages.yml does this automatically on every push
 * to main. This script is the manual equivalent, for when that workflow is not running.
 *
 * Usage: npm run deploy
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(repoRoot, 'packages', 'web', 'dist');
const BRANCH = 'gh-pages';

const git = (args, cwd = repoRoot) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const run = (cmd, args, env) => execFileSync(cmd, args, { cwd: repoRoot, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } });

// The Pages URL is /<repo>/, so the build needs that as its base or every asset 404s.
const originUrl = git(['remote', 'get-url', 'origin']);
const repoName = (originUrl.match(/([^/]+?)(?:\.git)?$/) || [])[1];
if (!repoName) throw new Error(`Could not read a repository name from origin: ${originUrl}`);
const base = `/${repoName}/`;

if (git(['status', '--porcelain'])) {
  console.error('Working tree has uncommitted changes. Commit or stash them first.');
  process.exit(1);
}

console.log(`Building with base ${base}`);
run('npm', ['run', 'build'], { VITE_BASE: base });

// Pages serves 404.html for any path it does not recognize, which is how a client-routed
// deep link such as /cities reaches the app instead of a 404. .nojekyll stops Pages from
// running the files through Jekyll.
copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
writeFileSync(path.join(dist, '.nojekyll'), '');

const work = mkdtempSync(path.join(tmpdir(), 'agora-pages-'));
try {
  try {
    git(['fetch', 'origin', BRANCH]);
    git(['worktree', 'add', work, BRANCH, '--force']);
  } catch {
    git(['worktree', 'add', '--orphan', '-b', BRANCH, work]);
  }

  for (const entry of readdirSync(work)) {
    if (entry !== '.git') rmSync(path.join(work, entry), { recursive: true, force: true });
  }
  cpSync(dist, work, { recursive: true });

  git(['add', '-A'], work);
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: work, encoding: 'utf8' }).trim();
  if (!staged) {
    console.log('Built output is identical to what is already published. Nothing to do.');
  } else {
    git(['-c', 'core.safecrlf=false', 'commit', '-m', `Publish the built web app (${new Date().toISOString().slice(0, 10)})`], work);
    run('git', ['push', 'origin', BRANCH]);
    const owner = (originUrl.match(/[:/]([^/]+)\/[^/]+?(?:\.git)?$/) || [])[1];
    console.log(`\nPublished. Live in a minute or so at https://${owner}.github.io/${repoName}/`);
  }
} finally {
  try {
    git(['worktree', 'remove', work, '--force']);
  } catch {
    rmSync(work, { recursive: true, force: true });
  }
}
