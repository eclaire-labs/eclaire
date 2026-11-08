> **Non-normative reference.** Extracted from Eclaire v0.7 to preserve user intent and hard-won lessons. `PRD.md` is the source of truth. Do not reproduce v0.7's structure, module layout or naming; where this document and the PRD disagree, the PRD wins. "Better options today" are leads to evaluate, not decisions.

Labels: **[Fact]** external truth, keep. **[Rule]** a requirement we want, mirrored in PRD Appendix C. **[v0.7 choice]** inventory only, free to change.

# Web capture and bookmarks: v0.7 reference

**Scope.** This covers how a capture becomes a kind, how URLs are fetched, rendered, archived and enriched, the GitHub, Reddit and X site handlers, X bookmark sync, per-domain rate limiting, SSRF exposure, and AI tagging of bookmarks.
**Method.** Everything here comes from reading v0.7 code at `8cd0fda`. Nothing was run. Items marked *(inferred)* are reasoned from code or external knowledge, not observed. Numbers (timeouts, sizes, thresholds) are the v0.7 values. They are a calibration baseline, not requirements.

---

### Capture classification
- **User intent:** One "drop anything here" capture. A file, a pasted URL, a text snippet or a share-sheet payload lands as the right kind with no choice needed. The user can still force a kind.
- **Observations:**
  - **[Fact]** Clients lie about content type or send `application/octet-stream`, so the client's declared MIME type alone is unreliable.
  - **[Rule RULE-WEB-1]** A capture MUST be classified by what its content actually is, even when the client declares a wrong or generic type.
  - **[v0.7 choice]** v0.7 detected from bytes first, then from the declared type: it sniffed magic bytes and fell back to the client's declared MIME only when sniffing found nothing.
  - **[Fact]** Magic bytes are ambiguous or absent for some formats, so the file extension is needed: SVG sniffs as generic XML (`application/xml` or `text/xml`), iWork files are ZIPs, and plain-text formats have no magic bytes.
  - **[v0.7 choice]** v0.7 used these extension overrides:
    - XML that sniffs as `application/xml` or `text/xml` with a `.svg` name → `image/svg+xml`.
    - ZIP containers with `.pages`, `.numbers` or `.keynote` names → `application/vnd.apple.{pages,numbers,keynote}`.
    - `application/octet-stream` with a text extension → `.md` text/markdown, `.csv` text/csv, `.txt` text/plain, `.html`/`.htm` text/html, `.json` application/json, `.xml` application/xml, `.rtf` text/rtf.
  - **[v0.7 choice]** v0.7 used this rule order (first match wins):
    1. An explicit kind override won. For a bookmark, the URL came from a metadata `url` field, or failing that from the body. An invalid URL gave 400. A photo override was rejected unless the bytes were an image (400). A task override parsed the body as JSON and needed a `title`.
    2. A URI-list MIME (`text/uri-list`, `text/x-uri`, `application/x-url`) → bookmark.
    3. `text/plain`, `text/rtf`, `text/markdown` or `text/html` **whose whole trimmed body is a single URL** → bookmark. A URL with other text around it, or a multi-line body, was not a URL.
    4. `text/plain`, `text/rtf` or `application/rtf` → note.
    5. Audio or video MIME → media.
    6. Image MIME (jpeg, png, webp, heic, heif, gif, tiff, bmp, svg+xml, avif) → photo. EXIF and geocoding were extracted at capture time.
    7. Document MIME → document. The set: pdf, msword, ms-excel, ms-powerpoint, rtf, markdown, html, csv, json, xml, plain, the iWork types, and any `application/vnd.openxmlformats-officedocument.*`.
    8. Anything else → 400 "unsupported content type".
  - **[v0.7 choice]** v0.7's order produced these quirks, to decide on deliberately:
    - A `.txt` upload became a *note*, but `.md`, `.html`, `.csv` and `.json` became *documents*.
    - An RTF upload became a *note*. Its text would hold raw RTF control words *(inferred)*.
    - Pasted HTML or markdown that wasn't a lone URL became a document, not a note.
  - **[v0.7 choice]** v0.7's lenient URL detection misfired. "Contains a dot, no spaces, doesn't start with http" was retried as `http://<text>`. So `README.md`, `notes.txt`, `hello.world` or a version string with a two-character suffix pasted as text became bookmarks.
  - **[Rule RULE-WEB-2]** Pasted text MUST become a bookmark only when it is unambiguously a single web address. Filenames, version strings and text that merely contains a URL MUST stay text.
  - **[v0.7 choice]** v0.7's lax URL validation let other schemes through. It accepted `ftp://`, `file:///x.conf` and similar. The URL normaliser then *prepended* `https://` to anything not starting with `http(s)://`, producing nonsense like `https://file:///…` rather than rejecting it.
  - **[Rule RULE-WEB-3]** A bookmark URL MUST use `http` or `https`. Any other scheme MUST be rejected, never rewritten into a web URL.
  - **[Fact]** RFC 2483 allows a URI list to hold several lines and `#` comment lines.
  - **[v0.7 choice]** v0.7 used a URI-list body verbatim as one URL, so lists with comments or more than one URL broke.
  - **[v0.7 choice]** v0.7's explicit override list left out media. The override enum didn't include media, so you couldn't force it.
  - **[Rule RULE-WEB-4]** A kind the user explicitly chooses MUST win over automatic classification, and every kind MUST be choosable.
- **How v0.7 did it (non-normative):** A single ordered if-chain over the sniffed MIME and the trimmed body, with hard-coded MIME lists per type.
- **Known problems in v0.7:**
  - Hard-coded kind lists rather than registry matchers.
  - "Is this a URL" was a regex library plus a prefix hack.
  - No handling of multi-URL pastes. Splitting them into several bookmarks, or asking, would be better.
  - The `.txt` and `.md` asymmetry was accidental, not designed.
- **Better options today:**
  - Kind manifests with MIME, extension and URL matchers and priorities ([KIND-1]). Sniffing with a magic-byte library (the `file-type` npm package is still current) remains the right first step.
  - For hard cases (text vs code vs markup, mislabelled Office files) evaluate Google **Magika** (ML content-type detection, with Python, Rust and JS bindings). Check the maturity of the JS/WASM binding.
  - URL detection: parse with the WHATWG `URL` parser, allow only `http`/`https`, require a hostname containing a dot, or `localhost` behind an allowlist. Treat a bare domain as a URL only when it matches the Public Suffix List (for example via `tldts`), so `README.md` stays text. `.md` is a real ccTLD, so a PSL check alone won't save that example. Prefer "a lone token whose TLD is known and isn't a common file extension, else ask".
- **PRD refs:** [CAP-1], [CAP-4], [CAP-6], [KIND-1], [KIND-2], [KIND-3].

### URL normalization and dedup intent
- **User intent:** Saving the same link twice shouldn't silently create clutter. "Link" here means the same page reached through a different scheme, `www.`, tracking parameters, redirects or a share URL. Users still expect to see the URL they actually saved.
- **Observations:**
  - **[v0.7 choice]** v0.7 kept two URLs per bookmark. The *original* was what the user submitted (trimmed, with `https://` added if no scheme). The *normalised* one was set by the worker, and in practice it was the **final URL after redirects**. On the lightweight path it was the HTTP client's final URL, if different. On the browser path it was the URL the page ended on.
  - **[Rule RULE-WEB-5]** A bookmark MUST keep and show the URL the user actually saved (for display and provenance), separately from any canonical URL used for dedup and site routing.
  - **[v0.7 choice]** v0.7 defaulted missing schemes to `https://`. Protocol-relative `//host/...` became `https:` plus the rest.
  - **[v0.7 choice]** v0.7's default title was the URL until extraction replaced it.
  - **[v0.7 choice]** v0.7 did no URL dedup on capture. It had no tracking-parameter stripping, no `rel=canonical` or `og:url` use, and no case or trailing-slash normalisation. The only dedup was X sync matching tweet IDs (see that topic).
  - **[v0.7 choice]** v0.7's site handlers re-derived identity from the URL:
    - GitHub: owner and repo from the first two path segments.
    - Reddit: the post ID after `/comments/`, and the subreddit after `/r/`.
    - X: the numeric segment after `/status/`, falling back to the first all-numeric path segment. `/i/web/status/<id>` worked.
  - **[Fact]** Those path segments are the sites' own object identities, so they are natural dedup keys for those sites (`github:owner/repo`, `reddit:t3_<id>`, `x:<tweet id>`), and they are more robust than URL strings.
