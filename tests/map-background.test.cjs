const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let activeCapture = false;
let selected = 1;
let calls = 0;
const stored = {};
const actions = [];
const chrome = {
  tabs: {
    query: async () => [{
      id: selected,
      windowId: 1,
      url: 'https://example.com/page',
      title: 'Page'
    }],
    get: async id => ({
      id,
      url: 'https://example.com/page'
    }),
    sendMessage: async (_id, message, target) => {
      calls++;
      if (message.type === 'PM_ACT') {
        actions.push(message.action);
      }
      if (target.frameId === 2) {
        throw Error('No access');
      }
      return message.type === 'PM_SCAN' ? {
        epoch: 'epoch',
        title: 'Frame',
        url: 'https://example.com/page',
        headings: [],
        landmarks: [],
        sections: []
      } : message.epoch === 'stale' ? {
        error: 'Stale document'
      } : {
        ok: true
      };
    }
  },
  storage: {
    local: {
      get: async key => ({
        [key]: stored[key]
      }),
      set: async values => Object.assign(stored, values)
    }
  },
  scripting: {
    executeScript: async ({
      target
    }) => {
      if (target.frameIds[0] === 2) {
        throw Error('Cannot access frame');
      }
    }
  },
  webNavigation: {
    getAllFrames: async () => [{
      frameId: 0,
      documentId: 'document-main',
      parentFrameId: -1,
      url: 'https://example.com/page'
    }, {
      frameId: 2,
      parentFrameId: 0,
      url: 'https://other.example/embed'
    }, {
      frameId: 3,
      parentFrameId: 0,
      url: 'https://example.com/embedded'
    }]
  }
};
const context = vm.createContext({
  chrome,
  URL,
  Promise,
  crypto: require('node:crypto').webcrypto,
  eligible: url => url.startsWith('https://'),
  state: async () => ({
    job: {
      tabId: 1
    }
  }),
  active: () => activeCapture
});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../src/background/page-map.js'), 'utf8'), context);
const api = context.UpkoppMapBackground;
(async () => {
  let data = await api.get({
    windowId: 1
  });
  assert.equal(data.documents.length, 3);
  assert(data.documents[1].error);
  assert.equal(data.documents[0].epoch, 'epoch');
  await assert.rejects(() => api.get({
    sourceURL: 'https://example.com/other',
    sourceTabId: 1
  }), /selected page changed/);
  await assert.rejects(() => api.get({
    sourceURL: 'https://example.com/page',
    sourceTabId: 1,
    sourceDocumentId: 'old-document'
  }), /page reloaded/);
  assert((await api.get({
    sourceURL: 'https://example.com/page',
    sourceTabId: 1,
    sourceDocumentId: 'document-main'
  })).documents.length);
  const before = calls;
  activeCapture = true;
  assert((await api.get({})).paused);
  assert.equal(calls, before);
  await assert.rejects(() => api.act({
    tabId: 1,
    frameId: 0
  }), /Finish or cancel/);
  activeCapture = false;
  selected = 3;
  await assert.rejects(() => api.act({
    tabId: 1,
    frameId: 0
  }), /active tab changed/);
  selected = 1;
  await assert.rejects(() => api.act({
    tabId: 1,
    frameId: 0,
    epoch: 'stale',
    action: 'jump'
  }), /Stale/);
  assert((await api.act({
    tabId: 1,
    frameId: 0,
    epoch: 'epoch',
    action: 'jump'
  })).ok);
  await api.act({
    tabId: 1,
    frameId: 3,
    epoch: 'epoch',
    url: 'https://example.com/page',
    action: 'jump'
  });
  assert(actions.includes('arm-frame'));
  assert(actions.includes('reveal-frame'));
  console.log('PASS frame access isolation, capture pause, active-tab and epoch guards, page action routing');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
