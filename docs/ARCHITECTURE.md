# Architecture

Upkopp uses Chrome Manifest V3. The toolbar popup and optional side panel share one interface. The service worker owns capture state and routes requests to on-demand content scripts. Nothing is injected automatically on every website.

## Boundaries

- `capture-core.js` validates the internal capture model and produces compact plain-text exports. The richer internal model retains reading order and evidence for partial-result checks; it is not the user's download format.
- `capture.js` reads visible page copy, handles bounded scrolling and comparison, and reports checkpoints. Capture is bounded by time, node, block, and payload limits. Original text is preserved; navigation menus and image metadata are excluded from the main export.
- `service-worker.js` serializes capture changes, rejects stale document messages, preserves the previous result when possible, and observes actual download completion.
- `page-map.js` in the background isolates frame access failures and checks the current page before acting. The content-side page map provides accessible outlines, bounded updates, and temporary highlights.
- `page-overview.js` reads current main-document and open-shadow content, social metadata, and image references without network requests. Headings and paragraphs retain source order. Image entries include hidden and lazy references, inline SVGs, and CSS backgrounds. Collection limits and coverage notes accompany the result.
- `indexability.js` makes bounded same-origin requests for response HTML and robots.txt. It parses canonical tags and robots metadata inertly, reports X-Robots-Tag and sitemap declarations, and distinguishes unavailable checks from missing tags. It does not infer a crawler-specific robots verdict or actual search-engine indexing.
- `research-core.js` combines Content fields with readable Page map headings, landmarks, and numbered sections; only image alt text is optional. Display filtering does not reduce the export, and internal map identifiers are removed. A matching retained capture can supply fuller text; matching checks include the tab and document identity. Image bytes and the internal capture tree stay out of JSON.
- `image-downloads.js` coordinates one ZIP job, deduplicates URLs, checks granted image-host permissions, persists progress, and reconciles Chrome download completion after worker restarts. It closes the offscreen document when the download ends.
- `offscreen/images.js` owns the local archive Blob independently of popup lifetime and reports progress through guarded runtime messages. The service worker routes archive updates before its popup-only message guard. Chrome’s [offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen) provides Blob support; this document uses only the runtime extension API.
- `image-archive.js` fetches bounded image streams without credentials or redirects, validates response types, and reports skipped images. `zip-core.js` builds dependency-free stored ZIP entries with CRC32 and a central directory. All files share one site-named folder inside one archive, with a short report only for partial exports. ZIP paths are validated to reject absolute paths, traversal, and duplicates.
- `settings.js` validates and persists export and appearance preferences. Existing map theme preferences migrate on first read.
- `research.js` validates the current source window and routes on-demand research, image ZIP, and larger-workspace requests.
- Popup scripts render website strings using DOM text properties. They never execute website markup.

## Naming and style

Production globals use the `Upkopp` prefix. `PC_`, `PM_`, and `UK_` message prefixes identify capture, page-map, and workspace requests. Chrome API boundaries use explicit request handlers; the interface does not own capture state.

Use two spaces, UTF-8, LF line endings, descriptive function names, braced control flow, and external scripts compatible with the extension content security policy. Prefer small functions organized by responsibility. The UI uses a 4px spacing scale; 1px separators and focus outlines are visual strokes, not spacing units.

`fonts.css` loads bundled Poppins Regular, Medium, and SemiBold from `assets/fonts`. The light sidebar uses text navigation and a neutral active state. Report rows align labels with values; sections retain native disclosure controls, and the sticky toolbar keeps export actions available while scrolling. Content separates its indented heading outline from full page text. Character badges show actual lengths, not SEO grades. Publication dates come only from declared page metadata and are omitted from JSON when unavailable. Narrow side panels use the view selector and stacked report rows. The Inspect menu closes on outside clicks or Escape and restores keyboard focus on Escape.

## Result lifecycle

Capture starts only from an explicit action. Progress survives the popup closing through the service worker and session storage. Completed, validated results download automatically unless the user disables automatic saving in Settings. Partial, cancelled, or interrupted results remain available for review and explicit export. An empty or invalid result is not downloaded automatically.

Session storage is temporary. At most the current and previous retained results are offered by the interface. A storage failure is disclosed instead of implying persistence. Export and reading preferences use local storage and survive browser restarts.

## Release engineering

`scripts/package.cjs` builds a deterministic DEFLATE ZIP from an explicit runtime allowlist. Development fixtures, simulated data, store materials, and repository tooling are excluded. The package includes the font license and ownership notices, has a root manifest, and receives a SHA-256 checksum. Packaging tests decompress every entry, verify CRCs and central-directory offsets, compare bytes with the source, and confirm repeatability on the same runtime.

The overview avoids layout-sensitive text reads on non-leaf containers. Image gallery cards are assembled in a document fragment before replacement. Fast image batches coalesce progress messages to ten per second, preserving the first and final snapshot and all failure details. JSON export locks before its first asynchronous read to prevent duplicate export jobs. No benchmarked whole-page speedup is claimed.

## Scope

Keep original source gathering inside Upkopp. Screenshots, AI analysis, and copywriting happen outside the extension. There is no remote service, authentication, paid metrics, crawler, request rewriting, or scheduled monitoring component. Only explicitly requested page-level indexability checks and image fetching for requested ZIP exports add network requests. JSON export reads current Content and Page map together, checks source tab/document identity, and performs no indexability requests.
