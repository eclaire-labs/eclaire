> **Non-normative reference.** Extracted from Eclaire v0.7 to preserve user intent and hard-won lessons. `PRD.md` is the source of truth. Do not reproduce v0.7's structure, module layout or naming; where this document and the PRD disagree, the PRD wins. "Better options today" are leads to evaluate, not decisions.

Labels: **[Fact]** external truth, keep. **[Rule]** a requirement we want, mirrored in PRD Appendix C. **[v0.7 choice]** inventory only, free to change.

# Document and image processing: v0.7 reference

Scope: what happens after a user uploads a document (PDF, Office, iWork, text-like formats) or an image (photo, screenshot, scan). Covers format routing, text extraction, PDF renditions, previews, AI metadata, image normalisation, EXIF, geocoding, vision classification, OCR, and the native dependencies these need. Media (audio/video) and bookmarks (web pages) are out of scope, except where they share tooling.

Verification: statements written plainly were checked in v0.7 code, or by running it (for example, the HEIC decode test below). "(inferred)" marks reasoning that was not tested. "(verify)" marks external facts that should be re-checked against current upstream docs.

---

## Part A: Documents

### A1. Supported formats and routing
- **User intent:** Drop in nearly any office or text file and get searchable text, a preview, a PDF to read, and an AI title, description and tags, without saying what kind of file it is.
- **Observations:**
  - **[v0.7 choice]** v0.7 accepted these formats as documents: PDF; DOCX, XLSX, PPTX (plus any `application/vnd.openxmlformats-officedocument.*`); legacy DOC, XLS, PPT; RTF (`text/rtf` and `application/rtf`); Markdown; HTML; CSV; JSON; XML; plain text; Apple Pages, Numbers and Keynote.
  - **[v0.7 choice]** v0.7 had extraction code for ODT, ODS and ODP, but those MIME types were missing from the accepted set, so OpenDocument uploads were rejected. **The rebuild should accept ODF.** Also consider: `text/x-rst` and org-mode had extractor support but no upload route; EPUB was not supported at all.
  - **[Rule RULE-DOC-1]** The system MUST work out an uploaded file's type from its content, without the user saying what kind of file it is, and a client-declared type MUST NOT override what the content shows.
  - **[v0.7 choice]** v0.7 ran MIME detection in this order:
    1. Sniff magic bytes. This won over the client-declared type.
    2. If sniffing found nothing, fall back to the declared type.
    3. If sniffing said XML and the filename ended in `.svg`, treat it as SVG.
    4. If sniffing said ZIP and the extension was an iWork one, use the iWork type.
    5. If the type was `application/octet-stream`, map by extension: `.md .csv .txt .html/.htm .json .xml .rtf`.
  - **[Fact]** Keynote files use the extension **`.key`**, not `.keynote`. Match `.key`.
  - **[v0.7 choice]** Gotcha: v0.7 matched `.keynote`, so Keynote files sniffed as ZIP were rejected.
  - **[v0.7 choice]** Gotcha: on the generic "capture anything" endpoint, v0.7 made plain text and RTF **notes**, not documents. Text, Markdown, HTML or RTF whose whole content was a URL became a **bookmark**. Only an explicit document upload produced a document from a `.txt`. The rebuild's kind classifier ([CAP-1]) needs an explicit precedence rule for this, plus a user override.
  - **[v0.7 choice]** v0.7 routed as a two-tier fallback ([PROC-7]):
    - PDF, DOCX, XLSX and PPTX tried Docling first, then the native extractor.
    - Every other format went straight to a native extractor.
    - v0.7 also listed image types as Docling-routable, but images never reached the document path because they were captured as photos.
- **How v0.7 did it (non-normative):** A single per-document job ran fixed stages: prepare, extract (Docling or native), AI analysis, PDF rendition (for anything that is not already a PDF), thumbnail and screenshot, and finalise. All routing was hard-coded MIME switches.
- **Known problems in v0.7:**
  - Supported formats were declared in at least four places: accepted MIME types, the Docling set, the extractor switch, and the MIME-to-extension map. They drifted apart, which is how ODF ended up dead and why JSON and XML were written to temp files as `.bin`.
  - Kind detection depended on filename extensions for zip-container formats.
- **Better options today:**
  - Declare formats once per processor through `accepts` predicates ([PROC-1]). Derive the upload allowlist from the registry.
  - For sniffing, `file-type` (Node) is still standard. Magika (Google's ML-based content-type detector, which has a CLI and bindings) is better at text-like formats such as CSV, JSON, Markdown and source code (verify current JS bindings).
  - On macOS, UTType conformance (`public.presentation`, `com.apple.iwork.keynote.key`) resolves iWork and Office types without guessing.
- **PRD refs:** [CAP-1], [PROC-1], [PROC-7], [PROC-13], [KIND-3a].

### A2. Docling integration
- **User intent:** High-fidelity structured extraction (reading order, tables, headings) and OCR of scanned PDFs, so that search and the assistant see real document structure.
- **Observations:**
  - **[Fact]** Endpoint: `POST {DOCLING_URL}/v1/convert/file`, multipart, with the file in the field `files`.
  - **[v0.7 choice]** v0.7 attached the original filename and MIME type to the upload.
  - **[v0.7 choice]** v0.7's default URL was `http://docling:5001` inside containers and `http://127.0.0.1:5001` locally, configurable through `DOCLING_SERVER_URL`.
  - **[Fact]** docling-serve exposes a health check at `GET /health`.
  - **[v0.7 choice]** v0.7 called the health check with a 5 s timeout, and reported Docling as **optional**: the system worked without it and fell back to native extractors.
  - **[Rule RULE-DOC-2]** When the preferred extractor is unavailable or fails, a document MUST still get searchable text from any other available extractor that can read it, and text produced by whichever extractor succeeded MUST be stored and searchable.
  - **[Fact]** docling-serve form options include:
    - `to_formats` (repeated field; values include `md`, `json`, `text`)
    - `do_ocr`
    - `ocr_engine` (the server offers easyocr, tesserocr, tesseract, rapidocr and ocrmac)
    - `image_export_mode`; `placeholder` keeps the payload small because images are not inlined as base64
  - **[v0.7 choice]** Form options v0.7 sent: `to_formats` = `md`, `json`, `text`; `do_ocr=true`; `ocr_engine=easyocr`; `image_export_mode=placeholder`.
  - **[v0.7 choice]** v0.7 used a client timeout of 300 s.
  - **[v0.7 choice]** v0.7's success test was response `status === "success"`. Any other status counted as failure.
  - **[Fact]** docling-serve also returns `partial_success` (some pages failed).
  - **[v0.7 choice]** Gotcha: v0.7 discarded `partial_success` results and fell back to the much weaker native path. **Keep partial results and mark the run `degraded` ([PROC-5]).**
  - **[Rule RULE-DOC-3]** When an extraction or OCR step produces usable but incomplete output, the system MUST keep that output and visibly mark it as partial, rather than discard it.
  - **[v0.7 choice]** Text selection in v0.7: prefer `document.text_content`, else `document.md_content`.
  - **[Fact]** Docling's "text" output can still contain Markdown markup.
  - **[v0.7 choice]** v0.7 always rendered that text Markdown → HTML → plain text (keeping tables, no word wrap, no upper-casing of table headings) before indexing.
  - **[v0.7 choice]** Outputs v0.7 kept:
    - The full raw response
    - Markdown (`md_content`)
    - Cleaned plain text
    - Docling's structured JSON (`json_content`)
  - **[v0.7 choice]** On any Docling error (network, timeout, non-success), v0.7 ran the native extractor for the same file. If that also failed, it recorded both error messages.
  - **[v0.7 choice]** Deployment: v0.7's compose ran `ghcr.io/docling-project/docling-serve:${DOCLING_VERSION:-latest}` in CPU mode. The app container depended on it with `service_started` only, not on health.
- **How v0.7 did it (non-normative):** A synchronous multipart POST from the worker. The worker waited up to 5 minutes, then stored the response blobs.
- **Known problems in v0.7:**
  - **Docling fails, native fallback succeeds → the extracted text was never persisted.** Saving text was gated on "not a Docling-routed type", so the document stayed unsearchable even though extraction worked. The lesson: store text artifacts by *what produced them*, not by which path was planned.
  - The image tag was unpinned (`latest`), so results changed silently. Pin the version, and record it in artifact provenance ([ART-1]).
  - Synchronous long requests: the server has its own sync-wait limit, which may be shorter than the client's 300 s (verify docling-serve's max-sync-wait setting). Large PDFs need the async API.
  - The raw response duplicated md, json and text, roughly tripling storage. The structured JSON was never read by anything.
  - EasyOCR on CPU is slow and heavy. It was chosen explicitly even on Macs, where `ocrmac` (Apple Vision) is available.