- **How v0.7 did it (non-normative):** It normalised the scheme at the API, then overwrote a "normalised URL" field with the post-redirect URL during processing.
- **Known problems in v0.7:**
  - Dedup was absent.
  - "Normalised" really meant "final URL", so it could land on a login wall, consent page or locale redirect. That makes it unsafe as a dedup key on its own.
  - The handler routing table and the rate limiter normalised hostnames differently. `reddit.com` and `www.reddit.com` were treated differently (see the rate limiter).
- **Better options today:**
  - A layered key: (1) a site-specific identity where a handler exists; (2) otherwise a canonical URL with the host lowercased, IDN converted to punycode, default ports dropped, the fragment dropped (except for hash-routed SPAs), the query sorted, and known tracking parameters removed (`utm_*`, `fbclid`, `gclid`, `mc_eid`, `ref_src`, `igshid`, `si` and so on); (3) optionally the page's declared canonical, but only when it is on the same registrable domain.
  - `normalize-url` (npm) and the ClearURLs rules dataset are maintained starting points for parameter stripping. Check licences and freshness.
  - Make the dedup policy configurable as the PRD says.
- **PRD refs:** [CAP-3], [KIND-1] (dedupe key), [DATA-1] (`source`), [SRC-1] (dedup keys).

### Browser bookmark file import
- **User intent:** Bring years of browser bookmarks in at once, with folder structure kept as organisation.
- **Observations:**
  - **[Fact]** Chromium browsers (Chrome and Brave) store bookmarks in a JSON `Bookmarks` file with `roots.bookmark_bar`, `roots.other` and `roots.synced` trees.
  - **[v0.7 choice]** v0.7 accepted only that Chromium JSON file, and walked those three trees.
  - **[v0.7 choice]** v0.7 turned folder paths into lowercase tags. Each bookmark was tagged with the root label (`bookmarks-bar`, `other`, `mobile`) plus every folder name on its path.
  - **[Fact]** Chromium timestamps are microseconds since 1601-01-01 UTC. Convert with `(µs − 11644473600000000) / 1000` to get Unix milliseconds. 0 maps to 1601.
  - **[v0.7 choice]** When the timestamp was missing, v0.7 defaulted the date to now. v0.7 computed the date but **never stored it**, so all imports looked "saved today".
  - **[Rule RULE-WEB-6]** Imported bookmarks MUST keep their original save date from the source (for example as `captured_at` or `content_at`), not the import date.
  - **[v0.7 choice]** v0.7 imported only URLs starting with `http`. Others (`javascript:` bookmarklets, `chrome://`, `file:`) went to the error list. One result reported counts of imported and queued, plus an errors array.
  - **[v0.7 choice]** In v0.7, every imported bookmark queued a full processing job with no dedup. Combined with the per-domain limiter, big imports took hours (see the rate limiter).
- **How v0.7 did it (non-normative):** It parsed the uploaded JSON tree recursively and created bookmarks one by one through the normal create path.
- **Known problems in v0.7:**
  - The Netscape HTML export format was not supported. It is the universal format that Firefox, Safari and every browser can export.
  - No dedup, no batching, and the import wasn't a durable run.
  - Folder-to-tag mapping polluted the tag space. Collections are the better fit.
- **Better options today:**
  - Model this as an import-mode Source ([SRC-11]) that supports both the Netscape HTML format and Chromium JSON, maps folders to nestable collections, keeps `date_added`, and runs as a durable, resumable run with per-item status.
  - Pocket, Raindrop, Pinboard and Instapaper exports are similar asks *(inferred user demand)*.
- **PRD refs:** [SRC-2], [SRC-9], [SRC-11], [CAP-3].

### Lightweight fetch plus Readability
- **User intent:** Fast, cheap, clean readable text for most articles without a browser, which is heavy and slow.
- **Observations:**
  - **[v0.7 choice]** v0.7's request was a GET with a **12 s timeout**, **at most 5 redirects**, and a **10 MB body cap** (starting point; tune). Only status codes below 400 were accepted, and success required a final status of exactly 200.
  - **[v0.7 choice]** v0.7 sent browser-like headers: a desktop Chrome UA (`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`), `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`, `Accept-Language: en-US,en;q=0.9`, and `Accept-Encoding: gzip, deflate, br`.
  - **[v0.7 choice]** v0.7's lightweight tier handled HTML only. A `Content-Type` that wasn't `text/html` or `application/xhtml` meant falling through to the browser.
  - **[v0.7 choice]** v0.7's quality gate: Readability had to return an article with a **non-empty title** and **at least 200 characters of `textContent`**. Otherwise the page was assumed to be a JS-rendered SPA and the browser path took over. This 200-character minimum was the main tuning knob (starting point; tune).
  - **[v0.7 choice]** v0.7's lightweight fetch never failed the job. Any error (timeout, TLS, 4xx, parse) silently returned "no result" and the browser path was used.
  - **[v0.7 choice]** v0.7 captured header metadata: final URL, `Content-Type`, `ETag` and `Last-Modified`. These are useful for later conditional re-fetch.
  - **[v0.7 choice]** v0.7 ran the fetch in parallel with browser launch to hide latency. The browser still navigated to the page afterwards, because screenshots and PDF always needed it. When the lightweight result passed the gate, the readable text came from the **server HTML**, not the rendered DOM.
  - **[Fact]** JSON-LD lives in `<script>` tags, so structured metadata has to be read before scripts are stripped.
  - **[v0.7 choice]** v0.7 ran Readability over a DOM with no script execution. Structured metadata was taken first, then all `<script>` elements were removed before Readability.
  - **[v0.7 choice]** v0.7 produced these outputs from the readable HTML:
    - Markdown: ATX headings, fenced code, `-` bullets, `**`/`*`, GFM tables and strikethrough. A custom rule kept the code-block language from `language-*`, `lang-*` or `hljs-*` classes.
    - Plain text with no word wrap.
    - The raw HTML.
    - The bare readable HTML.
    - A self-contained "styled readable" HTML page for offline reading: 720 px column, serif, escaped title and byline.
  - **[v0.7 choice]** v0.7 used these field fallbacks:
    - Title: Readability title, then `<title>`.
    - Description: Readability excerpt, then `<meta name="description">`.
    - Author: Readability byline.
    - Language: `<html lang>`, else **"en"**. Don't repeat that default. Unknown should stay unknown, or be detected from the text.
- **How v0.7 did it (non-normative):** An HTTP client plus JSDOM plus Mozilla Readability, Turndown and html-to-text. It was always paired with a browser navigation.
- **Known problems in v0.7:**
  - The UA was frozen at Chrome 120. A stale UA, or one that doesn't match the TLS fingerprint, is itself a bot signal.
  - The page was loaded twice, by the fetch and by the browser, and both counted as one rate-limited "visit".
  - Server HTML and rendered DOM could disagree, for example on paywall or consent overlays.
  - No charset handling beyond the HTTP client's defaults *(inferred)*.
  - No `<meta http-equiv=refresh>` handling.
  - The lightweight fetch had **no SSRF guard** (see SSRF).
- **Better options today:**
  - Keep the tiered fallback, but make it the PRD's declarative fallback group ([PROC-7]). Skip the browser entirely when no browser-only artifact is wanted.
  - `@mozilla/readability` is still maintained and the baseline. Evaluate **Defuddle** (kepano, built for Obsidian Web Clipper): it is more forgiving, normalises footnotes, math and code, and can emit Markdown. It is a work in progress, so pin and test.
  - In a Python sidecar, **trafilatura** is a strong main-content extractor that also extracts metadata.
  - `linkedom` or `happy-dom` are much lighter than JSDOM for parse-only work.
  - Use a fetch stack with an SSRF-pinned dispatcher (see SSRF).
- **PRD refs:** [PROC-7], [PROC-13], [ART-3] (`text.markdown`, `text.plain`, `snapshot.readable_html`), [PROC-10].

### Structured metadata (OpenGraph, Twitter cards, JSON-LD)
- **User intent:** Better titles, authors, dates, site names and tags, taken from what the site already declares.
- **Observations:**
  - **[v0.7 choice]** v0.7 collected every `meta[property^="og:"]`, every `meta[name^="twitter:"]`, and every `script[type="application/ld+json"]`, ignoring JSON that failed to parse. A single JSON-LD block was stored as an object; several were stored as an array.
  - **[v0.7 choice]** v0.7 *used* only a few fields, as tagging hints: `og:type`, `og:site_name`, JSON-LD `@type` and JSON-LD `keywords` (string or array). The rest was stored, unused.
  - **[Fact]** JSON-LD `@graph` containers and top-level arrays are very common on WordPress and news sites.
  - **[v0.7 choice]** v0.7 read JSON-LD `@type` and `keywords` only when there was exactly one top-level object, so `@graph` containers and arrays were ignored.
  - **[v0.7 choice]** v0.7 never used `og:image`, even as a cheap preview when screenshots fail.
  - **[v0.7 choice]** v0.7 never mapped `article:published_time`, `og:url` and JSON-LD `datePublished`/`author` to fields.
