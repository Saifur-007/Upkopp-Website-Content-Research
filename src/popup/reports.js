/* Content, indexability, social metadata and image inventory views. */
(() => {
  let ui;
  let imageFilter = 'all';
  let imageLimit = 40;
  let imageSource = null;
  const selectedImages = new Set();
  const badge = (text, tone = 'neutral') => {
    const node = ui.element('span', text, 'uk-signal ' + tone);
    node.prepend(UpkoppIcon(tone === 'good' ? 'check' : tone === 'warning' || tone === 'danger' ? 'alert' : 'info'));
    return node;
  };
  function link(value, label = value) {
    const node = ui.element('a', label);
    try {
      const url = new URL(value, ui.page().url);
      if (!/^https?:$/.test(url.protocol)) {
        return ui.element('span', label);
      }
      node.href = url.href;
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
    } catch {
      return ui.element('span', label);
    }
    return node;
  }
  function line(parent, label, value, tone) {
    const node = ui.element('div', undefined, 'uk-row');
    const content = ui.element('div', undefined, 'uk-value');
    content.append(value instanceof Node ? value : ui.element('span', value || 'Not provided', value ? '' : 'uk-missing'));
    if (tone) {
      content.append(badge(tone[0], tone[1]));
    }
    node.append(ui.element('div', label, 'uk-label'), content);
    parent.append(node);
  }
  function previewImage(src, alt, className = 'uk-thumbnail') {
    const image = ui.element('img', undefined, className);
    image.alt = alt || 'Page image';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    if (UpkoppResearchCore.safeImageURL(src)) {
      image.src = src;
    }
    image.onerror = () => {
      image.replaceWith(ui.element('div', 'Preview unavailable', className + ' uk-image-placeholder'));
    };
    return image;
  }
  function content() {
    const page = ui.page();
    const context = ui.section('Meta');
    for (const [label, value] of [['Title', page.title], ['Description', page.description]]) {
      const valueNode = ui.element('div', undefined, 'uk-meta-value');
      const text = ui.element('div');
      text.append(ui.element('span', value || 'Missing', value ? '' : 'uk-missing'));
      if (value) {
        text.append(ui.element('span', 'HTML', 'uk-html'));
      }
      const count = ui.element('span', value ? String([...value].length) : 'Missing', 'uk-character-count' + (value ? '' : ' missing'));
      count.title = value ? [...value].length + ' characters in the page’s ' + label.toLowerCase() + '. This is a character count, not an SEO score.' : 'The page does not provide this field.';
      valueNode.append(text, count);
      line(context, label, valueNode);
    }
    const dates = ui.section('Dates');
    line(dates, 'Published', page.dates?.published);
    line(dates, 'Modified', page.dates?.modified);
    const copy = ui.section('Content');
    copy.classList.add('uk-copy-section');
    line(copy, 'Word count', page.wordCount.toLocaleString() + ' words');
    const actions = ui.element('div', undefined, 'uk-actions');
    actions.append(ui.button('Copy headings', () => ui.copy(page.headings.map(item => '#'.repeat(item.level) + ' ' + item.text).join('\n')), 'copy'));
    copy.append(actions);
    const outline = ui.element('div', undefined, 'uk-content-outline');
    let headingCount = 0;
    const moreHeadings = ui.button('Show more headings', () => drawHeadings());
    function drawHeadings() {
      for (const heading of page.headings.slice(headingCount, headingCount + 100)) {
        const entry = ui.element('div', undefined, 'uk-outline-entry');
        entry.style.setProperty('--heading-indent', Math.min(5, Math.max(0, heading.level - 1)) * 24 + 'px');
        entry.append(ui.element('span', 'H' + heading.level, 'uk-outline-level'), ui.element('span', heading.text));
        outline.append(entry);
      }
      headingCount += 100;
      moreHeadings.hidden = headingCount >= page.headings.length;
    }
    line(copy, 'Headings', outline);
    copy.append(moreHeadings);
    drawHeadings();
    if (!page.headings.length) {
      outline.append(ui.element('span', 'No headings found', 'uk-missing'));
    }
    const bodyCopy = ui.section('Page text');
    bodyCopy.append(ui.button('Copy page text', () => ui.copy(UpkoppResearchCore.contentText(page.blocks)), 'copy'));
    const list = ui.element('div', undefined, 'uk-page-copy');
    let shown = 0;
    const more = ui.button('Show more paragraphs', () => draw());
    function draw() {
      const batch = (page.blocks || []).slice(shown, shown + 100);
      for (const block of batch) {
        const item = ui.element('div', undefined, 'uk-copy-block ' + block.type);
        if (block.type === 'heading') {
          item.style.setProperty('--heading-indent', Math.min(5, Math.max(0, block.level - 1)) * 12 + 'px');
        }
        item.append(ui.element('span', block.type === 'heading' ? 'H' + block.level : block.type === 'list-item' ? '•' : '¶', 'uk-block-label'), ui.element('p', block.text));
        list.append(item);
      }
      shown += batch.length;
      more.hidden = shown >= (page.blocks || []).length;
    }
    bodyCopy.append(list, more);
    draw();
    if (!page.blocks?.length) {
      bodyCopy.append(ui.element('p', 'No visible page copy was found. Try Text capture for a more detailed pass.'));
    }
  }
  async function indexability() {
    const area = ui.section('Indexability signals');
    area.append(ui.element('p', 'Checking canonical tags, robots directives, sitemaps, and language alternatives…', 'caption'));
    let data;
    try {
      data = await ui.indexability();
    } catch (error) {
      if (area.isConnected) {
        area.append(badge(error.message, 'warning'));
      }
      return;
    }
    if (!area.isConnected) {
      return;
    }
    area.replaceChildren(ui.element('summary', 'Indexability signals'));
    area.append(badge(data.summary === 'noindex-detected' ? 'Noindex directive detected' : 'No noindex directive detected', data.summary === 'noindex-detected' ? 'danger' : 'neutral'));
    area.append(ui.element('p', 'These are page signals, not proof that a search engine has indexed this URL.', 'caption'));
    const canonical = ui.section('Canonical URL');
    for (const [label, values] of [['Rendered HTML', data.canonical.rendered], ['Response HTML', data.canonical.raw]]) {
      if (values === null) {
        line(canonical, label, 'Not checked', ['Unavailable', 'warning']);
        continue;
      }
      if (!values.length) {
        line(canonical, label, null, ['Missing', 'warning']);
        continue;
      }
      for (const url of values) {
        const selfCanonical = url.replace(/#.*$/, '') === data.url.replace(/#.*$/, '');
        line(canonical, label, link(url), [selfCanonical ? 'Self-canonical' : 'Points elsewhere', values.length > 1 ? 'warning' : selfCanonical ? 'good' : 'neutral']);
      }
      if (values.length > 1) {
        canonical.append(badge('Multiple canonical URLs found', 'warning'));
      }
    }
    const robots = ui.section('Robots');
    line(robots, 'Robots.txt', link(data.robotsTxt.url), data.robotsTxt.status ? ['HTTP ' + data.robotsTxt.status, data.robotsTxt.status === 200 ? 'good' : 'warning'] : ['Not checked', 'warning']);
    if (!data.robotsMeta.length) {
      line(robots, 'Meta tags', null);
    }
    for (const meta of data.robotsMeta) {
      line(robots, meta.agent, meta.content);
    }
    line(robots, 'X-Robots-Tag', data.response.error ? 'Not checked' : data.response.xRobotsTag);
    line(robots, 'Response', data.response.status ? 'HTTP ' + data.response.status : 'Unavailable');
    if (data.response.error || data.robotsTxt.error) {
      robots.append(badge(data.response.error || data.robotsTxt.error, 'warning'));
    }
    if (data.robotsTxt.text !== null) {
      const rules = ui.element('details', undefined, 'uk-robots-source');
      rules.append(ui.element('summary', 'View robots.txt rules'), ui.element('pre', data.robotsTxt.text, 'uk-source-code'));
      robots.append(rules);
      if (data.robotsTxt.truncated) {
        robots.append(badge('Robots.txt was shortened at 256 KB', 'warning'));
      }
    }
    const sitemaps = ui.section('Sitemaps');
    if (!data.sitemaps.length) {
      sitemaps.append(ui.element('p', 'No sitemap declarations found in the available robots.txt.', 'caption'));
    }
    for (const url of data.sitemaps) {
      sitemaps.append(link(url));
    }
    const alternatives = ui.section('Language alternatives');
    if (!data.hreflangs.length) {
      alternatives.append(ui.element('p', 'No hreflang links found.', 'caption'));
    }
    for (const item of data.hreflangs) {
      line(alternatives, item.language, link(item.url));
    }
    for (const note of data.limitations) {
      alternatives.append(ui.element('p', note, 'caption'));
    }
  }
  function social() {
    const data = ui.page().social;
    for (const [key, title, expected] of [['openGraph', 'Open Graph', ['og:title', 'og:type', 'og:image', 'og:url']], ['twitter', 'X (Twitter) card', ['twitter:card']]]) {
      const area = ui.section(title);
      const tags = data?.[key] || [];
      const missing = expected.filter(name => !tags.some(tag => tag.name.toLowerCase() === name && tag.content));
      area.querySelector('summary').append(badge(missing.length ? 'Missing or incomplete' : 'Core tags present', missing.length ? 'warning' : 'good'));
      const common = key === 'openGraph' ? ['og:title', 'og:type', 'og:image', 'og:url', 'og:description'] : ['twitter:card', 'twitter:site', 'twitter:description', 'twitter:title', 'twitter:image'];
      const rows = common.flatMap(name => {
        const matching = tags.filter(tag => tag.name.toLowerCase() === name);
        return matching.length ? matching : [{
          name,
          content: ''
        }];
      }).concat(tags.filter(tag => !common.includes(tag.name.toLowerCase())));
      for (const tag of rows) {
        if (!tag.content) {
          line(area, tag.name, null);
          continue;
        }
        const isImage = /^(?:og:image(?::url|:secure_url)?|twitter:image(?::src)?)$/i.test(tag.name);
        if (isImage) {
          const cell = ui.element('div');
          if (/^(?:data|blob):/i.test(tag.content)) {
            cell.append(ui.element('span', 'Embedded image'), previewImage(tag.content, 'Social sharing image', 'uk-social-preview'));
            line(area, tag.name, cell);
            continue;
          }
          const url = link(tag.content);
          cell.append(url);
          if (url.href) {
            cell.append(previewImage(url.href, 'Social sharing image', 'uk-social-preview'));
          }
          line(area, tag.name, cell);
        } else {
          line(area, tag.name, /^https?:\/\//i.test(tag.content) ? link(tag.content) : tag.content);
        }
      }
    }
  }
  function images() {
    const page = ui.page();
    if (imageSource !== page) {
      selectedImages.clear();
      imageSource = page;
      imageLimit = 40;
    }
    const area = ui.section('Page images · ' + page.images.length);
    area.append(ui.element('p', 'Download all images together: one ZIP containing one folder of image files. Repeated URLs are included once.', 'caption'));
    const toolbar = ui.element('div', undefined, 'uk-actions');
    const label = ui.element('label', 'Show ', 'uk-filter');
    const filter = ui.element('select');
    for (const [value, title] of [['all', 'All images'], ['visible', 'Visible images'], ['text', 'With alt text'], ['missing', 'Missing alt text'], ['background', 'Backgrounds'], ['inline-svg', 'Inline SVGs']]) {
      const option = ui.element('option', title);
      option.value = value;
      filter.append(option);
    }
    filter.value = imageFilter;
    filter.onchange = () => {
      imageFilter = filter.value;
      imageLimit = 40;
      draw();
    };
    label.append(filter);
    const chosen = () => page.images.filter(image => selectedImages.has(image.number));
    const download = async entries => {
      if (!entries.length) {
        throw Error('Select at least one image.');
      }
      // Request discovered image hosts directly in the click gesture, before other awaits.
      const origins = [...new Set(entries.filter(image => /^https?:/.test(image.src)).map(image => new URL(image.src).origin + '/*'))];
      if (origins.length && !(await chrome.permissions.request({
        origins
      }))) {
        throw Error('Image host access was not granted. Allow access when downloading to create a ZIP.');
      }
      ui.status('Preparing one image ZIP…');
      await ui.request('UK_DOWNLOAD_IMAGES', {
        sourceURL: page.url,
        images: entries.map(({
          number,
          src
        }) => ({
          number,
          src
        }))
      });
      await downloadProgress();
    };
    const allButton = ui.button('Download all images', () => download(page.images), 'download');
    allButton.classList.add('primary');
    allButton.disabled = !page.images.length;
    const selectedButton = ui.button('Download selected', () => download(chosen()), 'download');
    const selection = ui.element('p', undefined, 'caption');
    selection.setAttribute('role', 'status');
    const clear = ui.button('Clear selection', () => {
      selectedImages.clear();
      draw();
    });
    function syncSelection() {
      selectedButton.disabled = !selectedImages.size;
      clear.disabled = !selectedImages.size;
      selection.textContent = selectedImages.size + ' of ' + page.images.length + ' images selected';
    }
    toolbar.append(allButton, label, ui.button('Select all', () => {
      page.images.forEach(image => selectedImages.add(image.number));
      draw();
    }, 'check'), clear, selectedButton, ui.button('Refresh images', ui.refresh, 'refresh'));
    const copyActions = ui.element('div', undefined, 'uk-actions');
    const altText = () => page.images.filter(image => image.alt || image.caption).map(image => ['Image ' + image.number, image.alt && 'Alt: ' + image.alt, image.caption && 'Caption: ' + image.caption].filter(Boolean).join('\n')).join('\n\n');
    copyActions.append(ui.button('Copy alt text & captions', () => ui.copy(altText()), 'copy'));
    const progress = ui.element('div', undefined, 'uk-download-progress');
    progress.id = 'uk-image-progress';
    progress.setAttribute('role', 'status');
    const grid = ui.element('div', undefined, 'uk-image-grid');
    const more = ui.button('Show more images', () => {
      imageLimit += 40;
      draw();
    });
    area.append(toolbar, selection, copyActions, ui.element('p', 'Chrome may ask for access to image hosts so Upkopp can package the files. Scroll the website and refresh to discover more images.', 'caption'), progress, grid, more);
    function draw() {
      syncSelection();
      const fragment = document.createDocumentFragment();
      const filtered = page.images.filter(image => imageFilter === 'all' || imageFilter === 'visible' && image.visible || imageFilter === 'text' && image.alt || imageFilter === 'missing' && image.alt === null || image.kind === imageFilter);
      for (const image of filtered.slice(0, imageLimit)) {
        const card = ui.element('article', undefined, 'uk-image-card');
        const heading = ui.element('label', undefined, 'uk-image-select');
        const check = ui.element('input');
        check.type = 'checkbox';
        check.checked = selectedImages.has(image.number);
        check.onchange = () => {
          if (check.checked) {
            selectedImages.add(image.number);
          } else {
            selectedImages.delete(image.number);
          }
          syncSelection();
        };
        heading.append(check, ui.element('span', 'Image ' + image.number), ui.element('span', image.kind || 'image', 'uk-image-kind'));
        card.append(heading, previewImage(image.src, image.alt), ui.element('p', (image.width || '?') + ' × ' + (image.height || '?') + (image.dimensionSource === 'rendered' ? ' · Rendered area' : '') + (image.visible === false ? ' · Hidden in page' : ''), 'caption'));
        card.append(ui.element('p', image.alt === null ? 'Alt text not provided' : image.alt === '' ? 'Empty alt attribute' : image.alt, image.alt ? 'uk-alt-text' : 'caption'));
        if (image.caption) {
          card.append(ui.element('p', image.caption, 'uk-image-caption'));
        }
        if (/^https?:/.test(image.src)) {
          card.append(link(image.src, 'Open original ↗'));
        }
        fragment.append(card);
      }
      if (!filtered.length) {
        fragment.append(ui.element('p', 'No images match this filter.'));
      }
      grid.replaceChildren(fragment);
      more.hidden = filtered.length <= imageLimit;
    }
    draw();
    void downloadProgress();
    const notes = ui.section('Image coverage');
    notes.open = false;
    notes.append(ui.element('p', 'Exports allow up to 2,000 unique images, 20 MB per image, and 128 MB total. Requests stop after three minutes. Protected, redirected, temporary blob images, or unavailable resources may be skipped; an incomplete ZIP includes a short failure report.', 'caption'));
    for (const note of page.limitations || []) {
      notes.append(ui.element('p', note, 'caption'));
    }
  }
  async function downloadProgress() {
    const host = document.getElementById('uk-image-progress');
    if (!host) {
      return;
    }
    try {
      const job = await ui.request('UK_IMAGE_DOWNLOAD_STATE');
      if (!host.isConnected || !job) {
        return;
      }
      const failed = job.failures || [];
      const state = job.state === 'complete' ? 'ZIP downloaded' : job.state === 'downloading' ? 'Saving ZIP…' : job.state === 'failed' ? 'ZIP export failed' : 'Preparing ZIP…';
      host.replaceChildren(badge(state + ' · ' + job.included + '/' + job.total + ' unique images included' + (failed.length ? ' · ' + failed.length + ' skipped' : ''), failed.length || job.error ? 'warning' : job.state === 'complete' ? 'good' : 'neutral'), ui.element('p', job.filename, 'caption'));
      if (job.state === 'preparing') {
        const meter = ui.element('progress');
        meter.max = job.total;
        meter.value = job.processed;
        meter.setAttribute('aria-label', 'Images processed');
        host.append(meter);
      }
      if (job.error) {
        host.append(ui.element('p', job.error, 'caption'));
      }
      if (failed.length) {
        const errors = ui.element('details');
        errors.append(ui.element('summary', 'Download failures'));
        for (const item of failed) {
          errors.append(ui.element('p', 'Image ' + item.number + ': ' + item.error, 'caption'));
        }
        host.append(errors);
      }
    } catch (error) {
      if (host.isConnected) {
        host.textContent = error.message;
      }
    }
  }
  setInterval(() => {
    if (!document.hidden) {
      void downloadProgress();
    }
  }, 2000);
  globalThis.UpkoppReports = {
    configure: value => {
      ui = value;
    },
    content,
    indexability,
    social,
    images
  };
})();
