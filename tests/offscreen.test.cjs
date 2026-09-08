const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  test
} = require('node:test');
test('Offscreen worker accepts trusted requests, owns a real ZIP Blob, and sends progress before download', async () => {
  let listener;
  const messages = [];
  let finish;
  const ready = new Promise(resolve => {
    finish = resolve;
  });
  const Zip = require('../src/shared/zip-core.js');
  const context = vm.createContext({
    console,
    URL: {
      createObjectURL: blob => {
        assert.equal(blob.type, 'application/zip');
        return 'blob:chrome-extension://upkopp/zip';
      }
    },
    chrome: {
      runtime: {
        id: 'upkopp',
        getURL: value => 'chrome-extension://upkopp/' + value,
        onMessage: {
          addListener: value => {
            listener = value;
          }
        },
        sendMessage: async message => {
          messages.push(message);
          if (message.state === 'ready') {
            finish();
          }
          return {
            ok: true
          };
        }
      }
    },
    UpkoppImageArchive: {
      build: async (images, notify) => {
        await notify({
          processed: 1,
          included: 1,
          failures: []
        });
        return Zip.create([{
          name: 'image-0001.svg',
          bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')
        }]);
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/offscreen/images.js'), 'utf8'), context);
  listener({
    type: 'UK_ARCHIVE_BUILD'
  }, {
    id: 'upkopp',
    tab: {
      id: 1
    }
  }, () => assert.fail('Page scripts must be rejected'));
  listener({
    type: 'UK_ARCHIVE_BUILD',
    id: 'job',
    images: [{
      src: 'data:image/svg+xml,example'
    }]
  }, {
    id: 'upkopp',
    url: 'chrome-extension://upkopp/src/background/service-worker.js'
  }, response => assert(response.ok));
  await ready;
  assert.equal(messages[0].state, 'preparing');
  assert.equal(messages[1].state, 'ready');
  assert.equal(messages[1].id, 'job');
  assert.equal(messages[1].blobURL, 'blob:chrome-extension://upkopp/zip');
});