- **How v0.7 did it (non-normative):** Ad-hoc DOM queries, before scripts were stripped.
- **Known problems in v0.7:** The data was captured but not mapped into props (`siteName`, `author`, `publishedAt`, `lang`) or `content_at`.
- **Better options today:**
  - **metascraper** (npm, rule-based, with many site plugins) or **open-graph-scraper**. Confirm current maintenance.
  - For JSON-LD, flatten `@graph` and pick the main entity (Article, NewsArticle, BlogPosting, Product, Recipe, VideoObject). That also makes the PRD's "extract recipes from bookmarks" example cheap.
  - Map the publish date to `content_at`.
- **PRD refs:** [PROC-13] ("metadata and JSON-LD"), [DATA-1] (`content_at`), Appendix B.1 bookmark props.

### Headless browser path: navigation
- **User intent:** JS-heavy pages still produce a faithful snapshot and usable text.
- **Observations:**
  - **[v0.7 choice]** v0.7 used one fresh browser per job: launched headless with a 30 s launch timeout and `--use-mock-keychain`, then a new context with `viewport: null` and one page. There was no persistent profile, so no cookies carried between jobs. Cleanup closed page, context and browser, each with a 5 s timeout, and failures were only logged.
  - **[Fact]** Chromium's `--use-mock-keychain` flag avoids macOS keychain prompts.
  - **[v0.7 choice]** v0.7's navigation strategy (starting point; tune):
    1. Try `waitUntil: "networkidle"` with a 60 s inner timeout inside a 65 s outer guard.
    2. On *any* error (not only timeouts), retry with `waitUntil: "load"`, 30 s inner and 35 s outer.

    Worst case was about 100 s per URL.
  - **[Fact]** Many pages never reach network idle, because of analytics beacons, long-polling and ads. That is why a `load` fallback is needed.
  - **[v0.7 choice]** From the response, v0.7 kept the final page URL, `Content-Type`, `ETag` and `Last-Modified`.
  - **[v0.7 choice]** v0.7's readiness steps before capture: wait for `document.fonts.ready` (5 s cap), then for incomplete `<img>` within **two viewport heights** of the top (5 s cap), then a 500 ms settle for CSS transitions. Timeouts here were non-fatal.
  - **[v0.7 choice]** When the lightweight tier failed, v0.7 took text from the rendered DOM (`page.content()`) through the same Readability pipeline.
  - **[Fact]** Outer timeouts don't cancel the work. A timeout wrapper around a browser call doesn't abort the underlying operation. Rely on the library's own `timeout` and on killing the process or container.
- **How v0.7 did it (non-normative):** In-process **patchright**, a stealth-patched Playwright fork for Chromium only, inside the API/worker container image.
- **Known problems in v0.7:**
  - The browser ran in the main process container with full network access: no sandbox, no resource limits, no egress filter.
  - Launching per job cost seconds and memory. There was no pooling.
  - No cookie-consent or overlay dismissal.
  - No lazy-load scrolling, so full-page captures miss below-the-fold images.
  - No `prefers-color-scheme` or locale control.
  - No per-site login. That is fine, and it's a deliberate privacy property worth keeping.
- **Better options today:**
  - Run the browser as an **out-of-process pack** ([PROC-10], [PROC-11], D13). For example, a Playwright server (`playwright run-server` over WebSocket) or a browserless-class container, behind an SSRF-filtering egress proxy.
  - Upstream **Playwright** is the default. **patchright** remained actively released through mid-2026 (npm 1.60.x, June 2026), but a stealth fork is a policy choice (bot-wall evasion) and a supply-chain dependency. Make stealth an optional pack setting, and check current release cadence.
  - CloakBrowser-class stealth Chromium builds have appeared (2026). Treat them as experimental.
  - Use a pooled browser with a fresh **context** per job rather than a fresh browser.
- **PRD refs:** [PROC-10], [PROC-11], [PROC-9] (`browser` pool), [PROC-1] (`timeout`), [PRIN-10], D13.

### Screenshots and PDF snapshot
- **User intent:** A visual record of the page as it looked when saved (sites change and die), a thumbnail for lists, and an archival PDF.
- **Observations:**
  - **[v0.7 choice]** v0.7's desktop capture: viewport **1920×1080**, PNG capture (30 s inner, 35 s outer). **This one was fatal: if it failed, the job failed.** Two renditions were derived from it:
    - **Thumbnail:** fit inside 800×800, never enlarged, **WebP q80**. A 1080p capture gives about 800×450.
    - **Desktop screenshot:** fit inside 1920×1440, **JPEG q90**. In practice it stays 1920×1080.
  - **[v0.7 choice]** v0.7's full-page capture: PNG of the full scroll height at 1920 width (45 s inner, 50 s outer). Non-fatal; stored as a lossless PNG.
  - **[v0.7 choice]** v0.7's mobile capture: viewport resized to **375×667**, PNG (30 s inner, 35 s outer). Non-fatal. It was *only a viewport resize*: no mobile UA, no `isMobile`/touch, DPR 1. Sites that do UA-based mobile serving were not captured as mobile.
  - **[v0.7 choice]** v0.7's capture order: desktop, then full page, then mobile, then back to 1920×1080 for the PDF.
  - **[v0.7 choice]** v0.7's PDF:
    - Wait for every incomplete image (5 s cap each), then 1 s.
    - Emulate **`screen` media**, not print, so it looks like the page rather than its print stylesheet.
    - A4, `printBackground: true`, 0.5 in margins on all sides; 90 s timeout.
    - Non-fatal on failure.
  - **[Fact]** PNGs from Playwright-class tools carry an sRGB colour profile that the image library (libvips via sharp) mis-handled when resizing, producing corrupt output. Re-test before carrying over any workaround.
  - **[v0.7 choice]** v0.7 worked around the colour-profile issue by decoding screenshots to raw pixels before resizing. The workaround doubled memory per screenshot.
  - **[v0.7 choice]** v0.7's site handlers rendered their own HTML. For Reddit and X, screenshots came from a locally rendered HTML page loaded as a `data:` URL, not the live site. Desktop, thumbnail and mobile came from the compact render. The full page and PDF came from the variant "with comments/replies".
- **How v0.7 did it (non-normative):** The same browser page was re-used for every capture, with viewport changes in between.
- **Known problems in v0.7:**
  - The full-page PNG could be enormous on long pages, with no height cap and no compression.
  - No dark-mode or consent handling.
  - Treating desktop-screenshot failure as fatal threw away good text extraction. The PRD's `degraded` outcome fits better.
- **Better options today:**
  - Make each variant its own artifact kind with variants ([ART-3] `snapshot.screenshot`). Cap full-page height (for example 16k px) and store WebP or AVIF.
  - For archival fidelity, evaluate **SingleFile** (`single-file-cli`, a self-contained HTML snapshot) or **WACZ/WARC** via Browsertrix/ArchiveWeb.page tooling, alongside or instead of PDF. Confirm current maintenance.
  - **Gotenberg** (a Chromium route) is a packaged option for HTML→PDF and screenshots that fits D13.
- **PRD refs:** [PROC-13], [ART-3], [PROC-5] (`degraded`), [HIST-5] (retention of large snapshots), D13.

### Favicon
- **User intent:** Recognisable site icons in lists.
- **Observations:**
  - **[v0.7 choice]** v0.7's discovery: the first `link[rel='icon']`, else `link[rel='shortcut icon']`, resolved against the page URL. If neither existed (lightweight path only), it fell back to **`/favicon.ico`**, accepting only HTTP 200.
  - **[v0.7 choice]** v0.7's fetch: 10 s timeout, desktop Chrome UA, `Accept: image/*,*/*`. On the browser path it went through the browser context's request API, so it shared cookies and the proxy.
  - **[v0.7 choice]** v0.7 took the file extension from the URL path, else from `Content-Type` (svg, png, ico/vnd.microsoft.icon, jpeg, gif), defaulting to `.ico`. Empty bodies were rejected. Failure was never fatal.
  - **[v0.7 choice]** v0.7 served favicons with long public cache headers (7 days) and other assets privately (1 hour).
