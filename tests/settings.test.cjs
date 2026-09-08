const assert = require('node:assert/strict');
const {
  test
} = require('node:test');
const Settings = require('../src/shared/settings.js');
test('Settings persist, migrate the old theme, reject invalid values, and reset defaults', async () => {
  const stored = {
    mapSettings: {
      theme: 'dark'
    }
  };
  global.chrome = {
    storage: {
      local: {
        get: async () => structuredClone(stored),
        set: async data => Object.assign(stored, structuredClone(data))
      }
    }
  };
  assert.equal((await Settings.read()).theme, 'dark');
  await Settings.write({
    theme: 'light',
    jsonAltText: true,
    autoDownloadText: false,
    saveAs: true,
    arbitrary: 'discard'
  });
  const value = await Settings.read();
  assert.equal(value.jsonAltText, true);
  assert.equal(value.autoDownloadText, false);
  assert.equal(value.saveAs, true);
  assert(!('arbitrary' in value));
  assert.deepEqual(Settings.normalize({
    theme: 'invalid',
    jsonAltText: 'false'
  }), Settings.defaults);
  await Settings.write(Settings.defaults);
  assert.deepEqual(await Settings.read(), Settings.defaults);
});
