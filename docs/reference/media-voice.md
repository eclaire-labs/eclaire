> **Non-normative reference.** Extracted from Eclaire v0.7 to preserve user intent and hard-won lessons. `PRD.md` is the source of truth. Do not reproduce v0.7's structure, module layout or naming; where this document and the PRD disagree, the PRD wins. "Better options today" are leads to evaluate, not decisions.

Labels: **[Fact]** external truth, keep. **[Rule]** a requirement we want, mirrored in PRD Appendix C. **[v0.7 choice]** inventory only, free to change.

# Media (audio and video) and voice: reference

Scope: importing and processing audio and video items, voice (STT/TTS) providers, browser voice capture and playback, and voice in chat channels. Facts checked in v0.7 code are stated plainly. Unverified ones are marked "(inferred)". External facts (CLI flags, endpoints, formats) are given because they are expensive to rediscover.

---

## Part A: Media import and processing

### A1. URL import with a yt-dlp-class downloader
- **User intent:** Paste a YouTube, Vimeo, SoundCloud or similar link and get a playable, searchable media item: the file, its title and description, and a transcript. The user should not have to download anything by hand.
- **Observations:**
  - **[v0.7 choice]** v0.7 created the item immediately with a placeholder title (URL hostname + the first 60 chars of the path), `media_type` defaulted to video, and no blob yet. The worker filled in the rest.
  - **[Rule RULE-MEDIA-1]** A URL import MUST show the new item at once, before downloading and processing finish, and MUST then fill in the file, title, description and transcript without further user action.
  - **[Rule RULE-MEDIA-2]** A title fetched from the source MUST replace the placeholder only if the user hasn't changed it. A title the user set MUST never be overwritten.
  - **[v0.7 choice]** v0.7 detected "still a placeholder" by checking whether the title contains `/` or `://`. The rebuild gets this from the PRD's provenance and lock rules ([PROC-8]) instead.
  - **[Rule RULE-MEDIA-3]** URL import MUST accept only `http:` and `https:` URLs, and every server-side fetch of a user-supplied URL, including each redirect hop, MUST be refused if it would reach a private, loopback, link-local or otherwise internal address.
  - **[v0.7 choice]** Step 1, metadata: v0.7 ran `yt-dlp --dump-json --no-download <url>` with a 30 s timeout. It defaulted `title` to "Untitled" and fell back from `filesize` to `filesize_approx`.
  - **[Fact]** The yt-dlp info JSON provides these fields:
    - `title`, `description`, `duration` (seconds), `thumbnail`, `uploader`
    - `filesize` and `filesize_approx`
    - `vcodec`: missing, empty or `"none"` means audio-only
    - keys of `subtitles` (manual) and `automatic_captions` (auto), giving the available languages
  - **[Rule RULE-MEDIA-4]** A failure in an optional enrichment step (source metadata, technical metadata, visuals, a transcript source, AI analysis) MUST NOT fail the item. Processing continues and the item keeps whatever did succeed.
  - **[v0.7 choice]** When metadata failed, v0.7 still attempted the download (degraded, not failed).
  - **[v0.7 choice]** Step 2, download: v0.7 used a 600 s timeout and these flags:
    - `-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"`
    - `-S vcodec:h264,acodec:aac`
    - `--no-playlist` and `--merge-output-format mp4`
    - `--max-filesize <N>m`
    - `-o <tmpdir>/%(id)s.%(ext)s`
  - **[Fact]** `-S vcodec:h264,acodec:aac` makes yt-dlp prefer H.264/AAC, which browsers can play without transcoding.
  - **[Rule RULE-MEDIA-5]** Imported media MUST be playable in the user's browser without the user converting anything.
  - **[v0.7 choice]** v0.7 found the output file by scanning the temp directory for known media extensions (mp4, webm, mkv, m4a, mp3, ogg, opus, wav, flac, aac), skipping `.part` and other temp files, and taking the newest if there were several.
  - **[v0.7 choice]** v0.7 took the MIME type from magic bytes, falling back to an extension map, and re-derived `media_type` (audio or video) from the MIME prefix after download.
  - **[v0.7 choice]** Step 3, captions: v0.7 made a separate yt-dlp call with a 30 s timeout: `--write-sub --write-auto-sub --sub-lang en --sub-format vtt --skip-download`. See A6 for how captions are used.
  - **[v0.7 choice]** Size cap: v0.7 used 500 MB (starting point; tune). A metadata estimate above the cap was meant to fail permanently, before any download.
  - **[v0.7 choice]** v0.7 always removed the temp directory, including on failure.
- **How v0.7 did it (non-normative):** yt-dlp was spawned as a subprocess inside the worker. Its availability was probed once per process with `--version`, and the plain HTTP fallback (A2) was used when it was missing.
- **Known problems in v0.7:**
  - **Unit bug:** the 500 MB cap was passed in bytes to a parameter expecting MB, giving `--max-filesize 524288000m`. In effect there was no cap.
  - The "estimated size too large" permanent error was thrown inside the metadata step's catch-all, so it was swallowed and the download went ahead anyway.
  - When yt-dlp skips a file for exceeding `--max-filesize`, it exits 0 without writing it (inferred). v0.7 then reported a confusing "no media file found" error. Map this case to a clear permanent "too large" error.
  - The info call has no `--no-playlist`. A playlist URL dumps one JSON object per line, which breaks single-object parsing.
  - Three network round trips (info, download, captions) where one invocation can do all three.
  - `--sub-lang en` misses `en-US`, `en-GB` and similar variants, and ignores the user's language.
  - There is no SSRF guard on the yt-dlp path. Its generic extractor will fetch any URL, internal hosts included.
  - yt-dlp and ffmpeg were missing from the shipped container image, so URL import silently degraded to direct download.
  - The whole file was read into memory several times (download, store, then re-read for each ffmpeg step).
- **Better options today:**
  - yt-dlp is still the de facto tool. Note: since 2025.11.12, YouTube support needs an external JS runtime plus the `yt-dlp-ejs` component. Deno is enabled by default; others need `--js-runtimes`. Without one, formats are limited. The processor pack must bundle Deno (or set `--js-runtimes`) and allow yt-dlp self-update or frequent pack updates, because extractors break often.
  - Use one invocation: `-J`/`--dump-single-json` or `--print-json` with `--write-subs --write-auto-subs --sub-langs "en.*,<user-lang>.*"`, plus `--no-playlist`.
  - For audio-first sources (podcasts, SoundCloud), consider `-x`/`--audio-format`.
  - `--match-filter "duration < N"` enforces duration caps before downloading.
  - Route traffic through the SSRF-guarding egress proxy (`--proxy`) per [PROC-10] and D13.
  - Login-gated content needs a user-supplied cookies file. Treat it as a secret.
- **PRD refs:** [PROC-7], [PROC-10], [PROC-11], [PROC-13], [CAP-1], [PROC-8], [PROC-5].

### A2. Direct-download fallback and its private-IP guard
- **User intent:** A link to a plain `.mp3` or `.mp4` file (or any URL when yt-dlp is unavailable) still imports.
- **Observations:**
  - **[v0.7 choice]** v0.7 used an overall timeout of 5 min and at most 5 redirects, followed manually with `redirect: manual`.
  - **[Rule RULE-MEDIA-3]** Each redirect hop MUST be re-validated (scheme and resolved address) before it is followed.
  - **[v0.7 choice]** v0.7 re-validated each hop in this order: scheme, then a DNS lookup, then a private-IP check.
  - **[Fact]** `Location` headers can be relative and must be resolved against the current URL.
  - **[v0.7 choice]** v0.7 blocked these ranges:
    - IPv4: `0/8`, `127/8`, `10/8`, `100.64/10` (CGNAT), `172.16/12`, `192.0.0/24`, `192.168/16`, `169.254/16`, `198.18/15`, `240/4`
    - IPv6: `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`
    - IPv4-mapped IPv6 in dotted form, e.g. `::ffff:10.0.0.1`
  - **[Rule RULE-MEDIA-6]** A size limit MUST be enforced on the bytes actually received, aborting mid-download once it is exceeded. A declared size such as `Content-Length` MUST never be trusted alone.
  - **[v0.7 choice]** v0.7 enforced size twice: an up-front `Content-Length` check, then a streaming byte counter.
  - **[v0.7 choice]** v0.7's filename precedence was `Content-Disposition` (`filename="…"` or unquoted), then the URL path basename (only if it contains a dot), then `download`.
  - **[Rule RULE-MEDIA-7]** A filename taken from a remote source MUST NOT be able to cause path traversal.
  - **[v0.7 choice]** v0.7 always passed the name through basename.
  - **[v0.7 choice]** v0.7's MIME precedence was the `Content-Type` header (ignored if `application/octet-stream`), then magic bytes, then the extension map.