- **How v0.7 did it (non-normative):** It ran inside text extraction and was stored per bookmark.
- **Known problems in v0.7:**
  - `apple-touch-icon`, `rel="icon shortcut"` variants, `sizes`, and web app manifest icons were ignored, so it often picked a 16×16 ICO.
  - No size or type validation: any bytes the server returned, including HTML error pages with status 200, were stored as an "icon".
  - Stored per bookmark rather than per site. Hundreds of identical copies, though content-addressed blobs ([BLOB-1]) fix that.
  - The favicon URL is attacker-controlled and was fetched with **no SSRF check**.
- **Better options today:**
  - Collect every icon candidate (link rels plus manifest), pick the best size (≥ 64 px, prefer SVG or PNG), verify by sniffing, and store once per origin.
  - Avoid third-party favicon services (Google S2 and similar) by default, because they leak browsing history. Allow them only under an explicit egress policy.
- **PRD refs:** [PROC-13], [BLOB-1], [MODEL-5]/egress, [PROC-10].

### Non-HTML URLs (PDF, images, binaries)
- **User intent:** A link to a PDF or image should still give something useful. Ideally it becomes the document or image it points to.
- **Observations:**
  - **[v0.7 choice]** v0.7 decided from the browser response's `Content-Type`. `application/pdf`, `image/*` or `application/octet-stream` took a simplified path:
    - Screenshots still ran (the browser renders images and maybe PDFs).
    - Title: last path segment, else "PDF Document", "Image" or "Binary content".
    - Description: "PDF document from <host>", "Image from <host>", or "Content type: <ct>".
    - Empty text, language "en".
    - Fixed tags with **no AI call**: `["pdf","document"]`, `["image"]` or `["file"]`.
    - No PDF snapshot and no Readability.
  - **[v0.7 choice]** v0.7 never saved the bytes. The code comment claimed the PDF itself was stored as the PDF artifact, but nothing was stored.
  - **[Fact]** *(inferred)* In Playwright-class headless Chromium, navigating to a PDF URL usually starts a *download* and `goto` throws ("Download is starting" / `net::ERR_ABORTED`). Verify against the chosen browser.
  - **[v0.7 choice]** v0.7's PDF branch was therefore probably unreachable *(inferred)*: both navigation attempts would fail and so would the job, before the branch was reached.
- **How v0.7 did it (non-normative):** A content-type branch after browser navigation.
- **Known problems in v0.7:** The best output, the original file with its text, was discarded.
- **Better options today:**
  - Decide from a cheap `HEAD` or a ranged `GET` (sniff the first bytes) **before** launching a browser.
  - For a PDF or image, download it through the SSRF-safe fetcher with a size cap, attach it as the original blob, and either convert the item to `document`/`image` or keep a bookmark linked (`derived_from`) to a new document item. Then run that kind's processors (text extraction, OCR, thumbnails). Make this a configurable capture policy.
  - Audio and video URLs belong to the media kind's URL import (yt-dlp-class).
- **PRD refs:** [CAP-1], [PROC-6] (conditional branches), [PROC-13] (Documents, Media), §3.1 Link (`derived_from`).

### Site handler: GitHub
- **User intent:** A repo bookmark should show what the repo *is*: description, language, stars, licence, latest release, last activity and README. A screenshot of GitHub's chrome isn't enough.
- **Observations:**
  - **[v0.7 choice]** v0.7 routed host `github.com` or `www.github.com` to the handler. Owner and repo were the first two path segments, with query and fragment stripped.
  - **[Fact]** GitHub REST v3 endpoints for a repo:
    - `GET /repos/{owner}/{repo}` → repo metadata.
    - `GET /repos/{owner}/{repo}/commits?per_page=1` → last commit, with its date at `commit.committer.date`.
    - `GET /repos/{owner}/{repo}/releases/latest` → `tag_name`, `published_at` and `created_at`. 404 means "no releases".
    - `GET /repos/{owner}/{repo}/readme` → base64 `content`. 404 means none.
  - **[v0.7 choice]** v0.7 called all four. Failure of the repo call was **non-fatal**: page-derived data was used instead. The release date was `published_at`, else `created_at`. README 404 and release 404 were not errors. The README was decoded as UTF-8.
  - **[v0.7 choice]** v0.7 kept these fields: name, owner login, description, `stargazers_count`, `forks_count`, `watchers_count`, language, topics, licence name, `html_url`, `created_at`, `updated_at`, plus the **full raw repo JSON**.
  - **[v0.7 choice]** v0.7's item fields: title was the repo `name` (not `owner/name`). Description was the repo description, else the page's. Author was the owner login.
  - **[v0.7 choice]** v0.7 saved the README as its own markdown artifact and **appended it to the page text** for search and tagging.
  - **[v0.7 choice]** v0.7's rule-based tags:
    - language lowercased
    - topics lowercased
    - `license-<name lowercased, spaces→dashes>` (yields `license-mit-license`)
    - `popular` for ≥ 10,000 stars, `trending` for ≥ 1,000
    - always `github`
    - capped at 10, then merged with AI tags
  - **[Fact]** Unauthenticated GitHub API access is about 60 requests/hour.
  - **[v0.7 choice]** v0.7 used an optional `GITHUB_TOKEN`. The client used Octokit throttling: retry primary rate limits up to 3 times, and always retry secondary limits.
  - **[v0.7 choice]** In v0.7 the browser still ran. It navigated the live page for screenshots, PDF and text. No lightweight tier.
- **How v0.7 did it (non-normative):** A dedicated handler that ran the full browser pipeline, then enriched from the API.
- **Known problems in v0.7:**
  - **Non-repo GitHub URLs failed the whole job.** A profile `github.com/user` (one path segment) threw "Invalid GitHub URL format". Others were misparsed as owner/repo: `/orgs/x`, `/topics/x`, `/settings`, `/sponsors/x` and `/marketplace/...`. Those got an API 404 and fell back to page data.
  - Issue, PR, discussion, gist (`gist.github.com`) and file/blob URLs got repo metadata instead of the specific object.
  - `.git` suffixes weren't stripped.
  - Four sequential API calls per bookmark.
  - Popularity tags (`popular`, `trending`) are snapshots that go stale and pollute the tag space.
  - An AI tagging failure here was **not caught**, so the job failed and retried the whole pipeline.
  - The README was appended *after* page text and then cut to 8,000 characters for tagging, so README content was often cut off.
- **Better options today:**
  - One **GraphQL** query (repository plus `object(expression:"HEAD:README.md")` or the README via REST, `latestRelease`, `defaultBranchRef.target.history(first:1)`, topics, licence) to cut the calls to one or two.
  - REST conditional requests with `ETag` don't count against the rate limit when the response is 304, which makes re-sync cheap.
  - Route by URL pattern to sub-handlers: repo, issue/PR, gist, user/org, release, file. Fall back to the generic web path for anything else, never to failure.
  - Store stars, forks, language and licence as **filterable props**, not tags ([PRIN-5], [PROC-8]).
  - Token: user-supplied, held as a secret ([SRC-1]). GitHub stars as a Source is P1.
- **PRD refs:** [PROC-13], [PROC-8], [SRC-11] (GitHub stars), [KIND-1] props/filters.

