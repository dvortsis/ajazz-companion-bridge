/**
 * scripts/package.js — `npm run package`: build a portable bundle (dist/ajazz-bridge-portable.zip) that runs
 * without installing Node.js: app files + production node_modules + the node.exe that ran this script.
 * Native modules (sharp, node-hid) are installed for this machine, so build on the OS you ship to.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist', 'ajazz-bridge-portable');
const exe = process.platform === 'win32' ? 'node.exe' : 'node';

const FILES = [
  'index.js',
  'supervisor.js',
  'config.js',
  'log.js',
  'devices.js',
  'parser.js',
  'protocol.js',
  'layout.js',
  'satellite.js',
  'session.js',
  'manager.js',
  'worker-client.js',
  'image-worker.js',
  'tray.js',
  'startup.js',
  'lock.js',
  'probe.js',
  'package.json',
  'package-lock.json',
  '.env.example',
  'LICENSE',
  'CHANGELOG.md',
  'readme.md',
  'AKP05_icon.ico',
];

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(root, f), path.join(out, f));
fs.copyFileSync(process.execPath, path.join(out, exe));

fs.writeFileSync(
  path.join(out, 'launch-bridge.vbs'),
  [
    "' Silent launcher: runs the bundled node.exe with the supervisor (restarts the bridge if it crashes).",
    'Set WshShell = CreateObject("WScript.Shell")',
    'dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)',
    'WshShell.CurrentDirectory = dir',
    'WshShell.Run """" & dir & "\\node.exe"" supervisor.js", 0, False',
    '',
  ].join('\r\n')
);
fs.writeFileSync(
  path.join(out, 'start.cmd'),
  '@echo off\r\ncd /d "%~dp0"\r\nif not exist .env copy .env.example .env >nul\r\nnode.exe index.js\r\n'
);

execSync('npm ci --omit=dev --ignore-scripts=false', { cwd: out, stdio: 'inherit' });

if (process.platform === 'win32') {
  const zip = path.join(root, 'dist', 'ajazz-bridge-portable.zip');
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${out}\\*' -DestinationPath '${zip}' -Force"`, {
    stdio: 'inherit',
  });
  console.log(`Built ${zip}`);
} else {
  console.log(`Built ${out}`);
}