- **Better options today:**
  - docling-serve's async API: `/v1/convert/file/async`, polling via `/v1/status/poll/{task_id}`, plus a WebSocket status endpoint. This maps cleanly onto durable runs with `deferred` polling ([PROC-4]).
  - Docling's VLM pipeline with **granite-docling-258M** (Apache-2.0, DocTags output) is a one-model alternative to the layout + OCR + table-model stack. Benchmark it against the standard pipeline on our fixtures.
  - Check the docling-serve release notes for the current version and options (verify). On macOS, `ocrmac` or a native Vision processor ([PROC-11a]) should be preferred.
  - See A10 for the wider VLM-OCR landscape (PaddleOCR-VL, MinerU, olmOCR, Marker).
- **PRD refs:** [PROC-7], [PROC-11], [PROC-5], [ART-1], [ART-3], [DEP-3], [D13].

### A3. Native extractor: PDF text (pdftotext)
- **User intent:** Searchable text from born-digital PDFs even when Docling is absent or fails.
- **Observations:**
  - **[Fact]** `pdftotext <file.pdf> -` writes the text to stdout.
  - **[v0.7 choice]** v0.7 ran that command with a 120 s timeout.
  - **[v0.7 choice]** v0.7 passed no `-layout`, no `-enc` and no page range, so the output was raw reading-order text.
  - **[Fact]** `pdftotext` does no OCR: scanned or image-only PDFs produce empty text.
  - **[v0.7 choice]** v0.7 then tagged the document `extraction-empty` (see A8). The native path had **no OCR fallback**.
- **How v0.7 did it (non-normative):** Wrote the bytes to a temp file and spawned Poppler's `pdftotext`.
- **Known problems in v0.7:** A scanned PDF with Docling down ends up with no text and no OCR. The image-OCR capability existed (see the image pipeline) but was never applied to PDF pages.
- **Better options today:**
  - Poppler `pdftotext` is still a solid baseline; consider `-layout` for tables, and `-enc UTF-8`.
  - PDFium (via `pypdfium2`, or pdf.js in Node) gives better text and rendering throughput.
  - MuPDF (`mutool`) is excellent but AGPL; check licensing.
  - For scanned PDFs on CPU-only hosts, **OCRmyPDF + Tesseract** adds a text layer and is still the standard choice.
  - On macOS, **PDFKit** (`PDFDocument.string`, plus per-page selections) extracts text with no install.
  - Detect "no text layer" and branch to OCR declaratively ([PROC-6]).
- **PRD refs:** [PROC-6], [PROC-7], [PROC-11a].

### A4. Native extractor: LibreOffice headless conversions
- **User intent:** Text and PDF renditions for legacy Office, OpenDocument and iWork files.
- **Observations:**
  - **[Fact]** Command shape: `soffice --headless --convert-to <fmt> --outdir <dir> <input>`.
  - **[v0.7 choice]** v0.7 used a 120 s timeout per call.
  - **[v0.7 choice]** v0.7 used `<fmt>` = `pdf` for renditions, `txt` for text extraction of DOC, XLS, PPT, ODF, Pages and Keynote, and `csv` for Numbers.
  - **[Fact]** LibreOffice's text export of Numbers does not work; CSV export does.
  - **[Fact]** LibreOffice names output after the input's basename.
  - **[v0.7 choice]** v0.7 found the output by scanning `--outdir` for the expected extension, not by predicting the filename.
  - **[v0.7 choice]** v0.7's executable discovery, in order, with the result cached:
    1. `/Applications/LibreOffice.app/Contents/MacOS/soffice` (macOS cask)
    2. `/usr/bin/libreoffice`
    3. `libreoffice` on PATH
    4. `soffice` on PATH
    - Absolute candidates were probed by file access; PATH candidates by running `--version`.
  - **[v0.7 choice]** Retries: v0.7 attempted PDF conversion 3 times with linear backoff (1 s, then 2 s). Text conversion was not retried.
  - **[Fact]** LibreOffice mostly sniffs content, but its filter selection can depend on the extension (inferred). Give the input file the *right extension*.
  - **[v0.7 choice]** v0.7 mapped Keynote to `.keynote` and JSON and XML to `.bin`.
- **How v0.7 did it (non-normative):** Spawned a new `soffice` per conversion inside the worker container. Worker concurrency was 1 per queue, which hid profile-lock problems.
- **Known problems in v0.7:**
  - No per-invocation profile (`-env:UserInstallation=file:///tmp/<unique>`). Concurrent `soffice` processes that share a profile fail or exit silently with no output. The retry loop masked this (inferred).
  - Cold start of a few seconds per call.
  - LibreOffice ran in the main app image with network access and no resource limits, which violates [PROC-10].
  - Office documents with external links or remote images could trigger fetches during conversion (inferred).
- **Better options today:**
  - **Gotenberg** (v8.x; verify) wraps LibreOffice and Chromium behind an HTTP API (`/forms/libreoffice/convert`, `/forms/chromium/convert/html|markdown|url`). It handles process pooling and timeouts, ships as one container, and fits the "office pack" in [DEP-3] and [D13] directly.
  - If you call LibreOffice directly: use **unoserver** (a persistent UNO listener) or always pass a unique `-env:UserInstallation`; add `--norestore` and `--nolockcheck`; and run it in a sandbox with no network.
  - On macOS, see A6 for iWork, and `textutil -convert txt` (built in) for DOC, DOCX, RTF, HTML, ODT and webarchive text.
- **PRD refs:** [PROC-9] (`office` pool), [PROC-10], [PROC-11], [DEP-3], [D13].

### A5. Native extractors: CSV, JSON, XML, RTF, HTML, Markdown and plain text
- **User intent:** Text-like files should be searchable *meaningfully*, so that an agent can answer "which row has X?", not just grep raw syntax.
- **Observations:**
  - **[v0.7 choice]** **Plain text:** v0.7 decoded it as UTF-8 and used it as-is. No charset detection was done, so Latin-1 and UTF-16 files were mangled.
  - **[Rule RULE-DOC-4]** Text files MUST be decoded in their actual character encoding, so that non-UTF-8 files (e.g. Latin-1, UTF-16) are searchable and readable without mangling.
  - **[v0.7 choice]** **Markdown:** v0.7 made text = Markdown → HTML → plain text, keeping tables. The Markdown artifact was the original file.
  - **[v0.7 choice]** **CSV:**
    - v0.7 parsed with the header row as column names, skipped empty lines, stripped a BOM, tolerated ragged rows, trimmed cells, and capped at **10,000 rows** (starting point; tune).
    - Text form: one line per row, `Row: <header> is <value>. <header> is <value>.` (empty cells skipped). This "row as sentences" form existed so that embeddings and LLMs see column semantics.
    - Markdown form: a GFM table, with `|` escaped and newlines inside cells flattened, also capped at 10,000 rows.
    - If parsing failed, v0.7 fell back to the raw text.
  - **[v0.7 choice]** **JSON:**
    - v0.7 walked the structure recursively up to **depth 50** (starting point; tune), emitting `key: value` lines for scalars; array items inherited their parent key.
    - Markdown form: the original in a fenced `json` block.
    - Invalid JSON: v0.7 used the raw text.
  - **[v0.7 choice]** **XML:** v0.7 kept the structure (LLMs read XML well), stripping `<?xml ...?>` declarations and comments only. Markdown form: a fenced `xml` block.
  - **[v0.7 choice]** **RTF:**
    - Primary: RTF → HTML via a converter, then HTML → text. The HTML was kept for the PDF rendition.
    - Fallback when conversion failed: if the content contained `\rtf`, regex-strip control words and braces and collapse whitespace. Otherwise fail with "not valid RTF".
  - **[Rule RULE-DOC-5]** Processing user-supplied HTML or Markdown (text extraction, rendering, previews) MUST NOT execute scripts it contains and MUST NOT let it make network requests.
  - **[v0.7 choice]** **HTML:**
    - v0.7 parsed in a DOM with **scripts disabled** (and `<script>` removed), ran Mozilla Readability, then converted the article HTML to text.
    - Fallback if DOM parsing threw: strip `<script>` and `<style>` with regex, then strip all tags.