- **How v0.7 did it (non-normative):** `fetch` with a hand-rolled IP-range function and a Transform stream as the size counter.
- **Known problems in v0.7:**
  - **DNS rebinding:** the check-then-fetch pattern resolves DNS twice (TOCTOU).
  - Only the first resolved address is checked.
  - Coverage gaps: `224/4` multicast, `::` unspecified, hex-form mapped addresses (`::ffff:7f00:1`), NAT64 `64:ff9b::/96`, and 6to4.
  - RFC 5987 `filename*=` is not parsed.
  - Nothing checks that the downloaded bytes are actually audio or video. An HTML error page became a "media" item.
  - Bookmarks had no guard at all.
- **Better options today:**
  - Validate the IP at connect time: a custom `lookup`/`connect` hook in undici, or a vetted package such as `request-filtering-agent`. Use `ipaddr.js` for range classification.
  - Better still, follow the PRD and put all fetchers behind one SSRF-guarding egress proxy (Smokescreen-class) with an allowlist.
  - After download, sniff the content and reject anything that isn't `audio/*` or `video/*` as a permanent error.
- **PRD refs:** [PROC-10], [PRIN-10], [PRIN-6], [PROC-5].

### A3. Upload intake and limits
- **User intent:** Drop any common audio or video file and have it accepted.
- **Observations:**
  - **[v0.7 choice]** v0.7 accepted these audio MIME types: `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/flac`, `audio/ogg`, `audio/aac`, `audio/mp4`, `audio/x-m4a`, `audio/webm`, `audio/aiff`, `audio/x-aiff`.
  - **[v0.7 choice]** v0.7 accepted these video MIME types: `video/mp4`, `video/quicktime`, `video/x-msvideo`, `video/x-matroska`, `video/webm`, `video/ogg`, `video/mpeg`, `video/3gpp`, `video/3gpp2`.
  - **[Rule RULE-MEDIA-8]** An uploaded file's type MUST be verified from its content, never trusted from the type the client declares.
  - **[v0.7 choice]** v0.7 verified the MIME type against magic bytes.
  - **[v0.7 choice]** Processing re-checked size (500 MB) and rejected empty blobs as permanent errors.
- **How v0.7 did it (non-normative):** a fixed MIME allowlist checked at upload; the worker re-checked size.
- **Known problems in v0.7:**
  - No `audio/opus` or `audio/x-caf`. Telegram, Discord and iOS voice memos produce these (inferred).
  - A single global cap with no per-space policy.
  - The whole blob is loaded into memory.
- **Better options today:** Use resumable uploads (tus-class) for large media, per [CAP-1]. Make the cap configurable. Stream blobs to processors by path or range ([BLOB-2]) instead of buffering.
- **PRD refs:** [CAP-1], [BLOB-2], [PROC-1], [NFR-1].

### A4. Technical metadata (ffprobe)
- **User intent:** See duration, resolution, codecs and bitrate, and use duration in search and filtering.
- **Observations:**
  - **[Fact]** For audio, `ffprobe -v quiet -of json -show_entries format=duration,bit_rate:stream=channels,sample_rate,codec_name` returns duration and bitrate plus each stream's channels, sample rate and codec.
  - **[Fact]** For video, adding `stream=codec_name,width,height,r_frame_rate,channels,sample_rate,codec_type` also returns dimensions, frame rate and stream type.
  - **[v0.7 choice]** v0.7 took width, height, fps and video codec from the first `codec_type=video` stream, and channels, sample rate and audio codec from the first `codec_type=audio` stream.
  - **[Fact]** `r_frame_rate` is a num/den fraction, and `duration` and `bit_rate` are strings in ffprobe JSON. All three must be parsed.
  - **[v0.7 choice]** v0.7 rounded fps to 2 decimals.
  - **[v0.7 choice]** Display: v0.7 showed channels 1 as "Mono", 2 as "Stereo", otherwise the count. Bitrate was shown in kbps. Duration was `h:mm:ss` or `m:ss`.
  - **[Rule RULE-MEDIA-4]** A metadata failure MUST degrade the run, not fail the item.
- **How v0.7 did it (non-normative):** ffprobe was fed the whole buffer on stdin (`-i pipe:0`). Availability was cached per process.
- **Known problems in v0.7:**
  - **Piped input breaks seekable containers.** MP4/MOV files whose `moov` atom is at the end (phone recordings) can fail or lose their duration over a pipe (inferred). Give ffprobe and ffmpeg a file path or an HTTP range URL.
  - For audio, `streams[0]` was used blindly. An MP3 or M4A with cover art can expose an `mjpeg` attached-picture stream first (inferred). Select by `codec_type` and skip `disposition.attached_pic`.
  - Not extracted, although useful:
    - Container tags: title, artist, album, `creation_time`. These are good `content_at` suggestions.
    - Rotation/display-matrix side data. Without it, phone video thumbnails come out sideways.
    - QuickTime GPS (`com.apple.quicktime.location.ISO6709`).
    - Stream language tags.
- **Better options today:** ffprobe (`-show_format -show_streams -of json`) is still the reference on Linux. On macOS, AVFoundation (`AVURLAsset` async `load(.duration, .tracks, .metadata)`) covers this with nothing to install ([PROC-11a]). Mediabunny is a newer pure-TS media reader worth a look for light metadata without native binaries (unsure how mature it is).
- **PRD refs:** [PROC-11a], [PROC-13], [ART-3] `metadata.*`, [PROC-8], [PROC-5] degraded.

### A5. Waveform and video thumbnail
- **User intent:** Audio items show a waveform and video items a poster frame, in lists and on the detail page.
- **Observations:**
  - **[Fact]** `ffmpeg -i <in> -filter_complex "showwavespic=s=800x200:colors=#3b82f6" -frames:v 1 -f image2 -c:v png <out>` renders the waveform as a single PNG.
  - **[v0.7 choice]** v0.7 rendered an 800×200 PNG in a fixed blue. It also served as the audio item's thumbnail.
  - **[Fact]** `ffmpeg -ss <t> -i <in> -vframes 1 -an -f image2 -c:v png <out>` extracts one video frame at time t as a PNG.
  - **[v0.7 choice]** Video thumbnail timing and size in v0.7:
    - t = 3 s. Seeking past the first frames avoids black or fade-in frames.
    - If the duration is under 3 s, t = duration × 0.5.
    - The output was full resolution, not scaled.
  - **[Rule RULE-MEDIA-4]** Visual generation failing MUST be a degraded result, not a failure.
- **How v0.7 did it (non-normative):** ffmpeg piped stdin to stdout, as one stage producing whichever of the two visuals applied.
- **Known problems in v0.7:**
  - The waveform PNG has a baked-in colour and size: it can't be themed (dark mode), made interactive (seek on click) or resized.
  - Thumbnails ignore rotation and aren't downscaled (a 4K PNG as a list thumbnail).
  - Piped input has the same `moov` problem as A4.
  - There is no per-artifact-kind URL contract; the waveform was reused as the thumbnail.
- **Better options today:**
  - Store waveform **peaks data** (e.g. 1–2k min/max pairs as JSON or binary) as an artifact and render it client-side. BBC `audiowaveform` produces this directly; ffmpeg `aresample` plus downsampled PCM also works.
  - For posters, ffmpeg's `thumbnail` filter picks a representative frame. Scale to roughly 800 px wide WebP or JPEG, honouring rotation.
  - On macOS, `AVAssetImageGenerator` (with `appliesPreferredTrackTransform`) and `AVAssetReader` for peaks ([PROC-11a]).
  - Scrub storyboards (sprite sheets or VTT thumbnails) are a later nicety.
