/**
 * scripts/package.js — `npm run package`: build a portable bundle that runs without installing Node.js.
 *
 * Output: dist/ajazz-bridge-<version>-<windows|macos|linux>-<arch>.zip (Windows) or .tar.gz (macOS, Linux),
 * containing the app, its production node_modules, the docs, launcher scripts and the node binary that ran this
 * script. Native modules (sharp, node-hid) are installed for the machine doing the build, so build on the OS and
 * CPU you ship to. The release workflow (.github/workflows/release.yml) does exactly that on GitHub runners.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');

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
  'AKP05_icon.png',
];
const DIRS = ['docs'];

const PLATFORM_NAMES = { win32: 'windows', darwin: 'macos', linux: 'linux' };

/** e.g. ajazz-bridge-1.2.0-windows-x64 */
function bundleName(version, platform = process.platform, arch = process.arch) {
  return `ajazz-bridge-${version}-${PLATFORM_NAMES[platform] || platform}-${arch}`;
}

/** Launcher scripts shipped in the bundle: filename → { content, exec }. All use the bundled node. */
function launchers(platform = process.platform) {
  if (platform === 'win32') {
    return {
      'launch-bridge.vbs': {
        content: [
          "' Silent launcher: runs the bundled node.exe with the supervisor (restarts the bridge if it crashes).",
          'Set WshShell = CreateObject("WScript.Shell")',
          'dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)',
          'WshShell.CurrentDirectory = dir',
          'WshShell.Run """" & dir & "\\node.exe"" supervisor.js", 0, False',
          '',
        ].join('\r\n'),
      },
      'start.cmd': {
        content:
          '@echo off\r\ncd /d "%~dp0"\r\nif not exist .env copy .env.example .env >nul\r\nnode.exe index.js\r\npause\r\n',
      },
      'install-startup.cmd': {
        content: '@echo off\r\ncd /d "%~dp0"\r\nnode.exe startup.js install\r\npause\r\n',
      },
      'uninstall-startup.cmd': {
        content: '@echo off\r\ncd /d "%~dp0"\r\nnode.exe startup.js uninstall\r\npause\r\n',
      },
    };
  }
  const start =
    '#!/bin/sh\ncd "$(dirname "$0")" || exit 1\n[ -f .env ] || cp .env.example .env\nexec ./node index.js\n';
  const files = {
    'start.sh': { content: start, exec: true },
    'install-startup.sh': {
      content: '#!/bin/sh\ncd "$(dirname "$0")" || exit 1\n./node startup.js install\n',
      exec: true,
    },
    'uninstall-startup.sh': {
      content: '#!/bin/sh\ncd "$(dirname "$0")" || exit 1\n./node startup.js uninstall\n',
      exec: true,
    },
  };
  // A .command file opens in Terminal when double-clicked in Finder.
  if (platform === 'darwin') files['Start Ajazz Bridge.command'] = { content: start, exec: true };
  return files;
}

function build() {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const name = bundleName(version);
  const distDir = path.join(root, 'dist');
  const out = path.join(distDir, name);
  const exe = process.platform === 'win32' ? 'node.exe' : 'node';

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(root, f), path.join(out, f));
  for (const d of DIRS) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });
  if (process.platform === 'linux')
    fs.cpSync(path.join(root, 'deploy', 'linux'), path.join(out, 'deploy', 'linux'), { recursive: true });
  fs.copyFileSync(process.execPath, path.join(out, exe));
  fs.chmodSync(path.join(out, exe), 0o755);

  for (const [file, { content, exec }] of Object.entries(launchers())) {
    fs.writeFileSync(path.join(out, file), content);
    if (exec) fs.chmodSync(path.join(out, file), 0o755);
  }

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npm, ['ci', '--omit=dev'], { cwd: out, stdio: 'inherit', shell: process.platform === 'win32' });

  let archive;
  if (process.platform === 'win32') {
    archive = path.join(distDir, `${name}.zip`);
    execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `Compress-Archive -Path '${out}' -DestinationPath '${archive}' -Force`],
      { stdio: 'inherit' }
    );
  } else {
    archive = path.join(distDir, `${name}.tar.gz`);
    execFileSync('tar', ['-czf', archive, '-C', distDir, name], { stdio: 'inherit' });
  }
  console.log(`Built ${archive}`);
  return archive;
}

module.exports = { bundleName, launchers, FILES };

if (require.main === module) build();
