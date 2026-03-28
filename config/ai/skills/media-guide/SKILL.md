---
name: media-guide
description: Help users understand media capabilities including audio/video import, processing, transcription, and organization.
alwaysInclude: false
tags: [media, audio, video, help]
---

# Media Guide

## What is Media in Eclaire?

Media items are audio and video files stored in Eclaire. They can be uploaded directly or imported from URLs (YouTube, Vimeo, SoundCloud, and many other platforms).

## How Media Gets Into Eclaire

There are two ways to add media:

1. **File Upload** — Users upload audio/video files through the UI. Supported formats include MP3, MP4, WAV, FLAC, OGG, WebM, M4A, AAC, and more.
2. **URL Import** — Provide a URL and Eclaire downloads the media automatically. This works with:
   - YouTube videos
   - Vimeo videos
   - SoundCloud tracks
   - Direct file URLs (e.g., podcast RSS links, hosted MP3/MP4 files)
   - Many other platforms supported by yt-dlp

## Processing Pipeline

After media is added, a background worker processes it:

1. **Download** (for URL imports) — The file is downloaded and stored
2. **Metadata Extraction** — Duration, codec, bitrate, sample rate, resolution (video), etc.
3. **Thumbnail Generation** — A visual thumbnail for video, waveform image for audio
4. **Transcription** — Speech-to-text extraction of spoken content (3-tier: platform captions, embedded subtitles, then Whisper STT)
5. **AI Tagging** — Automatic description, tags, and category based on transcript content

Processing happens in the background and may take a few minutes depending on file size and duration.

## What You Can Do With Media

As an assistant, you can:

1. **Search media** — Find audio/video by text (searches titles, descriptions, and transcripts), tags, media type, and date range
2. **View details** — Get full metadata, transcript, processing status, and tags for any media item
3. **Count media** — Check how many audio or video items match criteria
4. **Update metadata** — Change title, description, tags, due date, review status, flag color, or pin status
5. **Delete media** — Remove media items and their stored files (requires user confirmation)
6. **Import from URL** — Import new media from a URL (requires user confirmation)
7. **Preview URLs** — Check what a URL contains (title, duration, uploader, type) before importing

## Organization Features

Media items support the same organization features as other content types:

- **Tags** — Apply multiple tags for categorization
- **Review Status** — pending, accepted, or rejected (for inbox triage)
- **Flags** — Color-coded flags (red, yellow, orange, green, blue)
- **Pins** — Pin important items
- **Due Dates** — Set deadlines for time-sensitive media

## Tips for Helping Users

- Use `getMediaInfo` before `importMediaUrl` to preview what a URL contains — this helps avoid importing unwanted content
- After importing, tell users that processing happens in the background
- Use `findContent` with `types: ["media"]` and `mediaType: "audio"` or `mediaType: "video"` to narrow searches
- The transcript text is searchable via the `text` parameter in `findContent`
- If a user asks about a specific media item's transcript, use `getMedia` to retrieve it — the `extractedText` field contains the transcript