- **How v0.7 did it (non-normative):** In-process JS libraries (`csv-parse`, `@mozilla/readability` + `jsdom`, `html-to-text`, `marked`, an RTF→HTML package pulled from a GitHub master branch).
- **Known problems in v0.7:**
  - Readability returns `null` for non-article HTML (tables, forms, short pages, exported reports). v0.7 then produced empty text and an `extraction-empty` tag for files that were full of content. **Fall back to full-body text when Readability yields little.**
  - The RTF library was an unpinned GitHub dependency that is effectively unmaintained.
  - Markdown was rendered without sanitisation (raw HTML passes through) before going to Chromium. See A7.
  - CSV and JSON files above the caps were truncated silently, with no "truncated" marker in the artifact.
- **Better options today:**
  - Readability is still the reference for article extraction. Alternatives that keep more non-article content: `defuddle`, or Trafilatura (Python).
  - For RTF: LibreOffice or Pandoc (`pandoc -f rtf`) are maintained routes. On macOS, `NSAttributedString` and `textutil` read RTF natively.
  - Pandoc in general is a strong single tool for text-like format conversion (md, rst, org, html, docx, epub → md).
  - Charset detection: `chardet` or `jschardet`, or ICU.
- **PRD refs:** [PROC-13], [ART-3] (`text.plain`, `text.markdown`), [PROC-5] (`degraded` when truncated).

### A6. iWork (.pages, .numbers, .key)
- **User intent:** Mac users' native documents should work like Office files.
- **Observations:**
  - **[Fact]** Detection: modern iWork files sniff as ZIP, so the extension is needed to tell them apart (see A1).
  - **[v0.7 choice]** v0.7 got Pages and Keynote text via LibreOffice `txt`, and Numbers via LibreOffice `csv` export followed by the CSV row-sentence transform. PDF rendition was via LibreOffice `pdf`.
  - **[Fact]** LibreOffice's iWork import (libetonyek) is partial. Expect layout loss and failures on newer files (inferred).
- **How v0.7 did it (non-normative):** Treated iWork as just more LibreOffice input.
- **Known problems in v0.7:**
  - The `.key` extension bug (A1).
  - iWork "package" documents (directory bundles rather than single-file ZIPs) cannot be uploaded through a browser at all (inferred).
  - When LibreOffice fails there is no fallback.
- **Better options today:**
  - On macOS, **QuickLook** (`QLThumbnailGenerator`) renders thumbnails and previews of iWork files with no install.
  - iWork single-file documents usually embed preview images inside the ZIP (e.g. `preview.jpg`, `QuickLook/Thumbnail.jpg`), which makes a cheap cross-platform thumbnail (verify per version).
  - Full-fidelity text and PDF from iWork are best done on a Mac edge host, by scripting Pages, Numbers or Keynote export via AppleScript/JXA. Use LibreOffice as the Linux fallback ([PROC-11a], [EDGE-1]).
- **PRD refs:** [PROC-11a], [EDGE-1], [PROC-7].

### A7. PDF rendition
- **User intent:** A consistent in-app reader for any document, and a stable base for page thumbnails.
- **Observations:**
  - **[v0.7 choice]** v0.7 did not re-render PDFs; the original served as the rendition.
  - **[v0.7 choice]** **Chromium path** in v0.7 (Markdown, HTML, plain text, RTF-via-HTML):
    - Page format A4, 1 in margins on all sides, `printBackground: true`, waiting for `domcontentloaded`.
    - Markdown was wrapped in a minimal HTML page (sans-serif, line-height 1.6).
    - Plain text went in a `<pre>` with `white-space: pre-wrap`, word-wrap and a monospace font.
  - **[Rule RULE-DOC-5]** (same rule as A5) Processing user-supplied HTML or Markdown (text extraction, rendering, previews) MUST NOT execute scripts it contains and MUST NOT let it make network requests, so that user HTML cannot reach internal services (SSRF) or beacon out.
  - **[v0.7 choice]** v0.7 blocked **all network requests** except `data:` and `about:blank` during Chromium rendering. Keep this, and treat it as the floor, not the whole defence.
  - **[v0.7 choice]** **LibreOffice path** in v0.7 (Office, ODF, iWork, CSV, JSON, XML): `--convert-to pdf`, with the retries described in A4.
  - **[v0.7 choice]** For HTML, one browser instance served both the PDF and the screenshot (A8), to save a cold start.
- **How v0.7 did it (non-normative):** Headless Chromium (Patchright) launched in-process per document; route interception aborted every non-data request.
- **Known problems in v0.7:**
  - The plain-text HTML escaping was a no-op (`&`→`&`, `<`→`<`). Text files containing markup were rendered as HTML. **Escape properly, or render text without HTML.**
  - **JavaScript stayed enabled** for user-supplied HTML and Markdown. Network blocking limited the damage, but scripts could still spin the CPU or rewrite the page. Disable JS for document renditions.
  - A rendition failure failed the *whole job*, discarding the text and AI results computed earlier. Renditions should be independent artifacts with their own runs ([PROC-4]).
  - CSV, JSON and XML via LibreOffice give poor PDFs (spreadsheet pagination, unformatted text). Rendering the Markdown form via Chromium would be better (inferred).
  - The Dockerfile pinned the browser download to a different Patchright version than the one in package.json (1.58.2 vs 1.59.4). That risks a browser/driver mismatch (inferred).
- **Better options today:**
  - **Gotenberg's Chromium routes** for HTML and Markdown, with JS disabled and egress blocked at the container level ([PROC-10]).
  - On macOS: WebKit `WKWebView.createPDF` or `NSPrintOperation`, and PDFKit for assembly.
  - Typst or WeasyPrint are lighter non-browser options for Markdown/text → PDF (no JS engine at all). Worth evaluating for text-like formats.
- **PRD refs:** [ART-3] (`rendition.pdf`), [PROC-10], [PROC-4], [PRIN-10].

