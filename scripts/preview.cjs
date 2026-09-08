/* Dependency-free localhost server for design review and controlled browser fixtures. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tests/browser/generated');
fs.mkdirSync(output, {
  recursive: true
});
let html = fs.readFileSync(path.join(root, 'src/popup/popup.html'), 'utf8');
html = html.replace('<head>', '<head>\n  <base href="/src/popup/">\n  <script src="/tests/browser/preview-adapter.js"></script>\n  <style>.preview-banner{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 16px;background:#f0edff;color:#29213d;border-bottom:1px solid #d8d0ff}.preview-banner strong{font-size:12px;margin-right:auto}.preview-banner button{width:auto;min-height:32px;padding:4px 12px}body{height:100vh;display:flex;flex-direction:column;overflow:hidden}.preview-banner{flex-shrink:0}.uk-shell{height:auto;flex:1;width:100%;max-width:920px;max-height:740px;margin:20px auto;border:1px solid var(--line);box-shadow:0 4px 20px #0001}@media(max-width:940px){.uk-shell{margin:0 auto;max-height:none;border:0}}</style>');
fs.writeFileSync(path.join(output, 'preview.html'), html);
fs.writeFileSync(path.join(output, 'overview-collector.js'), 'globalThis.UpkoppOverviewFixture = ' + fs.readFileSync(path.join(root, 'src/content/page-overview.js'), 'utf8'));
fs.writeFileSync(path.join(output, 'indexability-collector.js'), 'globalThis.UpkoppIndexabilityFixture = ' + fs.readFileSync(path.join(root, 'src/content/indexability.js'), 'utf8'));
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf'
};
const port = Number(process.env.UPKOPP_PREVIEW_PORT || 62445);
http.createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/robots.txt') {
      response.writeHead(200, {
        'Content-Type': 'text/plain'
      }).end('User-agent: *\nDisallow: /private/\nSitemap: http://127.0.0.1:' + port + '/sitemap.xml');
      return;
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/tests/browser/generated/preview.html' : pathname));
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'text/plain',
      'Cache-Control': 'no-store',
      ...(pathname === '/tests/browser/indexability.html' ? {
        'X-Robots-Tag': 'noindex, follow'
      } : {})
    });
    fs.createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log('Upkopp design preview: http://127.0.0.1:' + port + '/'));