### Site handler: Reddit
- **User intent:** A Reddit save should preserve the post *and the discussion*, readable without Reddit's UI, login walls or app nags, and searchable, including comments.
- **Observations:**
  - **[v0.7 choice]** v0.7 ran the handler only for `reddit.com`/`www.reddit.com` and only when `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` were set. Otherwise the URL took the generic web path. This was undermined by a routing bug; see the rate limiter.
  - **[Rule RULE-WEB-7]** When a site-specific handler can't serve a URL (unsupported URL shape, missing credentials, API unavailable), the capture MUST fall back to generic web capture rather than fail.
  - **[Fact]** Reddit app-only OAuth: `POST https://www.reddit.com/api/v1/access_token` with HTTP Basic `client_id:secret` and `grant_type=client_credentials`. API calls go to `https://oauth.reddit.com` with `Authorization: Bearer` and a **custom User-Agent**. Reddit requires a descriptive UA; its guidelines ask for `<platform>:<app id>:<version> (by /u/<user>)`.
  - **[v0.7 choice]** v0.7 sent the User-Agent `Eclaire/1.0.0`.
  - **[Fact]** Reddit endpoints:
    - `GET /r/{sub}/comments/{postId}` returns the post and comment tree. `raw_json=1` avoids HTML-entity-escaped bodies.
    - `GET /r/{sub}/about` returns subscribers, title, public description and icon (`icon_img` or `community_icon`).
    - `GET /api/morechildren?api_type=json&link_id=t3_{id}&children=<ids>` expands "more" stubs, with at most 100 IDs per call.
  - **[v0.7 choice]** v0.7 fetched `GET /r/{sub}/comments/{postId}?raw_json=1&limit=500` and, in parallel, `GET /r/{sub}/about`, taking the icon from `icon_img`, else `community_icon`.
  - **[v0.7 choice]** v0.7 expanded "more" comments with up to **3** `morechildren` calls.
    - "more" stubs were prioritised **shallowest first, then by largest count**.
    - The returned comments were spliced back into the tree in place of their stubs.
    - It stopped early if a batch returned nothing.
    - A warning was logged with the count of unfetched comments.
  - **[Fact]** Where media lives in a Reddit post: `reddit_video` (`fallback_url`, width, height, duration); `post_hint=image`; galleries as `gallery_data.items` joined to `media_metadata[id].s.u`, whose URLs carry `&amp;` escapes, plus captions; oEmbed embeds (provider, title, html, thumbnail); and `preview.images[0].source`.
  - **[v0.7 choice]** v0.7 classified media in this order:
    1. `reddit_video`: `fallback_url`, audio guessed by replacing `DASH_` with `DASH_audio_` (a heuristic that may be stale; *inferred*), plus width, height and duration.
    2. Image: `post_hint=image`, or a URL ending in jpg/png/gif/webp.
    3. Gallery: `gallery_data.items` joined to `media_metadata[id].s.u` with `&amp;` unescaped, plus captions.
    4. oEmbed embed: provider, title, html, thumbnail.
    5. External link.

    A `preview.images[0].source` was kept whenever present.
  - **[v0.7 choice]** v0.7's derived fields:
    - Score = `ups − downs`.
    - Post type: text, image, video, gallery or link.
    - External domain (only for link posts, excluding `self.<sub>`).
    - Text length, has-media.
    - Age category relative to *capture time*: < 1 h fresh, < 24 h recent.
  - **[v0.7 choice]** v0.7's item fields: title `"<post title> - r/<sub>"`. Description was the first 200 characters of selftext plus "…", else `"Post by u/<author> in r/<sub>"`. Metadata kept: score, upvote ratio, comment count, view count, post type, subreddit name, subscribers and description, created and edited times, external domain.
  - **[v0.7 choice]** v0.7's artifacts: the raw API JSON, a simplified JSON, and two rendered HTML pages (with and without comments; comments indented 20 px per depth). Screenshots, PDF and searchable text came from these renders, so comments were searchable.
  - **[Rule RULE-WEB-8]** Saving a discussion post MUST preserve the discussion as well as the post, readable without the site's UI and searchable, including comments.
  - **[v0.7 choice]** v0.7's rule-based tags:
    - `r/<sub>`
    - post type: `image-post`, `video-post`, `gallery-post`, `link-post` (+ `from-<domain>`), or `discussion`
    - engagement by score: `high-engagement` ≥ 1000, `moderate-engagement` ≥ 100
    - comments: `active-discussion` ≥ 100, `discussion` ≥ 20
    - upvote ratio: `highly-upvoted` ≥ 0.9, `controversial` ≤ 0.6
    - age: `fresh`, `recent`
    - text length: `long-form` ≥ 1000, `medium-form` ≥ 300, else `short-form`
    - `has-media`
    - subreddit size: `major-` ≥ 1M, `large-` ≥ 100k, `medium-` ≥ 10k, else `small-subreddit`
    - `popular-source` for links to youtube, github, stackoverflow, medium, twitter/x, linkedin, wikipedia, arxiv or HN
- **How v0.7 did it (non-normative):** An API client, an extractor, an HTML renderer and a tag generator, then the browser over the rendered HTML.
- **Known problems in v0.7:**
  - **Share links failed instead of falling back.** `reddit.com/r/x/s/<token>` (the default mobile share link) and `redd.it/<id>` short links have no `/comments/`, so the job failed with no fallback to the generic path. `old.reddit.com`, `new.reddit.com` and `np.reddit.com` weren't routed to the handler.
  - **Most tags were volatile metrics or capture-time-relative** (`fresh`, engagement, subreddit size). They are meaningless later and swamp the tag space. Keep them as props.
  - **The renderer injected unescaped HTML into a page that a browser then loaded:** oEmbed `html`, `selftext_html`, comment `body_html` and media URLs. Remote embeds (iframes, scripts) ran during capture. The stored HTML is an XSS risk if served inline.
  - Token not cached across jobs; a new token was fetched per job.
  - A configured but unused max-depth setting.
- **Better options today:**
  - **Reddit API access changed.** Reddit's **Responsible Builder Policy (Nov 2025)** closed self-service Data API access; new apps need approval. Third-party reports say unauthenticated `.json` access ended in 2026. Both points are from secondary sources and need confirming against Reddit's official docs.
  - So the handler MUST be optional, configured with user-supplied credentials, and degrade to the generic web path. `old.reddit.com` renders server-side and is friendlier to the lightweight tier *(inferred)*.
  - Resolve `/s/` and `redd.it` links by following the redirect *before* routing.
  - Render with a templating engine that escapes by default, and drop oEmbed `html` in favour of a link and thumbnail.
  - Reddit "saved" as a Source is P1.
- **PRD refs:** [PROC-13], [SRC-11] (Reddit saved), [PROC-7], [PROC-8], [PROC-10].

### Site handler: X/Twitter
- **User intent:** Saving a post should keep its text, author, media and context even after deletion or a lockout. X pages are login-walled and hostile to scraping.
- **Observations:**
  - **[Fact]** X posts are served on `twitter.com`, `www.twitter.com`, `mobile.twitter.com`, `x.com` and `www.x.com`. The post ID is the numeric segment after `status`.
  - **[v0.7 choice]** v0.7 routed those five hosts to the handler, and fell back to the first all-numeric path segment when no `status` segment was found.
  - **[v0.7 choice]** If the item came from X bookmark sync, v0.7 used the tweet payload stored at sync time and made **no API call**.
  - **[Fact]** The X API v2 post lookup is `GET https://api.x.com/2/tweets/{id}` with `Authorization: Bearer <token>` (app-only), with fields chosen through `tweet.fields`, `expansions`, `user.fields` and `media.fields`.
  - **[v0.7 choice]** Otherwise v0.7 did an app-only lookup with `X_BEARER_TOKEN`, a 30 s timeout, and these parameters:
    - `tweet.fields=author_id,created_at,text,public_metrics,entities,attachments,referenced_tweets,conversation_id,lang`
    - `expansions=author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id`
    - `user.fields=name,username,verified_type,profile_image_url,public_metrics`
    - `media.fields=type,url,height,width,variants,alt_text,preview_image_url`
  - **[Fact]** X API error meanings: 429 is rate limited, with `x-rate-limit-reset` in epoch seconds; 401 is an expired token; 403 is a protected account; 404 is deleted. Error bodies carry `detail` and `title`.
  - **[v0.7 choice]** v0.7 mapped these to "rate limited" (reading `x-rate-limit-reset`), "token expired", "protected account" (surfacing the API `detail`) and "deleted". Anything else surfaced the API `detail` or `title`.
  - **[Fact]** Where data lives in an X API response: the author in `includes.users`; media in `includes.media`, joined via `media_keys`; links in `entities.urls` (with `expanded_url` and `display_url`, including `pic.x.com` media links); the post type in `referenced_tweets` (retweeted, quoted, replied_to); metrics for replies, retweets, likes, bookmarks, impressions and quotes. Avatar URLs ending `_normal` have a `_400x400` variant.
  - **[v0.7 choice]** v0.7 extracted all of these, swapped the avatar `_normal` for `_400x400`, and excluded `pic.x.com` links (using `expanded_url` and `display_url`).
  - **[v0.7 choice]** v0.7's item fields: title `"<name> (@<username>) on X"`. Description was the first 200 characters of the text. Metadata kept: metrics, author ID, name, username, verified type, profile image, tweet type, media count and types, link count, created date, language, text length.
  - **[v0.7 choice]** v0.7's artifacts: raw and simplified JSON, two HTML renders, then screenshots, PDF and text from the renders. Text was HTML-escaped, and t.co links were swapped for anchors to the expanded URL (`rel="noopener noreferrer"`).
  - **[v0.7 choice]** v0.7's rule-based tags:
    - `@<username>`
    - `verified-author` + `<type>-verified`
    - type: `reply`, `quote-tweet`, `retweet` or `tweet`
    - `has-media`, `image-tweet`, `video-tweet`, `gif-tweet`, `multiple-media`
    - `has-links`, `multiple-links`
    - engagement tiers: viral if likes ≥ 10k or retweets ≥ 1k or impressions ≥ 1M; high at 1k / 100 / 100k; moderate at 50 / 10 / 10k
    - `1k-likes`/`10k-likes`/`100k-likes`, `100-retweets`/`1k-retweets`/`10k-retweets`, `100k-impressions`/`1m-impressions`
    - `fresh`, `recent`
    - `long-tweet` for ≥ 240 characters, else `short-tweet`