### A8. Document thumbnails and previews
- **User intent:** Recognisable cards in grids, and a large first-page preview in detail views, for every document, including ones that failed to convert.
- **Observations:**
  - **[v0.7 choice]** v0.7 made two sizes per document (starting point; tune):
    - **Thumbnail:** fit inside 600×600, WebP quality 80.
    - **Preview ("screenshot"):** fit inside 1920×1440, JPEG quality 90.
    - Both used `withoutEnlargement`.
  - **[Fact]** `pdftocairo -png -f 1 -l 1 -scale-to <N> <in.pdf> <outbase>` renders page 1; `-scale-to` fits the page's long side to N px. pdftocairo appends a page suffix to the output name (`<outbase>-1.png`, possibly zero-padded), so find the file by prefix.
  - **[v0.7 choice]** **PDF-based** in v0.7 (every non-HTML document, via its PDF rendition):
    - pdftocairo with a 120 s timeout.
    - N = 1200 for the thumbnail (render about 2× and downscale for sharpness) and 1920 for the preview.
    - sharp then resized and encoded.
  - **[v0.7 choice]** **HTML documents:** v0.7 rendered in Chromium at a 2560×1600 viewport, captured the first viewport (not the full page), and derived both sizes from that one capture.
  - **[Rule RULE-DOC-6]** Every document MUST have a recognisable visual in grids and detail views, including documents that failed to convert, and a thumbnail or preview failure MUST NOT fail the rest of the document's processing.
  - **[v0.7 choice]** **Fallback placeholder:** if pdftocairo was missing (probed once with `-v`, then cached) or failed, v0.7 generated an SVG placeholder:
    - flat `#f0f2f5` background, centred "DOC" in `#a0aec0`, sans-serif, font size 15% of the shorter side
    - rasterised by sharp: thumbnail 800×600 JPEG q85, preview 1920×1440 JPEG q90
    - Thumbnail failure never failed the job.
- **How v0.7 did it (non-normative):** Poppler `pdftocairo` + sharp, Chromium screenshots for HTML, and an inline SVG placeholder.
- **Known problems in v0.7:**
  - The placeholder thumbnail was **JPEG bytes stored and served as `image/webp`**. Keep the format and the declared MIME type consistent.
  - The placeholder is generic. A per-format icon/colour (PDF, sheet, slides, text), rendered client-side from the MIME type, is better than storing placeholder blobs at all.
  - Document thumbnails were served with `Cache-Control: public, max-age=604800`. Private content must use `private` caching.
  - First page only. There is no multi-page preview strip.
- **Better options today:**
  - pdftocairo is still fine. PDFium renders faster.
  - On macOS, **QuickLook `QLThumbnailGenerator`** gives thumbnails for PDF, Office, iWork, text and images with one API, and **PDFKit** `PDFPage.thumbnail(of:for:)` handles PDFs.
  - sharp (libvips) remains the best Node choice for resize and encode. For thumbnails, consider AVIF or WebP at about 400 px and 2× DPR variants as registered artifact kinds (`image.thumbnail@N`, [ART-2]).
- **PRD refs:** [ART-2], [ART-3] (`image.thumbnail`, `image.preview`), [PROC-7], [BLOB-2].

