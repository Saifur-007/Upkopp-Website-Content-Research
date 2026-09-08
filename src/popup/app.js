/* Upkopp's content research workspace. Website text is always rendered as text. */
(() => {
  const titles = {
    content: 'Content',
    map: 'Page map',
    capture: 'Text capture',
    indexability: 'Indexability',
    social: 'Social tags',
    images: 'Images',
    settings: 'Settings'
  };
  const $ = id => document.getElementById(id);
  let view = 'content';
  let overview = null;
  let loading = false;
  let exporting = false;
  let indexabilityData = null;
  let indexabilityRequest = null;
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) {
      node.textContent = text;
    }
    if (className) {
      node.className = className;
    }
    return node;
  }
  function status(text) {
    $('uk-status').textContent = text;
  }
  async function run(action) {
    try {
      return await action();
    } catch (error) {
      status(error.message);
    }
  }
  function button(label, action, icon) {
    const node = element('button', label);
    node.type = 'button';
    if (icon) {
      node.prepend(UpkoppIcon(icon));
    }
    node.addEventListener('click', () => run(action));
    return node;
  }
  function section(title) {
    const node = element('details', undefined, 'uk-section');
    node.open = true;
    node.append(element('summary', title));
    $('uk-report').append(node);
    return node;
  }
  function row(parent, label, text) {
    const node = element('div', undefined, 'uk-row');
    node.append(element('div', label, 'uk-label'), element('div', text || 'Not provided', 'uk-value'));
    parent.append(node);
  }
  async function request(type, extra = {}) {
    const response = await chrome.runtime.sendMessage({
      type,
      windowId: await UpkoppContext.ready,
      ...extra
    });
    if (response?.error) {
      throw new Error(response.error);
    }
    return response;
  }
  async function copy(text) {
    if (!text.trim()) {
      throw new Error('There is no text to copy in this view.');
    }
    await navigator.clipboard.writeText(text);
    status('Copied to clipboard.');
  }
  async function download(text, filename, mime = 'text/plain') {
    if (!text.trim()) {
      throw new Error('There is no text to download in this view.');
    }
    await chrome.downloads.download({
      url: 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(text),
      filename,
      conflictAction: 'uniquify',
      saveAs: (await UpkoppSettings.read()).saveAs
    });
    status('Download requested.');
  }
  async function refresh() {
    if (loading) {
      return;
    }
    loading = true;
    status('Reading page content…');
    try {
      overview = await request('UK_OVERVIEW');
      indexabilityData = null;
      indexabilityRequest = null;
      $('uk-source').textContent = overview.url;
      status(overview.limited ? 'Overview shortened on this large page. Text capture has separate limits.' : '');
      if (['content', 'images', 'indexability', 'social'].includes(view)) {
        render();
      }
    } catch (error) {
      overview = null;
      if (['content', 'images', 'indexability', 'social'].includes(view)) {
        render();
      }
      status(error.message);
    } finally {
      loading = false;
    }
  }
  async function getIndexability() {
    if (!overview) {
      throw new Error('Read a website before checking indexability.');
    }
    if (indexabilityData) {
      return indexabilityData;
    }
    if (indexabilityRequest) {
      return indexabilityRequest;
    }
    const source = overview;
    const pending = request('UK_INDEXABILITY', {
      sourceURL: source.url
    }).then(data => {
      if (overview !== source || data.url !== source.url) {
        throw new Error('The source changed. Refresh to check the current page.');
      }
      indexabilityData = data;
      return data;
    }).finally(() => {
      if (indexabilityRequest === pending) {
        indexabilityRequest = null;
      }
    });
    indexabilityRequest = pending;
    return pending;
  }
  async function exportJSON() {
    if (loading || exporting) {
      status('Finish reading the page before exporting.');
      return;
    }
    const control = $('uk-export-json');
    exporting = true;
    control.disabled = true;
    try {
      await refresh();
      if (!overview) {
        return;
      }
      const source = overview;
      status('Preparing Content and Page map in one JSON file…');
      const capture = await request('PC_GET_STATE');
      const map = await request('PM_GET', {
        force: true,
        sourceURL: source.url,
        sourceTabId: source.tabId,
        sourceDocumentId: source.documentId
      });
      if (map.paused) {
        throw Error('Finish or cancel text capture, then export Content and Page map together.');
      }
      if (!map.documents?.some(doc => doc.frameId === 0 && !doc.error)) {
        throw Error('The main page map could not be read. Refresh the website and try again.');
      }
      const {
        mapSettings = {}
      } = await chrome.storage.local.get('mapSettings');
      if (overview !== source) {
        throw new Error('The page changed. Export the current page again.');
      }
      const output = UpkoppResearchCore.jsonExport(source, capture, UpkoppCapture, await UpkoppSettings.read(), map, mapSettings);
      await download(JSON.stringify(output, null, 2) + '\n', 'upkopp-' + new URL(source.url).hostname + '-content-and-map.json', 'application/json');
    } finally {
      exporting = false;
      control.disabled = false;
    }
  }
  let preferences = {
    ...UpkoppSettings.defaults
  };
  function applyTheme() {
    document.documentElement.dataset.theme = preferences.theme;
  }
  async function changeSetting(key, value, control) {
    control.disabled = true;
    try {
      preferences = await UpkoppSettings.write({
        ...(await UpkoppSettings.read()),
        [key]: value
      });
      applyTheme();
      status('Settings saved on this device.');
    } catch (error) {
      control.checked = preferences[key];
      control.value = preferences[key];
      status(error.message);
    } finally {
      control.disabled = false;
    }
  }
  function settings() {
    const toggle = (area, key, title, description) => {
      const label = element('label', undefined, 'uk-setting');
      const text = element('span');
      text.append(element('strong', title), element('span', description, 'caption'));
      const input = element('input');
      input.type = 'checkbox';
      input.checked = preferences[key];
      input.setAttribute('aria-label', title);
      input.onchange = () => changeSetting(key, input.checked, input);
      label.append(text, input);
      area.append(label);
    };
    const about = section('About Upkopp');
    about.append(element('p', 'Website content research for copywriters, content strategists, and web designers. Collect the source material before you write.', 'caption'));
    const help = element('a', 'Getting started, exports & privacy');
    help.href = '../help/index.html';
    help.target = '_blank';
    help.rel = 'noopener';
    about.append(help);
    const json = section('JSON export');
    json.append(element('p', 'One JSON file includes Content (title, description, word count, and page text) plus Page map (headings, landmarks, and sections from all accessible documents). Search, collapsed branches, and display limits do not shorten the export.', 'caption'));
    toggle(json, 'jsonAltText', 'Include image alt text', 'Add unique, non-empty alt text. No image files or dimensions.');
    const downloads = section('Downloads');
    toggle(downloads, 'autoDownloadText', 'Save text automatically after capture', 'Download a .txt file after a completed capture. Turn off to review it first.');
    toggle(downloads, 'saveAs', 'Ask where to save files', 'Choose a location for each JSON, text, or image ZIP download.');
    const appearance = section('Appearance');
    const themeLabel = element('label', 'Colour theme', 'uk-setting');
    const theme = element('select');
    for (const [value, title] of [['system', 'Follow system'], ['light', 'Light'], ['dark', 'Dark']]) {
      const option = element('option', title);
      option.value = value;
      theme.append(option);
    }
    theme.value = preferences.theme;
    theme.onchange = () => changeSetting('theme', theme.value, theme);
    themeLabel.append(theme);
    appearance.append(themeLabel);
    const map = section('Page map');
    map.append(element('p', 'Adjust heading visibility, scrolling, language, and keyboard shortcuts.', 'caption'), button('Open map settings', () => {
      show('map');
      $('map-settings').open = true;
    }, 'settings'));
    const reset = section('Restore defaults');
    reset.append(button('Reset export and appearance settings', async () => {
      preferences = await UpkoppSettings.write(UpkoppSettings.defaults);
      applyTheme();
      if (view === 'settings') {
        render();
      }
      status('Export and appearance settings reset.');
    }, 'refresh'));
  }
  function render() {
    $('uk-report').replaceChildren();
    if (view === 'settings') {
      settings();
      return;
    }
    if (!['content', 'images', 'indexability', 'social'].includes(view)) {
      return;
    }
    if (!overview) {
      $('uk-report').append(element('p', 'Open a website and use the Upkopp toolbar icon to read its content.'));
      return;
    }
    void UpkoppReports[view]();
  }
  function show(next) {
    if (!titles[next]) {
      return;
    }
    view = next;
    status('');
    document.body.dataset.view = next;
    $('uk-heading').textContent = titles[next];
    $('uk-view-select').value = next;
    document.querySelectorAll('[data-report]').forEach(node => node.setAttribute('aria-current', node.dataset.report === next ? 'page' : 'false'));
    UpkoppMap.setView(next);
    $('uk-report').hidden = next === 'map' || next === 'capture';
    render();
  }
  globalThis.UpkoppUI = {
    show
  };
  document.querySelectorAll('[data-report]').forEach(node => node.onclick = () => show(node.dataset.report));
  $('uk-view-select').onchange = event => show(event.target.value);
  $('uk-refresh').onclick = () => {
    $('uk-inspect').open = false;
    refresh();
  };
  document.addEventListener('pointerdown', event => {
    if (!$('uk-inspect').contains(event.target)) {
      $('uk-inspect').open = false;
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('uk-inspect').open) {
      $('uk-inspect').open = false;
      $('uk-inspect').querySelector('summary').focus();
    }
  });
  $('uk-source-toggle').onclick = () => {
    document.querySelector('.uk-sourcebar').hidden = !document.querySelector('.uk-sourcebar').hidden;
    $('uk-inspect').open = false;
  };
  $('uk-workspace').onclick = () => run(() => request('UK_WORKSPACE'));
  // sidePanel.open must remain directly within the user's click gesture.
  $('uk-sidepanel').onclick = () => run(() => chrome.sidePanel.open({
    windowId: UpkoppContext.windowId
  }));
  $('uk-export-json').onclick = () => run(exportJSON);
  $('uk-capture').onclick = () => run(async () => {
    await request('PC_START_CURRENT');
    show('capture');
  });
  if (!globalThis.chrome?.runtime?.id) {
    return;
  }
  if (chrome.runtime.getManifest) {
    $('uk-version').textContent = 'Upkopp ' + chrome.runtime.getManifest().version;
  }
  UpkoppReports.configure({
    element,
    section,
    row,
    button,
    copy,
    download,
    status,
    request,
    refresh,
    page: () => overview,
    indexability: getIndexability
  });
  $('uk-capture').prepend(UpkoppIcon('capture'));
  $('uk-export-json').prepend(UpkoppIcon('download'));
  void run(async () => {
    preferences = await UpkoppSettings.read();
    applyTheme();
    if (view === 'settings') {
      render();
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[UpkoppSettings.key]) {
      preferences = UpkoppSettings.normalize(changes[UpkoppSettings.key].newValue);
      applyTheme();
      if (view === 'settings') {
        render();
      }
    }
  });
  show('content');
  refresh();
})();
