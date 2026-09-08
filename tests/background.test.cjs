const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const Core = require(path.join(root, 'src/shared/capture-core.js'));
function fixture(status = 'completed') {
  return {
    schema_version: '1.0.0',
    page: {
      url: 'https://example.com/services',
      title: 'Our services',
      site_name: null,
      language: 'en',
      captured_at: '2026-09-07T12:00:00Z'
    },
    regions: [{
      id: 'r1',
      type: 'main',
      sections: [{
        id: 's1',
        grouping_basis: 'region',
        blocks: [{
          id: 'b1',
          type: 'heading',
          visibility: 'visible',
          text: 'Our services',
          inline: [{
            text: 'Our services'
          }],
          level: 1,
          semantic_source: 'h1'
        }],
        sections: [],
        order: ['b1']
      }]
    }],
    images: [],
    capture: {
      status,
      checks: {
        schema_valid: true,
        comparison_pass_performed: true,
        observed_content_reconciled: true
      },
      warnings: [],
      limits_reached: [],
      counts: {
        sections: 1,
        blocks: 1,
        headings: 1,
        images: 0
      },
      limits: Core.LIMITS,
      elapsed_ms: 100
    }
  };
}
const clone = x => JSON.parse(JSON.stringify(x));
function harness() {
  const handlers = {};
  const data = {
    session: {},
    local: {}
  };
  const downloads = [];
  const flags = {
    downloadFail: false,
    storageFail: false
  };
  const tab = {
    id: 1,
    windowId: 1,
    url: 'https://example.com/services',
    title: 'Our services'
  };
  const event = name => ({
    addListener: fn => {
      handlers[name] = fn;
    }
  });
  const area = name => ({
    get: async key => Object.fromEntries((Array.isArray(key) ? key : [key]).map(item => [item, clone(data[name][item] ?? null)])),
    set: async values => {
      if (flags.storageFail && name === 'session' && values.captureState?.result) {
        throw Error('QUOTA');
      }
      Object.assign(data[name], clone(values));
    }
  });
  const chrome = {
    storage: {
      session: area('session'),
      local: area('local')
    },
    runtime: {
      id: 'test-id',
      getURL: p => 'chrome-extension://test-id/' + p,
      sendMessage: async () => {},
      onMessage: event('message')
    },
    sidePanel: {
      open: () => {
        flags.opened = true;
        return Promise.resolve();
      }
    },
    action: {
      onClicked: event('action')
    },
    scripting: {
      executeScript: async () => [{
        documentId: 'doc-1'
      }]
    },
    tabs: {
      get: async () => ({
        ...tab
      }),
      query: async () => [{
        ...tab
      }],
      sendMessage: async (_id, message) => message.type === 'PC_PING' ? {
        id: flags.jobId,
        url: tab.url
      } : {
        ok: true
      },
      onUpdated: event('updated'),
      onRemoved: event('removed'),
      onActivated: event('activated')
    },
    downloads: {
      download: async options => {
        if (flags.downloadFail) {
          throw Error('USER_CANCELED');
        }
        downloads.push(options);
        return downloads.length;
      },
      search: async ({
        id
      }) => [{
        id,
        state: 'complete',
        filename: 'C:\\Downloads\\actual-name.txt'
      }],
      onChanged: event('downloadChanged')
    }
  };
  const context = vm.createContext({
    chrome,
    crypto: require('node:crypto').webcrypto,
    URL,
    TextEncoder,
    console,
    setTimeout,
    clearTimeout
  });
  context.importScripts = (...names) => names.forEach(name => vm.runInContext(fs.readFileSync(path.join(root, 'src/background', name), 'utf8'), context));
  vm.runInContext(fs.readFileSync(path.join(root, 'src/background/service-worker.js'), 'utf8') + '\nglobalThis.api={begin,state,refresh,save,download,collectorMessage,drain:()=>chain};', context);
  const sender = {
    id: 'test-id',
    tab: {
      id: 1
    },
    documentId: 'doc-1'
  };
  const dispatch = type => new Promise(resolve => handlers.message({
    type
  }, {
    id: 'test-id',
    url: 'chrome-extension://test-id/src/popup/popup.html'
  }, resolve));
  return {
    api: context.api,
    archive: context.UpkoppImageDownloads,
    handlers,
    flags,
    tab,
    downloads,
    data,
    sender,
    dispatch
  };
}
let passed = 0;
async function test(label, fn) {
  await fn();
  passed++;
  console.log('PASS ' + label);
}
(async () => {
  await test('Contract rejects unresolved references and contradictory success', () => {
    const r = fixture();
    assert.deepEqual(Core.validate(r), []);
    r.regions[0].sections[0].order = ['bad'];
    assert(Core.validate(r).length);
    const t = fixture();
    t.capture.warnings.push({
      category: 'gap',
      message: 'Missing',
      severity: 'warning',
      recovery: null
    });
    assert(Core.validate(t).some(e => e.includes('contradicts')));
  });
  await test('Filenames are safe, unique by job and labelled for partial results', () => {
    const r = fixture('partial');
    r.page.url = 'https://example.com/CON?x=/../';
    const name = Core.filename(r, 'a1b2c3d4');
    assert(!/[<>:"/\\|?*]/.test(name));
    assert(name.endsWith('-partial.txt'));
    assert.notEqual(name, Core.filename(r, 'different'));
  });
  await test('Toolbar declares a popup without capture; explicit capture starts once', async () => {
    const h = harness();
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    assert.equal(manifest.action.default_popup, 'src/popup/popup.html?popup=1');
    assert.equal(h.handlers.action, undefined);
    await h.api.drain();
    assert.equal((await h.api.state()).job, null);
    await h.dispatch('PC_START_CURRENT');
    const first = await h.api.state();
    h.flags.jobId = first.job.id;
    await h.api.begin(h.tab);
    assert.equal((await h.api.state()).job.id, first.job.id);
  });
  await test('Capture download settings persist and control automatic saving and file location', async () => {
    const h = harness();
    h.data.local.upkoppSettings = {
      autoDownloadText: false,
      saveAs: true
    };
    const state = await h.api.begin(h.tab);
    await h.api.collectorMessage({
      type: 'PC_DONE',
      id: state.job.id,
      url: h.tab.url,
      result: fixture()
    }, h.sender);
    assert.equal(h.downloads.length, 0);
    await h.api.download(await h.api.state());
    assert.equal(h.downloads.length, 1);
    assert.equal(h.downloads[0].saveAs, true);
  });
  await test('Actual service-worker listener routes archive messages only from the hidden archive document', async () => {
    const h = harness();
    const updates = [];
    h.archive.update = async message => {
      updates.push(message);
      return {
        ok: true
      };
    };
    const reply = await new Promise(resolve => {
      assert.equal(h.handlers.message({
        type: 'UK_ARCHIVE_UPDATE',
        id: 'archive-job',
        state: 'ready'
      }, {
        id: 'test-id',
        url: 'chrome-extension://test-id/src/offscreen/images.html'
      }, resolve), true);
    });
    assert(reply.ok);
    assert.equal(updates.length, 1);
    assert.equal(h.handlers.message({
      type: 'UK_ARCHIVE_UPDATE'
    }, {
      id: 'test-id',
      url: 'https://example.com',
      tab: {
        id: 1
      }
    }, () => assert.fail('Website message was accepted')), undefined);
    assert.equal(updates.length, 1);
  });
  await test('Stale document messages are ignored', async () => {
    const h = harness();
    const s = await h.api.begin(h.tab);
    const reply = await h.api.collectorMessage({
      type: 'PC_DONE',
      id: s.job.id,
      url: s.job.url,
      result: fixture()
    }, {
      ...h.sender,
      documentId: 'old-doc'
    });
    assert(reply.stale);
    assert.equal(h.downloads.length, 0);
  });
  await test('Valid completed capture auto-downloads, records actual completion and filename', async () => {
    const h = harness();
    const s = await h.api.begin(h.tab);
    await h.api.collectorMessage({
      type: 'PC_DONE',
      id: s.job.id,
      url: s.job.url,
      result: fixture()
    }, h.sender);
    const state = await h.api.state();
    assert.equal(h.downloads.length, 1);
    assert.equal(state.download.status, 'completed');
    assert.equal(state.download.filename, 'actual-name.txt');
    const text = decodeURIComponent(h.downloads[0].url.split(',').slice(1).join(','));
    assert(h.downloads[0].url.startsWith('data:text/plain;'));
    assert(text.includes('# Our services'));
    assert(!text.includes('schema_version'));
    assert(h.downloads[0].filename.endsWith('.txt'));
  });
  await test('Download failure retains capture and retry does not recapture', async () => {
    const h = harness();
    const s = await h.api.begin(h.tab);
    h.flags.downloadFail = true;
    await h.api.collectorMessage({
      type: 'PC_DONE',
      id: s.job.id,
      url: s.job.url,
      result: fixture()
    }, h.sender);
    assert.equal((await h.api.state()).download.status, 'failed');
    assert((await h.api.state()).result);
    h.flags.downloadFail = false;
    await h.api.download(await h.api.state());
    assert.equal((await h.api.state()).download.status, 'completed');
    assert.equal((await h.api.state()).job.id, s.job.id);
  });
  await test('Partial results never auto-download', async () => {
    const h = harness();
    const s = await h.api.begin(h.tab);
    await h.api.collectorMessage({
      type: 'PC_DONE',
      id: s.job.id,
      url: s.job.url,
      result: fixture('partial')
    }, h.sender);
    assert.equal(h.downloads.length, 0);
    await h.api.download(await h.api.state());
    assert.equal(h.downloads.length, 1);
    assert.equal((await h.api.state()).result.capture.status, 'partial');
  });
  await test('Navigation keeps checkpoint tied to original page and rejects late success', async () => {
    const h = harness();
    const s = await h.api.begin(h.tab);
    await h.api.collectorMessage({
      type: 'PC_PROGRESS',
      id: s.job.id,
      url: s.job.url,
      stage: 'scrolling',
      counts: {},
      result: fixture('partial')
    }, h.sender);
    h.tab.url = 'https://example.com/new';
    h.handlers.updated(1, {
      url: h.tab.url
    });
    await h.api.drain();
    assert.equal((await h.api.state()).result.capture.status, 'interrupted');
    const reply = await h.api.collectorMessage({
      type: 'PC_DONE',
      id: s.job.id,
      url: s.job.url,
      result: fixture()
    }, h.sender);
    assert(reply.stale);
    assert.equal(h.downloads.length, 0);
  });
  await test('Failed replacement preserves earlier result', async () => {
    const h = harness();
    const s = await h.api.begin(h.tab);
    await h.api.collectorMessage({
      type: 'PC_DONE',
      id: s.job.id,
      url: s.job.url,
      result: fixture()
    }, h.sender);
    const old = s.job.id;
    h.tab.url = 'chrome://settings';
    await h.api.begin(h.tab);
    assert.equal((await h.api.state()).previous.job.id, old);
  });
  await test('Storage quota failure reports non-persistence while allowing direct download', async () => {
    const h = harness();
    const s = await h.api.begin(h.tab);
    h.flags.storageFail = true;
    await h.api.collectorMessage({
      type: 'PC_DONE',
      id: s.job.id,
      url: s.job.url,
      result: fixture()
    }, h.sender);
    assert.equal((await h.api.state()).retention, 'memory');
    assert.equal(h.downloads.length, 1);
    assert.equal(h.data.session.captureState.result, null);
  });
  await test('Navigation-only captures do not auto-save an empty text file', async () => {
    const h = harness();
    const s = await h.api.begin(h.tab);
    const r = fixture();
    r.regions[0].type = 'navigation';
    await h.api.collectorMessage({
      type: 'PC_DONE',
      id: s.job.id,
      url: s.job.url,
      result: r
    }, h.sender);
    assert.equal(h.downloads.length, 0);
    assert.equal((await h.api.state()).job.stage, 'failed');
  });
  console.log(`Finished: ${passed} checks passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