- **PRD refs:** [ART-1], [ART-2], [ART-3] `image.thumbnail`, [PROC-11a], [PROC-13].

### A6. Transcript tiers: provider captions, then embedded subtitles, then STT
- **User intent:** Every spoken-word media item becomes searchable text and agent-readable context, using the cheapest accurate source available.
- **Observations:**
  - **[v0.7 choice]** v0.7 used a strict precedence, where the first non-empty result won:
    1. **Provider captions** from the URL import (A1). Manual captions beat auto-generated ones. A file matching a preferred language beat the first file. The language was parsed from the filename (`<id>.<lang>.vtt`, regex `\.([a-z]{2,3}(?:-[a-zA-Z]+)?)\.vtt$`).
    2. **Embedded subtitle streams**, found and extracted with the ffprobe and ffmpeg commands below.
    3. **STT** with the configured provider, if any.
  - **[Fact]** Embedded subtitle streams can be listed with `ffprobe -select_streams s -show_entries stream=codec_type,codec_name`, and the first one extracted with `ffmpeg -i <in> -map 0:s:0 -f srt <out>`.
  - **[v0.7 choice]** v0.7 recorded `transcript_source` as `provider_captions`, `embedded_subtitles` or `stt`, plus the language when known.
  - **[Fact]** These WebVTT parts are not caption text and must be removed to get plain text (v0.7's cleanup rules, worth keeping):
    - The `WEBVTT` header, `NOTE` blocks, numeric cue ids, `-->` timing lines, cue settings (`position:`, `align:`, `line:`, `size:`, `vertical:`, `region:`) and the `Kind:`/`Language:` header lines.
    - Inline tags (`<c>`, `<b>`, karaoke `<00:00:01.000>` tags).
    - Consecutive duplicate lines. YouTube auto-captions repeat each line across rolling cues.
  - **[Fact]** SRT carries sequence numbers and `hh:mm:ss,mmm -->` timing lines, which must be dropped. Files in the wild use `,` or `.` as the millisecond separator.
  - **[v0.7 choice]** In v0.7 any tier failing fell through to the next tier. With no transcript, analysis fell back to metadata (A7).
  - **[Rule RULE-MEDIA-4]** If every transcript source fails, the item MUST still complete, with no transcript.
  - **[Rule RULE-MEDIA-9]** The spoken content of audio and video items MUST become searchable text that agents can read.
  - **[v0.7 choice]** Outputs: the plain transcript (also the item's searchable text), a markdown rendering (category heading, one-line description, "Video Info"/"Audio Info" metadata list, "Transcript", "Tags"), and a JSON record of everything extracted.
- **How v0.7 did it (non-normative):** one processing stage with if/else tiers. Captions were fetched during the download stage and carried in memory to the transcription stage.
- **Known problems in v0.7 (important):**
  - **Timestamps were thrown away in every tier.** VTT/SRT timings were stripped, embedded subs were flattened into one space-joined line, and STT results kept only `text`, even though oMLX returns `segments` and whisper.cpp can too. The PRD requires `transcript` with timestamps ([ART-3]).
  - Manual vs auto detection used filename patterns (`.auto.`). yt-dlp names both `<id>.<lang>.vtt` (inferred), so the "manual" label was unreliable. Use the info JSON's `subtitles` vs `automatic_captions` keys instead.
  - Embedded subs: the first stream was taken regardless of language; the stream's `tags.language` was never read; bitmap subtitle codecs (`hdmv_pgs_subtitle`, `dvd_subtitle`, `dvb_subtitle`) can't become SRT and just fail.
  - STT received the **entire original file**, video container included, with no audio extraction, resampling or chunking. Each provider request had a 30 s timeout, so long media would time out (inferred) or exceed provider upload limits.
  - STT was attempted whenever "audio available" was true, which was always (a default provider URL existed). Unreachable servers became per-item errors.
  - The full transcript was logged at info level (violates [VOICE-6], [OBS-1]).
- **Better options today:**
  - Normalise every tier to one segment model (start, end, text, optional speaker, word timings), stored as the `transcript` artifact. Derive `text.plain` from it.
  - Parse VTT/SRT with a proper parser, or have ffmpeg convert any text subtitle to WebVTT, then de-roll YouTube auto-captions.
  - Before STT, extract audio to 16 kHz mono (`ffmpeg -vn -ac 1 -ar 16000 -c:a pcm_s16le` or FLAC). Split long audio on VAD silences (Silero VAD), transcribe the chunks under the `stt` resource pool, then stitch with offsets.
  - Local STT with timestamps:
    - whisper.cpp (`verbose_json`/segments, built-in VAD in recent builds (inferred))
    - NVIDIA Parakeet TDT 0.6B v3 (word timestamps, 25 EU languages)
    - Whisper large-v3-turbo (99+ languages)
    - Canary-Qwen-2.5B (top of the Open ASR leaderboard for English)
    - Mistral Voxtral and Qwen3-ASR (verify which are current)
    - WhisperX-style forced alignment when word timings matter
  - Speaker diarization (pyannote or NVIDIA Sortformer class) would be a welcome addition for meetings and podcasts (flag: check current options).
  - macOS: **SpeechAnalyzer + SpeechTranscriber** (macOS/iOS 26+). It runs on device, handles long-form audio, gives volatile and final results, and returns per-word `audioTimeRange` when the attribute option is requested. Third-party benchmarks put it near Whisper on clean English. This is the [PROC-11a] default on Macs.
- **PRD refs:** [PROC-7], [ART-3] `transcript`, [PROC-11a], [PROC-9], [PROC-5], [VOICE-6], [OBS-1], [PROC-13].

### A7. AI analysis of media
- **User intent:** Media items get a one-line description, tags and a category without the user writing anything.
- **Observations:**
  - **[v0.7 choice]** Input was the transcript, truncated to 8,000 characters (starting point; tune) with a visible marker (`[Transcript truncated — N characters total]`).
  - **[v0.7 choice]** Category vocabularies:
    - video: `tutorial, presentation, interview, vlog, screencast, music_video, meeting, short_clip, other`
    - audio: `speech, podcast, interview, lecture, meeting, voice_memo, music, audiobook, sound_effect, other`
  - **[v0.7 choice]** Output JSON: `{description, tags[3–8], category}`. Tags were hard-capped at 15 even though the prompt asked for 3–8.
  - **[v0.7 choice]** Call settings: temperature 0.2, max 500 output tokens, 180 s timeout, using the background/worker model role.
  - **[v0.7 choice]** **No-transcript fallback:** v0.7 analysed metadata instead, using the source title, the source description (truncated to 2,000 chars plus "…") and the filename. If none existed, it skipped analysis.
  - **[v0.7 choice]** JSON extraction tolerated a fenced ```json block and rejected anything that didn't start with `{` or `[`.
  - **[Rule RULE-MEDIA-4]** An analysis failure MUST degrade the run, not fail the item.
  - **[v0.7 choice]** v0.7's prompts are in the appendix.
- **How v0.7 did it (non-normative):** one prompt pair with interpolated label and category list, and the reply parsed by regex.
- **Known problems in v0.7:**
  - Truncation means a 2-hour podcast is described from its first ~10 minutes.
  - Music and silent videos get no content signal.
  - AI tags were written straight into the item, with no suggestion or lock semantics.
  - The category was only used as a markdown heading.
  - Generation parameters were hard-coded.
- **Better options today:**
  - Structured outputs / JSON-schema mode, instead of regex extraction.
  - Map-reduce or hierarchical summarisation over timestamped chunks, which also yields **chapters** (a natural use of timestamps).
  - For videos without speech, a vision model over several keyframes (not one).
  - Audio tagging (CLAP/PANNs-class) to detect music or ambience (flag: verify current small models).
  - Remote multimodal models (Gemini-class) accept audio and video directly, but only where egress policy allows.
  - Prompts become versioned assets ([PROC-12]); outputs become Suggestions ([PROC-8]).
- **PRD refs:** [PROC-8], [PROC-12], [MODEL-4], [MODEL-5], [MODEL-6], [PROC-5], [PRIN-12].

---

## Part B: Voice providers

### B1. Provider model, selection and health (cross-cutting)
- **User intent:** Use local speech (privacy, no cost) by default, with cloud (ElevenLabs) as an option. Pick the provider, model and voice per user.
- **Observations:**
  - **[v0.7 choice]** v0.7 modelled four capability flags per provider: batch STT, batch TTS, streaming STT, streaming TTS. It declared them as follows (this reflects v0.7's integration, not necessarily each server's full feature set):

    | Provider | STT | TTS | Streaming STT | Streaming TTS |
    |---|---|---|---|---|
    | mlx-audio | yes | yes | yes | yes |
    | oMLX | yes | yes | no | yes |
    | whisper.cpp | yes | no | no | no |
    | pocket-tts | no | yes | no | yes |
    | ElevenLabs | yes | yes | no | yes |

  - **[v0.7 choice]** Each provider had a base URL, a request timeout (default 30 s), and default STT model, TTS model and voice. Defaults were overridable through instance settings and per-user preferences.
  - **[v0.7 choice]** Health status was "ready" if any provider was ready, with per-provider status and defaults. The web app polled health every 60 s and hid voice UI when nothing was available.
  - **[Rule RULE-MEDIA-10]** Voice controls and options MUST appear only when a usable provider supports them: no voice UI when no provider is usable, and streaming only when the chosen provider can stream.
  - **[v0.7 choice]** TTS input was 1–10,000 chars, with an optional `instruct` style hint of at most 500 chars. Speed was 0.5–1.5; the UI offered steps 0.5/0.75/1.0/1.25/1.5 and showed speed only for ElevenLabs and Kokoro/Kitten models.
  - **[v0.7 choice]** Format was `mp3` (the default for buffered requests) or `wav` (the default for streaming).
  - **[Fact]** Voice lists depend on the model:
    - Kokoro/Kitten: `af_heart`, `af_bella`, `am_adam`, `bf_emma`, `bm_george`, `jf_alpha`, `zf_xiaobei` and similar
    - pocket-tts: `alba`, `marius`, `javert`, `jean`, `fantine`, `cosette`, `eponine`, `azelma`
    - Some models take no voice: Soprano, Chatterbox, Marvis, Qwen3-TTS base
- **How v0.7 did it (non-normative):** an in-process registry keyed by provider id, falling back to mlx-audio whenever no provider was named. Model and voice lists were hard-coded in the frontend.
- **Known problems in v0.7:**
  - "Available" was always true because mlx-audio had a default URL.
  - The default provider was hard-wired, so channels and processors ignored user preferences.
  - Health meant "the process answers HTTP", not "the model is loaded". The first request may download a multi-GB model and blow the 30 s timeout (inferred).
  - **The response `Content-Type` was derived from the requested format, not the actual bytes.** pocket-tts always returns WAV, and ElevenLabs "wav" is headerless PCM, yet both could be labelled `audio/mpeg` or `audio/wav`. Downstream consumers (Telegram, ffmpeg, the browser) then misdecoded them.
  - Hard-coded model lists drifted: the UI listed `whisper-large-v3-turbo` where the smoke test used `whisper-large-v3-turbo-asr-fp16`.
  - Field names differ per server (`instruct` vs `instructions`), which leaked into the API.
- **Better options today:**
  - Treat the OpenAI-compatible audio API (`POST /v1/audio/transcriptions` multipart, `POST /v1/audio/speech` JSON with `input`/`voice`/`response_format`/`speed`, `GET /v1/models`) as the common adapter. mlx-audio, oMLX, whisper.cpp (via `--inference-path`), Speaches (formerly faster-whisper-server), Kokoro-FastAPI, LocalAI and others speak it (verify each).
  - Discover models and voices from the server rather than hard-coding them.
  - Health should include a cheap "model ready" probe and report warm-up.
- **PRD refs:** [VOICE-1], [VOICE-4], [MODEL-4], [MODEL-5], [DEP-4], [EXT-4], B.5.

### B2. mlx-audio
- **User intent:** Fast local STT and TTS on Apple Silicon, including streaming.
- **Observations:**
  - **[v0.7 choice]** v0.7's default base URL was `http://127.0.0.1:9100`.
  - **[Fact]** Endpoints (relative to the base URL):
    - `GET /` is the liveness check.
    - `GET /v1/models` lists models.
    - `POST /v1/audio/transcriptions` takes multipart `file`, `model` and optional `language`. **The response is NDJSON:** lines of `{"text": "<delta>", "accumulated": "<so far>"}`.
    - `POST /v1/audio/speech` takes JSON `{model, input, voice?, speed?, response_format?, instruct?, stream?}` and returns audio bytes. With `stream: true` the body is a chunked WAV stream.
    - `WS /v1/audio/transcriptions/realtime` is realtime STT; see C2.
  - **[v0.7 choice]** v0.7 used the last `accumulated` value, or else concatenated the `text` values. It fell back to a single JSON object, then to raw text.
  - **[v0.7 choice]** Defaults: STT `mlx-community/parakeet-tdt-0.6b-v3`, TTS `mlx-community/pocket-tts-4bit`.
  - **[v0.7 choice]** STT models offered: whisper tiny/base/large-v3-turbo, SenseVoiceSmall, parakeet-tdt v2/v3, moonshine tiny/base, Qwen3-ASR-0.6B-8bit.
  - **[v0.7 choice]** TTS models offered: pocket-tts-4bit, Marvis-TTS-100M, Kitten-TTS nano (fp16/8bit), Chatterbox-turbo, Kokoro-82M, Soprano-80M, Qwen3-TTS-0.6B.
  - **[Fact]** Local requirements: an Apple Silicon Mac, a Python env with `mlx-audio` and its server running, and models pulled from Hugging Face on first use. MP3 output and decoding of compressed input likely need ffmpeg on that machine (inferred).
- **How v0.7 did it (non-normative):** a thin HTTP client plus a separate WebSocket client for realtime.
- **Known problems in v0.7:** NDJSON parsing threw away any segment and timing data. Language was not returned.
- **Better options today:** mlx-audio is still the broadest MLX speech server (it covered most current open models in 2026). Keep it as one adapter. Prefer its OpenAI-compatible surface so it is swappable.
- **PRD refs:** [VOICE-1], [DEP-4].

### B3. oMLX
- **User intent:** One local MLX server for LLM, vision and audio, so there is a single process to run.
- **Observations:**
  - **[Fact]** Default `http://localhost:8000`, started with `omlx serve`.
  - **[Fact]** `GET /health` is the liveness check (not `/`).
  - **[Fact]** `GET /v1/models` lists models.
  - **[Fact]** `POST /v1/audio/transcriptions` takes multipart `file`, `model` and `language`, and returns **a single JSON object** `{text, language, duration, segments}`.
  - **[Fact]** `POST /v1/audio/speech` takes JSON `{model, input, voice, speed, response_format, instructions}`. Note the field is `instructions`, not `instruct`. `stream: true` is supported.
  - **[Fact]** TTS returns a RIFF WAV. The smoke test sizes it as 16-bit mono at 24 kHz (inferred for every model).
  - **[Fact]** No streaming STT.
  - **[v0.7 choice]** v0.7 used the same defaults as for mlx-audio.
  - **[Fact]** Port 8000 clashes with pocket-tts's default.
- **How v0.7 did it (non-normative):** a near-copy of the mlx-audio client with the differences above.
- **Known problems in v0.7:** `segments` and `language` were discarded.
- **Better options today:** Still a reasonable "one server" option on Macs (flag: verify the project is maintained). The adapter is just OpenAI-compatible with quirks.
- **PRD refs:** [VOICE-1], [DEP-4], [MODEL-4].

### B4. whisper.cpp
- **User intent:** Portable local STT on any OS (CPU, Metal, CUDA, Vulkan).
- **Observations:**
  - **[Fact]** Default `http://127.0.0.1:8080`.
  - **[Fact]** `GET /` (serves a page) is used as liveness.
  - **[Fact]** `POST /inference` takes multipart `file`, `response_format=json` and optional `language`. The response is `{text}`.
  - **[Fact]** The model is fixed when the server starts (`whisper-server -m <ggml-model>`). A model parameter sent per request is ignored.
  - **[Fact]** STT only.
- **How v0.7 did it (non-normative):** an HTTP client against `/inference`.
- **Known problems in v0.7:**
  - Input format: whisper-server expects WAV, typically 16 kHz. Other formats need the server started with `--convert`, which needs ffmpeg (inferred). v0.7 sent raw OGG, WebM and MP4 from channels and media, which likely failed.
  - Timestamps are available via `response_format=verbose_json` (inferred) but were never requested.
- **Better options today:** whisper.cpp is still well maintained and the most portable option. Consider its OpenAI-style path (`--inference-path /v1/audio/transcriptions`) and built-in VAD (inferred). Always send 16 kHz mono WAV.
- **PRD refs:** [VOICE-1], [PROC-13].

### B5. pocket-tts (Kyutai)
- **User intent:** Natural-sounding local TTS that runs on CPU, with no GPU or Mac required.
- **Observations:**
  - **[Fact]** Default `http://127.0.0.1:8000`.
  - **[Fact]** `GET /health` is the liveness check.
  - **[Fact]** `POST /tts` takes **multipart/form-data** (not JSON): `text` and optional `voice_url`. A URL or HF path to a voice sample is presumably accepted in `voice_url` (inferred).
  - **[v0.7 choice]** v0.7 passed the voice name (`alba` etc.) in `voice_url`.
  - **[Fact]** The response is always a streaming WAV, whatever format was requested. There is no model, speed or format control.
  - **[v0.7 choice]** v0.7's default voice was `alba`.
- **How v0.7 did it (non-normative):** an HTTP client; buffered and streaming were the same request.
- **Known problems in v0.7:** A request for `mp3` silently got WAV, labelled as MP3 downstream. Telegram's reply was named `response.mp3` whatever the bytes were.
- **Better options today:** pocket-tts is still a good CPU TTS. Alternatives:
  - Kokoro-82M: Apache-2.0, multilingual, tiny
  - Piper: fastest on CPU
  - Chatterbox: expressive, cloning
  - Sesame CSM: naturalness
  - Qwen3-TTS
  - Voxtral TTS (Mistral, March 2026)

  Licences vary (e.g. Fish Audio's weights are non-commercial). Transcode server-side to the requested format.
- **PRD refs:** [VOICE-1].

### B6. ElevenLabs (cloud)
- **User intent:** Best-quality voices and multilingual STT when the user accepts cloud egress.
- **Observations:**
  - **[Fact]** Base `https://api.elevenlabs.io`; auth header `xi-api-key`.
  - **[v0.7 choice]** v0.7 used `GET /v1/user/subscription` as the health and key-validity check.
  - **[Fact]** STT: `POST /v1/speech-to-text`, multipart with `model_id`. The response contains `text`.
  - **[v0.7 choice]** v0.7's default STT model was `scribe_v1`.
  - **[Fact]** TTS: `POST /v1/text-to-speech/{voice_id}?output_format=…`, and `/stream` for chunked output. The body is `{text, model_id, voice_settings?: {speed}}`.
  - **[v0.7 choice]** v0.7 sent speed only when it wasn't 1.0.
  - **[v0.7 choice]** Default TTS model `eleven_multilingual_v2`; the UI also offered `eleven_turbo_v2_5`.
  - **[Fact]** **A voice ID is mandatory**: it is part of the TTS path.
  - **[v0.7 choice]** v0.7 failed fast with a clear message if there was none.
  - **[v0.7 choice]** Format mapping: v0.7 mapped `mp3` → `mp3_44100_128` and `wav` → `pcm_16000`.
  - **[Fact]** `pcm_16000` is **raw headerless s16le PCM at 16 kHz, not WAV**.
- **How v0.7 did it (non-normative):** an HTTP client; the streaming response body was passed straight through to the browser.
- **Known problems in v0.7:**
  - Because `pcm_16000` is headerless, the browser's streaming player (which waits for a RIFF header) could not play ElevenLabs streams (inferred). Channel ffmpeg conversion of the same bytes also fails without `-f s16le -ar 16000 -ac 1` (inferred).
  - The multipart field was named `audio`. Current docs name it `file` (inferred; verify).
  - Speed range 0.5–1.5 exceeds ElevenLabs' accepted range (roughly 0.7–1.2, inferred).
- **Better options today:**
  - Scribe v2 and **`scribe_v2_realtime`** (WebSocket, about 150 ms, 90+ languages, VAD or manual commit, word timestamps). For browsers, use single-use tokens minted server-side, but [VOICE-5] still routes audio through Eclaire.
  - Flash/turbo TTS models for low latency, `eleven_v3` for expressiveness (flag: verify current model ids).
  - The TTS WebSocket "stream-input" mode accepts text incrementally, which fits sentence-chunked TTS from a token stream (flag: verify).
- **PRD refs:** [VOICE-1], [VOICE-5], [MODEL-5], [PRIN-9].

---

## Part C: Streaming and voice flows

### C1. Push-to-talk, batch path
- **User intent:** Hold the mic button, speak, release, and the transcript lands in the composer (or is sent, if auto-send is on).
- **Observations:**
  - **[v0.7 choice]** v0.7 recorded with MediaRecorder using `audio/webm;codecs=opus`, falling back to `audio/mp4`.
  - **[Fact]** MediaRecorder format support varies by browser; the `audio/mp4` fallback is for Safari.
  - **[v0.7 choice]** Max 60 s. A stop within 500 ms of start was deferred so tiny taps still produced audio.
  - **[v0.7 choice]** Before upload the browser decoded the clip (`decodeAudioData`) and re-encoded it as 16-bit PCM WAV, "for backends that don't support WebM/Opus". It was then sent multipart with the model and provider.
  - **[Rule RULE-MEDIA-11]** Pressing the mic or stop MUST silence all assistant speech immediately, including audio already queued (barge-in).
  - **[v0.7 choice]** In v0.7, pressing the mic stopped any TTS playing.
  - **[v0.7 choice]** Microphone denial gave a specific "check browser permissions" message.
  - **[v0.7 choice]** An audio level meter (4 bars) showed while recording.
- **How v0.7 did it (non-normative):** a recorder hook plus a client-side WAV encoder.
- **Known problems in v0.7:**
  - The WAV was encoded at the context's native rate (44.1/48 kHz) and channel count, roughly 6× larger than 16 kHz mono.
  - Release was detected with a window `mouseup` only. Touch and pointer handling was missing (inferred), so mobile is hard.
  - Format normalisation belongs on the server, where it is reusable by channels and media.
- **Better options today:** Upload the native Opus/MP4 and normalise server-side with ffmpeg, or AVFoundation on Mac. Use Pointer Events for press and hold. Keep this mode as the [VOICE-2] push-to-talk alternative.
- **PRD refs:** [VOICE-2], [VOICE-4], [WEB-10], [WEB-11].

### C2. Streaming STT over WebSocket (wire protocol)
- **User intent:** See words appear while speaking, and get the final text instantly on release.
- **Observations:**
  - **[Rule RULE-MEDIA-12]** A voice streaming connection MUST be authenticated and authorised before any audio is accepted.
  - **[v0.7 choice]** **Browser to Eclaire** (v0.7's own protocol): an authenticated WS. Auth and the `speech:write` scope were checked before upgrade. Provider, model and language were query params.
    - Binary frames: **raw little-endian int16 PCM, mono, 16 kHz, 4,800 samples (300 ms, 9,600 bytes) per frame**. The final frame may be shorter, from the flush.
    - Text frames: JSON control messages, e.g. `{"action":"stop"}`, forwarded upstream.
  - **[v0.7 choice]** **Eclaire to browser events** (v0.7's own protocol):
    - `{"type":"connected"}` once upstream is ready
    - `{"type":"delta","delta":"…"}` for incremental text in the current segment
    - `{"type":"complete","text":"…"}` for a finalized segment
    - `{"type":"error","error":"…"}`
    - Close codes: `1011` for service unavailable, provider lacking streaming, or upstream connect failure.
  - **[Fact]** **Upstream (mlx-audio realtime):**
    - First message: JSON config `{"model": …, "language"?: …}`. The probe script also sends `"sample_rate": 16000` and waits for a ready message before sending audio.
    - Upstream emits `{"type":"delta","delta"}` and `{"type":"complete","text","is_partial"}`. Only `complete` with `is_partial` false counts as final.
    - mlx-audio segments speech with WebRTC VAD, which needs at least 480-sample (30 ms) frames.
  - **[Fact]** The Web Audio render quantum is 128 samples, below that VAD minimum.
  - **[v0.7 choice]** That is why v0.7's browser buffered 4,800 samples instead of sending each render quantum.
  - **[v0.7 choice]** **Client accumulation:**
    - Deltas accumulated within the current segment.
    - Each `complete` appended to a session transcript, joined with spaces, and reset the segment.
    - The displayed partial was the session text plus the current segment's deltas.
  - **[v0.7 choice]** **Timeouts:**
    - WS open: 10 s
    - `connected` handshake: 10 s
    - Max session: 60 s, then auto-stop
    - On stop, the client flushed the worklet, sent `{"action":"stop"}`, waited up to **5 s** for a final `complete`, then returned whatever it had accumulated.
  - **[Rule RULE-MEDIA-13]** Stopping a dictation MUST deliver the final text promptly and MUST never discard text already recognised.
  - **[v0.7 choice]** Only one session per client at a time. Stale close events from a previous socket were ignored.
- **How v0.7 did it (non-normative):** the backend was a transparent WS proxy to mlx-audio's realtime endpoint. Only mlx-audio supported streaming STT.
- **Known problems in v0.7:**
  - The mic opened only after the upstream handshake. Speech before then was lost, and frames arriving before upstream connected were silently dropped. Buffer from mic-open instead.
  - No per-session auth refresh, no resume, and no server-side duration cap.
  - The streaming protocol was invented ad hoc, separate from the unified realtime connection.
  - The final transcript was logged.
- **Better options today:**
  - Keep 16 kHz mono int16 as the internal canonical STT frame format. Consider Opus on the wire for remote clients.
  - Use 20–30 ms frames internally for VAD.
  - Server-side VAD (Silero) means providers without native streaming can still give partials, by re-transcribing a growing window (whisper-streaming / LocalAgreement-style) (inferred).
  - Natively streaming local STT: Kyutai STT, Moonshine streaming, Parakeet streaming via NeMo, and Apple SpeechAnalyzer volatile results (verify each).
- **PRD refs:** [VOICE-2], [VOICE-5], [EVT-3], [STREAM-2], [VOICE-6], [AUTHZ-1], [AUTHZ-2].

### C3. Browser capture with an AudioWorklet
- **User intent:** Low-latency, glitch-free mic capture in the browser.
- **Observations:**
  - **[v0.7 choice]** v0.7 called `getUserMedia({audio: {channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true}})`.
  - **[Fact]** Echo cancellation matters for barge-in while TTS plays.
  - **[v0.7 choice]** v0.7 created `new AudioContext({sampleRate: 16000})` so the browser resamples.
  - **[v0.7 choice]** The worklet accumulated float32 samples into a 4,800-sample buffer and converted them to int16 with clamping. Negative samples scaled by `0x8000`, positive by `0x7FFF`.
  - **[v0.7 choice]** Buffers were posted as transferable ArrayBuffers.
  - **[v0.7 choice]** A `"flush"` message sent a partial buffer on stop.
  - **[v0.7 choice]** Graph: mic source → worklet → gain(0) → destination.
  - **[Fact]** The zero-gain node keeps the graph pulling audio without playing it back.
- **How v0.7 did it (non-normative):** a static worklet JS file loaded with `audioWorklet.addModule`.
- **Known problems in v0.7:**
  - The `sampleRate` constraint on getUserMedia is ignored by most browsers. Firefox has historically refused to connect a MediaStream source to an AudioContext at a different rate (inferred). Resample inside the worklet, or server-side, rather than relying on the context rate.
  - The mic is re-acquired on every press, which adds latency and permission churn.
- **Better options today:** Same approach (AudioWorklet is still the right primitive). Alternatively use a WebRTC audio track, which brings browser AEC/AGC/NS and Opus. Run Silero VAD in-browser (ONNX/WASM, e.g. `@ricky0123/vad-web`) for client-side endpointing (verify maintenance).
- **PRD refs:** [VOICE-2], [VOICE-5].

### C4. Gapless streaming TTS playback with Web Audio
- **User intent:** The assistant starts speaking within a second, not after the whole reply is synthesized.
- **Observations:**
  - **[v0.7 choice]** Requests used `format: wav, stream: true`. The streamed body was a WAV.
  - **[Fact]** In a canonical 44-byte WAV header, `RIFF` comes first, channels are at offset 22, sample rate at offset 24 and bits per sample at offset 34.
  - **[v0.7 choice]** The client read until it had 44 bytes, checked `RIFF`, read those three fields, and then created an AudioContext at that sample rate.
  - **[Fact]** PCM bytes must be cut at `blockAlign` boundaries, with leftovers carried across reads. int16 is converted to float32 (/32768) and de-interleaved per channel.
  - **[v0.7 choice]** Each chunk became an AudioBufferSourceNode scheduled at `nextPlayTime`, which then advanced by the buffer's duration. The first chunk started 50 ms after `currentTime`.
  - **[Rule RULE-MEDIA-11]** Stopping playback MUST silence all assistant speech immediately, including audio already scheduled; the mic button MUST do the same (barge-in).
  - **[v0.7 choice]** Stop cancelled the reader, stopped all scheduled sources and closed the context. The mic button stopped playback.
  - **[v0.7 choice]** Auto-play fired when an assistant reply finished (if auto-play was on and the reply wasn't an error).
- **How v0.7 did it (non-normative):** fetch a ReadableStream, parse the WAV by hand, schedule buffers on one AudioContext.
- **Known problems in v0.7:**
  - **No underrun handling.** If synthesis falls behind realtime, `nextPlayTime` drifts into the past and later chunks play at once and overlap. Always use `max(nextPlayTime, currentTime + small_lead)`.
  - The header is assumed to be exactly 44 bytes and 16-bit. Streaming WAVs may carry `LIST` chunks and placeholder sizes (`0`/`0xFFFFFFFF`). Scan for the `data` chunk.
  - Headerless PCM (ElevenLabs `pcm_16000`) was never recognised.
  - TTS started only after the **whole** reply finished, and the **raw markdown** was spoken.
  - Completion was detected by polling.
- **Better options today:**
  - Server-side sentence chunking of the token stream into TTS ([VOICE-2]), sending audio frames with explicit format metadata (sample rate and encoding in a header message) over the realtime connection. The client then never parses WAV.
  - Use an AudioWorklet ring buffer, or WebRTC playout, for jitter handling.
  - Use a markdown-to-speakable-text renderer ([CHAN-6]).
- **PRD refs:** [VOICE-2], [VOICE-5], [CHAN-6], [EVT-3].

### C5. Voice preferences and the duplex voice session (the target)
- **User intent:** Hands-free conversation with the agent: low latency, interruptible, consistent across web, desktop and channels.
- **Observations:**
  - **[v0.7 choice]** v0.7's preference set: STT provider and model, TTS provider, model, voice and speed.
  - **[v0.7 choice]** v0.7's toggles: `useStreamingSTT`, `autoSendSTT`, `useStreamingTTS`, `autoPlayTTS` (defaults off).
  - **[Rule RULE-MEDIA-10]** Streaming toggles MUST only take effect when the chosen provider advertises the capability.
- **How v0.7 did it (non-normative):** push-to-talk only. Preferences were stored client-side, separate from user settings.
- **Known problems in v0.7:**
  - No VAD or end-of-turn detection, no sentence-chunked TTS, and no barge-in beyond "pressing the mic stops playback".
  - Preferences did not reach channels.
  - The latency target was never measured.
- **Better options today:**
  - **VAD:** Silero VAD (v5/v6) is the standard. TEN VAD is a newer alternative (verify). WebRTC VAD is legacy.
  - **Turn detection:** Pipecat **Smart Turn v3.x**. It is about 8M params, built on Whisper-tiny, open weights and data. It runs only after VAD reports silence (VAD `stop_secs` ≈ 0.2 s) and classifies the last ≤8 s of audio as complete or incomplete. It is Pipecat's default turn-stop strategy. LiveKit's turn-detector model is text-based (verify).
  - **Frameworks:** Pipecat and LiveKit Agents implement VAD, turn-taking, interruption and sentence-chunked TTS. Evaluate them as an engine inside Eclaire, keeping [VOICE-3] (tools and approvals stay in Eclaire) and [VOICE-5].
  - **WebRTC vs WebSocket:**
    - WebRTC gives Opus, jitter buffers, packet-loss concealment, browser AEC and UDP. It is clearly better on mobile and remote networks, and is the native path for phone and SIP.
    - WebSocket is simpler, fine on LAN/localhost, and fits [EVT-3]'s "dedicated authenticated WS for audio", but suffers TCP head-of-line blocking.
    - Options: LiveKit server (self-hostable SFU), or a server-side peer via aiortc, Pion or werift.
    - Lead: abstract the transport, ship WS first, and plan for WebRTC.
  - **Realtime speech-to-speech ([VOICE-3]):**
    - Hosted: OpenAI `gpt-realtime` and Gemini Live (verify current names).
    - Open full-duplex: Kyutai Moshi and its cascaded "Unmute", NVIDIA PersonaPlex-7B (Jan 2026), NVIDIA Nemotron VoiceChat (Sept 2026, with tool calling), Qwen-Omni series.

    Quality of tool use and barge-in handling varies a lot. Benchmark with Full-Duplex-Bench before adopting. Cascaded STT→LLM→TTS stays the baseline because it keeps Eclaire tools, approvals and transcripts intact.
  - **macOS native client:**
    - `AVAudioEngine` with voice processing enabled, for system AEC
    - SpeechAnalyzer for on-device STT
    - `AVSpeechSynthesizer` (including Personal Voice) as a zero-install TTS fallback. Its quality is below neural local TTS (inferred).
- **PRD refs:** [VOICE-2], [VOICE-3], [VOICE-4], [VOICE-5], [APPLE-7], [EVT-3], [MODEL-4] `realtime_voice`.

### C6. Telegram voice notes and the mp3 reply
- **User intent:** Send the bot a voice note and get a text reply plus a spoken reply.
- **Observations:**
  - **[Fact]** Inbound voice notes (`message.voice`) are always OGG/Opus.
  - **[v0.7 choice]** Download: v0.7 called `getFileLink(file_id)`, then an HTTP GET.
  - **[Fact]** The Bot API caps downloads at 20 MB.
  - **[v0.7 choice]** Pipeline: STT, then the agent turn on the channel's agent and session, then the text reply (split to the length limit), then `sendVoice` with the TTS audio.
  - **[v0.7 choice]** v0.7 showed a typing action while working, and rate-limited per channel with a polite message.
  - **[Rule RULE-MEDIA-14]** A channel message that can't be handled (a processing failure, a rate limit, or a channel that doesn't accept input) MUST get a reply saying so, never silence.
  - **[v0.7 choice]** Notification-only channels refused with an explanatory reply. Failures got a generic error reply.
  - **[Fact]** `sendVoice` accepts OGG/Opus, MP3 or M4A per current Bot API docs (verify). Only OGG/Opus reliably shows as a native voice bubble with a waveform (inferred).
- **How v0.7 did it (non-normative):** a voice-specific handler calling a shared "process audio message" pipeline (STT, agent, optional TTS).
- **Known problems in v0.7:**
  - Only `voice` was handled. `audio` files, `video_note` circles and videos were ignored (inferred from handler registration).
  - Voice notes weren't saved as items, and the transcript wasn't shown to the user ([CHAN-4] requires both).
  - The default provider was used instead of the user's preferences.
  - The reply was named `response.mp3` whatever the actual format (see B5).
  - Raw markdown was sent with no parse mode.
- **Better options today:** Transcode TTS output to OGG/Opus (`-c:a libopus -b:a 32k–64k -ac 1 -ar 48000`) for native voice bubbles. Treat inbound media as capture ([CHAN-4]).
- **PRD refs:** [CHAN-1], [CHAN-4], [CHAN-6], [CHAN-8], [VOICE-4], [VOICE-6].

### C7. Discord voice messages and voice channels
- **User intent:** Voice-message the bot and get a native Discord voice message back. Optionally, talk to it in a voice channel.
- **Observations:**
  - **[Fact]** Inbound voice messages carry the `IS_VOICE_MESSAGE` flag (`1 << 13` = 8192).
  - **[v0.7 choice]** v0.7 used the first attachment with an `ogg` content type or `.ogg` name.
  - **[Rule RULE-MEDIA-15]** Attachments received through a chat platform MUST be fetched only from that platform's own content hosts.
  - **[v0.7 choice]** v0.7 fetched attachments only from Discord CDN hosts (`cdn.discordapp.com`, `media.discordapp.net`).
  - **[v0.7 choice]** Outbound conversion: `ffmpeg -i <in> -c:a libopus -b:a 64k -ar 48000 -ac 1 -application voip -f ogg <out>`.
  - **[v0.7 choice]** Duration: `ffprobe -show_entries format=duration -of csv=p=0`.
  - **[v0.7 choice]** Waveform:
    - decode to `s16le` mono 8 kHz
    - split into 256 bins and take each bin's peak `|sample|`
    - scale to 0–255 and base64 the 256 bytes
    - fall back to a flat waveform (all 128) if decoding fails
  - **[v0.7 choice]** v0.7 sent the audio as a file named `voice-message.ogg` with the voice-message flag. The text reply went first.
  - **[Rule RULE-MEDIA-16]** A failure to produce or send a spoken reply MUST NOT stop the text reply from reaching the user.
  - **[v0.7 choice]** Voice channels:
    - Optional auto-join of a configured voice channel, with mode `listen`, `speak` or `both`.
    - Receiving subscribed per user, with end-after-silence of 1,000 ms (Opus packets).
  - **[Fact]** Voice-channel playback goes through an audio resource of type `OggOpus`, `WebmOpus` or arbitrary.
- **How v0.7 did it (non-normative):** `@discordjs/voice` for channels; ffmpeg subprocesses for conversion, duration and waveform.
- **Known problems in v0.7:**
  - **Duration and waveform were computed but never sent.** Discord voice messages need `duration_secs` and `waveform` on the attachment, and the high-level attachment builder doesn't expose them (inferred). Use raw REST attachment metadata.
  - An input-format hint was placed after `-i`, which makes it an output option, so it did nothing. Input format flags must precede `-i`.
  - Headerless PCM from ElevenLabs can't be converted without explicit `-f s16le -ar -ac` (inferred).
  - Voice-channel listen and speak were dead code.
- **Better options today:**
  - Discord voice channels deliver 48 kHz stereo Opus in 20 ms frames. Decode them with `@discordjs/opus` or `prism-media`, then downmix and resample to 16 kHz for STT.
  - Discord has been rolling out mandatory E2EE (DAVE) for voice, which libraries must support (flag: verify current status).
  - Treat Discord voice channels as a [VOICE-2] session transport (P1).
- **PRD refs:** [CHAN-1], [CHAN-4], [VOICE-2], [CHAN-8].

### C8. Slack audio
- **User intent:** Drop an audio clip in Slack and get an answer.
- **Observations:**
  - **[v0.7 choice]** v0.7 detected a message file with `mimetype` starting `audio/`.
  - **[Fact]** Private files are downloaded from `url_private_download` with `Authorization: Bearer <bot token>`.
  - **[v0.7 choice]** The format hint was the file extension (default `webm`).
  - **[v0.7 choice]** v0.7 ran STT then the agent, and replied in-thread as Slack mrkdwn.
  - **[v0.7 choice]** A "thinking" reaction served as the typing indicator, removed afterwards.
  - **[Fact]** Slack bots can't post native voice clips.
  - **[v0.7 choice]** **No TTS reply** in v0.7.
- **How v0.7 did it (non-normative):** the same shared audio pipeline with TTS disabled.
- **Known problems in v0.7:** Clips recorded in Slack may arrive as `video/mp4` or another non-`audio/*` type and be missed (inferred). The other issues match C6.
- **Better options today:** Same approach. Normalise through the server-side audio pipeline and capture the clip as an item. Optionally attach a TTS file as a regular upload if the user opts in.
- **PRD refs:** [CHAN-1], [CHAN-4], [CHAN-6].

### C9. Agent speech tools
- **User intent:** The agent can transcribe a stored media item on request and produce spoken audio.
- **Observations:**
  - **[v0.7 choice]** Transcribe took a media id and an optional language. Its description told the agent to check for an existing transcript first, which avoided redundant STT.
  - **[v0.7 choice]** Synthesize took 1–10,000 chars of text, an optional voice, and `mp3` or `wav`.
- **How v0.7 did it (non-normative):** in-process tools calling the default provider. Synthesized audio was written to a bare storage path.
- **Known problems in v0.7:** The output was an orphan blob, not an item or attachment (never garbage-collected; [BLOB-3]). The tool ignored user preferences. Transcribe re-ran STT on the whole file (A6 limits).
- **Better options today:** Tools should read the `transcript` artifact, or trigger a re-run of the transcript processor, rather than call STT directly. TTS output should become an attachment on the run or message.
- **PRD refs:** [TOOL-4], [TOOL-6], [ART-1], [BLOB-3], [PROC-3].

### C10. Provider probes and round-trip testing (snippets)
- **User intent (developer):** Check quickly that a local speech server and every listed model actually work, without a human listening.
- **Observations:**
  - **[v0.7 choice]** **Realtime STT probe:**
    1. Record 3 s at 16 kHz float32 and convert to int16 (`×32767`).
    2. Connect to `ws://127.0.0.1:9100/v1/audio/transcriptions/realtime` and send `{"model": "mlx-community/parakeet-tdt-0.6b-v3", "sample_rate": 16000}`.
    3. Wait for the server's ready message.
    4. Send 300 ms chunks plus the remainder, then `{"action":"stop"}`.
    5. Read messages (keyed by `type`, or by `status` for the ready message) until a `complete` with `is_partial` false, with a 30 s timeout.
  - **[v0.7 choice]** **Model smoke test (oMLX):**
    - Check `GET /health`.
    - Generate test speech with TTS (pocket-tts, voice `alba`, "The quick brown fox…"), then transcribe it with every STT model, using `language=en`.
    - Run every TTS model and assert the output starts with `RIFF` and is over 100 bytes. Save the WAVs for listening.
    - An optional mic mode transcribes 3 s chunks as WAV (chunked pseudo-streaming over the batch endpoint). The trailing chunk is sent only if it is at least 1 s.
    - HTTP timeout 120 s.
  - **[v0.7 choice]** **Round-trip integration tests** (TTS then STT): fuzzy keyword match ("hello", "world"), not exact strings, across provider pairs. Tests skipped when a server was unreachable, and treated "STT model not loaded" as a skip.
- **How v0.7 did it (non-normative):** standalone Python scripts plus integration tests that skip when servers are missing.
- **Known problems in v0.7:** No CI coverage (servers absent), and model lists duplicated across UI, scripts and tests.
- **Better options today:** Keep the TTS→STT round trip as the core conformance test for voice providers ([EXT-4]), with WER thresholds instead of keyword checks. Add a latency probe for the [VOICE-2] 1.2 s target. Run against a containerised CPU stack (whisper.cpp plus a CPU TTS) in CI.
- **PRD refs:** [EXT-4], [VOICE-1], [VOICE-2], [PRIN-12], §10.

---

## Candidate fixtures

No audio or video sample files are tracked in v0.7. Existing test assets:

| Path (v0.7) | What it exercises |
|---|---|
| `snippets/test-stt-ws.py` | Live probe of the mlx-audio realtime STT WS: config message, ready handshake, 300 ms int16 chunks, stop, final `complete`. |
| `snippets/oMLX/test_models.py` | Smoke test of all listed STT/TTS models over OpenAI-compatible endpoints: TTS→STT round trip, RIFF check, chunked mic STT. |
| `snippets/oMLX/output/test_sine_440hz.wav` | Untracked local output. 64,044 bytes, consistent with 2 s of 16 kHz mono 16-bit: a 440 Hz tone (non-speech input for STT hallucination checks). |
| `snippets/oMLX/output/test_speech.wav` | Untracked local output. pocket-tts rendering of the test phrase, about 5.8 s at 24 kHz mono (inferred). |
| `packages/audio/src/tests/setup.ts` | Synthetic helpers: generate a silent 16 kHz mono WAV of N seconds; RIFF and MP3 header checks. |
| `packages/audio/src/tests/integration/round-trip.test.ts` | Cross-provider TTS→STT with fuzzy keyword match (mlx→mlx, pocket-tts→mlx, mlx→whisper.cpp). |
| `packages/audio/src/tests/integration/{mlx-audio,pocket-tts,whisper-cpp}.test.ts` | Per-provider health, STT on silence, TTS header validity; skipped when the server is unreachable. |
| `packages/audio/src/tests/unit/*.test.ts` | Wire-format expectations per provider (NDJSON parse, form fields, ElevenLabs format mapping, WS event filtering). |
| `apps/backend/src/tests/integration/audio.test.ts`, `media.search.test.ts`; `apps/backend/src/tests/unit/audio-service.test.ts` | Speech API routes, provider routing and media search. |

Fixtures the rebuild should create, because each one maps to a lesson above:
- MP4 with `moov` at the end (non-faststart)
- MP4 with a `mov_text` subtitle track and language tag
- MKV with a PGS bitmap subtitle track
- MP3 with embedded cover art
- Rotated phone MOV with GPS and creation time
- YouTube-style rolling auto-caption VTT
- SRT using `.` as the millisecond separator
- Telegram OGG/Opus voice note
- Headerless `pcm_16000` blob
- Streaming WAV with a `LIST` chunk and `0xFFFFFFFF` sizes
- 10+ minute speech file, for STT chunking and timeouts
- HTML error page served as `video/mp4`
- Redirect-to-`127.0.0.1` URL, for the SSRF tests

---

## Appendix: v0.7 prompts (eval baseline only, not a template)

Both prompts were used by media AI analysis (A7) with the background **worker** model role (`workers`), temperature 0.2, max 500 tokens. `${mediaLabel}` is `video` or `audio`. `${categoryList}` is:
- video: `tutorial, presentation, interview, vlog, screencast, music_video, meeting, short_clip, other`
- audio: `speech, podcast, interview, lecture, meeting, voice_memo, music, audiobook, sound_effect, other`

**1. Transcript-based analysis**: used when any transcript tier succeeded. `${truncatedTranscript}` is at most 8,000 chars plus the truncation marker.

System:
```
You are a media analysis AI. Analyze the provided ${mediaLabel} transcript and return ONLY valid JSON. Do not include explanatory text.
```
User:
```
Analyze this ${mediaLabel} transcript. Provide:
- A brief one-sentence description of the content
- 3-8 relevant tags (keywords)
- Category: ${categoryList}

Transcript:
${truncatedTranscript}

Respond with JSON: { "description": "...", "tags": ["tag1", "tag2"], "category": "..." }
```

**2. Metadata-only analysis**: used when there was no transcript but at least one of title, description or filename existed. `${metadataParts}` is newline-joined `Title: …`, `Description: …` (at most 2,000 chars plus "…") and `Filename: …`.

System:
```
You are a media analysis AI. Analyze the provided ${mediaLabel} metadata and return ONLY valid JSON. No transcript is available — base your analysis on the title, description, and filename.
```
User:
```
Analyze this ${mediaLabel} based on its metadata (no transcript available). Provide:
- A brief one-sentence description of the content
- 3-8 relevant tags (keywords)
- Category: ${categoryList}

${metadataParts}

Respond with JSON: { "description": "...", "tags": ["tag1", "tag2"], "category": "..." }
```

The voice paths had no LLM prompts of their own. Voice input went to the agent as a plain user prompt, and the agent's reply text was spoken verbatim, markdown included.
