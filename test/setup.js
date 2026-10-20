'use strict';

// Keep test runs away from the real bridge.log and keep the output quiet.
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = path.join(os.tmpdir(), 'ajazz-bridge-test-logs');
fs.mkdirSync(dir, { recursive: true });
process.env.LOG_DIR = dir;
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'error';
