document.getElementById('run').onclick = async () => {
  const status = document.getElementById('status');
  const out = document.getElementById('results');
  const frame = document.getElementById('fixture');
  const w = frame.contentWindow;
  const d = frame.contentDocument;
  const agent = w.UpkoppPageMap;
  let passed = 0;
  let failed = 0;
  out.replaceChildren();
  const assert = (value, message) => {
    if (!value) {
      throw Error(message);
    }
  };
  const test = async (name, fn) => {
    const li = document.createElement('li');
    try {
      await fn();
      li.textContent = 'PASS — ' + name;
      passed++;
    } catch (error) {
      li.textContent = 'FAIL — ' + name + ': ' + error.message;
      failed++;
    }
    out.append(li);
  };
  await test('Headings, original spaces, ARIA defaults, deep levels and names', () => {
    const r = agent.scan({
      ariaNames: true
    }, true);
    assert(r.headings[0].label === 'Garden care services', 'word spacing');
    assert(r.headings.find(h => h.label === 'Default ARIA level').level === 2, 'ARIA default');
    assert(r.headings.find(h => h.label === 'Level eight').level === 8, 'deep level');
    assert(r.headings.find(h => h.label === 'Invalid level').warnings.length, 'invalid level warning');
    assert(r.headings.some(h => h.label === 'Contact accessible'), 'accessible name');
    assert(agent.scan({
      ariaNames: false
    }, true).headings.some(h => h.label === 'Contact visible'), 'visible name');
  });
  await test('Hidden, inert and closed details distinguished from screen-reader-only content', () => {
    const r = agent.scan();
    for (const label of ['Hidden heading', 'Inert heading', 'Closed answer']) {
      assert(r.headings.find(h => h.label === label).hidden, label);
    }
    assert(!r.headings.find(h => h.label === 'Screen reader heading').hidden, 'screen-reader heading should remain');
  });
  await test('Nested open shadow roots and real anchor links', () => {
    const r = agent.scan();
    assert(r.headings.some(h => h.label === 'Nested shadow content'), 'nested shadow');
    assert(r.headings[0].href.endsWith('#intro'), 'anchor');
  });
  await test('Nested landmarks and section headings', () => {
    const r = agent.scan();
    const l = UpkoppMapCore.landmarkTree(r.landmarks);
    assert(l.some(x => x.role === 'main' && x.parent), 'nested main');
    assert(l.some(x => x.warnings.some(w => w.includes('distinct'))), 'duplicate names');
    assert(r.sections.some(x => x.label === 'Services'), 'section title');
  });
  await test('Unchanged map reuses scan; DOM mutations refresh the map', async () => {
    const a = agent.scan({}, true);
    const b = agent.scan({});
    assert(a.scanCount === b.scanCount, 'cache');
    const h = d.createElement('h2');
    h.textContent = 'New heading';
    d.getElementById('mutations').append(h);
    await new Promise(r => setTimeout(r, 20));
    const c = agent.scan({});
    assert(c.headings.some(h => h.label === 'New heading'), 'live mutation');
    assert(c.scanCount > a.scanCount, 'new scan');
    h.remove();
  });
  await test('Jump, highlight, viewport membership and overlay cleanup', () => {
    const r = agent.scan({}, true);
    const bottom = r.headings.find(h => h.label === 'Bottom');
    agent.action({
      epoch: r.epoch,
      url: r.url,
      action: 'jump',
      id: bottom.id,
      offset: 80,
      highlight: true
    });
    assert(w.scrollY > 100, 'jump should scroll');
    assert(d.querySelector('[data-page-capture-ui]'), 'highlight');
    assert(agent.scan({}).visibleIds.includes(bottom.id), 'viewport');
    agent.action({
      epoch: r.epoch,
      url: r.url,
      action: 'reveal',
      kind: 'headings',
      enabled: true
    });
    agent.action({
      epoch: r.epoch,
      url: r.url,
      action: 'reveal',
      enabled: false
    });
    assert(!d.querySelector('[data-page-capture-ui]'), 'cleanup');
  });
  await test('Stale document and removed targets rejected', () => {
    const r = agent.scan({}, true);
    let rejected = false;
    try {
      agent.action({
        epoch: 'stale',
        url: r.url,
        action: 'jump',
        id: r.headings[0].id
      });
    } catch {
      rejected = true;
    }
    assert(rejected, 'stale epoch');
    const n = d.createElement('h2');
    n.textContent = 'Remove me';
    d.body.append(n);
    const fresh = agent.scan({}, true);
    const target = fresh.headings.find(h => h.label === 'Remove me');
    n.remove();
    rejected = false;
    try {
      agent.action({
        epoch: fresh.epoch,
        url: fresh.url,
        action: 'jump',
        id: target.id
      });
    } catch {
      rejected = true;
    }
    assert(rejected, 'removed target');
  });
  await test('Ancestor frame reveal uses the actual child window', async () => {
    const outer = UpkoppPageMap.scan({}, true);
    const inner = agent.scan({}, true);
    const token = crypto.randomUUID();
    UpkoppPageMap.action({
      epoch: outer.epoch,
      url: outer.url,
      action: 'arm-frame',
      token
    });
    agent.action({
      epoch: inner.epoch,
      url: inner.url,
      action: 'reveal-frame',
      token
    });
    await new Promise(r => setTimeout(r, 30));
    const rect = frame.getBoundingClientRect();
    assert(rect.top < innerHeight && rect.bottom > 0, 'frame brought into view');
  });
  status.textContent = 'Finished: ' + passed + ' passed, ' + failed + ' failed';
};
