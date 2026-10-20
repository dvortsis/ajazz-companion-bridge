/**
 * paths.js — Where the project lives on disk. Source files sit in src/, but settings (.env), logs, the lock
 * file, the launcher scripts and the tray icons are found relative to the project root, which is one level up.
 */
'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..');

module.exports = { ROOT, ASSETS: path.join(ROOT, 'assets') };
