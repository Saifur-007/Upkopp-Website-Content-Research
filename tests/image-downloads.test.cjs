const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  test
} = require('node:test');
const Core = require('../src/shared/research-core.js');
function harness() {
  const stored = {};
  const downloads = [];
  const sent = [];
  let contextOpen = false;
  let granted = true;
  let actualState = 'in_progress';
  const chrome = {
    runtime: {
      id: 'upkopp',
      getURL: file => 'chrome-extension://upkopp/' + file,
      getContexts: async () => contextOpen ? [{}] : [],
      sendMessage: async message => {
        sent.push(message);
        return {
          ok: true
        };
      }
    },
    permissions: {
      contains: async () => granted
    },
    offscreen: {
      createDocument: async () => {
        contextOpen = true;
      },
      closeDocument: async () => {
        contextOpen = false;
      }
    },
    storage: {
      session: {
        get: async key => ({
          [key]: structuredClone(stored[key])
        }),
        set: async data => Object.assign(stored, structuredClone(data))
      }
    },
    downloads: {
      download: async options => {
        downloads.push(options);
        return downloads.length;
      },
      search: async ({
        id
      }) => [{
        id,
        state: actualState,
        error: actualState === 'interrupted' ? 'USER_CANCELED' : undefined
      }]
    }
  };
  const context = vm.createContext({
    chrome,
    URL,
    crypto: require('node:crypto').webcrypto,
    UpkoppResearchCore: Core,
    UpkoppSettings: {
      read: async () => ({
        saveAs: true
      })
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/background/image-downloads.js'), 'utf8'), context);
  return {
    api: context.UpkoppImageDownloads,
    downloads,
    sent,
    stored,
    opened: () => contextOpen,
    denied: () => {
      granted = false;
    },
    interrupt: () => {
      contextOpen = false;
    },
    state: value => {
      actualState = value;
    }
  };
}
const images = [{
  number: 1,
  src: 'https://example.com/a.png'
}, {
  number: 2,
  src: 'https://example.com/a.png'
}, {
  number: 3,
  src: 'https://example.com/b.png'
}];
test('ZIP batch deduplicates sources and creates exactly one Chrome download with save preference', async () => {
  const h = harness();
  const job = await h.api.start(images, 'https://example.com/page');
  assert.equal(job.total, 2);
  assert.equal(h.sent[0].images.length, 2);
  assert.equal(h.sent[0].folder, 'upkopp-example-com-images');
  assert.equal(h.downloads.length, 0);
  await assert.rejects(() => h.api.start(images, job.sourceURL), /already/);
  await h.api.update({
    id: job.id,
    state: 'preparing',
    processed: 2,
    included: 1,
    failures: [{
      number: 3,
      error: 'HTTP 403'
    }]
  });
  await h.api.update({
    id: job.id,
    state: 'ready',
    blobURL: 'blob:chrome-extension://upkopp/archive'
  });
  assert.equal(h.downloads.length, 1);
  assert.equal(h.downloads[0].saveAs, true);
  assert(h.downloads[0].filename.endsWith('.zip'));
  assert.equal((await h.api.progress()).state, 'downloading');
  assert(h.opened());
  h.state('complete');
  await h.api.changed({
    id: 1,
    state: {
      current: 'complete'
    }
  });
  const final = await h.api.progress();
  assert.equal(final.state, 'complete');
  assert.equal(final.failures.length, 1);
  assert.equal(h.opened(), false);
});
test('Denied permissions, interrupted preparation, and canceled ZIP downloads are explicit', async () => {
  const denied = harness();
  denied.denied();
  await assert.rejects(() => denied.api.start(images, 'https://example.com'), /Allow access/);
  assert.equal(denied.opened(), false);
  const h = harness();
  const job = await h.api.start(images, 'https://example.com');
  h.interrupt();
  assert.equal((await h.api.progress()).state, 'failed');
  assert((await h.api.update({
    id: job.id,
    state: 'ready',
    blobURL: 'blob:chrome-extension://upkopp/stale'
  })).stale);
  const next = await h.api.start(images, 'https://example.com');
  await h.api.update({
    id: next.id,
    state: 'ready',
    blobURL: 'blob:chrome-extension://upkopp/new'
  });
  h.state('interrupted');
  assert.equal((await h.api.progress()).error, 'USER_CANCELED');
  assert.equal(h.opened(), false);
});
test('Invalid image sources and foreign Blob URLs cannot become downloads', async () => {
  const h = harness();
  await assert.rejects(() => h.api.start([{
    src: 'javascript:alert(1)'
  }], 'https://example.com'), /valid images/);
  const job = await h.api.start(images, 'https://example.com');
  await h.api.update({
    id: job.id,
    state: 'ready',
    blobURL: 'blob:https://example.com/fake'
  });
  assert.equal(h.downloads.length, 0);
  assert.equal((await h.api.progress()).state, 'failed');
});
