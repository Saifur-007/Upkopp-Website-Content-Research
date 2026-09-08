# Verification

## Latest local verification — 8 September 2026

Version 1.0.0 release candidate: syntax, manifest, popup assets, bundled font/license checks, and all 25 automated test entries passed. Packaging verification decompresses every runtime entry, compares it with its source, checks CRCs and central-directory offsets, and verifies repeatability. The fast-image-batch regression confirms progress messages are coalesced while all final failures and file counts are preserved. The actual overview browser fixture passed all 11 checks, including paragraphs, image references, and declared publication dates. The public-version Settings, Images, branding, and local help were reviewed in the simulated browser preview. Native Chrome installation, permission prompts, and downloads remain pending as described below.

Native Chrome installation, real permission prompts, and actual Chrome downloads still require the unpacked-extension smoke test below. The local browser preview does not provide those APIs.

## Run checks

Run `npm run check` and `npm test` from the project root. No dependency installation is required.

Run `npm run verify` for these checks plus a fresh store ZIP. The default preview port is 62445; set `UPKOPP_PREVIEW_PORT` when that port is already in use. This release was reviewed on port 62446. Browser fixture URLs below use the default port.

Automated coverage includes compact text fidelity, nested reading order, duplicate handling, tables and lists, schema checks, stale messages, navigation interruption, partial-result handling, download failures, storage failures, map hierarchy and frame isolation, minimal JSON, persisted preferences, ZIP generation, image-host access, URL validation, and collection limits.

Run `npm run preview` for the optional local design preview and browser fixtures:

- `http://127.0.0.1:62445/` — clearly labelled simulated design preview. Its controls demonstrate ready, progress, saved, and incomplete capture states.
- `http://127.0.0.1:62445/tests/browser/harness.html` — run the eight capture scenarios against the production collector.
- `http://127.0.0.1:62445/tests/browser/map-harness.html` — run the eight map scenarios against the production map reader.
- `http://127.0.0.1:62445/tests/browser/overview.html` — eleven automatic checks for paragraphs, declared publication dates, alt text, captions, hidden images, backgrounds, inline SVGs, and literal source strings.
- `http://127.0.0.1:62445/tests/browser/indexability.html` — seven automatic checks for response HTML, headers, canonicals, robots.txt, sitemaps, and language alternatives.

The design preview mocks Chrome APIs. Browser fixtures exercise actual DOM readers but do not validate Chrome's installation, permission prompts, native side panel, or actual downloads. Check those with a loaded unpacked extension before tagging a release.

Manual Chrome smoke test:

1. Load the folder containing `manifest.json` and open a normal website.
2. Check Content, Images, Social tags, Indexability, and Page map; follow a heading and then start Text capture.
3. Keep the source selected until capture finishes. Verify the downloaded file contains original text without raw page metadata.
4. Cancel another capture and confirm the partial result explains its limitations and waits for an explicit export.
5. Change the JSON alt-text option, save-location prompting, automatic text saving, and theme; reopen Chrome to confirm preferences persist. Reset defaults and verify each control.
6. Check the native popup, larger workspace, and side panel; verify a protected browser page gives a useful message.
7. Select all images (also try a filter and a list longer than 40), then Download selected, or use Download all images directly. Grant the requested image-host access. Close the popup while packaging and reopen it to check progress. Verify one ZIP containing one folder with valid original image files, deduplication, and a failure report for blocked resources. Cancel a ZIP download and confirm failure is shown. Export JSON and confirm Content includes title, description, word count, and page text, and Page map includes headings, landmarks, and numbered sections. Enable optional alt text and verify it too.
