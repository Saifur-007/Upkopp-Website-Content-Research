const assert = require('node:assert/strict');
const fs = require('node:fs');
const Core = require('../src/shared/capture-core.js');
let next = 0;
const text = (type, value, extra = {}) => ({
  id: 'b' + ++next,
  type,
  text: value,
  inline: [{
    text: value,
    href: 'https://tracker.invalid/?unused=1'
  }],
  visibility: 'visible',
  ...extra
});
const section = (blocks, sections = []) => ({
  id: 's' + ++next,
  grouping_basis: 'semantic_container',
  blocks,
  sections,
  order: [...blocks, ...sections].map(item => item.id)
});
const cell = (value, row_span = 1, col_span = 1) => ({
  inline: [{
    text: value
  }],
  header: false,
  row_span,
  col_span
});
const child = section([text('heading', 'Seasonal work', {
  level: 3,
  semantic_source: 'h3'
}), text('paragraph', 'Same offer.')]);
const parent = section([text('heading', 'Garden care', {
  level: 1,
  semantic_source: 'h1'
}), text('paragraph', 'Exact wording: “£25”, café & soil.'), text('paragraph', 'Exact wording: “£25”, café & soil.'), text('paragraph', 'After the nested section.'), text('paragraph', 'HIDDEN_COPY', {
  visibility: 'hidden'
}), {
  id: 'img-block',
  type: 'image',
  image_id: 'image1',
  visibility: 'visible'
}, {
  id: 'list',
  type: 'list',
  visibility: 'visible',
  ordered: true,
  start: 3,
  items: [{
    inline: [{
      text: 'Prepare soil'
    }],
    children: [{
      ordered: false,
      start: 1,
      items: [{
        inline: [{
          text: 'Add compost'
        }],
        children: []
      }]
    }]
  }]
}, {
  id: 'table',
  type: 'table',
  visibility: 'visible',
  caption: 'Prices',
  rows: [[cell('Service'), cell('Price')], [cell('Garden care', 2), cell('£25')], [cell('£30')]]
}, {
  id: 'definitions',
  type: 'description_list',
  visibility: 'visible',
  entries: [{
    term: [{
      text: 'Hours'
    }],
    definitions: [[{
      text: 'Monday to Friday'
    }]]
  }]
}, text('link', 'Book a visit'), text('paragraph', '<img src=x onerror=alert(1)>')], [child]);
parent.order.splice(parent.order.indexOf(child.id), 1);
parent.order.splice(3, 0, child.id);
const sibling = section([text('paragraph', 'Same offer.')]);
const result = {
  schema_version: '1.0.0',
  page: {
    title: 'Garden services',
    url: 'https://example.com/services',
    site_name: 'Garden',
    language: 'en',
    captured_at: '2026-09-08T12:00:00Z'
  },
  regions: [{
    id: 'nav',
    type: 'navigation',
    sections: [section([text('link', 'MENU_ONLY')])]
  }, {
    id: 'main',
    type: 'main',
    sections: [parent, sibling]
  }, {
    id: 'footer',
    type: 'footer',
    sections: [section([text('paragraph', 'Contact: hello@example.com')])]
  }],
  images: [{
    id: 'image1',
    url: 'https://image.invalid/tracking.png',
    alt: 'ALT_NOT_COPY',
    caption: null,
    decorative: false,
    source_kind: 'img',
    association: {
      section_id: parent.id,
      related_block_ids: [],
      basis: 'shared_section',
      certainty: 'supported'
    }
  }],
  capture: {
    status: 'completed',
    checks: {
      schema_valid: true,
      comparison_pass_performed: true,
      observed_content_reconciled: true
    },
    warnings: [],
    limits_reached: [],
    counts: {},
    limits: Core.LIMITS,
    elapsed_ms: 1234
  }
};
assert.deepEqual(Core.validate(result), []);
const before = JSON.stringify(result);
const copy = Core.copyExport(result);
assert.equal(JSON.stringify(result), before, 'Projection must not mutate the retained capture');
for (const excluded of ['MENU_ONLY', 'HIDDEN_COPY', 'ALT_NOT_COPY', 'image.invalid', 'tracker.invalid', 'schema_version', 'grouping_basis', 'semantic_source', 'elapsed_ms', 'related_block_ids']) {
  assert(!copy.includes(excluded), excluded);
}
assert.equal(copy.split('Exact wording: “£25”, café & soil.').length - 1, 1);
assert.equal(copy.split('Same offer.').length - 1, 2, 'Do not delete repeated wording in distinct sections');
assert(copy.indexOf('### Seasonal work') < copy.indexOf('After the nested section.'));
assert(copy.includes('3. Prepare soil\n  - Add compost'));
assert(copy.includes('Garden care\t£30'), 'Spanning labels must stay associated with prices');
assert(copy.includes('Hours\nMonday to Friday'));
assert(copy.includes('Book a visit'));
assert(copy.includes('Contact: hello@example.com'));
assert(copy.includes('<img src=x onerror=alert(1)>'));
assert(!copy.includes('Capture note:'));
const json = JSON.parse(Core.copyExport(result, 'json'));
assert.deepEqual(Object.keys(json), ['title', 'url', 'content']);
assert.equal(json.content, Core.copyContent(result));
for (const status of ['partial', 'cancelled', 'interrupted']) {
  const partial = structuredClone(result);
  partial.capture.status = status;
  partial.capture.warnings = [{
    severity: 'warning',
    message: 'An embedded frame could not be read.'
  }, {
    severity: 'info',
    message: 'INTERNAL_IMAGE_NOTE'
  }];
  const output = Core.copyExport(partial);
  assert(output.includes('Capture ' + status));
  assert(output.includes('An embedded frame could not be read.'));
  assert(!output.includes('INTERNAL_IMAGE_NOTE'));
}
const oldBytes = Core.byteLength(Core.serialize(result));
const newBytes = Core.byteLength(copy);
assert(newBytes < oldBytes * 0.25, 'Text export should remove structural overhead');
console.log('PASS source fidelity, nested order, lists, table spans, definitions, CTA/footer, literal HTML, local deduplication, excluded metadata, partial notes, JSON option, and non-mutation');
console.log(JSON.stringify({
  fixtureOldBytes: oldBytes,
  fixtureTextBytes: newBytes,
  byteReductionPercent: Math.round(100 * (1 - newBytes / oldBytes))
}));
