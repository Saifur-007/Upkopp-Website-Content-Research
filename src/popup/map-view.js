(() => {
  const Core = UpkoppMapCore;
  const $ = id => document.getElementById(id);
  if (!$('map-view') || !globalThis.chrome?.runtime?.id) {
    return;
  }
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) {
      node.textContent = text;
    }
    if (cls) {
      node.className = cls;
    }
    return node;
  };
  let settings = {
    ...Core.defaults
  };
  let data = null;
  let kind = 'headings';
  let selectedFrame = 0;
  let selectedId = null;
  let collapsed = new Set();
  let rows = [];
  let visibleRows = [];
  let reveal = false;
  let loading = false;
  let windowId;
  let view = 'content';
  let rowLimit = 200;
  let signature = '';
  const shortcutsDefault = {
    search: '/',
    refresh: 'r',
    copy: 'shift+c',
    reveal: 'shift+h',
    settings: 'shift+s',
    focus: 'shift+f',
    help: '?'
  };
  let shortcuts = {
    ...shortcutsDefault
  };
  const status = text => {
    $('map-status').textContent = text;
  };
  async function request(type, extra = {}) {
    const response = await chrome.runtime.sendMessage({
      type,
      windowId,
      ...extra
    });
    if (response?.error) {
      throw Error(response.error);
    }
    return response;
  }
  function currentDoc() {
    return data?.documents?.find(doc => doc.frameId === selectedFrame);
  }
  async function pageAction(action, extra = {}) {
    const doc = currentDoc();
    if (!doc || doc.error) {
      return;
    }
    try {
      await request('PM_ACTION', {
        tabId: data.tabId,
        frameId: doc.frameId,
        epoch: doc.epoch,
        url: doc.url,
        action,
        kind,
        highlight: settings.highlight,
        offset: settings.offset,
        ...extra
      });
    } catch (error) {
      status(error.message);
    }
  }
  globalThis.UpkoppMap = {
    setView: switchView
  };
  function switchView(next) {
    view = next;
    $('map-view').hidden = next !== 'map';
    $('content').hidden = next !== 'capture';
    if (next === 'map') {
      load(true);
    } else {
      if (reveal) {
        pageAction('reveal', {
          enabled: false
        });
      }
      reveal = false;
      $('map-reveal').setAttribute('aria-pressed', 'false');
    }
  }
  async function load(force = false) {
    if (loading || view !== 'map' && !force) {
      return;
    }
    loading = true;
    try {
      const next = await request('PM_GET', {
        force
      });
      if (!next) {
        throw Error('Open a website and click the extension icon.');
      }
      if (next.paused) {
        status('Text capture is running. The map will resume when it finishes.');
        $('map-tree').replaceChildren();
        $('map-summary').textContent = '';
        data = next;
        return;
      }
      const old = currentDoc();
      const changedPage = data?.tabId !== next.tabId || data?.url !== next.url;
      data = next;
      if (changedPage || !data.documents.some(doc => doc.frameId === selectedFrame)) {
        selectedFrame = 0;
        collapsed.clear();
        rowLimit = 200;
        selectedId = null;
        reveal = false;
      }
      if (old && old.epoch !== currentDoc()?.epoch) {
        selectedId = null;
        collapsed.clear();
      }
      $('map-title').textContent = data.title || 'Untitled page';
      $('map-url').textContent = data.url;
      const selectSignature = JSON.stringify(data.documents.map(doc => [doc.frameId, doc.title, doc.url, doc.error]));
      if ($('map-document').dataset.signature !== selectSignature) {
        $('map-document').replaceChildren(...data.documents.map(doc => {
          const option = el('option', (doc.frameId === 0 ? 'Main: ' : 'Frame: ') + (doc.title || doc.url) + (doc.error ? ' · access needed' : ''));
          option.value = doc.frameId;
          return option;
        }));
        $('map-document').dataset.signature = selectSignature;
      }
      $('map-document').value = String(selectedFrame);
      status(settings.live ? 'Live map · updates as the page changes' : 'Manual updates · choose Refresh when needed');
      render();
    } catch (error) {
      status(error.message);
      if (!data) {
        $('map-tree').replaceChildren();
      }
    } finally {
      loading = false;
    }
  }
  function render() {
    UpkoppMapLanguage.apply(settings.language);
    $('map-reveal').setAttribute('aria-pressed', String(reveal));
    const doc = currentDoc();
    $('map-tools').hidden = !settings.tools;
    $('map-tree').classList.toggle('no-wrap', !settings.wrap);
    document.querySelector('[data-kind="landmarks"]').hidden = !settings.landmarks;
    document.querySelector('[data-kind="sections"]').hidden = !settings.sections;
    if (!settings.landmarks && kind === 'landmarks' || !settings.sections && kind === 'sections') {
      kind = 'headings';
    }
    document.querySelectorAll('[data-kind]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.kind === kind)));
    $('map-access').hidden = !doc?.error || !/^https?:/.test(doc.url || '') || doc.frameId === 0;
    const notice = doc?.error || (data?.frameLimit ? 'Only the first 30 documents are listed. ' : '') + (doc?.limited ? 'This large document reached the map limit. Some items may be missing. ' : '') + (kind === 'sections' ? 'Sections are source containers. Warnings are review suggestions, not a browser accessibility outline.' : '');
    $('map-notice').textContent = notice;
    $('map-notice').hidden = !notice;
    if (!doc || doc.error) {
      rows = [];
      visibleRows = [];
      $('map-tree').replaceChildren();
      $('map-summary').textContent = '';
      $('map-more').hidden = true;
      return;
    }
    rows = kind === 'headings' ? Core.headingTree(doc.headings, settings) : kind === 'landmarks' ? Core.landmarkTree(doc.landmarks, settings) : Core.sectionTree(doc.sections, settings);
    const q = $('map-search').value;
    visibleRows = Core.filterTree(rows, q, collapsed);
    const warnings = rows.filter(row => row.warnings.length).length;
    let summary = rows.length + ' ' + kind + (settings.showWarnings ? ' · ' + warnings + ' to review' : '');
    if (q) {
      summary += ' · ' + visibleRows.length + ' shown with context';
    }
    if (kind === 'landmarks' && !rows.some(row => row.role === 'main')) {
      summary += ' · No main landmark found';
    }
    $('map-summary').textContent = summary;
    $('map-more').hidden = visibleRows.length <= rowLimit;
    const visibleSet = new Set(doc.visibleIds || []);
    const nextSignature = JSON.stringify([kind, visibleRows.slice(0, rowLimit), [...collapsed], q, settings, selectedId]);
    if (nextSignature === signature) {
      for (const node of $('map-tree').querySelectorAll('[data-node]')) {
        node.classList.toggle('in-viewport', settings.viewport && visibleSet.has(node.dataset.node));
      }
      return;
    }
    signature = nextSignature;
    const focused = document.activeElement?.dataset?.node;
    const root = el('ul', undefined, 'map-list');
    root.setAttribute('role', 'tree');
    root.setAttribute('aria-label', kind + ' structure');
    const containers = new Map();
    const hasChildren = new Set(rows.map(row => row.parent).filter(Boolean));
    for (const row of visibleRows.slice(0, rowLimit)) {
      const item = el('li', undefined, 'map-node');
      item.setAttribute('role', 'treeitem');
      item.dataset.node = row.id;
      item.tabIndex = row.id === (selectedId || visibleRows[0]?.id) ? 0 : -1;
      item.setAttribute('aria-level', String(row.depth + 1));
      item.setAttribute('aria-selected', String(row.id === selectedId));
      item.classList.toggle('in-viewport', settings.viewport && visibleSet.has(row.id));
      if (hasChildren.has(row.id)) {
        item.setAttribute('aria-expanded', String(!!q || !collapsed.has(row.id)));
      }
      const line = el('div', undefined, 'map-line');
      const toggle = el('button', hasChildren.has(row.id) ? collapsed.has(row.id) && !q ? '▸' : '▾' : '·', 'branch-toggle');
      toggle.type = 'button';
      toggle.tabIndex = -1;
      toggle.disabled = !hasChildren.has(row.id);
      toggle.setAttribute('aria-label', (collapsed.has(row.id) ? 'Expand ' : 'Collapse ') + (row.label || 'unnamed item'));
      toggle.onclick = event => {
        event.stopPropagation();
        toggleBranch(row.id);
      };
      const label = (kind === 'headings' && settings.showLevels ? 'H' + row.level + ' ' : kind === 'landmarks' ? row.role + ' · ' : kind === 'sections' ? (settings.sectionIndex ? row.index + ' ' : '') + (settings.sectionTags ? row.tag + ' · ' : '') : '') + (row.label || '(unnamed)');
      item.setAttribute('aria-label', label + (row.hidden ? ' · hidden' : '') + (settings.showWarnings && row.warnings.length ? ' · ' + row.warnings.join(' ') : ''));
      const jump = el('button', label, 'map-jump');
      jump.tabIndex = -1;
      jump.onclick = event => {
        event.stopPropagation();
        jumpTo(row);
      };
      if (settings.tooltips) {
        jump.title = [row.tag, row.hidden ? 'Hidden from assistive technology' : 'Available in the document', ...row.warnings].join(' · ');
      }
      line.append(toggle, jump);
      if (settings.anchors && row.href) {
        const anchor = el('a', '↗', 'map-anchor');
        anchor.href = row.href;
        anchor.title = 'Copy link to this item';
        anchor.setAttribute('aria-label', 'Copy link to ' + (row.label || 'item'));
        anchor.tabIndex = -1;
        anchor.onclick = event => {
          event.preventDefault();
          event.stopPropagation();
          copy(row.href, 'Link copied');
        };
        line.append(anchor);
      }
      item.append(line);
      if (row.hidden) {
        item.append(el('span', 'Hidden', 'map-badge'));
      }
      if (settings.showWarnings && row.warnings.length) {
        const warning = el('p', row.warnings.join(' '), 'map-warning');
        item.append(warning);
      }
      item.addEventListener('focus', () => {
        selectedId = row.id;
        for (const other of $('map-tree').querySelectorAll('[data-node]')) {
          other.tabIndex = other === item ? 0 : -1;
        }
      });
      item.onclick = event => {
        if (event.target === item) {
          jumpTo(row);
        }
      };
      (containers.get(row.parent) || root).append(item);
      const group = el('ul', undefined, 'map-list');
      group.setAttribute('role', 'group');
      item.append(group);
      containers.set(row.id, group);
    }
    if (!visibleRows.length) {
      $('map-tree').replaceChildren(el('p', q ? 'No matching items.' : 'No ' + kind + ' found with the current filters.', 'caption'));
    } else {
      $('map-tree').replaceChildren(root);
    }
    if (focused) {
      $('map-tree').querySelector('[data-node="' + focused + '"]')?.focus({
        preventScroll: true
      });
    }
  }
  function toggleBranch(id) {
    collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
    render();
  }
  function jumpTo(row) {
    selectedId = row.id;
    pageAction('jump', {
      id: row.id
    });
    render();
    $('map-tree').querySelector('[data-node="' + row.id + '"]')?.focus({
      preventScroll: true
    });
  }
  async function copy(value, message = 'Map copied') {
    try {
      await navigator.clipboard.writeText(value);
      status(message);
    } catch {
      status('Clipboard access failed. Select the preview text and copy it manually.');
    }
  }
  function copyMap() {
    const doc = currentDoc();
    if (!doc || doc.error) {
      return;
    }
    copy([doc.title, doc.url, Core.outlineText(Core.filterTree(rows, $('map-search').value), kind)].join('\n\n'));
  }
  function expandLevel(value) {
    collapsed.clear();
    if (value !== 'all') {
      for (const row of rows) {
        if ((kind === 'headings' ? row.level : row.depth + 1) >= Number(value)) {
          collapsed.add(row.id);
        }
      }
    }
    render();
  }
  async function saveSettings() {
    await chrome.storage.local.set({
      mapSettings: settings
    });
    signature = '';
    render();
  }
  function checkbox(key, label) {
    const wrap = el('label', undefined, 'map-check');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = !!settings[key];
    input.onchange = async () => {
      settings[key] = input.checked;
      await saveSettings();
      if (key === 'ariaNames') {
        load(true);
      }
    };
    wrap.append(input, document.createTextNode(label));
    return wrap;
  }
  function buildSettings() {
    const host = $('map-settings-fields');
    host.replaceChildren();
    const languageLabel = el('label', 'Map language', 'field');
    const language = el('select');
    for (const [value, label] of [['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['pl', 'Polski'], ['ja', '日本語']]) {
      const option = el('option', label);
      option.value = value;
      language.append(option);
    }
    language.value = settings.language;
    language.onchange = () => {
      settings.language = language.value;
      saveSettings();
    };
    languageLabel.append(language);
    host.append(languageLabel, el('p', 'Map controls are translated. Source text stays in its original language; review messages and help remain in English.', 'caption'));
    const groups = [['Reading the map', [['showLevels', 'Show heading levels'], ['showEmpty', 'Include empty headings'], ['showHidden', 'Include hidden headings and sections'], ['ariaNames', 'Use accessible names (ARIA)'], ['landmarks', 'Enable landmarks'], ['sections', 'Enable sections'], ['sectionTags', 'Show section tags'], ['sectionIndex', 'Show section numbers']]], ['Review checks', [['showWarnings', 'Show review warnings'], ['firstH1', 'Flag first heading when it is not H1'], ['landmarkTop', 'Review nested top-level landmarks'], ['landmarkUnique', 'Review duplicate main, banner and footer landmarks'], ['landmarkLabels', 'Review repeated landmark names']]], ['Display and updates', [['highlight', 'Highlight an item when clicked'], ['anchors', 'Show copyable anchor links'], ['viewport', 'Mark items currently in view'], ['wrap', 'Wrap long heading text'], ['tooltips', 'Show item details on hover'], ['tools', 'Show search and map tools'], ['live', 'Update automatically']]]];
    for (const [title, fields] of groups) {
      const group = el('fieldset');
      group.append(el('legend', title));
      fields.forEach(([key, label]) => group.append(checkbox(key, label)));
      host.append(group);
    }
    const offsetLabel = el('label', 'Space above a scrolled heading (px)', 'field');
    const offset = el('input');
    offset.type = 'number';
    offset.min = 0;
    offset.max = 300;
    offset.step = 4;
    offset.value = settings.offset;
    offset.onchange = () => {
      settings.offset = Math.round(Math.min(300, Math.max(0, Number(offset.value) || 0)) / 4) * 4;
      offset.value = settings.offset;
      saveSettings();
    };
    offsetLabel.append(offset);
    host.append(offsetLabel);
    const reset = el('button', 'Reset map settings');
    reset.onclick = async () => {
      settings = {
        ...Core.defaults
      };
      await saveSettings();
      buildSettings();
      load(true);
    };
    host.append(reset);
  }
  function buildShortcuts() {
    const host = $('map-shortcuts');
    host.replaceChildren();
    for (const [action, label] of Object.entries({
      search: 'Search',
      refresh: 'Refresh',
      copy: 'Copy map',
      reveal: 'Show on page',
      settings: 'Settings',
      focus: 'Focus tree',
      help: 'Help'
    })) {
      const wrap = el('label', label, 'field');
      const input = el('input');
      input.value = shortcuts[action];
      input.setAttribute('aria-label', label + ' shortcut');
      input.onchange = async () => {
        const value = input.value.trim().toLowerCase();
        if (!/^(?:(?:ctrl|alt|shift|meta)\+)*[a-z0-9/?.,;]$/.test(value) || Object.entries(shortcuts).some(([key, keyValue]) => key !== action && keyValue === value)) {
          status('Use a unique shortcut such as shift+c.');
          input.value = shortcuts[action];
          return;
        }
        shortcuts[action] = value;
        await chrome.storage.local.set({
          mapShortcuts: shortcuts
        });
        status('Shortcut saved');
      };
      wrap.append(input);
      host.append(wrap);
    }
  }
  $('map-capture').onclick = async () => {
    try {
      if (reveal) {
        await pageAction('reveal', {
          enabled: false
        });
      }
      reveal = false;
      await request('PC_START_CURRENT');
      switchView('capture');
      globalThis.UpkoppUI?.show('capture');
    } catch (error) {
      status(error.message);
    }
  };
  $('map-refresh').onclick = () => load(true);
  $('map-copy').onclick = copyMap;
  $('map-top').onclick = () => pageAction('top');
  $('map-reveal').onclick = () => {
    reveal = !reveal;
    pageAction('reveal', {
      enabled: reveal
    });
    $('map-reveal').setAttribute('aria-pressed', String(reveal));
  };
  $('map-search').oninput = () => {
    rowLimit = 200;
    render();
  };
  $('map-depth').onchange = event => expandLevel(event.target.value);
  $('map-more').onclick = () => {
    rowLimit += 200;
    render();
  };
  $('map-document').onchange = () => {
    pageAction('reveal', {
      enabled: false
    });
    reveal = false;
    selectedFrame = Number($('map-document').value);
    collapsed.clear();
    selectedId = null;
    rowLimit = 200;
    signature = '';
    render();
  };
  document.querySelectorAll('[data-kind]').forEach(button => button.onclick = () => {
    if (reveal) {
      pageAction('reveal', {
        enabled: false
      });
    }
    reveal = false;
    kind = button.dataset.kind;
    collapsed.clear();
    $('map-depth').value = 'all';
    rowLimit = 200;
    signature = '';
    render();
  });
  $('map-access').onclick = async () => {
    try {
      const doc = currentDoc();
      const url = new URL(doc.url);
      const granted = await chrome.permissions.request({
        origins: [url.protocol + '//' + url.hostname + '/*']
      });
      if (granted) {
        load(true);
      } else {
        status('Access was not granted. The main-page map still works.');
      }
    } catch (error) {
      status(error.message);
    }
  };
  $('map-reset-shortcuts').onclick = async () => {
    shortcuts = {
      ...shortcutsDefault
    };
    await chrome.storage.local.set({
      mapShortcuts: shortcuts
    });
    buildShortcuts();
  };
  $('map-tree').onkeydown = event => {
    const item = event.target.closest('[data-node]');
    if (!item) {
      return;
    }
    const index = visibleRows.findIndex(row => row.id === item.dataset.node);
    const row = visibleRows[index];
    if (!row) {
      return;
    }
    let target;
    if (event.key === 'ArrowDown') {
      target = visibleRows[index + 1];
    } else if (event.key === 'ArrowUp') {
      target = visibleRows[index - 1];
    } else if (event.key === 'Home') {
      target = visibleRows[0];
    } else if (event.key === 'End') {
      target = visibleRows[Math.min(rowLimit, visibleRows.length) - 1];
    } else if (event.key === 'ArrowRight') {
      collapsed.delete(row.id);
      render();
      target = visibleRows[index + 1]?.parent === row.id ? visibleRows[index + 1] : row;
    } else if (event.key === 'ArrowLeft') {
      if (rows.some(other => other.parent === row.id) && !collapsed.has(row.id)) {
        collapsed.add(row.id);
        render();
      } else {
        target = rows.find(other => other.id === row.parent);
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      jumpTo(row);
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (target) {
      $('map-tree').querySelector('[data-node="' + target.id + '"]')?.focus();
    }
  };
  document.addEventListener('keydown', event => {
    if (view !== 'map' || event.target.closest('input,textarea,select,[contenteditable]')) {
      return;
    }
    const chord = [event.ctrlKey ? 'ctrl' : null, event.altKey ? 'alt' : null, event.shiftKey ? 'shift' : null, event.metaKey ? 'meta' : null, event.key.toLowerCase()].filter(Boolean).join('+');
    const action = Object.keys(shortcuts).find(key => shortcuts[key] === chord || shortcuts[key] === event.key && event.key === '?');
    if (!action) {
      if (/^[1-6]$/.test(event.key) && !event.ctrlKey && !event.altKey) {
        expandLevel(event.key);
        event.preventDefault();
      }
      return;
    }
    event.preventDefault();
    ({
      search: () => {
        $('map-tools').hidden = false;
        $('map-tools').open = true;
        $('map-search').focus();
      },
      refresh: () => load(true),
      copy: copyMap,
      reveal: () => $('map-reveal').click(),
      settings: () => {
        $('map-settings').open = true;
        $('map-settings').querySelector('summary').focus();
      },
      focus: () => $('map-tree').querySelector('[data-node]')?.focus(),
      help: () => {
        $('map-help').open = true;
        $('map-help').querySelector('summary').focus();
      }
    })[action]();
  });
  setInterval(() => {
    if (view !== 'map' || document.hidden) {
      return;
    }
    if (settings.live) {
      load();
    } else if (reveal) {
      pageAction('reveal', {
        enabled: true
      });
    }
  }, 2000);
  (async () => {
    try {
      windowId = globalThis.UpkoppContext ? await UpkoppContext.ready : (await chrome.windows.getCurrent()).id;
      const saved = await chrome.storage.local.get(['mapSettings', 'mapShortcuts']);
      settings = {
        ...Core.defaults,
        ...saved.mapSettings
      };
      shortcuts = {
        ...shortcutsDefault,
        ...saved.mapShortcuts
      };
      buildSettings();
      buildShortcuts();
      if (view === 'map') {
        await load(true);
      }
    } catch (error) {
      status(error.message);
    }
  })();
})();
