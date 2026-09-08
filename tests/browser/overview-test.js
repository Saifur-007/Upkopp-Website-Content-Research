/* Browser coverage for the actual overview reader. */
(() => {
  const data = globalThis.UpkoppOverviewFixture;
  const checks = [['original title and description', data.title === 'Upkopp overview fixture' && data.description === 'Original wording & punctuation.'], ['visible headings only', data.headings.length === 1 && data.headings[0].text === 'Original heading'], ['paragraphs accompany headings in reading order', data.blocks[0].type === 'heading' && data.blocks.some(block => block.text === 'Original copy for research.')], ['image alt text and captions', data.images[0].alt === 'Lavender & grasses' && data.images[0].caption === 'Caption from the page.'], ['empty and missing alt attributes remain distinct', data.images[1].alt === '' && data.images[2].alt === null], ['source markup stays literal text', data.images[3].alt === '<strong>Literal text</strong>'], ['hidden images remain in the inventory', data.images.some(image => image.alt === 'Hidden image' && !image.visible)], ['CSS backgrounds and inline SVGs are included', data.images.some(image => image.kind === 'background') && data.images.some(image => image.kind === 'inline-svg')], ['image URLs are usable and raw page HTML is absent', data.images[0].src.endsWith('/plant.svg') && !('html' in data)]];
  const output = document.createElement('pre');
  checks.push(['page-provided publication date', data.dates.published === '2026-08-01'], ['page-provided modification date', data.dates.modified === '2026-09-08']);
  output.textContent = checks.map(([label, passed]) => (passed ? 'PASS ' : 'FAIL ') + label).join('\n');
  document.body.append(output);
  document.getElementById('result').textContent = checks.every(([, passed]) => passed) ? checks.length + ' passed, 0 failed' : 'Some checks failed';
})();
