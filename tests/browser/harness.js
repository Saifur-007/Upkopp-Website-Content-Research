let frame = document.getElementById('fixture');
const output = document.getElementById('results');
const status = document.getElementById('status');
const allBlocks = result => {
  const list = [];
  const walk = s => {
    list.push(...s.blocks);
    s.sections.forEach(walk);
  };
  result.regions.forEach(r => r.sections.forEach(walk));
  return list;
};
function assert(condition, label) {
  if (!condition) {
    throw new Error(label);
  }
}
async function capture(mode, override = {}) {
  const old = frame;
  const fresh = document.createElement('iframe');
  fresh.id = 'fixture';
  fresh.title = 'Controlled capture page';
  frame = fresh;
  await new Promise((resolve, reject) => {
    let done = false;
    const ready = () => {
      try {
        if (!frame.contentWindow.UpkoppCollector || frame.contentDocument.readyState !== 'complete' || done) {
          return;
        }
        done = true;
        clearTimeout(timeout);
        clearInterval(poll);
        resolve();
      } catch {}
    };
    const timeout = setTimeout(() => {
      done = true;
      clearInterval(poll);
      reject(new Error('Fixture loading timed out'));
    }, 20000);
    const poll = setInterval(ready, 100);
    frame.onload = ready;
    frame.src = 'fixture.html?case=' + mode;
    old.replaceWith(frame);
  });
  const win = frame.contentWindow;
  const collector = new win.UpkoppCollector({
    id: 'fixture-' + mode,
    url: win.location.href,
    limits: {
      durationMs: 10000,
      collectMs: 5000,
      compareMs: 3000,
      quietMs: 120,
      waitMs: 220,
      ...override
    }
  }, async () => ({
    ok: true
  }));
  if (mode === 'cancel') {
    setTimeout(() => collector.cancel(), 350);
  }
  if (mode === 'navigation') {
    setTimeout(() => win.history.pushState({}, '', '?case=navigated'), 350);
  }
  const result = await collector.run();
  document.getElementById('json').textContent = JSON.stringify(result, null, 2);
  assert(win.UpkoppCapture.validate(result).length === 0, 'Schema: ' + win.UpkoppCapture.validate(result).join(', '));
  return {
    result,
    win,
    collector,
    blocks: allBlocks(result)
  };
}
document.getElementById('run').addEventListener('click', async () => {
  document.getElementById('run').disabled = true;
  output.replaceChildren();
  let passed = 0;
  let failed = 0;
  const only = new URLSearchParams(location.search).get('only');
  const test = async (label, fn) => {
    if (only && !label.startsWith(only)) {
      return;
    }
    status.textContent = 'Running: ' + label;
    const li = document.createElement('li');
    try {
      await fn();
      li.textContent = 'PASS — ' + label;
      passed++;
    } catch (e) {
      li.textContent = 'FAIL — ' + label + ': ' + e.message;
      failed++;
    }
    output.append(li);
  };
  await test('Static fidelity, hierarchy, lists, tables, image context and private-field exclusion', async () => {
    const {
      result,
      blocks
    } = await capture('static');
    assert(result.capture.status === 'completed', 'Expected completed, got ' + result.capture.status);
    assert(blocks.some(b => b.text === 'Exact punctuation: “£25”, café & soil. Contact us today.'), 'Exact wording');
    assert(blocks.some(b => b.level === 8 && b.semantic_source === 'aria_heading'), 'Accessible heading level');
    assert(blocks.filter(b => b.text === 'Same wording.').length === 2, 'Legitimate repeated text');
    const list = blocks.find(b => b.type === 'list');
    assert(list.start === 3 && list.items[0].children[0].items[0].inline[0].text === 'Nested item', 'Nested list');
    const table = blocks.find(b => b.type === 'table');
    assert(table.rows[1][0].row_span === 2 && table.rows[0][0].header, 'Table structure');
    assert(result.images.length === 2 && result.images[0].association.section_id !== result.images[1].association.section_id, 'Image card associations');
    assert(!JSON.stringify(result).includes('PRIVATE_'), 'Private form content excluded');
    const p = blocks.find(b => b.text?.startsWith('Exact punctuation'));
    assert(p.inline.some(s => s.href?.endsWith('/contact?service=garden')), 'Inline link kept');
    const sections = [];
    const walk = s => {
      sections.push(s);
      s.sections.forEach(walk);
    };
    result.regions.forEach(r => r.sections.forEach(walk));
    const outer = sections.find(s => s.blocks.some(b => b.text === 'First service'));
    const after = outer.blocks.find(b => b.text === 'After nested detail.');
    assert(outer.order.indexOf(outer.sections[0].id) < outer.order.indexOf(after.id), 'Nested section interleaving');
  });
  await test('Delayed content and recycled virtual items survive incremental capture', async () => {
    const {
      result,
      blocks
    } = await capture('dynamic');
    assert(blocks.some(b => b.text === 'Delayed content appeared.'), 'Delayed text');
    assert(blocks.some(b => b.text === 'Virtual item zero.') && blocks.some(b => b.text === 'Virtual item one.'), 'Earlier recycled item retained');
    assert(result.capture.status === 'partial', 'Changed content qualified');
  });
  await test('Collapsed and inaccessible content produces honest warnings', async () => {
    const {
      result,
      blocks
    } = await capture('hidden');
    assert(result.capture.status === 'partial', 'Partial');
    assert(blocks.some(b => b.text === 'Hidden source answer.' && b.visibility === 'hidden'), 'Hidden answer labelled');
    assert(result.capture.warnings.some(w => w.category === 'embedded_content'), 'Embedded warning');
  });
  await test('Nested scroller collection and original-position restoration', async () => {
    const {
      result,
      win,
      collector,
      blocks
    } = await capture('nested');
    assert(blocks.some(b => b.text === 'Nested bottom.'), 'Nested bottom');
    const nested = win.document.querySelector('.nested');
    const original = collector.scrollers.get(nested)?.top;
    assert(Math.abs(original - 75) < 1 && Math.abs(nested.scrollTop - original) < 0.5, 'Original nested position restored');
    assert(result.capture.position_restored, 'Restored status');
  });
  await test('Open shadow content is readable', async () => {
    const {
      blocks
    } = await capture('shadow');
    assert(blocks.some(b => b.text === 'Open shadow content.'), 'Shadow paragraph');
  });
  await test('Infinite loading stops within configured bounds', async () => {
    const {
      result
    } = await capture('infinite', {
      steps: 5
    });
    assert(result.capture.status === 'partial' && result.capture.limits_reached.includes('scroll_steps'), 'Bounded partial');
  });
  await test('Cancellation keeps a labelled partial result and restores position', async () => {
    const {
      result,
      win
    } = await capture('cancel');
    assert(result.capture.status === 'cancelled', 'Cancelled status');
    assert(win.scrollY === 0, 'Restored position');
  });
  await test('Client-side navigation interrupts source ownership', async () => {
    const {
      result
    } = await capture('navigation');
    assert(result.capture.status === 'interrupted', 'Interrupted status');
    assert(result.page.url.includes('case=navigation'), 'Original URL preserved');
  });
  status.textContent = `Finished: ${passed} passed, ${failed} failed`;
  document.getElementById('run').disabled = false;
});
