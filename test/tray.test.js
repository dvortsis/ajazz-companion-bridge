'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

// Replace systray2 with a fake that records the menu and lets the test fire click events by seq_id.
let instance;
class FakeSysTray {
  static separator = { title: '<SEPARATOR>', tooltip: '', enabled: true };
  constructor(conf) {
    this.conf = conf;
    this.updates = [];
    this.killed = false;
    instance = this;
  }
  onClick(fn) {
    this.click = fn;
    return Promise.resolve(this);
  }
  sendAction(a) {
    this.updates.push(a);
    return Promise.resolve(this);
  }
  kill() {
    this.killed = true;
    return Promise.resolve();
  }
}
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'systray2') return { default: FakeSysTray };
  return realLoad.call(this, request, ...rest);
};
const { createTray } = require('../tray');
Module._load = realLoad;

test('tray menu: every item is wired to its action; status and startup toggle update the menu', async () => {
  const calls = [];
  let startupOn = false;
  const tray = createTray({
    startupEnabled: false,
    openLog: () => calls.push('log'),
    openFolder: () => calls.push('folder'),
    reconnect: () => calls.push('reconnect'),
    toggleStartup: () => (startupOn = !startupOn),
    quit: () => calls.push('quit'),
  });
  const titles = instance.conf.menu.items.map((i) => i.title);
  assert.deepEqual(titles, [
    'Starting…',
    '<SEPARATOR>',
    'Open log',
    'Open folder',
    'Reconnect',
    'Start at login',
    '<SEPARATOR>',
    'Quit',
  ]);

  for (const id of [2, 3, 4, 7]) instance.click({ seq_id: id, item: {} });
  assert.deepEqual(calls, ['log', 'folder', 'reconnect', 'quit']);
  instance.click({ seq_id: 0, item: {} }); // status line and separators do nothing
  instance.click({ seq_id: 1, item: {} });
  assert.equal(calls.length, 4);

  instance.click({ seq_id: 5, item: {} });
  assert.equal(instance.updates.at(-1).item.checked, true);
  instance.click({ seq_id: 5, item: {} });
  assert.equal(instance.updates.at(-1).item.checked, false);

  tray.setStatus('Ajazz AKP05E · Companion connected');
  assert.equal(instance.updates.at(-1).item.title, 'Ajazz AKP05E · Companion connected');
  assert.equal(instance.updates.at(-1).seq_id, 0);
  await tray.kill();
  assert.equal(instance.killed, true);
});
