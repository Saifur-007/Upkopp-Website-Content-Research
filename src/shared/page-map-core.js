/* Original page-map model. Independent of the text-export contract. */
(() => {
  const defaults = Object.freeze({
    showLevels: true,
    showWarnings: true,
    firstH1: true,
    showHidden: false,
    showEmpty: true,
    ariaNames: true,
    highlight: true,
    anchors: true,
    viewport: true,
    wrap: true,
    tooltips: true,
    tools: true,
    live: true,
    landmarks: true,
    sections: true,
    sectionTags: true,
    sectionIndex: true,
    landmarkTop: true,
    landmarkUnique: true,
    landmarkLabels: true,
    theme: 'system',
    language: 'en',
    offset: 80
  });
  function headingTree(items, options = {}) {
    const opts = {
      ...defaults,
      ...options
    };
    const stack = [];
    const out = [];
    for (const item of items.filter(item => (opts.showHidden || !item.hidden) && (opts.showEmpty || item.label))) {
      const node = {
        ...item,
        warnings: [...(item.warnings || [])]
      };
      while (stack.length && stack.at(-1).level >= node.level) {
        stack.pop();
      }
      node.parent = stack.at(-1)?.id || null;
      node.depth = stack.length;
      if (!out.length && opts.firstH1 && node.level !== 1) {
        node.warnings.push('The first heading is not H1.');
      }
      if (out.length && node.level > out.at(-1).level + 1) {
        node.warnings.push('Heading level jumps from H' + out.at(-1).level + ' to H' + node.level + '.');
      }
      if (!node.label) {
        node.warnings.push('This heading has no text.');
      }
      out.push(node);
      stack.push(node);
    }
    return out;
  }
  function landmarkTree(items, options = {}) {
    const opts = {
      ...defaults,
      ...options
    };
    const out = items.filter(item => opts.showHidden || !item.hidden).map(item => ({
      ...item,
      warnings: []
    }));
    const ids = new Map(out.map(item => [item.id, item]));
    for (const item of out) {
      let parent = item.parent;
      const visited = new Set();
      item.depth = 0;
      while (parent && ids.has(parent) && !visited.has(parent)) {
        visited.add(parent);
        item.depth++;
        parent = ids.get(parent).parent;
      }
      if (!ids.has(item.parent)) {
        item.parent = null;
      }
      if (opts.landmarkTop && item.depth && ['banner', 'main', 'complementary', 'contentinfo'].includes(item.role)) {
        item.warnings.push('Review nesting: ' + item.role + ' is usually a top-level landmark.');
      }
      const peers = out.filter(other => other.role === item.role);
      if (opts.landmarkUnique && peers.length > 1 && ['banner', 'main', 'contentinfo'].includes(item.role)) {
        item.warnings.push('More than one ' + item.role + ' landmark in this document.');
      }
      if (opts.landmarkLabels && peers.length > 1 && (!item.label || peers.some(other => other.id !== item.id && other.label === item.label))) {
        item.warnings.push('Repeated landmarks should have distinct names; review whether they serve the same purpose.');
      }
    }
    return out;
  }
  function sectionTree(items, options = {}) {
    const opts = {
      ...defaults,
      ...options
    };
    const out = items.filter(item => opts.showHidden || !item.hidden).map(item => ({
      ...item,
      warnings: item.label ? [] : ['This section has no heading or accessible name.']
    }));
    const byId = new Map(out.map(item => [item.id, item]));
    const numbers = new Map();
    for (const item of out) {
      const parent = byId.get(item.parent);
      item.depth = parent ? parent.depth + 1 : 0;
      if (!parent) {
        item.parent = null;
      }
      const count = (numbers.get(item.parent) || 0) + 1;
      numbers.set(item.parent, count);
      item.index = (parent ? parent.index + '.' : '') + count;
    }
    return out;
  }
  function filterTree(items, query = '', collapsed = new Set()) {
    const q = query.trim().toLocaleLowerCase();
    const ids = new Map(items.map(item => [item.id, item]));
    if (q) {
      const keep = new Set();
      for (const item of items) {
        if ((item.label + ' ' + (item.role || '') + ' ' + item.warnings.join(' ')).toLocaleLowerCase().includes(q)) {
          let cursor = item;
          while (cursor && !keep.has(cursor.id)) {
            keep.add(cursor.id);
            cursor = ids.get(cursor.parent);
          }
        }
      }
      return items.filter(item => keep.has(item.id));
    }
    return items.filter(item => {
      let parent = item.parent;
      const seen = new Set();
      while (parent && !seen.has(parent)) {
        if (collapsed.has(parent)) {
          return false;
        }
        seen.add(parent);
        parent = ids.get(parent)?.parent;
      }
      return true;
    });
  }
  function outlineText(items, kind) {
    return items.map(item => '  '.repeat(Math.min(item.depth, 20)) + (kind === 'headings' ? 'H' + item.level + ' ' : kind === 'landmarks' ? item.role + ': ' : item.index + ' ') + (item.label || '(unnamed)') + (item.hidden ? ' [hidden]' : '')).join('\n');
  }
  globalThis.UpkoppMapCore = {
    defaults,
    headingTree,
    landmarkTree,
    sectionTree,
    filterTree,
    outlineText
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = UpkoppMapCore;
  }
})();
