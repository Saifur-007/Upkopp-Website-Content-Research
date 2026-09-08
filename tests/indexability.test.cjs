const assert = require('node:assert/strict');
const {
  test
} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/content/indexability.js'), 'utf8');
const document = {
  baseURI: 'https://example.com/page',
  querySelectorAll: () => [],
  querySelector: () => null
};
function read(fetch) {
  return vm.runInNewContext(source, {
    document,
    location: {
      href: document.baseURI
    },
    URL,
    fetch,
    AbortController,
    setTimeout,
    clearTimeout,
    TextDecoder,
    DOMParser: class {
      parseFromString() {
        return document;
      }
    }
  });
}
test('Blocked requests are reported as unavailable rather than missing raw canonical tags', async () => {
  const data = await read(async () => {
    throw new TypeError('Blocked');
  });
  assert.equal(data.canonical.raw, null);
  assert.match(data.response.error, /blocked/);
  assert.match(data.robotsTxt.error, /blocked/);
  assert.equal(data.robotsTxt.text, null);
});
test('Oversized HTML is bounded and never treated as a complete raw response', async () => {
  let cancelled = false;
  const data = await read(async url => url.endsWith('robots.txt') ? new Response('', {
    status: 404
  }) : {
    status: 200,
    url,
    headers: new Headers({
      'Content-Type': 'text/html'
    }),
    body: {
      getReader: () => ({
        read: async () => ({
          done: false,
          value: new Uint8Array(2000001)
        }),
        cancel: async () => {
          cancelled = true;
        }
      })
    }
  });
  assert(cancelled);
  assert.equal(data.canonical.raw, null);
  assert.match(data.response.error, /2 MB/);
  assert.equal(data.robotsTxt.status, 404);
});
test('Empty HTTP responses preserve the actual status', async () => {
  const data = await read(async () => new Response(null, {
    status: 204
  }));
  assert.equal(data.response.status, 204);
  assert.equal(data.robotsTxt.status, 204);
  assert.equal(data.canonical.raw, null);
});