- **How v0.7 did it (non-normative):** API v2 lookup or sync payload, then extractor, renderer and tag rules, then the browser over a `data:` URL.
- **Known problems in v0.7:**
  - **Long posts were truncated.** `note_tweet` was never requested, so posts over 280 characters came back cut short.
  - **Quoted and parent posts were lost.** They were fetched via expansions but never rendered. The renders "with replies" and "without replies" were **identical**: no replies or thread were ever fetched.
  - **Missing token meant a hard failure.** A routing quirk forced `x.com`/`twitter.com` into this handler even without a bearer token, so the job failed rather than falling back.
  - Volatile metric tags, as for Reddit.
  - Video variants were stored but no best bitrate was chosen or downloaded, so media can vanish when the post is deleted.
- **Better options today:**
  - **X API pricing is pay-per-use as of 2026** (per docs.x.com): credits per request. Owned reads such as your own bookmarks are listed at about **$0.001 per resource**, and other post reads cost more. Pay-per-use plans cap at 3M post reads per month. Prices change, so check the Developer Console.
  - Each lookup costs money. Make the handler opt-in, with a per-space budget, and prefer the sync payload.
  - Request `note_tweet` and render `includes.tweets` (quoted and parent). Use `conversation_id` search only if the user opts in (cost).
  - Credential-free fallbacks worth evaluating: X's **oEmbed** endpoint (`publish.twitter.com/oembed`, which returns blockquote HTML with the text) and the syndication endpoint used by Vercel's `react-tweet`. The latter is unofficial and may break, so label it experimental.
  - Download media (best MP4 variant by bitrate, and photos at `name=orig`) under size caps.
- **PRD refs:** [PROC-13], [SRC-11], [MODEL-5]-style cost and egress policy, [PROC-8].

### X bookmarks sync: OAuth linking and token handling
- **User intent:** "Everything I bookmark on X shows up in Eclaire", without manual copy-paste. v0.7 had a manual "Sync Bookmarks" button. The PRD makes it a scheduled mirror.
- **Observations:**
  - **[Fact]** Reading X bookmarks needs OAuth 2.0 Authorization Code with PKCE and the scopes **`tweet.read users.read bookmark.read offline.access`**. `offline.access` is required to get a refresh token.
  - **[v0.7 choice]** v0.7's linking:
    - It went through the auth library's X provider.
    - It was enabled only when `X_CLIENT_ID` and `X_CLIENT_SECRET` were configured.
    - **Sign-up via X was disabled**: link to an existing account only.
    - The callback returned to the page that started the flow.
    - The X user ID was stored as the linked account ID.
  - **[v0.7 choice]** v0.7 encrypted access, refresh and ID tokens at rest when a master key was configured (a versioned ciphertext prefix, so plaintext legacy values could still be read). The developer fallback was plaintext. Don't carry that over.
  - **[Fact]** X token refresh is `POST https://api.x.com/2/oauth2/token`, form body `grant_type=refresh_token&refresh_token=…&client_id=…`, with HTTP Basic `client_id:client_secret` for a confidential client. The response carries a new access token and `expires_in`. X rotates refresh tokens, so a returned refresh token replaces the old one.
  - **[v0.7 choice]** v0.7's refresh handling:
    - It considered the token expired **5 minutes before** `expires_at`.
    - It stored the new access token and expiry (`expires_in`, default 7200 s).
    - It stored the **new refresh token if one was returned, else kept the old one**.
    - On failure, it returned "not connected" and logged.
  - **[Fact]** The bookmarks endpoint is `GET /2/users/{xUserId}/bookmarks`. It takes the same field and expansion parameters as the lookup, paginates with `meta.next_token`, returns bookmarks newest first, and only returns the most recent ~800 bookmarks.
  - **[v0.7 choice]** v0.7's sync loop:
    - It requested `max_results=100` and followed `meta.next_token` for at most **8 pages (800)**.
    - If the **first** page failed, the sync failed. A later page failure returned partial results plus errors.
    - **It stopped early when a whole page was already known.** Because bookmarks come newest first, this kept incremental syncs cheap.
    - It deduped against existing items by tweet ID, for that user only.
    - Each new post was created with canonical URL `https://x.com/<username or "i">/status/<id>`, title = first 100 characters of the text, origin marked as X bookmark sync. **The post and `includes` were embedded, filtered to only that post's users, media and referenced posts**, so processing could skip the API call.
    - The result reported imported, skipped and total counts, plus errors.
  - **[Rule RULE-WEB-9]** Re-running a sync MUST NOT create duplicates of items it already imported.
- **How v0.7 did it (non-normative):** A synchronous HTTP request ran the whole sync inline. Tokens lived in the auth library's accounts table.
- **Known problems in v0.7:**
  - **Fragile dedup:** a `LIKE '%/status/<id>%'` scan over URLs rather than a stored external ID.
  - Not durable, scheduled or resumable. It ran inside one HTTP request.
  - **No refresh single-flight.** Two concurrent syncs could both refresh. With rotating refresh tokens, the loser invalidates the winner's token *(inferred)*.
  - **Failures were miscounted as imports.** Per-item create failures returned an error object that the loop counted as "imported".
  - **Wasted rate-limit slots.** Each synced post became a job that the per-domain limiter spaced 10 s apart on `x.com`, even though no request to x.com was needed (the data was prefetched). 800 posts took about 2.2 hours.
  - **Deletions weren't mirrored.** Un-bookmarking on X did nothing.
  - **The app credentials were instance-wide.** That's consistent with the PRD's "user-supplied client", but it was undocumented.
- **Better options today:**
  - Implement it as a **Source** in `mirror` mode with a durable cursor (the newest-known ID), a schedule, a delete policy, and `external_id = tweet id` as the dedup key.
  - Use a per-source lock around token refresh. Store tokens in the secrets store ([CFG-3]).
  - Rate-limit by the hosts actually contacted (api.x.com and the media CDN), not by the item URL.
  - Pricing as in the X handler topic.
- **PRD refs:** [SRC-1], [SRC-2], [SRC-8], [SRC-9], [SRC-10], [SRC-11] (X mirror, P0 phase 1), [CFG-3], [PROC-9].

### The domain rate limiter
- **User intent:** Politeness and self-protection. Don't hammer one site when a user imports 500 links from it. Don't get the instance's IP banned. Don't burn hours retrying a dead host.
- **Observations:**
  - **[v0.7 choice]** v0.7's domain key was the lowercased hostname, with `https://` added if the scheme was missing. `www.` was *not* stripped, and the registrable domain was not used.
  - **[v0.7 choice]** v0.7's defaults: **10 s** between job starts on the same host, **max 1 concurrent** job per host, and a **global 500 ms** gap between any two job starts (starting point; tune). Exact-host rules for `twitter.com`, `x.com` and `reddit.com` used the same 10 s/1 values, but also named a handler.
  - **[v0.7 choice]** v0.7 supported wildcard rules (`*.example.com`) but matched them with a plain `endsWith`, so `*.example.com` also matched `badexample.com`.
  - **[v0.7 choice]** v0.7's check order at job start:
    1. Blocked? Then fail (see below).
    2. At max concurrency? Reschedule in **5 s**.
    3. Global gap not elapsed? Reschedule for the remainder.
    4. Same-host gap not elapsed? Reschedule for the remainder.

    Otherwise it marked the job running and stamped the start time. **The gap was measured from the previous job's *start*, not its end.**
  - **[v0.7 choice]** v0.7's rescheduling threw a dedicated rate-limit error. The queue set the job back to pending with `scheduledFor = now + delay` and **did not consume an attempt**. This is the PRD's `deferred` semantics, and it worked.
  - **[v0.7 choice]** v0.7's failure tracking:
    - Each job failure was classified (next topic).
    - Failures older than **10 minutes** were pruned.
    - **3 consecutive** "blockable" failures (server or network errors) blocked the host for **1 hour**. A non-blockable failure broke the streak. A success cleared the history.
    - Blocking also cleared the running set.
  - **[v0.7 choice]** In v0.7, blocked hosts failed rather than deferred. A job for a blocked host failed with "Domain X is blocked: <reason>". It was not deferred until the block expired, so it burned retries during the block. Defer to the block's expiry instead.
  - **[v0.7 choice]** v0.7 ran a stale sweep every 5 minutes: a host whose running set was non-empty and whose last start was over 10 minutes ago had its running set cleared, and the stuck jobs were marked failed. It was broken; see REVIEW.
  - **[v0.7 choice]** v0.7 had admin operations: manual unblock, stats per host (running, last processed, blocked, reason, until), and a list of blocked hosts. None was exposed in the UI *(inferred)*.