### A9. Text sampling and AI metadata for documents
- **User intent:** Every document gets a useful title, a one-line description and tags without the user typing anything, even for very long files.
- **Observations:**
  - **[v0.7 choice]** v0.7 skipped AI analysis when the extracted text was **50 characters or fewer** (starting point; tune).
  - **[v0.7 choice]** **Sampling budget: 4,000 characters** (starting point; tune).
    - Text at or under the budget was sent whole.
    - Longer text was sent as 50% from the beginning, 25% from the exact middle and 25% from the end, laid out as:
      `[Document length: N characters]`, then `--- Beginning ---`, `--- Middle ---` and `--- End ---` sections.
    - The beginning carries title and abstract; the middle catches the main topic; the end catches conclusions and signatures.
  - **[v0.7 choice]** v0.7 included the original filename in the prompt. It is a strong signal for titles.
  - **[v0.7 choice]** Call parameters: temperature 0.1, max 500 output tokens, using the background/vision model role (`workers` in v0.7).
  - **[v0.7 choice]** Response handling: v0.7 stripped ```` ```json ```` fences and parsed, taking `title`, `description` and `tags` (strings only; non-string tags dropped). Missing fields became null or empty.
  - **[Rule RULE-DOC-7]** If AI analysis fails, the document MUST still complete with its extracted text and previews, and the missing AI results MUST be visible as a partial outcome rather than a failed document.
  - **[v0.7 choice]** v0.7 completed such documents with their extraction and renditions, marked degraded.
- **How v0.7 did it (non-normative):** One chat-completion call with the prompt in Appendix P1; the result was merged straight into the item.
- **Known problems in v0.7:**
  - AI output **overwrote** user-edited titles and descriptions, and **replaced** the user's tags. See [PROC-8]: these must be Suggestions.
  - There was no JSON schema or structured-output mode; parsing relied on fence stripping.
  - The 4,000-character budget was fixed regardless of model context; the AI saw no document structure (headings) when Docling Markdown was available; and the result recorded no prompt hash or model ([PRIN-5]).
- **Better options today:**
  - Use structured outputs / JSON-schema-constrained decoding (llama.cpp grammars, OpenAI-style `response_format`, the tool-call pattern).
  - Build the sample from Markdown headings plus the first paragraphs of sections, rather than raw character slices. Size the budget to the model's context.
  - On macOS, Foundation Models' guided generation (`@Generable`) covers small title, tag and summary tasks on-device ([PROC-11a]).
  - Reuse an existing tag vocabulary in the prompt to avoid near-duplicate tags (inferred benefit).
- **PRD refs:** [PROC-8], [PROC-12], [MODEL-4], [PRIN-5], [QA-6].

### A10. Size caps, extraction failure and empty extraction
- **User intent:** Uploads never take the server down. A document whose text cannot be read is still stored, previewable and visibly flagged, rather than silently missing from search.
- **Observations:**
  - **[v0.7 choice]** Caps in v0.7:
    - 200 MB per document, checked in the worker before download (permanent error).
    - 100 MB per photo, checked at upload and again in the worker.
    - A **global 50 MB request body limit**, which made both larger caps unreachable through the API.
    - Make caps explicit per route and kind ([DEP-5]), and stream large files instead of buffering them ([CAP-2]).
  - **[Rule RULE-DOC-8]** Each kind's size limit MUST be explicit and enforced consistently along the whole upload path, so that any file within the stated limit is accepted, and no single upload may take the server down.
  - **[v0.7 choice]** v0.7 treated missing or empty blob ids as permanent errors, and an empty image buffer as a permanent error.
  - **[Rule RULE-DOC-9]** A document whose text cannot be extracted, or whose extraction comes back empty, MUST still be stored and previewable, and MUST be visibly flagged with the reason instead of silently missing from search.
  - **[v0.7 choice]** **Extraction failed** (primary and fallback both threw) in v0.7:
    - The job continued to renditions and thumbnails.
    - The error text was recorded: "Content extraction failed: <primary>; fallback also failed: <fallback>".
    - The extraction stage was marked failed, and the item was labelled `extraction-failed`.
  - **[v0.7 choice]** **Extraction empty** (no exception, but the text is empty or whitespace): v0.7 continued and labelled the item `extraction-empty`. This is the common case for scanned PDFs without OCR and for photos-of-text uploaded as PDF.
  - **[v0.7 choice]** v0.7 treated an unsupported MIME type in the extractor as a permanent error (no retry).
- **How v0.7 did it (non-normative):** Special tags written into the item's tag list, plus a failed stage in the job's stage list.
- **Known problems in v0.7:**
  - Status was modelled as **user tags**. `extraction-failed` *replaced* all existing tags, and these tags polluted tag facets and AI tag suggestions. The rebuild should model them as artifact/run status and warnings (`degraded`, [PROC-5]), shown in the UI as an attention reason, with a one-click "retry with OCR / different processor".
  - The two caps disagreed with the body limit.
  - Whole files were read into memory (`readBuffer`) even at 200 MB.
- **Better options today:** Model empty extraction as a predicate that enables an OCR branch automatically ([PROC-6]), e.g. "`text.plain` empty AND mime=pdf → page-raster OCR". Limits should come from processor manifests (`timeout`, resource pool) instead of constants.
- **PRD refs:** [PROC-5], [PROC-6], [CAP-2], [DEP-5], [PROC-9].

### A11. Document artifact set (what the UI and the agent consumed)
- **User intent:** A "Content" tab with readable text, a "PDF" tab, a preview, and text for search and chat.
- **Observations:**
  - **[v0.7 choice]** Each v0.7 document produced: the original, canonical plain text, canonical Markdown, the PDF rendition (non-PDF inputs), the thumbnail, the preview, and, for Docling, the raw response and structured JSON.
  - **[v0.7 choice]** Markdown for non-Docling inputs in v0.7:
    - Markdown files → the original
    - CSV → a table
    - JSON and XML → fenced blocks
    - everything else → the extracted text
  - **[Rule RULE-DOC-10]** Uploaded originals that can carry active content (such as HTML, SVG and XML) MUST NOT be able to run script in the app's origin when viewed, previewed or downloaded (XSS).
  - **[v0.7 choice]** v0.7 **always served** originals of `text/html`, `image/svg+xml`, `application/xhtml+xml` and `application/xml` **as attachments**, never inline. Keep this list, and add a sandboxed CSP for any inline preview.
- **How v0.7 did it (non-normative):** Fixed per-kind URL routes (`/file`, `/thumbnail`, `/screenshot`, `/pdf`, `/content`).
- **Known problems in v0.7:** Per-kind hard-coded routes and columns. Some artifacts (raw Docling JSON) were written with no column and were never reachable.
- **Better options today:** Generic artifact discovery ([ART-2]) with registered kinds (`text.plain`, `text.markdown`, `rendition.pdf`, `image.thumbnail`, `image.preview`, `extraction.docling`).
- **PRD refs:** [ART-1], [ART-2], [ART-3], [BLOB-2].

---

## Part B: Images

### B1. Format normalisation
- **User intent:** iPhone HEIC, AVIF, TIFF scans, BMP, GIF and SVG all display in any browser and feed the AI reliably.
- **Observations:**
  - **[v0.7 choice]** v0.7 accepted these image types: JPEG, PNG, WebP, HEIC, HEIF, GIF, TIFF, BMP, SVG and AVIF.
  - **[Rule RULE-DOC-11]** Every accepted image MUST display correctly oriented in every supported browser, whatever its original format.
  - **[v0.7 choice]** Types v0.7 normalised to a "converted JPEG" (quality 90, EXIF orientation applied):
    - HEIC, HEIF, AVIF and WebP
    - SVG, rasterised at **density 300**
    - PNG, normalised to avoid alpha → black in JPEG
    - TIFF, because CMYK, 16-bit and multi-page variants break consumers
    - BMP, because the files are large
    - GIF, first frame only
    - JPEG was used as-is.
  - **[v0.7 choice]** v0.7's **view** endpoint preferred the converted JPEG for HEIC, HEIF, TIFF and SVG, and fell back to the original. "Original viewable in browser" was false for HEIC, HEIF and TIFF.
  - **[v0.7 choice]** In v0.7 a conversion failure **failed the whole image job**.
- **How v0.7 did it (non-normative):** sharp `.rotate().jpeg({quality:90})` on the whole image, with the result stored as an extra blob.
- **Known problems in v0.7:**
  - **Docker builds could not decode iPhone HEIC.** sharp's prebuilt libvips (installed with `SHARP_IGNORE_GLOBAL_LIBVIPS=1`) does not include an HEVC decoder. This was reproduced against the HEIC fixture with sharp 0.34.5: `metadata()` succeeds (format `heif`, compression `hevc`, EXIF present), but decoding fails with "Support for this compression format has not been built in". So HEIC photos got EXIF but no conversion, no thumbnail and no AI. The `libheif1` apt package in the image was never used by sharp. **Add a CI test that fully decodes a real iPhone HEIC.**
  - Flattening PNG with alpha to JPEG composited onto black (no `flatten({background})`) (inferred). Pick a background (white, or detect it), or keep WebP/PNG with alpha.
  - Converting already web-safe PNG, WebP and GIF wasted storage. Animated GIF and WebP lost their animation in the derived image, though the original kept it.
  - SVG originals could be served inline if conversion failed (the forced-attachment list only applied to documents).
  - Wide-gamut and HDR (Display P3, gain-map HDR) were reduced to plain sRGB JPEG with no colour-profile handling (inferred).
- **Better options today:**
  - **libvips/sharp is still the best server-side choice.** For HEVC HEIC, pick one of:
    - a global libvips built with libheif + libde265 (sharp built from source)
    - a WASM decoder such as `heic-decode` for files whose metadata reports `compression === "hevc"`
    - **ImageIO on macOS**, which decodes HEIC and camera RAW natively ([PROC-11a])
  - Mind HEVC patent licensing when shipping decoders.
  - Camera RAW (DNG, CR3, NEF, ARW) is not handled by sharp. Options: LibRaw/`dcraw_emu`, darktable-cli, or ImageIO.
  - Emit a browser-safe `image.preview` (WebP/AVIF or JPEG, about 2048 px) rather than a full-resolution "converted JPEG".
  - Keep the ICC profile (`withIccProfile`/`keepIccProfile` in sharp).
  - Check current sharp for JPEG XL and Ultra HDR support (verify).
- **PRD refs:** [PROC-13], [PROC-11a], [PROC-10] (image codecs are untrusted-input parsers), [ART-3].

### B2. Image thumbnails (crop strategy)
- **User intent:** Square grid tiles that show the subject, not an arbitrary centre crop.
- **Observations:**
  - **[Fact]** libvips' `attention` crop position is saliency-based and favours skin tones, saturation and edges.
  - **[v0.7 choice]** v0.7 used **800×800, `fit: cover`, `position: attention`**, WebP quality 80, after applying EXIF orientation (`rotate()`).
  - **[v0.7 choice]** v0.7 generated the thumbnail from the converted image when one existed.
  - **[v0.7 choice]** In v0.7, thumbnail failure failed the job.
- **How v0.7 did it (non-normative):** A single sharp pipeline.
- **Known problems in v0.7:**
  - There was only a square crop. Detail and masonry views had no aspect-preserving mid-size preview.
  - Thumbnails were served as `public, max-age=604800` (should be `private`).
- **Better options today:**
  - Keep libvips `attention`, or use `entropy`.
  - On macOS, Vision's **attention- or objectness-based saliency** requests, plus face rectangles, give better crops.
  - Generate both a square crop and an aspect-preserving preview, and consider BlurHash/ThumbHash placeholders for instant grids.
- **PRD refs:** [ART-3] (`image.thumbnail`, `image.preview`).

### B3. EXIF and technical metadata
- **User intent:** Photos sort by when they were taken, show camera details, and can be filtered by place.
- **Observations:**
  - **[v0.7 choice]** v0.7 ran extraction **synchronously at upload**, before the item was created.
  - **[Rule RULE-DOC-12]** Corrupt, truncated, missing or unreadable image metadata MUST NOT fail a capture; the item is stored without that metadata.
  - **[v0.7 choice]** In v0.7, extraction never failed the upload: corrupt, truncated, empty and non-image buffers returned empty metadata.
  - **[v0.7 choice]** Sources v0.7 used, in order:
    1. Basic image properties from the decoder: width, height, orientation, density, format, colour space, channels, ICC presence.
    2. The embedded EXIF block, parsed with TIFF, EXIF, GPS, IPTC and ICC segments, translated keys and values, revived dates, and **no sanitisation** (sanitising dropped useful HEIC fields).
    3. If that threw, retry after skipping a leading `Exif\0\0` header.
    4. If the decoder failed entirely, parse EXIF directly from the file.
  - **[v0.7 choice]** Fields v0.7 persisted:
    - `dateTaken` = DateTimeOriginal, else CreateDate (valid Date objects only; invalid dates are ignored)
    - camera make and model, lens model, ISO
    - FNumber and ExposureTime (stored as strings)
    - Orientation
    - width and height (ExifImageWidth/Height preferred over the decoded ImageWidth/Height)
    - GPS latitude, longitude, altitude
    - the full parsed blob kept as raw metadata
  - **[Rule RULE-DOC-13]** Photos MUST sort and filter by when they were taken when that is known, falling back to when the item was added.
  - **[v0.7 choice]** v0.7's search and sort used `COALESCE(dateTaken, createdAt)`.
- **How v0.7 did it (non-normative):** sharp metadata + `exifr`, inside the upload request.
- **Known problems in v0.7:**
  - **Time zone loss.** EXIF DateTimeOriginal has no zone. v0.7 ignored OffsetTimeOriginal, so times were interpreted in the server's zone (inferred). Store the local time, the offset (from OffsetTime* or GPS time) and a UTC instant separately.
  - ExifImageWidth/Height can disagree with the real pixel size after editing or rotation. Prefer decoded dimensions, adjusted for orientation.
  - Running at upload makes capture latency depend on parsing. It belongs in a processor that produces a `metadata.exif` artifact, with Suggestions for `content_at` and location ([PROC-8]).
  - GPS was kept in raw metadata with no privacy control. Consider a per-space "strip location on share/export" setting.
  - `exifr` has had no release in years (verify).
- **Better options today:**
  - **ExifTool** (via `exiftool-vendored` in Node) is the most complete reader: maker notes, XMP, QuickTime and HEIC, and time-zone inference. It costs a Perl dependency, which suits a processor pack.
  - `ExifReader` (maintained, pure JS) is a lighter option.
  - On macOS, **ImageIO** `CGImageSourceCopyPropertiesAtIndex` gives EXIF, GPS, TIFF and IPTC with offsets. For Photos-library items, PhotoKit already provides creation date and location ([EDGE-1]).
- **PRD refs:** [PROC-8], [ART-3] (`metadata.*`), [PRIN-9], [EDGE-1].

### B4. Reverse geocoding
- **User intent:** "Photos from Lisbon": a place name without sending coordinates to a third party.
- **Observations:**
  - **[Rule RULE-DOC-14]** Turning a photo's coordinates into a place name MUST NOT send those coordinates to a third party unless the user's policy explicitly allows it.
  - **[v0.7 choice]** **Offline only.** v0.7 used the npm package `offline-geocode-city` (v1.0.2), a nearest-city lookup over a bundled dataset. Coordinates never left the server.
  - **[v0.7 choice]** Inputs: decimal latitude and longitude (from parsed EXIF; the raw GPS tag fields were the fallback).
  - **[v0.7 choice]** Output: city name, country ISO-2 code and country name. Failures were swallowed.
  - **[v0.7 choice]** v0.7 loaded the geocoder module lazily to avoid ES-module load problems.
- **How v0.7 did it (non-normative):** In-request lookup at upload, stored in three location columns.
- **Known problems in v0.7:**
  - Nearest-city lookup always returns *some* city, even far offshore or in wilderness, with no distance threshold (inferred). Near borders it can name the wrong country. Add a max-distance cut-off and a country-polygon check.
  - No admin-1 level (state or region), and no neighbourhood.
  - Place names were English only.
  - Results were not re-derivable when the dataset improved (no provenance).
- **Better options today:**
  - GeoNames `cities500`/`cities1000` + `admin1CodesASCII` with a k-d tree. For example, `local-reverse-geocoder` (npm), which downloads GeoNames data and is offline after setup; check maintenance. Python `reverse_geocoder` is another.
  - Add Natural Earth or geoBoundaries polygons for exact country and admin-1 resolution.
  - Heavier but richer: self-hosted Photon or Nominatim (OSM). These are offline-capable but take gigabytes, so they belong in an optional pack.
  - On macOS, `CLGeocoder` / MapKit reverse geocoding is high quality but **network-bound to Apple**, so it must be classified `may-egress` ([MODEL-5], [PROC-1] `privacy_class`).
  - Re-check `offline-geocode-city` maintenance before reusing it (verify).
- **PRD refs:** [PROC-13] ("local or offline-capable provider"), [PROC-1] (`privacy_class`), [PROC-8], [QA-5].

### B5. Dominant colours
- **User intent:** Find "the blue one" and show colour chips.
- **Observations:**
  - **[v0.7 choice]** In v0.7, dominant colours were **colour names produced by the vision LLM** in the visual-analysis step, e.g. `["blue", "white"]`.
  - **[v0.7 choice]** They were only produced for images classified photograph, illustration or other (see B6). Screenshots, scans and diagrams got none.
  - **[v0.7 choice]** They were stored as a string array, null when absent.
- **How v0.7 did it (non-normative):** A field in the visual-analysis JSON response; no pixel analysis at all.
- **Known problems in v0.7:** The colours were non-deterministic, uncalibrated free-form names, cost model tokens, and covered only some image types.
- **Better options today:**
  - Compute colours deterministically from pixels for every image:
    - libvips/sharp `stats().dominant` gives one dominant RGB.
    - k-means or median-cut on a downsampled image gives a palette, e.g. `node-vibrant` or `image-q` (verify maintenance), in Lab/OKLab space.
  - Map the palette to a fixed named vocabulary (CSS/XKCD names, or basic colour terms) for search, and store the hex values for UI chips.
  - Cheap, local and reproducible. Leave mood and style to the LLM.
- **PRD refs:** [PROC-13], [PROC-3] (deterministic, versioned producers backfill cleanly).

### B6. Vision classification and type-specific branches
- **User intent:** A photo of a receipt is read like a document; a holiday photo is described and tagged by its contents; a chart is understood as a chart. All automatic.
- **Observations:**
  - **[v0.7 choice]** v0.7's first AI step classified into exactly one of 10 types, plus a short description. The description became the item's description.
  - **[v0.7 choice]** Branches per type in v0.7:

    | Type | Follow-up steps |
    |---|---|
    | `photograph_general` (people, landscapes, objects, events, animals, food) | object detection → visual analysis |
    | `screenshot` | OCR → document analysis |
    | `document_scan` (letter, form, receipt, invoice, business card, book page) | OCR → document analysis |
    | `whiteboard_note` (whiteboard, blackboard, handwritten notes) | OCR → document analysis |
    | `diagram_chart` (graph, flowchart, technical drawing, mind map) | technical analysis |
    | `illustration_art` (drawings, paintings, digital art, comics, graphic design) | object detection → visual analysis |
    | `map` | technical analysis |
    | `ui_mockup` (UI design, wireframe, prototype) | OCR → document analysis |
    | `qr_barcode` | OCR only |
    | `other_graphic` | visual analysis |
    | *unknown or invalid type* | visual analysis (fallback) |

  - **[v0.7 choice]** What each step produced in v0.7:
    - **Object detection:** `objects[]`.
    - **Visual analysis:** `dominant_colors[]`, `tags[]`, `mood_setting`.
    - **Document analysis:** `document_type`, `tags[]`, `purpose`.
    - **Technical analysis:** `main_concepts[]`, `components[]`, `tags[]`, `diagram_type`.
    - **OCR:** `extracted_text` and `has_text` (B7).
  - **[v0.7 choice]** Image input to every step in v0.7:
    - EXIF-rotated, fit inside **2048×2048** (no enlargement; starting point, tune), re-encoded JPEG q85.
    - Sent as a base64 data URI with MIME `image/jpeg` (so the declared MIME always matched the bytes).
    - Prepared once and reused across steps. This bounded VRAM use on small local VLMs.
  - **[v0.7 choice]** Non-OCR step parameters in v0.7: temperature 0.2, max 1,000 tokens, timeout `AI_TIMEOUT` (default 180 s). A `finish_reason=length` (truncated) response was an error.
  - **[v0.7 choice]** Response parsing in v0.7:
    - Extract a ```` ```json ```` fenced block if present.
    - The response had to start with `{` or `[`, otherwise it was an error.
  - **[v0.7 choice]** Tags in v0.7: the union of visual-analysis tags, **object names**, and document- and technical-analysis tags, de-duplicated and **capped at 15**.
  - **[v0.7 choice]** Final outputs in v0.7:
    - a JSON analysis record of every step's raw output
    - a Markdown summary of the image for search and the agent, with a type heading, the description, and sections for extracted text, visual analysis, detected objects, document analysis, technical analysis and tags
    - plain text = the OCR text only
