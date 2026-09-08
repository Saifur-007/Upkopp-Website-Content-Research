<img src="store/assets/github-cover.svg" alt="Upkopp — collect source material, write with context" width="100%">

# Upkopp — Website Content Research

**Collect source material. Write with context.**

Made by Upkopp for copywriters, content strategists, and web designers preparing website rewrites. Collect the existing words, understand page structure, and gather image references before you write.

**Version 1.0.0 · First public release candidate · Chrome 116+**

Not yet published in the Chrome Web Store. This repository contains the unpacked extension and first-submission materials. See [release status](docs/RELEASE.md) for the remaining publication tasks.

## Your first research pass

1. Open a website and click Upkopp. Read its metadata, headings, and paragraphs in **Content**.
2. Explore **Page map** to understand the hierarchy and jump to relevant sections.
3. Choose **Export JSON** to save Content and Page map together, or **Capture text** for a scrolling pass saved as plain text.
4. Review the export and bring the source material into your writing workflow.

Upkopp preserves original wording. Screenshots, AI analysis, and copywriting happen outside the extension.

## Features

| Feature | What it helps you do |
| --- | --- |
| Content | Read metadata, declared dates, word count, indented headings, and full paragraphs. Copy text or headings. |
| Page map | Search headings, landmarks, and sections; jump to content; inspect permitted embedded pages. |
| Text capture | Collect page copy through bounded scrolling. Review incomplete results before exporting. |
| JSON export | Save Content and Page map in one readable file, with optional unique image alt text. |
| Images | Review image references, alt text, and captions. Download all images or a selection in one ZIP containing one folder. |
| Social tags & Indexability | Inspect sharing metadata, canonical links, robots signals, and sitemap declarations as research context. |
| Settings | Choose theme, optional JSON alt text, automatic text saving, and save-location prompts. |

The interface uses bundled Poppins, a neutral sidebar, a 4px spacing scale, and a popup, larger window, or side panel.

## Install locally

1. Download or clone this repository. Extract it first if it is a ZIP.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select this folder containing `manifest.json`.
4. Open a website and click the Upkopp toolbar icon.

No build, dependency installation, Docker, server, or account is needed. After editing files, reload Upkopp in Chrome and refresh the source website.

## Useful exports without unnecessary bulk

JSON includes `content` (title, description, word count, page text, and dates when available) and `pageMap` (headings, landmarks, and numbered sections). It retains source URLs and coverage notes but excludes raw HTML, internal identifiers, image bytes, and unrelated technical reports. Map search, collapsed branches, and pagination do not shorten the export. A matching retained capture supplies fuller copy when available.

Image downloads produce **one ZIP → one site-named folder → image files**. Duplicate URLs are included once. An incomplete archive includes a short failure report. Optional permission prompts name the image hosts being accessed.

## Privacy and limits

Selected page content is processed locally and is not uploaded to Upkopp. No analytics, ads, accounts, or AI integrations are included. Page checks and image requests contact the original sites. Settings stay on your device; captures are temporary until exported. Read [privacy and permissions](docs/PRIVACY.md).

Keep the source tab selected during capture and expand needed content first. Protected pages, some embedded content, closed shadow roots, temporary images, and text inside images may be unavailable. Review partial results. ZIP limits are 2,000 unique images, 20 MB per file, 128 MB total, and a bounded fetch duration. These are page research tools, not a complete-capture guarantee or a comprehensive SEO audit.

## Development and packaging

Use Node.js 22 or newer. No dependency installation is required.

```sh
npm run verify
npm run preview
```

`verify` checks source files, runs tests, and creates `dist/upkopp-content-research-1.0.0.zip`, its SHA-256 checksum, and a file inventory. The ZIP contains only runtime code, assets, and ownership notices, with `manifest.json` at its root. Development files and simulated data are excluded.

`preview` starts an optional localhost design preview with simulated data. It is clearly labelled and is never included in the store ZIP. Stop the server with Ctrl+C.

GitHub Actions verifies pushes and pull requests on Windows and Linux. It does not publish or submit anything.

| Folder | Contents |
| --- | --- |
| `src/`, `assets/` | Runtime code, help, icons, and local fonts |
| `tests/`, `scripts/` | Automated checks, browser fixtures, preview, package builder |
| `docs/` | Architecture, privacy, verification, and release instructions |
| `store/` | Listing, positioning, launch plan, and brand artwork |
| `.github/` | CI, issue template, and pull-request template |

## Ownership and support

Copyright © 2026 Upkopp. All rights reserved. No open-source reuse license is granted; see [LICENSE](LICENSE). Fonts retain their [third-party licenses](THIRD_PARTY_NOTICES.md).

Public support details will be added before store publication. Bug reports should include Chrome and Upkopp versions and a public reproduction page. Do not attach confidential captures. See [contributing](CONTRIBUTING.md), [security](SECURITY.md), and [release instructions](docs/RELEASE.md).
# Upkopp-Website-Content-Research
