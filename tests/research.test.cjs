const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  test
} = require('node:test');
function harness() {
  const stored = {};
  const tab = {
    id: 1,
    windowId: 1,
    url: 'https://example.com/page',
    title: 'Source page'
  };
  let changed = false;
  const chrome = {
    storage: {
      local: {
        get: async key => structuredClone({
          [key]: stored[key]
        }),
        set: async data => Object.assign(stored, structuredClone(data))
      }
    },
    scripting: {
      executeScript: async options => {
        assert.deepEqual(Array.from(options.target.frameIds), [0]);
        return [{
          result: {
            title: 'Source page',
            url: tab.url
          }
        }];
      }
    },
    runtime: {
      getURL: file => 'chrome-extension://upkopp/' + file
    },
    windows: {
      create: async options => options
    }
  };
  let reads = 0;
  const context = vm.createContext({
    chrome,
    URL,
    UpkoppMapBackground: {
      currentTab: async () => ({
        ...tab,
        id: changed && reads++ > 0 ? 2 : tab.id
      })
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/background/research.js'), 'utf8'), context);
  return {
    handle: context.UpkoppResearch.handle,
    tab,
    stored,
    change: () => {
      changed = true;
    }
  };
}
test('Overview rejects a result when the active page changes during reading', async () => {
  const h = harness();
  h.change();
  await assert.rejects(() => h.handle({
    type: 'UK_OVERVIEW'
  }), /page changed/);
  const stable = harness();
  assert.equal((await stable.handle({
    type: 'UK_OVERVIEW'
  })).title, 'Source page');
});
test('Larger workspace preserves the source window and unknown requests fail', async () => {
  const h = harness();
  const options = await h.handle({
    type: 'UK_WORKSPACE',
    windowId: 7
  });
  assert(options.url.endsWith('src/popup/popup.html?windowId=7'));
  await assert.rejects(() => h.handle({
    type: 'UNKNOWN'
  }), /Unknown Upkopp/);
});