- **How v0.7 did it (non-normative):** A static type→steps table. Stages were appended to the job after classification, and the steps ran serially against the same model role.
- **Known problems in v0.7:**
  - **Any failed AI step failed the whole job.** That included classification, a truncated object list, or one unparseable JSON, even though the thumbnail and other steps had already succeeded. Each branch should be its own run with `degraded` semantics.
  - Object names used directly as tags ("chair", "person") flooded the tag space. Keep objects as a searchable artifact; suggest only salient tags.
  - Classification was single-label. A screenshot of a chart, or a photo of a document, needs both branches; multi-label or confidence scores would help.
  - `qr_barcode` asked the LLM to "OCR" a barcode. LLMs cannot decode QR or barcode payloads reliably. Use a real decoder.
  - There were 6 sequential VLM calls at most per image, with the image re-sent every time. Merging classification and description into one structured call, and running the independent branches in parallel, cuts latency.
  - Results had no provenance (model, prompt hash), and the description overwrote user text ([PROC-8]).
- **Better options today:**
  - Express branches as `accepts` predicates over a classification artifact ([PROC-6]). The table above is a good **eval baseline** for the label set.
  - Barcodes and QR: **zxing-cpp** (WASM or Node bindings) on Linux; Vision `DetectBarcodesRequest` on macOS.
  - On-device classification on macOS: Vision `ClassifyImageRequest` (Apple taxonomy labels), plus document detection (`DetectDocumentSegmentationRequest`) to spot scans cheaply before calling any VLM ([PROC-11a]).
  - Small local VLMs that handle classification well enough for routing: Qwen2.5/3-VL, Gemma 3/3n, SmolVLM (verify the current best small models). A CLIP/SigLIP zero-shot classifier is a cheap, deterministic router and also yields image embeddings for search.