- **How v0.7 did it (non-normative):** An in-memory singleton per worker process, consulted only once at job start.
- **Known problems in v0.7:**
  - **In memory only.** Limits weren't shared across processes, and were lost on restart (REVIEW §4.3 #4).
  - **One job counted as one visit,** but a job made 3–5 requests to the host: lightweight fetch, browser navigation plus subresources, and favicon.
  - **Handler choice came from the limiter's rule table.** That overrode the credential check, so `x.com` and bare `reddit.com` went to API handlers with no credentials and failed. `www.reddit.com` was not covered by the rule.
  - **API hosts and page hosts were conflated.** GitHub API calls weren't limited by this limiter at all (the Octokit throttle handled them). Synced X items were limited although they made no x.com request.
  - `Retry-After` and `X-RateLimit-Reset` weren't fed back into the limiter.
- **Better options today:**
  - Durable, cross-process rate limits keyed by **(egress host or API, principal or credential)**, stored in the core DB as token buckets or GCRA ([PROC-9]).
  - Key web politeness on the registrable domain via the Public Suffix List (`tldts`).
  - Honour `Retry-After`, `X-RateLimit-Reset` and 429/503 responses as deferrals.
  - Optionally honour `robots.txt` `Crawl-delay` for bulk imports *(policy choice)*.
  - Expose blocked hosts as attention items with an "unblock and retry" action.
  - Off-the-shelf durable limiters exist (for example the PRD's job engine's own concurrency keys, or Postgres-backed ones if D1 ever changes). With SQLite (D1), a small in-house table is simplest.
- **PRD refs:** [PROC-9], [PROC-5] (`deferred`), [SRC-1] (rate limits), [PRIN-4].

### Failure classification
- **User intent:** Tell "this site is down" (stop trying for a while) apart from "this page is gone or forbidden" (fail this item) and "our renderer choked" (retry or degrade). Never black-list a whole site because of one bad page.
- **Observations:**
  - **[v0.7 choice]** v0.7 used four categories, and only two counted toward blocking:
    - `server_error` (5xx): blockable
    - `network_error` (DNS, refused, reset, TLS, certificate, name-not-resolved): blockable
    - `client_error` (401, 403, 404, 429): never blocks
    - `processing_error` (image library, storage, module, timeout, readability, screenshot, content extraction, and **unknown**): never blocks
  - **[Rule RULE-WEB-10]** A failure that does not show the site itself is down (a missing or forbidden page, a local processing error, an unknown error) MUST NOT count toward blocking or throttling that whole site.
  - **[v0.7 choice]** In v0.7, unknown errors deliberately defaulted to non-blocking. An earlier version blocked on any error and over-blocked whole domains. Keep that lesson.
  - **[v0.7 choice]** In v0.7, missing job data (no item ID, URL or owner) was a permanent error with no retry.
- **How v0.7 did it (non-normative):** Lower-cased substring matching on the error *message*.
- **Known problems in v0.7:**
  - **Substring matching could misclassify timeouts as server errors.** The 5xx check ran first and matched `"500"` anywhere in the message. The outer timeout guards report messages like "…timed out after 65000ms" or "…35000ms", and both contain "500". A URL or ID containing "500" has the same effect. So **a guard-level timeout could count as a server error and help block a domain for an hour**. Usually the browser library's own inner timeout ("Timeout 30000ms exceeded") fired first, which made this intermittent and hard to diagnose. Classify from structured data: HTTP status, error codes such as `ENOTFOUND`, and the browser's `net::ERR_*` codes. Never classify from message text.
  - **429 was "client error, never blocks"** instead of a deferral that respects `Retry-After`.
  - **No permanent outcome for 404 or 410.** They were retried as generic failures. The PRD's `permanent` category fits: show "page gone" and offer the saved snapshot.
  - **Content failures could fail the job.** A Readability or extraction failure on the generic path was degraded (title "Content extraction failed", empty text, a failure flag). On site-handler paths the same class of failure failed the job.
- **Better options today:** Map outcomes onto the PRD's `permanent`, `retryable`, `deferred` and `degraded` set per processor, with a typed error taxonomy. Record per-attempt errors on the Run.
- **PRD refs:** [PROC-5], [PROC-4].

### SSRF-relevant observations
- **User intent:** Saving a link must never let someone reach the instance's internal network, a cloud metadata endpoint, or other users' services. Eclaire runs on home networks and NASes next to routers, printers and admin panels, so this matters more than usual.
- **Observations:** The bullets below are the threat surface to cover.
  - **[v0.7 choice]** No v0.7 bookmark fetcher had an SSRF guard. That covers the lightweight GET, the browser navigation, the favicon fetches (`/favicon.ico` and the attacker-chosen `link rel=icon` href) and the fetch of every subresource the page loads. Redirects were followed automatically (5 for the GET, unlimited for the browser).
  - **[v0.7 choice]** In v0.7, any user could make the server request any URL, including `http://192.168.1.1/`, `http://169.254.169.254/latest/meta-data/`, `http://localhost:<port>/` and Docker service names. The user then received a screenshot, PDF and text of the response. That's a full-read SSRF.
  - **[Rule RULE-WEB-11]** Server-side fetches made for a capture, including every redirect hop, page subresource and icon fetch, MUST NOT reach private, loopback, link-local or cloud-metadata addresses or internal service names unless explicitly allowlisted.
  - **[v0.7 choice]** v0.7's scheme check was weak (see classification). `https://` was prepended rather than non-http(s) being rejected. Chromium itself would refuse `file:` once the prefix mangled the URL, but this was luck, not design.
  - **[v0.7 choice]** v0.7's Reddit and X renders loaded `data:` URLs in the same browser, and their HTML pulled remote images and, for Reddit, oEmbed iframes and scripts. So third-party content ran inside the capture browser too.
  - **[v0.7 choice]** The one guard in v0.7 (media direct download):
    - It checked scheme ∈ {http, https}.
    - It resolved the host with a *single* `lookup` and checked that one address against private ranges: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, CGNAT 100.64/10, reserved ranges and IPv6 equivalents.
    - It followed redirects manually (`redirect: "manual"`) and re-checked every hop.
  - **[Fact]** That guard's gaps teach the right design: checking only one resolved address can be bypassed with multi-record and AAAA answers, and checking **before** a separate connect that resolves DNS again is a DNS-rebinding TOCTOU.
  - **[Fact]** Stored captured HTML is untrusted.
  - **[v0.7 choice]** v0.7 served raw and readable HTML artifacts with `Content-Disposition: attachment` "to prevent XSS", so users couldn't view the readable copy inline. Rendered Reddit HTML contained unescaped remote HTML.
  - **[Rule RULE-WEB-12]** Viewing captured web content MUST NOT let it run script with the app's origin, cookies or credentials.
