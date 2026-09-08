const assert = require('node:assert/strict');
const Core = require('../src/shared/page-map-core.js');
const rows = [{
  id: 'a',
  level: 2,
  label: 'Start',
  warnings: []
}, {
  id: 'b',
  level: 4,
  label: 'Prices',
  warnings: []
}, {
  id: 'c',
  level: 3,
  label: 'Contact',
  warnings: []
}, {
  id: 'd',
  level: 1,
  label: '',
  warnings: []
}, {
  id: 'e',
  level: 2,
  label: 'Hidden',
  hidden: true,
  warnings: []
}];
const tree = Core.headingTree(rows);
assert.equal(tree.length, 4);
assert(tree[0].warnings[0].includes('not H1'));
assert(tree[1].warnings[0].includes('jumps'));
assert.equal(tree[1].parent, 'a');
assert.equal(tree[2].parent, 'a');
assert.equal(tree[3].parent, null);
assert(tree[3].warnings[0].includes('no text'));
assert.equal(Core.headingTree(rows, {
  showHidden: true,
  showEmpty: false
}).length, 4);
assert.deepEqual(Core.filterTree(tree, 'prices').map(r => r.id), ['a', 'b']);
assert.deepEqual(Core.filterTree(tree, '', new Set(['a'])).map(r => r.id), ['a', 'd']);
assert(Core.outlineText(tree, 'headings').includes('  H4 Prices'));
const landmarks = Core.landmarkTree([{
  id: '1',
  role: 'main',
  label: '',
  parent: null
}, {
  id: '2',
  role: 'main',
  label: '',
  parent: '1'
}, {
  id: '3',
  role: 'navigation',
  label: 'Same'
}, {
  id: '4',
  role: 'navigation',
  label: 'Same'
}]);
assert(landmarks[0].warnings.some(w => w.includes('More than one')));
assert(landmarks[1].warnings.some(w => w.includes('nesting')));
assert(landmarks[3].warnings.some(w => w.includes('distinct')));
assert(Core.landmarkTree(landmarks, {
  landmarkTop: false,
  landmarkUnique: false,
  landmarkLabels: false
}).every(row => row.warnings.length === 0));
const sections = Core.sectionTree([{
  id: '1',
  label: 'A',
  parent: null
}, {
  id: '2',
  label: 'B',
  parent: '1'
}, {
  id: '3',
  label: '',
  parent: '1'
}]);
assert.equal(sections[1].index, '1.1');
assert.equal(sections[2].index, '1.2');
assert.equal(sections[2].depth, 1);
assert(sections[2].warnings.length);
console.log('PASS heading hierarchy, empty/hidden filters, search ancestry, collapse, text outline, landmark checks and section numbering');