- **PRD refs:** [PROC-6], [PROC-5], [PROC-8], [PROC-12], [MODEL-4] (`vision` role), [QA-6].

### B7. OCR from images (vision LLM)
- **User intent:** Text in screenshots, scans, receipts and whiteboards becomes searchable and quotable by the agent.
- **Observations:**
  - **[v0.7 choice]** v0.7 ran OCR only on the OCR branches (B6), using a dedicated OCR system prompt (Appendix P4).
  - **[v0.7 choice]** Parameters in v0.7: **temperature 0.1, max 4,096 tokens**, timeout `AI_TIMEOUT` (default 180 s).
  - **[Fact]** Small VLMs commonly loop on tables, dotted leaders and repeated rows.
  - **[v0.7 choice]** **Repetition-loop detection:** v0.7 failed the step if the response contained a 30+ character sequence repeated 3+ times in a row (regex `(.{30,})\1{2,}`). The same check also ran on non-OCR steps.
  - **[Rule RULE-DOC-3]** (same rule as A2) When an extraction or OCR step produces usable but incomplete output, the system MUST keep that output and visibly mark it as partial, rather than discard it.
  - **[v0.7 choice]** **Truncation was not failure for OCR** in v0.7. If `finish_reason=length`:
    1. Try to parse the JSON. If that worked, keep it and set `_truncated: true`.
    2. If the JSON was cut off mid-string, keep the raw content as `extracted_text`, set `has_text` = "content is non-blank", and set `_truncated: true`.
    - Either way the step completed.
  - **[Rule RULE-DOC-15]** Text visible in images such as screenshots, scans, receipts and whiteboards MUST become searchable text of the item.
  - **[v0.7 choice]** v0.7 stored `extracted_text` as the item's text only when `has_text` was true.
- **How v0.7 did it (non-normative):** A JSON-wrapped OCR prompt to the shared worker vision model.
- **Known problems in v0.7:**
  - The repetition check runs **before** the truncation salvage. A looping model, which nearly always also hits the length limit, therefore loses *all* its text, including the good prefix. **Better:** cut at the start of the repeated run, keep the prefix, mark the result `degraded`.
  - The raw-content fallback stored the JSON wrapper (`{"extracted_text": "…`) as user-visible text.
  - Asking for OCR inside JSON forces the model to escape every quote and newline, which wastes tokens and causes parse failures. **Ask for plain text or Markdown output for OCR.**
  - A backtracking regex over long outputs is roughly O(n²) or worse. Use a linear detector (rolling hash, n-gram repeat counts, or compression ratio).
  - The 4,096-token cap truncates dense documents. Tile or split large scans by region or page instead.
  - There were no bounding boxes, so the UI could not highlight hits, and copy-paste lost layout.
- **Better options today:**
  - **Apple Vision** text recognition (`RecognizeTextRequest`, accurate mode, language correction) is fast, on-device, gives bounding boxes, and does not loop. macOS 26 adds `RecognizeDocumentsRequest` for structured documents (tables, lists) (verify availability). Make it the preferred `ocr` implementation on Macs ([PROC-11a]).
  - Dedicated OCR/document VLMs (2026 standings per OmniDocBench and olmOCR-Bench; verify at bake-off):
    - **PaddleOCR-VL** (about 0.9B, Apache-2.0, strong multilingual)
    - **MinerU 2.5** (about 1.2B; licence has conditions)
    - **olmOCR 2** (7B, Apache-2.0, good for bulk work)
    - GLM-OCR, dots.ocr, DeepSeek-OCR
    - **Marker** (code Apache, weights restricted for commercial use)
    These outperform general VLMs on scans and are less prone to loops. They serve via vLLM or llama.cpp where supported.
  - CPU-only fallback: Tesseract (via OCRmyPDF for PDFs) or RapidOCR (ONNX PaddleOCR), with bounding boxes.
  - Run the model with a repetition penalty or DRY sampler where the server supports it (llama.cpp does).
- **PRD refs:** [MODEL-4] (`ocr` role), [PROC-5] (`degraded`), [PROC-7], [PROC-11a], [ART-3] (`ocr`), [QA-6] (OCR golden sets).

### B8. Model configuration notes (vision)
- **User intent:** Image and document processing works on modest local hardware.
- **Observations:**
  - **[v0.7 choice]** v0.7 documented a two-model local setup: a larger text model for chat, and a **small vision model for background processing**. The reference was `gemma-3-4b-it` QAT Q4 on llama.cpp `--ctx-size 16384`, on its own server instance and port, so the two roles never contended for one model.
  - **[v0.7 choice]** v0.7 treated a model as vision-capable when its capabilities declared `image` input. Workers required it for every image step.
- **How v0.7 did it (non-normative):** One "workers" model selection served all document and image AI calls.
- **Known problems in v0.7:** A single role for classification, OCR, tagging and document metadata meant that no OCR-specialised model could be used, and there was no fallback model ([MODEL-4]).
- **Better options today:** Separate `vision`, `ocr` and `background` roles with ordered fallbacks. Record per-call usage in the LLM ledger ([MODEL-7]).
- **PRD refs:** [MODEL-4], [MODEL-7], [DEP-4].

---

## Part C: Native dependencies

