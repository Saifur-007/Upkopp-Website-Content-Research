(async () => {
  const data = await globalThis.UpkoppIndexabilityFixture;
  const checks = [['rendered canonical URL is resolved', data.canonical.rendered[0] === location.href], ['response HTML canonical is parsed without execution', data.canonical.raw?.[0] === location.href], ['response HTTP status and X-Robots-Tag are available', data.response.status === 200 && data.response.xRobotsTag === 'noindex, follow'], ['HTTP noindex overrides a permissive rendered meta tag', data.summary === 'noindex-detected'], ['robots.txt rules and sitemap declarations are read', data.robotsTxt.text.includes('Disallow: /private/') && data.sitemaps[0] === location.origin + '/sitemap.xml'], ['hreflang is preserved', data.hreflangs[0].language === 'en-GB'], ['raw HTML is excluded from the result', !JSON.stringify(data).includes('<html')]];
  const output = document.createElement('pre');
  output.textContent = checks.map(([label, passed]) => (passed ? 'PASS ' : 'FAIL ') + label).join('\n');
  document.body.append(output);
  document.getElementById('result').textContent = checks.every(([, passed]) => passed) ? '7 passed, 0 failed' : 'Some checks failed';
})();
