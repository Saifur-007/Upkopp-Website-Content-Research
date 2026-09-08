/* Reads only the current document; the coordinator handles frame permissions. */
(() => {
  if (globalThis.UpkoppPageMap) {
    return;
  }
  const MAX_NODES = 60000;
  const MAX_ITEMS = 5000;
  const ids = new WeakMap();
  const elements = new Map();
  const observers = new Map();
  const epoch = crypto.randomUUID();
  let seq = 0;
  let dirty = true;
  let cached = null;
  let optionsKey = '';
  let lastUse = Date.now();
  let overlay = null;
  let reveal = false;
  let revealKind = 'headings';
  let scanCount = 0;
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const parent = el => el.parentElement || el.getRootNode()?.host || null;
  const id = el => {
    if (!ids.has(el)) {
      ids.set(el, 'm' + ++seq);
    }
    const key = ids.get(el);
    elements.set(key, el);
    return key;
  };
  const excluded = el => el === overlay || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
  function accessibleName(el) {
    const root = el.getRootNode();
    const refs = clean(el.getAttribute('aria-labelledby')).split(' ').filter(Boolean);
    if (refs.length) {
      const names = refs.map(ref => root.getElementById?.(ref)).filter(Boolean).map(node => clean(node.textContent));
      if (names.length) {
        return clean(names.join(' '));
      }
    }
    return clean(el.getAttribute('aria-label'));
  }
  function text(el, aria = false, depth = 0) {
    if (depth > 40 || excluded(el)) {
      return '';
    }
    if (aria) {
      const name = accessibleName(el);
      if (name) {
        return name;
      }
    }
    if (el.tagName === 'IMG') {
      return el.getAttribute('alt') || '';
    }
    let result = '';
    for (const child of el.childNodes) {
      if (child.nodeType === 3) {
        result += child.textContent;
      } else if (child.nodeType === 1 && child.getAttribute('aria-hidden') !== 'true') {
        result += child.tagName === 'BR' ? ' ' : text(child, aria, depth + 1);
      }
    }
    return result;
  }
  function link(el) {
    if (el.getRootNode() !== document) {
      return null;
    }
    const target = el.id ? el : el.closest('a[id],a[name]');
    if (!target) {
      return null;
    }
    const anchor = target.id || target.getAttribute('name');
    if (!anchor) {
      return null;
    }
    const url = new URL(location.href);
    url.hash = anchor;
    return url.href;
  }
  function landmark(el, role, name, inSection) {
    if (role) {
      return ['banner', 'main', 'navigation', 'complementary', 'contentinfo', 'search', 'region', 'form'].includes(role) && (!['region', 'form'].includes(role) || name) ? role : null;
    }
    if (el.tagName === 'HEADER') {
      return inSection ? null : 'banner';
    }
    if (el.tagName === 'FOOTER') {
      return inSection ? null : 'contentinfo';
    }
    if (el.tagName === 'SECTION') {
      return name ? 'region' : null;
    }
    if (el.tagName === 'FORM') {
      return name ? 'form' : null;
    }
    return {
      MAIN: 'main',
      NAV: 'navigation',
      ASIDE: 'complementary',
      SEARCH: 'search'
    }[el.tagName] || null;
  }
  function watch(root) {
    if (observers.has(root)) {
      return;
    }
    const obs = new MutationObserver(records => {
      if (records.some(record => {
        if (record.target === overlay || overlay?.contains(record.target)) {
          return false;
        }
        const changed = [...record.addedNodes, ...record.removedNodes];
        return record.type !== 'childList' || changed.some(node => node.nodeType !== 1 || !node.hasAttribute('data-page-capture-ui'));
      })) {
        dirty = true;
      }
    });
    obs.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['hidden', 'aria-hidden', 'inert', 'open', 'role', 'aria-level', 'aria-label', 'aria-labelledby', 'id', 'class', 'style', 'slot']
    });
    observers.set(root, obs);
  }
  function scan(options = {}, force = false) {
    lastUse = Date.now();
    const key = JSON.stringify({
      ariaNames: options.ariaNames
    });
    if (cached && !dirty && !force && key === optionsKey && cached.url === location.href) {
      return snapshot();
    }
    optionsKey = key;
    dirty = false;
    elements.clear();
    scanCount++;
    const headings = [];
    const landmarks = [];
    const sections = [];
    const frames = [];
    const seen = new WeakSet();
    let visited = 0;
    let limited = false;
    const sectionNodes = new Map();
    function visit(el, context = {
      hidden: false,
      landmark: null,
      section: null,
      inSection: false
    }, depth = 0) {
      if (!el || seen.has(el) || excluded(el)) {
        return;
      }
      seen.add(el);
      if (++visited > MAX_NODES || headings.length + landmarks.length + sections.length >= MAX_ITEMS || depth > 100) {
        limited = true;
        return;
      }
      const style = getComputedStyle(el);
      const hidden = context.hidden || el.hidden || el.hasAttribute('inert') || el.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse';
      const role = clean(el.getAttribute('role')).split(' ')[0];
      const name = accessibleName(el);
      const lm = landmark(el, role, name, context.inSection);
      const next = {
        ...context,
        hidden
      };
      if (lm) {
        const item = {
          id: id(el),
          role: lm,
          label: name,
          parent: context.landmark,
          hidden,
          tag: el.tagName.toLowerCase(),
          href: link(el)
        };
        landmarks.push(item);
        next.landmark = item.id;
      }
      if (['ARTICLE', 'SECTION', 'NAV', 'ASIDE'].includes(el.tagName)) {
        const item = {
          id: id(el),
          label: name,
          parent: context.section,
          hidden,
          tag: el.tagName.toLowerCase(),
          href: link(el)
        };
        sections.push(item);
        sectionNodes.set(item.id, item);
        next.section = item.id;
      }
      next.inSection ||= ['ARTICLE', 'ASIDE', 'MAIN', 'NAV', 'SECTION'].includes(el.tagName);
      const native = /^H([1-6])$/.exec(el.tagName);
      if (role === 'heading' || native && !role) {
        const raw = el.getAttribute('aria-level');
        const ariaLevel = Number(raw);
        const level = role === 'heading' ? Number.isInteger(ariaLevel) && ariaLevel > 0 ? ariaLevel : 2 : Number(native[1]);
        const label = clean(text(el, options.ariaNames !== false)).slice(0, 4000);
        const warnings = [];
        if (role === 'heading' && raw !== null && (!Number.isInteger(ariaLevel) || ariaLevel < 1)) {
          warnings.push('Invalid aria-level; displayed with fallback level 2.');
        }
        const item = {
          id: id(el),
          level,
          label,
          hidden,
          tag: el.tagName.toLowerCase(),
          href: link(el),
          warnings
        };
        headings.push(item);
        if (next.section && !sectionNodes.get(next.section).label) {
          sectionNodes.get(next.section).label = label;
        }
      }
      if (['IFRAME', 'FRAME'].includes(el.tagName)) {
        frames.push({
          title: el.title || '',
          url: el.src || 'about:blank',
          hidden
        });
      }
      const closed = el.tagName === 'DETAILS' && !el.open;
      if (el.shadowRoot) {
        watch(el.shadowRoot);
        for (const child of el.shadowRoot.children) {
          visit(child, next, depth + 1);
        }
        return;
      }
      if (el.tagName === 'SLOT') {
        const assigned = el.assignedElements({
          flatten: true
        });
        if (assigned.length) {
          assigned.forEach(child => visit(child, next, depth + 1));
          return;
        }
      }
      for (const child of el.children) {
        visit(child, {
          ...next,
          hidden: hidden || closed && child.tagName !== 'SUMMARY'
        }, depth + 1);
      }
    }
    watch(document.documentElement);
    visit(document.documentElement);
    for (const [root, obs] of observers) {
      if (!root.isConnected && !root.host?.isConnected) {
        obs.disconnect();
        observers.delete(root);
      }
    }
    cached = {
      epoch,
      url: location.href,
      title: document.title,
      headings,
      landmarks,
      sections,
      frames,
      limited,
      scanCount
    };
    return snapshot();
  }
  function snapshot() {
    const visibleIds = [];
    for (const [key, el] of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth) {
        visibleIds.push(key);
      }
    }
    if (reveal) {
      paint();
    }
    return {
      ...cached,
      visibleIds
    };
  }
  function clearOverlay() {
    overlay?.remove();
    overlay = null;
  }
  function paint(single = null) {
    clearOverlay();
    const targets = single ? [{
      id: single,
      label: ''
    }] : cached?.[revealKind] || [];
    overlay = document.createElement('div');
    overlay.setAttribute('data-page-capture-ui', '');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    const shadow = overlay.attachShadow({
      mode: 'closed'
    });
    let count = 0;
    for (const item of targets) {
      const el = elements.get(item.id);
      if (!el?.isConnected || item.hidden) {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || ++count > 150) {
        continue;
      }
      const box = document.createElement('div');
      box.style.cssText = 'position:absolute;box-sizing:border-box;border:3px solid #4a2bfa;background:rgba(136,237,57,.12);pointer-events:none;';
      Object.assign(box.style, {
        left: r.left + 'px',
        top: r.top + 'px',
        width: r.width + 'px',
        height: r.height + 'px'
      });
      if (!single) {
        const label = document.createElement('span');
        label.textContent = item.level ? 'H' + item.level : item.role || item.tag;
        label.style.cssText = 'position:absolute;left:0;top:0;background:#4a2bfa;color:white;padding:4px 8px;font:600 12px/16px system-ui;';
        box.append(label);
      }
      shadow.append(box);
    }
    document.documentElement.append(overlay);
  }
  let flashTimer;
  const frameRequests = new Map();
  addEventListener('message', event => {
    if (event.data?.type !== 'PAGE_CAPTURE_FRAME_REVEAL' || !frameRequests.has(event.data.token)) {
      return;
    }
    frameRequests.delete(event.data.token);
    const frames = [];
    const collect = root => {
      for (const node of root.querySelectorAll('iframe,frame')) {
        frames.push(node);
      }
      for (const node of root.querySelectorAll('*')) {
        if (node.shadowRoot) {
          collect(node.shadowRoot);
        }
      }
    };
    collect(document);
    const frame = frames.find(node => node.contentWindow === event.source);
    if (frame) {
      frame.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'instant'
      });
    }
  });
  function action(message) {
    lastUse = Date.now();
    if (message.epoch !== epoch || message.url !== location.href) {
      throw Error('The document changed. Refresh the page map.');
    }
    if (message.action === 'arm-frame') {
      if (frameRequests.size > 30) {
        frameRequests.clear();
      }
      frameRequests.set(message.token, true);
      setTimeout(() => frameRequests.delete(message.token), 5000);
      return {
        ok: true
      };
    }
    if (message.action === 'reveal-frame') {
      window.parent.postMessage({
        type: 'PAGE_CAPTURE_FRAME_REVEAL',
        token: message.token
      }, '*');
      return {
        ok: true
      };
    }
    if (message.action === 'reveal') {
      reveal = !!message.enabled;
      revealKind = ['headings', 'landmarks', 'sections'].includes(message.kind) ? message.kind : 'headings';
      reveal ? paint() : clearOverlay();
      return {
        ok: true
      };
    }
    if (message.action === 'top') {
      scrollTo({
        top: 0,
        left: 0,
        behavior: 'instant'
      });
      return {
        ok: true
      };
    }
    const el = elements.get(message.id);
    if (!el?.isConnected) {
      dirty = true;
      throw Error('This item was removed. Refresh the page map.');
    }
    const hidden = cached.headings.concat(cached.landmarks, cached.sections).find(item => item.id === message.id)?.hidden;
    if (hidden) {
      throw Error('This item is hidden. Open it on the source page, then refresh.');
    }
    el.scrollIntoView({
      block: 'start',
      inline: 'nearest',
      behavior: 'instant'
    });
    scrollBy({
      top: -Math.max(0, Math.min(300, Number(message.offset) || 0)),
      behavior: 'instant'
    });
    if (message.highlight !== false) {
      paint(message.id);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        if (reveal) {
          paint();
        } else {
          clearOverlay();
        }
      }, 2200);
    }
    return {
      ok: true
    };
  }
  let paintPending = false;
  const onViewport = () => {
    if (!reveal || paintPending) {
      return;
    }
    paintPending = true;
    requestAnimationFrame(() => {
      paintPending = false;
      paint();
    });
  };
  addEventListener('scroll', onViewport, true);
  addEventListener('resize', onViewport);
  setInterval(() => {
    if (Date.now() - lastUse > 15000) {
      observers.forEach(obs => obs.disconnect());
      observers.clear();
      dirty = true;
      reveal = false;
      clearOverlay();
    }
  }, 10000);
  globalThis.UpkoppPageMap = {
    scan,
    action
  };
  if (globalThis.chrome?.runtime?.id) {
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
      if (sender.id !== chrome.runtime.id || !['PM_SCAN', 'PM_ACT'].includes(message.type)) {
        return;
      }
      try {
        reply(message.type === 'PM_SCAN' ? scan(message.options, message.force) : action(message));
      } catch (error) {
        reply({
          error: error.message
        });
      }
    });
  }
})();