### C1. Native dependencies: what was needed and what was dead weight
- **User intent:** A one-command install that works, without a multi-GB image full of unused tools.
- **Observations (actually used in v0.7):**
  - **[v0.7 choice]** v0.7 used these native dependencies:

    | Dependency | Used for |
    |---|---|
    | **LibreOffice** (writer, calc, impress) | Office/ODF/iWork → pdf, txt, csv |
    | **poppler-utils** | `pdftotext` (text), `pdftocairo` (page rasterising) |
    | **Chromium** (downloaded by Patchright at build time) and its shared libraries (atk, atspi, xcomposite, xdamage, xfixes, gbm, xkbcommon, asound, nss, nspr, atk-bridge, drm, xrandr, xss) | HTML/MD/TXT/RTF → PDF, HTML screenshots |
    | **sharp**'s bundled libvips (prebuilt, global libvips ignored) | all image work, placeholder rasterising |
    | **Docling** (separate container) | structured extraction and OCR |

- **Installed but unused:**
  - `imagemagick`, `graphicsmagick` and `ghostscript`. Nothing invoked them; the image even shipped a custom ImageMagick policy.
  - `libheif1`, because sharp's prebuilt libvips does not link the system libheif. HEVC HEIC therefore still failed (B1).
- **How v0.7 did it (non-normative):** Everything except Docling lived in one runtime image alongside the API.
- **Known problems in v0.7:**
  - A multi-GB image, with untrusted-input parsers (LibreOffice, Chromium, image codecs) running in the API's process space with network access.
  - The browser revision was pinned separately from the library version (A7).
  - Tool availability was discovered at runtime per call, so a missing tool surfaced as placeholder thumbnails rather than as a health/capability report.
- **Better options today:**
  - Per [DEP-3] and [D13]: a slim core, plus processor packs. An office + Chromium pack (Gotenberg-class); a document-AI pack (docling-serve, optionally a VLM-OCR server); an image pack (libvips with libheif/libde265, zxing, exiftool, LibRaw).
  - On macOS, the Swift native pack (Vision, ImageIO, PDFKit, QuickLook) replaces most of these with nothing to install.
  - Packs declare capabilities, and the planner shows which artifact kinds are unavailable ([PROC-2]).
- **PRD refs:** [PROC-10], [PROC-11], [PROC-11a], [DEP-1], [DEP-3], [D13], [PRIN-10].

---

## Candidate fixtures

Existing v0.7 fixtures:

| Path (v0.7 repo) | What it exercises |
|---|---|
| `apps/backend/src/tests/fixtures/photos/photo1.jpg` | JPEG 640×640 with EXIF; decoder dimensions and FileType; possible GPS → geocode path |
| `apps/backend/src/tests/fixtures/photos/photo2.JPEG` | JPEG 640×476; upper-case extension handling |
| `apps/backend/src/tests/fixtures/photos/photo3.png` | PNG 600×400; PNG normalisation and alpha handling |
| `apps/backend/src/tests/fixtures/photos/photo4.heic` | **HEVC-compressed HEIC**, 1000×667 with EXIF. Metadata reads with prebuilt sharp but pixel decode fails. Use it as the regression test for HEIC support. |
| `apps/backend/src/tests/fixtures/documents/document2.pdf` | Born-digital PDF (about 135 KB): pdftotext, Docling, pdftocairo thumbnail |
| `apps/backend/src/tests/fixtures/documents/document1.txt` | Small plain-text document: text path, Chromium text → PDF, AI-skip threshold |

The v0.7 unit tests also covered these synthetic edge cases, which are worth keeping: a non-image buffer, an empty buffer, and a truncated JPEG (only the first 8 header bytes) must all yield empty metadata without throwing; plus DateTimeOriginal-vs-CreateDate precedence with invalid dates.

Gaps worth filling (no v0.7 fixture existed):
- scanned image-only PDF
- DOCX with tables
- XLSX
- PPTX
- legacy DOC
- ODT
- Pages, Numbers and Keynote (`.key`)
- RTF with Unicode
- non-article HTML (tables only)
- HTML containing `<script>` and remote `<img>` (egress test)
- CSV with BOM and ragged rows
- deeply nested JSON
- Latin-1 text
- animated GIF
- PNG with alpha
- CMYK and 16-bit TIFF
- SVG with external `href`
- AVIF
- camera RAW (DNG)
- Display-P3 HEIC
- photo with GPS near a border
- photo with OffsetTimeOriginal
- receipt photo
- whiteboard
- screenshot
- chart
- QR code
- an image that reliably triggers an OCR repetition loop

---

## Appendix: v0.7 prompts (eval baseline only, not a template)

All prompts below were sent to the **`workers`** model role (one vision-capable background model). Quoted verbatim.

**P1. Document metadata (title, description, tags).** Model role `workers`; temperature 0.1; max 500 tokens. `${originalFilename}` and `${textSample}` are interpolated; the sample is the 4,000-character begin/middle/end sample from A9.

System:
```
You are an assistant that analyzes documents and generates metadata in JSON format.
```
User:
```
Based on the following document text, generate a JSON object with a concise title, a brief description, and an array of relevant tags.

Filename: ${originalFilename}
Content: ${textSample}

Respond with only a valid JSON object.
```

**P2. Shared system prompt for all non-OCR image steps** (classification, object detection, visual, document and technical analysis). Model role `workers`; temperature 0.2; max 1,000 tokens. The user message is the image (data URI) followed by the step prompt.
```
You are an expert image analysis AI. Analyze the provided image and return ONLY valid JSON. Do not include explanatory text before or after the JSON.
```

**P3. Image classification.** This prompt was the router for the branches in B6.
```
Analyze this image and classify it. Choose the most appropriate type from this list:
- photograph_general: General photos (people, landscapes, objects, events, animals, food)
- screenshot: Image captured from a digital screen
- document_scan: Scanned document (letter, form, receipt, invoice, business card, book page)
- whiteboard_note: Photo of whiteboard, blackboard, or handwritten notes
- diagram_chart: Visual information representation (graph, flowchart, technical drawing, mind map)
- illustration_art: Drawings, paintings, digital art, comics, graphic designs
- map: Geographical area depiction
- ui_mockup: User interface design, wireframe, or prototype
- qr_barcode: Image primarily containing QR code or barcode
- other_graphic: Other graphics not fitting elsewhere

Respond with JSON: {"image_type": "exact_type_from_list", "description": "brief description of what you see"}
```

**P4. OCR (content extraction).** Model role `workers`; temperature 0.1; max 4,096 tokens; repetition check and truncation salvage as in B7.

System:
```
You are an expert Optical Character Recognition (OCR) engine. Your task is to extract all text from an image. You must respond with a single, valid JSON object that strictly adheres to the provided schema. Do not include any other text, explanations, or markdown formatting in your response.
```
User (after the image):
```
Extract all visible text from this image. Respond with JSON: {"extracted_text": "all text here", "has_text": true/false}
```
A step-table variant also existed but was superseded by the above: "Extract all visible text from this image, preserving formatting and line breaks. Respond with JSON: {"extracted_text": "all text here", "has_text": true/false}".

**P5. Object detection.** Produced the object list; object names were also added to tags.
```
List all visible objects and people in this image. Be specific but not overly detailed. Respond with JSON: {"objects": ["object1", "object2"]}
```

**P6. Visual analysis.** Produced the LLM-named dominant colours, tags and mood.
```
Analyze the visual characteristics. Identify dominant colors and provide descriptive tags about setting, mood, or style. Respond with JSON: {"dominant_colors": ["color1"], "tags": ["tag1", "tag2"], "mood_setting": "description"}
```

**P7. Document analysis.** Ran on screenshots, scans, whiteboards and UI mockups after OCR.
```
Analyze what type of document or interface this is. Provide relevant categorical tags. Respond with JSON: {"document_type": "specific type", "tags": ["tag1", "tag2"], "purpose": "what this document/interface is for"}
```

**P8. Technical analysis.** Ran on diagrams, charts and maps.
```
Analyze the technical content of this diagram, chart, or map. Identify main concepts and components. Respond with JSON: {"main_concepts": ["concept1"], "components": ["component1"], "tags": ["tag1"], "diagram_type": "specific type"}
```
