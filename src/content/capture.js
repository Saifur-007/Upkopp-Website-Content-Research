(() => {
  if (globalThis.UpkoppCollector) {
    return;
  }
  const Core = globalThis.UpkoppCapture;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);
  const LANDMARK = {
    HEADER: 'header',
    NAV: 'navigation',
    MAIN: 'main',
    FOOTER: 'footer',
    ASIDE: 'aside'
  };
  const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  const href = (s, base, image = false) => {
    try {
      const u = new URL(s, base);
      return (image ? ['http:', 'https:', 'blob:'] : ['http:', 'https:', 'mailto:', 'tel:']).includes(u.protocol) ? u.href : null;
    } catch {
      return null;
    }
  };
  class Collector {
    constructor(job, report) {
      this.job = job;
      this.report = report;
      this.limits = {
        ...Core.LIMITS,
        ...job.limits
      };
      this.started = Date.now();
      this.stopReason = null;
      this.sequence = 0;
      this.steps = 0;
      this.nodeIds = new WeakMap();
      this.regionMap = new Map();
      this.sectionMap = new Map();
      this.observations = new Map();
      this.sourceNodes = new Map();
      this.scrollers = new Map();
      this.warningKeys = new Set();
      this.observers = new Map();
      this.bytes = 0;
      this.blockCount = 0;
      this.lastMutation = Date.now();
      this.lastCheckpoint = 0;
      this.generation = 0;
      this.capHit = false;
      this.compared = false;
      this.restored = false;
      this.result = {
        schema_version: '1.0.0',
        page: {
          url: job.url,
          title: document.title,
          site_name: document.querySelector('meta[property="og:site_name"]')?.content || null,
          language: document.documentElement.lang || null,
          captured_at: new Date().toISOString()
        },
        regions: [],
        images: [],
        capture: {
          status: 'partial',
          checks: {
            schema_valid: false,
            comparison_pass_performed: false,
            observed_content_reconciled: false
          },
          warnings: [],
          limits_reached: [],
          counts: {},
          limits: this.limits,
          elapsed_ms: 0
        }
      };
      this.addScroller(document.scrollingElement, true);
    }
    id(node) {
      if (!this.nodeIds.has(node)) {
        this.nodeIds.set(node, ++this.sequence);
      }
      return this.nodeIds.get(node);
    }
    warn(category, message, recovery = null, severity = 'warning') {
      if (this.warningKeys.has(category) || this.warningKeys.size >= 80) {
        return;
      }
      this.warningKeys.add(category);
      this.result.capture.warnings.push({
        category,
        message,
        recovery,
        severity
      });
    }
    limit(key) {
      if (!this.result.capture.limits_reached.includes(key)) {
        this.result.capture.limits_reached.push(key);
      }
      this.warn('limit_' + key, 'The ' + key.replaceAll('_', ' ') + ' limit was reached. Some content may be missing.', 'Try a shorter page or wait for loading before retrying.');
    }
    check() {
      if (location.href !== this.job.url) {
        this.stopReason = 'interrupted';
      }
      if (Date.now() - this.started >= this.limits.durationMs) {
        this.limit('duration');
        this.capHit = true;
      }
      return !this.stopReason && !this.capHit;
    }
    async pause(ms) {
      await new Promise(r => setTimeout(r, ms));
      this.check();
    }
    cancel(reason = 'cancelled') {
      this.stopReason = reason;
    }
    region(node, type) {
      const key = this.id(node);
      if (!this.regionMap.has(key)) {
        const r = {
          id: 'r' + key,
          type,
          sections: []
        };
        this.regionMap.set(key, r);
        this.result.regions.push(r);
        r.sections.push({
          id: 's-root-' + key,
          grouping_basis: 'region',
          blocks: [],
          sections: [],
          order: []
        });
      }
      return this.regionMap.get(key);
    }
    section(node, parent, basis) {
      const key = this.id(node) + ':' + parent.id;
      if (!this.sectionMap.has(key)) {
        const s = {
          id: 's' + ++this.sequence,
          grouping_basis: basis,
          blocks: [],
          sections: [],
          order: []
        };
        this.sectionMap.set(key, s);
        parent.sections.push(s);
        parent.order.push(s.id);
        this.sourceNodes.set(s.id, node);
      }
      return this.sectionMap.get(key);
    }
    hidden(el) {
      const style = el.ownerDocument.defaultView.getComputedStyle(el);
      return el.hidden || el.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0';
    }
    excluded(el) {
      return SKIP.has(el.tagName) || el.isContentEditable || el.getAttribute('contenteditable') === '' || el.getAttribute('contenteditable') === 'true';
    }
    inline(nodes, hiddenAllowed = false, omitLists = false, depth = 0) {
      if (depth > 60) {
        this.limit('nesting');
        return [];
      }
      const out = [];
      const visit = (node, context = {}, d = depth) => {
        if (d > 60) {
          this.limit('nesting');
          return;
        }
        if (node.nodeType === 3) {
          out.push({
            ...context,
            text: node.textContent.replace(/\s+/g, ' ')
          });
          return;
        }
        if (node.nodeType !== 1 || this.excluded(node) || !hiddenAllowed && this.hidden(node) || omitLists && ['UL', 'OL'].includes(node.tagName)) {
          return;
        }
        if (node.tagName === 'BR') {
          out.push({
            ...context,
            text: '\n'
          });
          return;
        }
        if (node.tagName === 'IMG' || node.tagName === 'SVG') {
          return;
        }
        const next = {
          ...context
        };
        if (node.tagName === 'A') {
          next.href = href(node.getAttribute('href'), node.baseURI);
        }
        if (['STRONG', 'B'].includes(node.tagName)) {
          next.emphasis = 'strong';
        }
        if (['EM', 'I'].includes(node.tagName)) {
          next.emphasis = 'em';
        }
        if (node.tagName === 'CODE') {
          next.emphasis = 'code';
        }
        for (const child of node.childNodes) {
          visit(child, next, d + 1);
        }
      };
      const outerLink = nodes[0]?.parentElement?.closest('a[href]');
      for (const node of nodes) {
        visit(node, outerLink ? {
          href: href(outerLink.getAttribute('href'), outerLink.baseURI)
        } : {});
      }
      if (out.length) {
        out[0].text = out[0].text.trimStart();
        out[out.length - 1].text = out[out.length - 1].text.trimEnd();
      }
      return out.filter(s => s.text.length);
    }
    list(el, hiddenAllowed, depth = 0) {
      if (depth > 40) {
        this.limit('list_nesting');
        return {
          ordered: false,
          start: 1,
          items: []
        };
      }
      const items = [...el.children].filter(n => n.tagName === 'LI' && (hiddenAllowed || !this.hidden(n))).map(li => ({
        inline: this.inline(li.childNodes, hiddenAllowed, true),
        children: [...li.querySelectorAll('ul,ol')].filter(list => list.parentElement.closest('li') === li && list.parentElement.closest('ul,ol') === el).map(list => this.list(list, hiddenAllowed, depth + 1))
      }));
      return {
        ordered: el.tagName === 'OL',
        start: Number(el.getAttribute('start')) || 1,
        items
      };
    }
    add(node, section, data, part = '') {
      if (!this.check()) {
        return null;
      }
      const key = this.id(node) + ':' + section.id + ':' + part;
      const fingerprint = JSON.stringify(data);
      const variants = this.observations.get(key) || new Map();
      if (variants.has(fingerprint)) {
        return variants.get(fingerprint);
      }
      if (this.blockCount >= this.limits.blocks) {
        this.limit('blocks');
        this.capHit = true;
        return null;
      }
      const cost = Core.byteLength(fingerprint) * 2 + 512;
      if (this.bytes + cost > this.limits.bytes * 0.7) {
        this.limit('export_size');
        this.capHit = true;
        return null;
      }
      if (variants.size) {
        this.warn('changing_content', 'Content changed in a reused page element. Earlier observed versions were retained; their order may be uncertain.', 'Review the affected page content before using the export.');
      }
      const block = {
        id: 'b' + ++this.sequence,
        ...data
      };
      variants.set(fingerprint, block);
      this.observations.set(key, variants);
      this.sourceNodes.set(block.id, node);
      section.blocks.push(block);
      section.order.push(block.id);
      this.bytes += cost;
      this.blockCount++;
      this.generation++;
      return block;
    }
    image(el, section, visibility, kind = 'img', backgroundURL = null) {
      if (this.result.images.length >= this.limits.images) {
        this.limit('images');
        return;
      }
      const raw = backgroundURL || (kind === 'img' ? el.currentSrc || el.getAttribute('src') || el.getAttribute('data-src') : null);
      const url = raw ? href(raw, el.baseURI, true) : null;
      const alt = kind === 'img' ? el.getAttribute('alt') : el.getAttribute('aria-label') || el.querySelector('title')?.textContent || null;
      const caption = clean(el.closest('figure')?.querySelector('figcaption')?.textContent) || null;
      const decorative = el.getAttribute('role') === 'presentation' || el.getAttribute('aria-hidden') === 'true' || kind === 'img' && alt === '';
      if (!url && raw?.startsWith('data:')) {
        this.warn('inline_image', 'Inline image bytes were omitted; source descriptions and context were retained.', null, 'info');
      }
      if (url?.startsWith('blob:')) {
        this.warn('temporary_image', 'Some image references are temporary browser URLs and may not work later.', null, 'info');
      }
      if (!url && !alt && kind === 'svg') {
        return;
      }
      const data = {
        url,
        alt: alt === null ? null : clean(alt),
        caption,
        decorative,
        source_kind: kind
      };
      const block = this.add(el, section, {
        type: 'image',
        visibility,
        image_signature: JSON.stringify(data)
      }, 'image-' + kind);
      if (!block || block.image_id) {
        return;
      }
      // The signature is an internal deduplication key, never exported.
      delete block.image_signature;
      const id = 'i' + ++this.sequence;
      block.image_id = id;
      this.result.images.push({
        id,
        ...data,
        association: {
          section_id: section.id,
          related_block_ids: [],
          basis: caption ? 'explicit_caption' : section.grouping_basis === 'card_container' ? 'shared_card' : 'shared_section',
          certainty: kind === 'background' || section.grouping_basis === 'card_container' ? 'inferred' : 'supported'
        }
      });
    }
    addScroller(el, root = false) {
      if (!el || this.scrollers.has(el)) {
        return;
      }
      if (!root && this.scrollers.size > this.limits.nestedScrollers) {
        this.warn('nested_scroll_limit', 'Additional scrolling areas were found beyond the supported limit.', 'Scroll the affected area manually and capture again.');
        return;
      }
      this.scrollers.set(el, {
        left: el.scrollLeft,
        top: el.scrollTop,
        root
      });
    }
    observe(doc) {
      if (this.observers.has(doc)) {
        return;
      }
      const observer = new MutationObserver(() => {
        this.lastMutation = Date.now();
      });
      observer.observe(doc.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
      this.observers.set(doc, observer);
    }
    async scan() {
      this.observe(document);
      let visited = 0;
      const visit = async (el, region, section, hiddenAllowed = false, depth = 0) => {
        if (!this.check()) {
          return;
        }
        if (++visited > this.limits.nodesPerPass) {
          this.limit('scan_nodes');
          this.capHit = true;
          return;
        }
        if (visited % 150 === 0) {
          await this.pause(0);
          if (!this.check()) {
            return;
          }
        }
        if (depth > 70) {
          this.limit('nesting');
          return;
        }
        if (el.nodeType !== 1 || this.excluded(el)) {
          return;
        }
        if (!hiddenAllowed && this.hidden(el)) {
          return;
        }
        const closedDetails = el.tagName === 'DETAILS' && !el.open;
        const controlledHidden = el.getAttribute('aria-expanded') === 'false';
        if (closedDetails || controlledHidden) {
          this.warn('collapsed_controls', 'Collapsed sections or controls were found. Only available source content was captured.', 'Expand relevant FAQs, tabs or menus manually, then retry.');
        }
        if (el.getAttribute('role') === 'tablist' || el.getAttribute('aria-roledescription') === 'carousel') {
          this.warn('alternate_panels', 'Tabs or carousel content may have additional states that were not displayed.', 'Select relevant panels manually and capture again.');
        }
        const type = LANDMARK[el.tagName] || {
          banner: 'header',
          navigation: 'navigation',
          main: 'main',
          contentinfo: 'footer',
          complementary: 'aside'
        }[el.getAttribute('role')];
        if (type) {
          region = this.region(el, type);
          section = region.sections[0];
        } else if (['SECTION', 'ARTICLE', 'FIGURE'].includes(el.tagName) || /(^|[\s_-])(card|service-item|feature-item)([\s_-]|$)/i.test(el.className?.baseVal ?? el.className ?? '')) {
          section = this.section(el, section, ['SECTION', 'ARTICLE', 'FIGURE'].includes(el.tagName) ? 'semantic_container' : 'card_container');
        }
        const visibility = hiddenAllowed ? 'hidden' : 'visible';
        const style = el.ownerDocument.defaultView.getComputedStyle(el);
        if (/reverse$/.test(style.flexDirection) || style.order && style.order !== '0') {
          this.warn('visual_order', 'CSS changes the visual order of some content. The export preserves observed source order.', 'Compare this area with your separately captured visual reference.');
        }
        if (el.scrollHeight > el.clientHeight + 80 && el.clientHeight > 100 && /(auto|scroll)/.test(style.overflowY)) {
          this.addScroller(el);
        }
        const rect = el.getBoundingClientRect();
        if (style.backgroundImage !== 'none' && rect.width >= 64 && rect.height >= 64) {
          const match = style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
          if (match) {
            this.image(el, section, visibility, 'background', match[1]);
          }
        }
        if (el.tagName === 'IMG') {
          this.image(el, section, visibility);
          return;
        }
        if (el.tagName.toLowerCase() === 'svg') {
          this.image(el, section, visibility, 'svg');
          return;
        }
        if (['CANVAS', 'VIDEO'].includes(el.tagName) && rect.width > 80 && rect.height > 40) {
          this.warn('visual_only_content', 'Canvas or video content cannot be read as page text.', 'Use your existing external screenshot workflow for visual context.');
        }
        if (el.tagName === 'IFRAME') {
          try {
            const child = el.contentDocument;
            if (!child?.body) {
              throw new Error('inaccessible');
            }
            this.observe(child);
            if (child.scrollingElement.scrollHeight > child.scrollingElement.clientHeight + 80) {
              this.addScroller(child.scrollingElement);
            }
            const frameRegion = this.region(el, 'embedded');
            frameRegion.source_url = child.URL;
            await visit(child.body, frameRegion, frameRegion.sections[0], false, depth + 1);
          } catch {
            if (rect.width > 32 && rect.height > 32) {
              this.warn('embedded_content', 'An embedded frame could not be read with current-page access.', 'Open relevant embedded content as a normal page and capture it separately.');
            }
          }
          return;
        }
        let payload = null;
        const match = el.tagName.match(/^H([1-6])$/);
        const isHeading = el.getAttribute('role') === 'heading';
        if (match || isHeading) {
          const rich = this.inline(el.childNodes, hiddenAllowed);
          const ariaLevel = Number(el.getAttribute('aria-level'));
          payload = {
            type: 'heading',
            level: match ? Number(match[1]) : Number.isFinite(ariaLevel) && ariaLevel > 0 ? ariaLevel : null,
            semantic_source: match ? el.tagName.toLowerCase() : 'aria_heading',
            inline: rich,
            text: rich.map(s => s.text).join('')
          };
        } else if (['P', 'BLOCKQUOTE', 'PRE', 'BUTTON', 'A', 'FIGCAPTION', 'SUMMARY'].includes(el.tagName)) {
          // Containers containing actual block elements are traversed, so their children retain structure.
          if (!el.querySelector('h1,h2,h3,h4,h5,h6,p,ul,ol,table,section,article,div')) {
            const rich = this.inline([el], hiddenAllowed);
            payload = {
              type: el.tagName === 'BUTTON' || el.tagName === 'SUMMARY' ? 'button' : el.tagName === 'A' ? 'link' : el.tagName === 'BLOCKQUOTE' ? 'quote' : 'paragraph',
              inline: rich,
              text: rich.map(s => s.text).join('')
            };
          }
        } else if (['UL', 'OL'].includes(el.tagName)) {
          payload = {
            type: 'list',
            ...this.list(el, hiddenAllowed)
          };
        } else if (el.tagName === 'TABLE') {
          payload = {
            type: 'table',
            caption: clean(el.caption?.textContent) || null,
            rows: [...el.rows].filter(r => hiddenAllowed || !this.hidden(r)).map(row => [...row.cells].map(cell => ({
              inline: this.inline(cell.childNodes, hiddenAllowed),
              header: cell.tagName === 'TH',
              row_span: cell.rowSpan,
              col_span: cell.colSpan
            })))
          };
        } else if (el.tagName === 'DL') {
          const entries = [];
          let current = null;
          for (const item of el.children) {
            if (item.tagName === 'DT') {
              current = {
                term: this.inline(item.childNodes, hiddenAllowed),
                definitions: []
              };
              entries.push(current);
            }
            if (item.tagName === 'DD' && current) {
              current.definitions.push(this.inline(item.childNodes, hiddenAllowed));
            }
          }
          payload = {
            type: 'description_list',
            entries
          };
        }
        if (payload) {
          if (payload.text === undefined || clean(payload.text)) {
            this.add(el, section, {
              ...payload,
              visibility
            });
          }
          for (const image of el.querySelectorAll('img,svg')) {
            if (hiddenAllowed || !this.hidden(image)) {
              this.image(image, section, visibility, image.tagName.toLowerCase() === 'svg' ? 'svg' : 'img');
            }
          }
          return;
        }
        if (el.shadowRoot) {
          for (const child of el.shadowRoot.children) {
            await visit(child, region, section, hiddenAllowed, depth + 1);
          }
          // Light DOM is still visited once; slots themselves are not expanded twice.
        } else if (el.tagName.includes('-') && !clean(el.textContent) && rect.width > 80 && rect.height > 40) {
          this.warn('opaque_component', 'A custom page component exposed no readable text; content inside it may be unavailable.', 'Review this area with your separate visual reference.');
        }
        let run = [];
        let first = null;
        const flush = () => {
          const rich = this.inline(run, hiddenAllowed);
          if (rich.length && clean(rich.map(s => s.text).join(''))) {
            this.add(first, section, {
              type: 'text',
              visibility,
              inline: rich,
              text: rich.map(s => s.text).join('')
            }, 'inline');
          }
          run = [];
          first = null;
        };
        for (const child of el.childNodes) {
          if (child.nodeType === 3) {
            if (!first) {
              first = child;
            }
            run.push(child);
          } else if (child.nodeType === 1) {
            const inlineTag = ['SPAN', 'STRONG', 'B', 'EM', 'I', 'SMALL', 'BR', 'CODE', 'A'].includes(child.tagName) && !child.querySelector('img,svg,div,p,ul,ol,table,[role="heading"]') && child.getAttribute('role') !== 'heading';
            if (inlineTag && !closedDetails) {
              if (!first) {
                first = child;
              }
              run.push(child);
            } else {
              flush();
              await visit(child, region, section, hiddenAllowed || closedDetails && child.tagName !== 'SUMMARY', depth + 1);
            }
          }
        }
        flush();
      };
      const rootRegion = this.region(document.body, 'other');
      if (document.body) {
        await visit(document.body, rootRegion, rootRegion.sections[0]);
      }
      this.sort();
    }
    sort() {
      const walk = s => {
        s.order.sort((a, b) => {
          const x = this.sourceNodes.get(a);
          const y = this.sourceNodes.get(b);
          if (!x || !y || x === y || !x.isConnected || !y.isConnected || x.ownerDocument !== y.ownerDocument) {
            return 0;
          }
          const position = x.compareDocumentPosition(y);
          if (position & 1) {
            return 0;
          }
          return position & 4 ? -1 : position & 2 ? 1 : 0;
        });
        s.sections.forEach(walk);
      };
      this.result.regions.forEach(r => r.sections.forEach(walk));
    }
    snapshot(status = 'partial') {
      const sections = new Map();
      const walk = s => {
        sections.set(s.id, s);
        s.sections.forEach(walk);
      };
      this.result.regions.forEach(r => r.sections.forEach(walk));
      this.result.images.forEach(i => {
        i.association.related_block_ids = (sections.get(i.association.section_id)?.blocks || []).filter(b => b.type !== 'image').slice(0, 12).map(b => b.id);
      });
      const c = this.result.capture;
      c.status = status;
      c.counts = Core.counts(this.result);
      c.elapsed_ms = Date.now() - this.started;
      c.checks.comparison_pass_performed = this.compared;
      c.checks.observed_content_reconciled = this.compared && !this.capHit && !this.stopReason;
      c.scroll_steps = this.steps;
      c.position_restored = this.restored;
      c.coverage = 'Observed semantic content only; no guarantee of every possible page state. Closed shadow roots and non-text media may be unavailable.';
      return this.result;
    }
    async progress(stage, force = false) {
      const include = force || Date.now() - this.lastCheckpoint > 4000;
      if (include) {
        this.lastCheckpoint = Date.now();
      }
      const response = await this.report({
        type: 'PC_PROGRESS',
        id: this.job.id,
        url: this.job.url,
        stage,
        counts: Core.counts(this.result),
        elapsed: Date.now() - this.started,
        ...(include ? {
          result: this.snapshot()
        } : {})
      });
      if (response?.stale) {
        this.cancel('interrupted');
      }
    }
    async settle(deadline) {
      const start = Date.now();
      do {
        await this.pause(100);
      } while (this.check() && Date.now() < deadline && Date.now() - start < this.limits.waitMs && Date.now() - this.lastMutation < this.limits.quietMs);
    }
    move(el, top, left = el.scrollLeft) {
      if (!this.check()) {
        return;
      }
      if (this.steps >= this.limits.steps) {
        this.limit('scroll_steps');
        this.capHit = true;
        return;
      }
      el.scrollTo({
        top,
        left,
        behavior: 'instant'
      });
      this.steps++;
    }
    async sweep(deadline, comparison = false) {
      const finished = new Set();
      while (this.check()) {
        const entry = [...this.scrollers.entries()].find(([el]) => !finished.has(el) && el.isConnected);
        if (!entry) {
          return true;
        }
        const [el] = entry;
        if (el.scrollTop > 0) {
          this.move(el, 0);
        }
        await this.settle(deadline);
        await this.scan();
        let bottomChecks = 0;
        while (this.check()) {
          if (Date.now() >= deadline) {
            this.limit(comparison ? 'comparison_time' : 'collection_time');
            return false;
          }
          const before = this.generation;
          const height = el.scrollHeight;
          const max = Math.max(0, el.scrollHeight - el.clientHeight);
          if (el.scrollTop < max - 2) {
            this.move(el, Math.min(max, el.scrollTop + Math.max(80, el.clientHeight * 0.75)));
            bottomChecks = 0;
          } else {
            bottomChecks++;
          }
          await this.settle(deadline);
          await this.scan();
          await this.progress(comparison ? 'checking' : 'scrolling');
          if (bottomChecks >= 2 && height === el.scrollHeight && before === this.generation) {
            break;
          }
        }
        finished.add(el);
      }
      return false;
    }
    async run() {
      const onPageHide = () => this.cancel('interrupted');
      const onUserScroll = e => {
        if (e.isTrusted && (e.type !== 'keydown' || ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key))) {
          this.cancel('cancelled');
          this.userMoved = true;
        }
      };
      window.addEventListener('pagehide', onPageHide);
      for (const name of ['wheel', 'touchstart', 'keydown']) {
        window.addEventListener(name, onUserScroll, {
          passive: true
        });
      }
      try {
        await this.progress('reading');
        await this.scan();
        await this.progress('scrolling', true);
        await this.sweep(this.started + this.limits.collectMs);
        if (this.check()) {
          this.compared = await this.sweep(Math.min(this.started + this.limits.durationMs - 3000, Date.now() + this.limits.compareMs), true);
        }
      } catch (error) {
        this.warn('collection_error', 'Part of the page could not be read: ' + String(error.message).slice(0, 140), 'Reload the page and retry.');
      } finally {
        this.observers.forEach(o => o.disconnect());
        window.removeEventListener('pagehide', onPageHide);
        for (const name of ['wheel', 'touchstart', 'keydown']) {
          window.removeEventListener(name, onUserScroll);
        }
        if (location.href === this.job.url && !this.userMoved) {
          this.restored = true;
          for (const [el, original] of this.scrollers) {
            try {
              if (el.isConnected) {
                el.scrollTo({
                  top: original.top,
                  left: original.left,
                  behavior: 'instant'
                });
              }
            } catch {
              this.restored = false;
            }
          }
        }
      }
      if (this.stopReason) {
        this.warn(this.stopReason, this.stopReason === 'cancelled' ? 'Capture was cancelled before all checks finished.' : 'The source page or active tab changed during capture.', 'Return to the intended page and capture again.');
      }
      if (!this.compared) {
        this.warn('comparison_incomplete', 'The comparison pass did not finish.', 'Retry when the page has finished loading.');
      }
      const status = this.stopReason || (this.result.capture.warnings.some(w => w.severity === 'warning') || this.result.capture.limits_reached.length ? 'partial' : 'completed');
      const result = this.snapshot(status);
      result.capture.checks.schema_valid = Core.validate(result).length === 0;
      await this.report({
        type: 'PC_DONE',
        id: this.job.id,
        url: this.job.url,
        result
      });
      return result;
    }
  }
  globalThis.UpkoppCollector = Collector;
  if (globalThis.chrome?.runtime?.id) {
    let running = null;
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (sender.id !== chrome.runtime.id) {
        return;
      }
      if (message.type === 'PC_PING') {
        sendResponse({
          id: running?.job.id || null,
          url: location.href
        });
        return;
      }
      if (message.type === 'PC_CANCEL') {
        if (running?.job.id === message.id) {
          running.cancel(message.reason || 'cancelled');
        }
        sendResponse({
          ok: true
        });
        return;
      }
      if (message.type !== 'PC_START') {
        return;
      }
      if (running || message.job.url !== location.href) {
        sendResponse({
          ok: false
        });
        return;
      }
      running = new Collector(message.job, data => chrome.runtime.sendMessage(data).catch(() => ({
        stale: true
      })));
      sendResponse({
        ok: true
      });
      running.run().catch(() => {}).finally(() => {
        running = null;
      });
    });
  }
})();