- **How v0.7 did it (non-normative):** No guard on web capture. A pre-check-then-fetch guard on media download only.
- **Known problems in v0.7:** As listed above. REVIEW §4.1 #5 records the missing guard; the details here are what a fix must cover.
- **Better options today:**
  - **HTTP fetchers:** resolve once, validate **every** A/AAAA record against a `node:net` `BlockList` (private, loopback, link-local, CGNAT, ULA `fc00::/7`, IPv4-mapped IPv6, `0.0.0.0/8`, multicast, and metadata IPs including `fd00:ec2::254`). Then **pin** the connection to the validated IP with an undici `Agent` whose `connect.lookup` returns only that IP. Re-validate on every redirect hop. Fail closed on an empty DNS answer.
    - New libraries such as `ssrf-guard` and `ssrf-safe-fetch` implement this pattern, but they are young, so audit before adopting.
    - Several 2026 CVEs (link-preview-js DNS rebinding; Budibase's undici client ignoring the guarded agent; dssrf treating an empty answer as safe) show exactly these failure modes. Make every outbound request go through the guarded dispatcher, and test it ([QA-4]).
  - **Browsers:** in-process checks can't see subresource requests reliably. Put the browser pack behind an **egress proxy** that enforces the same policy (Stripe's **Smokescreen** is the reference design; confirm it's still maintained) and/or a network namespace with no route to RFC 1918 addresses.
    - Also block non-http(s) navigations and `chrome://`/`file:` schemes, and turn off service workers and downloads.
    - Request interception (`page.route`) is a useful second layer, not the primary control.
  - Allowlist overrides per space (for example "allow my homelab wiki"), off by default, with audit.
  - **Serving captured HTML:** serve it from a separate sandbox origin, or with `Content-Security-Policy: sandbox; default-src 'none'; img-src data: https:` and no cookies. Or render the stored markdown instead. That restores inline reading safely.
- **PRD refs:** [PROC-10], [PRIN-10], §8 item 6, [QA-4], [EVT-4], [DEP-5], D13 ("a Playwright pack with an SSRF-guarding egress proxy").

### AI tagging and description for bookmarks
- **User intent:** Bookmarks become findable and browsable by topic without manual filing, and each has a short "what is this" line.
- **Observations:**
  - **[v0.7 choice]** v0.7's inputs to the tagger:
    - The page's extracted plain text (else the title), **truncated to the first 8,000 characters** (starting point; tune).
    - The title.
    - A short metadata line built from `og:type`, `og:site_name`, JSON-LD `@type` and JSON-LD `keywords`, when present. Only the generic path passed it.
  - **[v0.7 choice]** v0.7's call settings: the **background/worker model role**, temperature **0.1**, max tokens **200**, timeout **60 s**. It asked for **at most 5 tags as a JSON array of strings**.
  - **[v0.7 choice]** v0.7's parsing: take the contents of a ```json fence if present, else the whole reply. Accept either an array or `{ "tags": [...] }`, and keep only string entries.
  - **[v0.7 choice]** v0.7's fallbacks:
    - Generic web path: on any AI error, tags became `["webpage","bookmark"]` and a failure flag was set. The item still completed.
    - GitHub, Reddit and X paths: AI errors were **not caught**, so the whole job failed and retried. Don't repeat this; tagging should be its own processor.
    - Non-HTML URLs: fixed tags and no AI call.
    - Site-handler rule tags were unioned with AI tags (exact-string dedup).
  - **[v0.7 choice]** v0.7 had no AI description or summary for bookmarks. Description was the Readability excerpt, then meta description, then empty. Site handlers set their own (repo description, first 200 characters of the post). The PRD's `ai.describe` is new work.
  - **[v0.7 choice]** v0.7's processing results **overwrote** the user's capture-time title and description, and **replaced the whole tag set**, including tags the user supplied at capture or import (folder tags). REVIEW lists the general bug.
  - **[Rule RULE-WEB-13]** A title, description or tags the user supplied at capture or import MUST survive processing. Automated results MUST NOT overwrite or remove them.
  - **[v0.7 choice]** v0.7 told the model the wrong content type. The prompt switch for "Twitter/X post" vs "webpage" existed but was always set to "webpage", even for X posts.
- **How v0.7 did it (non-normative):** One prompt call at the end of each handler. Tags were written straight onto the item.
- **Known problems in v0.7:**
  - Free-text JSON parsing with no schema.
  - No tag vocabulary, so near-duplicates (`AI`, `ai`, `artificial-intelligence`) multiplied.
  - No case normalisation.
  - The title is interpolated into the prompt unescaped (a prompt-injection surface; low impact here).
  - Page chrome text eats the 8,000-character budget before the article body on browser-extracted pages.
  - No language awareness.
- **Better options today:**
  - Use **structured output** (JSON Schema or tool calling) where the model supports it.
  - Pass the user's existing top tags as a preferred vocabulary, and normalise the case and slug.
  - Feed the *readable markdown* (title + description + first N tokens, where N is set by model context) rather than raw text.
  - Emit tags and description as **Suggestions** with `source=ai`, confidence and prompt hash ([PROC-8], [PROC-12]).
  - Run under the space's egress policy, so local models are the default ([MODEL-5]).
  - Treat this prompt as the eval baseline (appendix) and build an eval set from the candidate fixtures.
- **PRD refs:** [PROC-8], [PROC-12], [MODEL-4], [MODEL-5], [MODEL-6], [PRIN-5], [PRIN-12], Appendix B.1 (`ai.describe`, `ai.tag`).

### Processing outcomes and provenance (cross-cutting notes)
- **User intent:** Know what was captured, what failed, and re-run only what's needed.
- **Observations:**
  - **[v0.7 choice]** v0.7 reported three user-visible stages: validation, content extraction, AI tagging. Within content extraction, sub-steps were non-fatal on purpose: full-page and mobile screenshots, PDF, favicon, and on the generic path Readability. The desktop screenshot and navigation were fatal.
  - **[Rule RULE-WEB-14]** When some parts of a capture fail (for example a screenshot, PDF, favicon, site API call or AI tagging), the item MUST still complete with whatever was captured, and MUST show what is missing.
  - **[v0.7 choice]** v0.7 had a capture-time "process this bookmark" flag (default on) that let API and import callers create a bare bookmark with no fetching. The extraction judged this switch worth keeping.
  - **[v0.7 choice]** v0.7's "reprocess" action re-ran everything. It was forced through the retry path and recorded in history.
- **Known problems in v0.7:**
  - All-or-nothing reprocessing.
  - No record of which extractor, browser version or model produced each artifact.
  - Raw API JSON (GitHub, Reddit, X) was stored, but without the fetch time in a queryable place.
- **Better options today:** Model each artifact (readable text, markdown, raw HTML, each screenshot variant, PDF, favicon, site-API JSON, README) as its own processor output with producer and version, so a new extractor version can be backfilled alone ([PROC-3], [ART-1]).
- **PRD refs:** [PROC-3], [PROC-4], [PROC-5], [ART-1], [ART-2], [ART-3].

---

## Candidate fixtures

v0.7 has **no HTML page fixtures and no recorded site-API responses**. Its bookmark tests are pure unit and CRUD tests. The rebuild should record its own: a static article, a JS-only SPA under 200 characters of server text, a paywall or consent page, a `@graph` JSON-LD page, a PDF URL, a redirect chain, GitHub `repos.get`/`readme`/`releases/latest` JSON, a Reddit comments response with nested `more` stubs, an X tweet lookup with `includes` (a quote post and a long `note_tweet`), and a bookmarks page with `next_token`. Existing v0.7 test material that is relevant:

| Path (v0.7) | What it exercises |
|---|---|
| `apps/backend/src/tests/integration/all.test.ts` | The classification matrix: explicit override beats MIME, `text/uri-list` → bookmark, text URL with and without scheme → bookmark, plain text → note, JPEG → photo, PDF → document, markdown → document, non-URL HTML → document, RTF → note, unsupported MIME → 400, invalid URL for a bookmark override → 400, non-image photo override → 400. |
| `apps/backend/src/tests/unit/bookmarks.test.ts` | Scheme normalisation (trim, add https, case-insensitive), URL validation edge cases, the favicon MIME-from-extension fallback, Chromium timestamp conversion (1601 epoch), folder-path → lowercase tag extraction with nesting and mixed levels. |
| `apps/backend/src/tests/integration/bookmarks.test.ts` | Bookmark CRUD, pin, flag and review; 404 for asset endpoints of missing items; invalid URL → validation error. |
| `apps/backend/src/tests/integration/bookmarks.search.test.ts` | Search over bookmark fields. |
| `apps/backend/src/tests/fixtures/documents/document1.txt`, `document2.pdf` | Magic-byte vs declared-MIME classification for text and PDF uploads. |
| `apps/backend/src/tests/fixtures/photos/photo1.jpg`, `photo2.JPEG`, `photo3.png`, `photo4.heic` | Image sniffing, including an uppercase extension and HEIC. |
| `apps/frontend/src/hooks/tests/use-bookmarks.test.tsx` | Client-side bookmark data hooks (UI only; low value for the rebuild). |

---

## Appendix: v0.7 prompts (eval baseline only, not a template)

**Bookmark tag generation.**
- **Purpose:** produce up to 5 topical tags for a saved web page, GitHub repo, Reddit post or X post.
- **Model role:** `workers`, v0.7's background-processing model; the PRD's `background` role.
- **Parameters:** temperature 0.1, max tokens 200, timeout 60 s.
- **Inputs:** `${contentType}` was always `webpage` in practice. The intended alternative was `Twitter/X post`. `${metadataContext}` is either empty or `\nMetadata: <parts joined by ". ">.`, where the parts are drawn from `Type: <og:type>`, `Site: <og:site_name>`, `Schema type: <JSON-LD @type>` and `Keywords: <JSON-LD keywords>`. Content is truncated to 8,000 characters.

System message:

```
You are a helpful assistant that analyzes web content and generates relevant tags. Always respond with a JSON array of strings.
```

User message template:

```
Based on the following text from a ${contentType}, generate a list of maximum 5 relevant tags as a JSON array of strings. The title of the ${contentType} is "${title}".${metadataContext} Content: 

${contentText.substring(0, 8000)}
```

No other LLM prompts exist in v0.7's web capture path. Titles, descriptions and site-specific tags were all rule-based.
