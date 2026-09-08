const assert = require('node:assert/strict');
const {
  test
} = require('node:test');
const Core = require('../src/shared/research-core.js');
require('../src/shared/page-map-core.js');
const page = {
  url: 'https://example.com/page',
  title: 'Original title',
  description: 'Original description',
  language: 'en',
  wordCount: 12,
  blocks: [{
    type: 'heading',
    level: 1,
    text: 'A title'
  }, {
    type: 'paragraph',
    text: '<strong>Literal copy</strong>'
  }],
  images: [{
    number: 1,
    src: 'data:image/png;base64,' + 'a'.repeat(100000),
    alt: 'Original alt',
    visible: true
  }, {
    number: 2,
    src: 'https://example.com/image.png',
    alt: null,
    visible: false
  }],
  social: {
    openGraph: [{
      name: 'og:title',
      content: 'Social title'
    }],
    twitter: []
  },
  limitations: []
};
const map = {
  url: page.url,
  tabId: 1,
  documents: [{
    frameId: 0,
    title: page.title,
    url: page.url,
    epoch: 'do-not-export',
    scanCount: 2,
    headings: [{
      id: 'h1',
      level: 1,
      label: 'A title'
    }, {
      id: 'h2',
      level: 3,
      label: 'Nested heading',
      hidden: true
    }],
    landmarks: [{
      id: 'main',
      role: 'main',
      label: 'Page body',
      parent: null
    }],
    sections: [{
      id: 's1',
      tag: 'section',
      label: 'Services'
    }, {
      id: 's2',
      parent: 's1',
      tag: 'article',
      label: 'Details'
    }]
  }]
};
test('JSON combines every Content field with readable headings, landmarks, and sections', () => {
  const output = Core.jsonExport(page, null, null, {}, map);
  assert.deepEqual(Object.keys(output), ['url', 'content', 'pageMap']);
  assert.deepEqual(output.content, {
    title: page.title,
    description: page.description,
    wordCount: 12,
    text: '# A title\n\n<strong>Literal copy</strong>'
  });
  const doc = output.pageMap.documents[0];
  assert.equal(doc.headings.length, 2);
  assert.equal(doc.headings[1].hidden, true);
  assert(doc.headings[1].notes[0].includes('level jumps'));
  assert.equal(doc.landmarks[0].role, 'main');
  assert.equal(doc.sections[1].section, '1.1');
  for (const internal of ['do-not-export', 'scanCount', 'Original alt', 'data:image', 'visibleIds']) {
    assert(!JSON.stringify(output).includes(internal));
  }
});
test('Optional alt text remains unique, while description is always part of Content', () => {
  const output = Core.jsonExport({
    ...page,
    images: [...page.images, page.images[0], {
      alt: '  '
    }]
  }, null, null, {
    jsonAltText: true
  }, map);
  assert.equal(output.content.description, page.description);
  assert.deepEqual(output.imageAltText, ['Original alt']);
});
test('Matching capture supplies fuller text; stale documents and maps cannot replace current content', () => {
  const state = {
    job: {
      tabId: 1,
      documentId: 'doc'
    },
    result: {
      page: {
        url: page.url
      },
      capture: {
        status: 'partial',
        warnings: [{
          severity: 'warning',
          message: 'Some content unavailable'
        }]
      }
    }
  };
  const captureCore = {
    copyContent: () => 'Captured paragraphs'
  };
  const current = {
    ...page,
    tabId: 1,
    documentId: 'doc'
  };
  assert.equal(Core.jsonExport(current, state, captureCore, {}, map).content.text, 'Captured paragraphs');
  assert(Core.jsonExport(current, state, captureCore, {}, map).note.includes('Some content unavailable'));
  assert.equal(Core.jsonExport({
    ...current,
    documentId: 'new'
  }, state, captureCore, {}, map).content.text, Core.contentText(page.blocks));
  assert.throws(() => Core.jsonExport(current, state, captureCore, {}, {
    ...map,
    url: 'https://other.example'
  }), /does not match/);
  assert.throws(() => Core.jsonExport(current, state, captureCore, {}, {
    ...map,
    paused: true
  }), /Finish text capture/);
});
test('Map export preserves inaccessible document and collection-limit notes without dropping available sections', () => {
  const output = Core.jsonExport(page, null, null, {}, {
    ...map,
    frameLimit: true,
    documents: [...map.documents, {
      url: 'https://other.example',
      title: 'Frame',
      error: 'Access unavailable'
    }]
  });
  assert.equal(output.pageMap.documents.length, 2);
  assert.equal(output.pageMap.documents[1].note, 'Access unavailable');
  assert(output.pageMap.note.includes('30 documents'));
});
test('Image URLs exclude executable and non-website schemes', () => {
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hello', 'chrome://settings']) {
    assert.equal(Core.safeImageURL(url), false);
  }
  assert(Core.safeImageURL('data:image/svg+xml;charset=utf-8,%3Csvg%3E'));
});
test('Content exports include only dates actually provided by the page', () => {
  const withDates = Core.jsonExport({
    ...page,
    dates: {
      published: '2026-08-01',
      modified: null
    }
  }, null, null, {}, map);
  assert.deepEqual(withDates.content.dates, {
    published: '2026-08-01'
  });
  const withoutDates = Core.jsonExport({
    ...page,
    dates: {
      published: null,
      modified: null
    }
  }, null, null, {}, map);
  assert(!('dates' in withoutDates.content));
});
