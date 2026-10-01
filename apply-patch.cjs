#!/usr/bin/env node
/** Apply this source-only patch to the EXISTING application. No Firebase writes. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const PATCH_DIR = __dirname;
const PIN = '0.3.6';
const usage = `Usage:
  node apply-patch.cjs "/path/to/your/project" [--install]
  node apply-patch.cjs "/path/to/your/project" --source src [--install]

The project directory must contain your existing package.json.
Source is auto-detected at <project>/src or <project>.
--source PATH     Use a source directory inside the project.
--install         Also run your project's package manager after applying.
--manager NAME    npm, pnpm, yarn, or bun (normally detected automatically).
--force           Allow overwriting files changed since the supplied assets.zip.
--help            Show this help.

Existing files and dependency manifests are backed up before any changes.
Without --install, the source and package.json are updated, but you must run
npm install (or your existing package manager) before building the app.`;
function fail(message) { throw new Error(message); }
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function inside(root, candidate) { const rel = path.relative(root, candidate); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); }
function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) { console.log(usage); return; }
  let targetArg = '', sourceArg = '', managerArg = '', install = false, force = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--install') install = true;
    else if (arg === '--force') force = true;
    else if (arg === '--source' || arg === '--manager') {
      const value = args[++i];
      if (!value || value.startsWith('--')) fail(`Missing value after ${arg}.`);
      if (arg === '--source') sourceArg = value; else managerArg = value;
    } else if (arg.startsWith('--')) fail(`Unknown option: ${arg}`);
    else if (!targetArg) targetArg = arg;
    else fail(`Unexpected argument: ${arg}`);
  }
  if (!targetArg) fail('Provide your existing project directory.\n' + usage);
  const target = path.resolve(targetArg);
  const packagePath = path.join(target, 'package.json');
  if (!fs.existsSync(packagePath)) fail('No package.json at ' + target + '. Point to your existing application root, not to this patch folder.');
  const packageBytes = fs.readFileSync(packagePath);
  const pkg = JSON.parse(packageBytes.toString('utf8').replace(/^\uFEFF/, ''));
  function looksLikeSource(dir) { return ['App.jsx', 'pages/LearningContentStudio.jsx', 'services/dataService.js', 'firebase/firebaseConfig.js'].every(rel => fs.existsSync(path.join(dir, rel))); }
  let source;
  if (sourceArg) {
    source = path.resolve(target, sourceArg);
    if (!inside(target, source) || !looksLikeSource(source)) fail('--source must point to this application source directory inside your project.');
  } else {
    const candidates = [path.join(target, 'src'), target].filter(looksLikeSource);
    if (candidates.length !== 1) fail('Cannot choose the source directory safely. Pass --source <relative-directory> (the directory containing App.jsx, pages, and services).');
    source = candidates[0];
  }
  if (inside(PATCH_DIR, source)) fail('Choose your real application, not the extracted patch directory.');
  const manifest = JSON.parse(fs.readFileSync(path.join(PATCH_DIR, 'manifest.json'), 'utf8'));
  const conflicts = [];
  for (const file of manifest.files) {
    if (path.isAbsolute(file.path) || file.path.split(/[\\/]/).includes('..')) fail('Invalid manifest path.');
    const payload = path.join(PATCH_DIR, 'source', file.path);
    if (!fs.existsSync(payload) || digest(fs.readFileSync(payload)) !== file.sha256) fail('Patch file is missing or changed: ' + file.path);
    const destination = path.join(source, file.path);
    if (fs.existsSync(destination)) {
      const current = digest(fs.readFileSync(destination));
      if (current !== file.sha256 && current !== file.originalSha256) conflicts.push(file.path);
    } else if (file.originalSha256) conflicts.push(file.path + ' (missing)');
  }
  if (conflicts.length && !force) fail('These files differ from the uploaded source:\n  ' + conflicts.join('\n  ') + '\nMerge your newer changes first, or use --force to overwrite after making a backup. No files were changed.');
  let manager = managerArg || String(pkg.packageManager || '').split('@')[0];
  if (!manager) manager = fs.existsSync(path.join(target, 'pnpm-lock.yaml')) ? 'pnpm'
    : fs.existsSync(path.join(target, 'yarn.lock')) ? 'yarn'
    : fs.existsSync(path.join(target, 'bun.lock')) || fs.existsSync(path.join(target, 'bun.lockb')) ? 'bun' : 'npm';
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) fail('Use --manager npm, pnpm, yarn, or bun.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
  const backup = path.join(target, '.lesson-document-patch-backups', stamp);
  const backupIndex = { createdAt: new Date().toISOString(), project: target, source, files: [], dependencyFiles: [] };
  fs.mkdirSync(backup, { recursive: true });
  for (const file of manifest.files) {
    const destination = path.join(source, file.path);
    const existed = fs.existsSync(destination);
    if (existed) {
      const copy = path.join(backup, 'source', file.path);
      fs.mkdirSync(path.dirname(copy), { recursive: true });
      fs.copyFileSync(destination, copy);
    }
    backupIndex.files.push({ path: file.path, existed });
  }
  for (const name of ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']) {
    const file = path.join(target, name);
    const existed = fs.existsSync(file);
    backupIndex.dependencyFiles.push({ path: name, existed });
    if (existed) fs.copyFileSync(file, path.join(backup, name));
  }
  fs.writeFileSync(path.join(backup, 'backup-index.json'), JSON.stringify(backupIndex, null, 2) + '\n');
  console.log('Backup: ' + backup);
  for (const file of manifest.files) {
    const destination = path.join(source, file.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(PATCH_DIR, 'source', file.path), destination);
  }
  pkg.dependencies = { ...(pkg.dependencies || {}), 'docx-preview': PIN };
  if (pkg.devDependencies?.['docx-preview']) delete pkg.devDependencies['docx-preview'];
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Applied ${manifest.files.length} source files to ${source}.`);
  console.log(`Added runtime dependency docx-preview@${PIN}. Existing Firebase configuration and rules were not changed.`);
  if (install) {
    const installArgs = manager === 'pnpm' ? ['install', '--no-frozen-lockfile'] : ['install'];
    const result = spawnSync(manager, installArgs, { cwd: target, stdio: 'inherit', shell: process.platform === 'win32' });
    if (result.error || result.status !== 0) fail('Source patch is applied, but dependency installation did not finish. Run ' + manager + ' install inside your project before starting or building it. Backup: ' + backup);
    console.log('Dependencies installed. Restart the development server, then run your normal production build and verification.');
  } else console.log(`NEXT: in ${target}, run ${manager} install. Then restart your development server and run your normal production build.`);
}
try { main(); } catch (error) { console.error('\nPatch installer: ' + error.message); process.exitCode = 1; }
