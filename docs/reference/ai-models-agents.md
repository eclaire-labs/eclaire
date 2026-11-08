> **Non-normative reference.** Extracted from Eclaire v0.7 to preserve user intent and hard-won lessons. `PRD.md` is the source of truth. Do not reproduce v0.7's structure, module layout or naming; where this document and the PRD disagree, the PRD wins. "Better options today" are leads to evaluate, not decisions.

Labels: **[Fact]** external truth, keep. **[Rule]** a requirement we want, mirrored in PRD Appendix C. **[v0.7 choice]** inventory only, free to change.

# Models, providers, agent runtime and harness integration: v0.7 knowledge

**Scope.** This covers provider and server quirks, model metadata, local engine management, external CLI harnesses, MCP and browsing, the tool catalogue, prompts and skills. The source is v0.7 at `8cd0fda`, read on 2026-11-07. Nothing was run. Statements are from reading code unless marked *(inferred)*. External facts in "Better options today" were spot-checked with a few web lookups, which are noted where made.

**How to read the v0.7 notes.** v0.7 sent every provider through one OpenAI-SSE-shaped internal stream and ran a hand-written agent loop. The PRD rejects both (D5, D6, [MODEL-2], [STREAM-1]). The lessons below are about *wire behaviour of the outside world*, which any design has to handle.

---

## 1. Providers and models

### 1.1 Provider dialects, base URLs and endpoints
- **User intent:** Point Eclaire at any inference server, local or cloud, with a base URL and an optional key, and it works. Local-first is the default ([PRIN-9]).
- **Observations:**
  - **[Rule RULE-AI-1]** Every provider's endpoint (base URL and optional credential) MUST be user-configurable, with no host, port or path assumed to be fixed.
  - **[Fact]** Endpoint paths differ by API: Chat Completions `/chat/completions`, Anthropic `/v1/messages` (on a base URL without `/v1`), MLX-VLM native `/responses`.
  - **[v0.7 choice]** v0.7's base URL convention *included* the API version path (`http://127.0.0.1:11434/v1`) and derived the endpoint path from the dialect. Each provider could override the chat path and the models-list path.
  - **[Fact]** Model listing uses `GET {baseUrl}/models`. The response is either `{data:[…]}` or a bare array, so handle both. OpenRouter entries carry `context_length`, `architecture.input_modalities` and `supported_parameters` (`tools`, `response_format`). Local servers usually return just ids.
  - **[Fact]** Containers reach host-run inference servers through `host.docker.internal`. Native installs use `127.0.0.1`.
  - **[v0.7 choice]** v0.7 picked the default host from the runtime and allowed a per-provider URL override.
  - **[v0.7 choice]** v0.7's model id convention was `provider:model-slug`.
  - **[Fact]** Provider model names for llama.cpp `-hf` style are `org/repo:QUANT` (e.g. `unsloth/Qwen3-14B-GGUF:Q4_K_XL`).
- **How v0.7 did it (non-normative):** Four "dialects": OpenAI-compatible, Anthropic Messages, MLX native, and CLI JSONL for harnesses. A JSON provider config held URL, headers, auth, optional engine settings and optional CLI settings.
- **Known problems in v0.7:** There was no OpenAI Responses API and no Gemini. CLI harnesses were modelled as "providers", which conflated a model with a runtime (fixed conceptually by [INTEROP-2] and B.9). Default MLX ports disagreed between the env defaults (8080) and the presets (11434, which collides with Ollama).
- **Better options today:** The Vercel AI SDK provider packages (`@ai-sdk/openai-compatible`, `@ai-sdk/openai` for Responses, `@ai-sdk/anthropic`, `@ai-sdk/google`) or pi-ai's unified provider layer, behind the B.8 contract. Both already handle most of the quirks below. Prototype both (D5).
- **PRD refs:** [MODEL-1], [MODEL-3], [MODEL-5], B.8, D5, [DEP-7].

### 1.2 Reasoning and thinking: where it appears and how to toggle it
- **User intent:** Users see the model's thinking separately from its answer, and can turn thinking off for speed. Background processing never pays for thinking tokens.
- **Observations:**
  - **[Rule RULE-AI-2]** The model's thinking MUST be shown apart from its answer and MUST NOT leak into the answer text, however the server delivers it. Turning thinking off is covered by [MODEL-6].
  - **[Fact]** **Field names differ by server.** Streaming deltas come as `delta.reasoning` (OpenRouter and others) or `delta.reasoning_content` (llama.cpp, vLLM, DeepSeek-style). Non-streaming messages can also use `message.thinking`. Check all three. Treat an empty-string reasoning delta as absent, because some servers send `""` alongside content.
  - **[Fact]** **Inline `<think>…</think>` tags.** Qwen3/QwQ/DeepSeek-R1-style models served without a reasoning parser put the thinking in `content`.
  - **[v0.7 choice]** v0.7 gave a provider reasoning field precedence over embedded tags.
  - **[Fact]** **Tag-parsing gotchas:**
    - Tags split across stream chunks (`<thi` + `nk>`).
    - A missing opening tag *(inferred)*: some chat templates pre-fill `<think>` in the prompt, so the output starts mid-thought and has only `</think>`.
    - A literal `<think>` in normal prose.
  - **[v0.7 choice]** v0.7 handled none of the three gotchas robustly. It also ran tag parsing even when the server had already split reasoning out.
  - **[Fact]** **llama-server toggle quirk.** `enable_thinking` at the top level of the request body is *ignored* by llama-server. It must be sent as `chat_template_kwargs: {"enable_thinking": false}`. This applied to Qwen3/Qwen3.5 templates.
  - **[v0.7 choice]** v0.7 sent both the top-level field and `chat_template_kwargs`, so other servers that read the top-level field also worked.
  - **[Fact]** **Prompt-controlled thinking.** Some models toggle with a prompt prefix such as `/no_think`.
  - **[v0.7 choice]** v0.7 modelled four reasoning modes per model: `always`, `never`, `prompt-controlled` (with a `disablePrefix`) and `provider-controlled` (API parameter). For prompt-controlled models thinking defaulted to **off** unless requested, by prefixing the system message.
  - **[v0.7 choice]** v0.7's background/processing role forced thinking off by default to save token budget (starting point; tune).
  - **[Fact]** Anthropic and other signature-bearing reasoning must round-trip unchanged (see [MODEL-2]).
  - **[v0.7 choice]** v0.7 dropped thinking signatures everywhere.
- **How v0.7 did it (non-normative):** A stream parser normalised the reasoning fields and `<think>` tags into "reasoning" events. A per-model reasoning config drove the prefix or flag.
- **Known problems in v0.7:**
  - Reasoning was re-sent in history as a flat string the OpenAI path silently dropped.
  - Signatures were lost.
  - There was no reasoning-effort parameter.
  - The Anthropic adapter did not request or parse thinking at all.
- **Better options today:**
  - The AI SDK has reasoning parts plus `extractReasoningMiddleware({tagName:'think'})` for tag-in-content models. v0.7's own prototype used it (§6).
  - pi-ai normalises thinking levels across providers.
  - Server-side reasoning parsers are the most robust option: llama.cpp `--reasoning-format`, vLLM `--reasoning-parser`. Prefer them, and keep tag extraction only as a fallback.
  - Check that `chat_template_kwargs` is still the llama-server mechanism and whether `--reasoning-budget` exists in the target build.
- **PRD refs:** [MODEL-2], [MODEL-3] (reasoning mode), [MODEL-6], [RUN-2] (`reasoning` part with signature).

### 1.3 MLX native servers (Apple Silicon)
- **User intent:** Mac users run MLX models (text and vision) at full speed on unified memory.
- **Observations:**
  - **[Fact]** **mlx-lm** and **LM Studio** (which can run MLX models) speak OpenAI Chat Completions. Treat them as OpenAI-compatible.
  - **[Fact]** **mlx-vlm**'s server used a `/responses`-style API:
    - Request: `{model, input:[{role,content}], stream, max_output_tokens, temperature, top_p}`, with no `/v1` in the base URL.
    - Streaming events: `response.output_text.delta` (`delta` string) and `response.completed`.
    - Non-streaming text appeared under varying keys: `response.output_text`, `response.text`, `output_text`, `text`, `response`, `content`. Try them all.
    - No tools, no reasoning, no usage.
  - **[Fact]** An MLX server is a single-model process at a fixed port. Several MLX processes need distinct ports.
- **How v0.7 did it (non-normative):** A small dedicated adapter that translated the stream into the internal OpenAI-SSE shape.
- **Known problems in v0.7:** Unknown event types were logged and dropped. There was no image-part translation check *(inferred)*. Port defaults were inconsistent (§1.1).
- **Better options today:**
  - Recent mlx-lm / mlx-vlm servers and oMLX expose OpenAI-compatible `/v1/chat/completions` (and some expose `/v1/responses`). If so, no special dialect is needed: use the generic OpenAI-compatible or Responses provider and drop the bespoke one. Verify per server version.
  - Apple Foundation Models is the on-device option on macOS 26+ (PRD D11).
- **PRD refs:** [MODEL-1], [DEP-7], D11, D18.

### 1.4 llama.cpp, Ollama, LM Studio, vLLM differences
- **User intent:** Setup detects whichever local server the user runs and just works ([DEP-7]).
- **Observations:**
  - **[Fact]** Default ports: llama.cpp's own default is `8080`. Ollama `11434`, LM Studio `1234`, vLLM `8000` *(inferred)*.
  - **[v0.7 choice]** v0.7's convention put llama.cpp on `11500` (assistant) and `11501` (processing). The "custom" preset defaulted to `8080`.
  - **[v0.7 choice]** v0.7 had **no code-level differences** between Ollama, LM Studio and llama.cpp. All went through the same Chat Completions path, and the only differences were ports and whether Eclaire managed the process.
  - **[Fact]** Known external quirks worth testing *(inferred, verify on current versions)*:
    - Ollama's OpenAI-compatible endpoint uses the model's default context (historically small, 2–4k) unless `num_ctx` is set in a Modelfile or through the native API. This silently truncates long agent prompts.
    - Ollama model ids are `name:tag`.
    - LM Studio loads models on demand (JIT) and may return a different id than requested.
    - Some servers omit `index` on tool-call deltas.
  - **[Fact]** Streaming `usage` is only sent by OpenAI-style servers when the request has `stream_options: {"include_usage": true}`.
  - **[v0.7 choice]** v0.7 parsed usage from the final chunk but never sent that option.
  - **[Fact]** llama-server health is `GET /health` on the server root (not under `/v1`).
- **How v0.7 did it (non-normative):** Presets per server, with an optional "managed" flag for llama.cpp (§5.1).
- **Known problems in v0.7:**
  - There was no detection: the user had to pick a preset.
  - No per-server context-size discovery (e.g. llama-server `GET /props` exposes `n_ctx` *(inferred)*; Ollama has `/api/show`).
- **Better options today:** Probe known ports at setup with `/v1/models` plus a server-specific endpoint to detect type, context size and loaded models. Read context size from the server rather than trusting the catalogue.
- **PRD refs:** [DEP-7], [MODEL-3], [MODEL-6].

### 1.5 Anthropic specifics
- **User intent:** Claude models are usable directly with the user's API key.
- **Observations:**
  - **[Fact]** Headers: the key goes in `x-api-key` (not `Authorization`), plus `anthropic-version: 2023-06-01`. The base URL is `https://api.anthropic.com` and the path `/v1/messages`.
  - **[Fact]** The system prompt is a top-level `system` field, not a message. `max_tokens` is **required**. Content is always an array of blocks.
  - **[Fact]** Tool results are `user` messages containing `tool_result` blocks keyed by `tool_use_id`. Tool definitions use `input_schema`.
  - **[Fact]** `tool_choice` mapping: `auto` maps to `{type:"auto"}` and `required` to `{type:"any"}`. A named tool maps to `{type:"tool",name}`.
  - **[v0.7 choice]** v0.7 treated `tool_choice` as having no "none" value and omitted the tools instead.
  - **[Fact]** Image URLs in data-URI form must become base64 `source` blocks. Plain URLs can use `{type:"url"}` sources.
  - **[Fact]** Streaming uses SSE `event:` lines with `content_block_start` / `content_block_delta` (`text_delta`, `input_json_delta`, and `thinking_delta` / `signature_delta` for thinking) / `content_block_stop`, then `message_delta` (`stop_reason`, usage) and `message_stop`.
  - **[Fact]** Stop-reason mapping: `max_tokens` maps to length and `tool_use` to tool calls.
- **How v0.7 did it (non-normative):** Hand-translated Anthropic SSE into OpenAI-shaped SSE.
- **Known problems in v0.7 (lessons):**
  - **Parallel tool calls were corrupted.** Every translated tool call was emitted with `index: 0`, so the accumulator merged the second call's arguments into the first. Key tool calls by block index or id, never by an assumed index.
  - The SSE `event:` type was tracked per network chunk, so an `event:` line and its `data:` line split across chunks lost their type.
  - There was no thinking, no prompt caching (`cache_control`), no usage, no citations.
  - Malformed tool-argument JSON was silently replaced by `{}`. Surface it to the model as a tool error instead.
- **Better options today:** Use the official Anthropic SDK or AI SDK `@ai-sdk/anthropic`, which handle thinking signatures, caching and citations. Check the current API version header and thinking parameters with the provider docs at build time.
- **PRD refs:** [MODEL-1], [MODEL-2], [MODEL-7].

### 1.6 Auth headers, custom headers and `${ENV:VAR}` interpolation
- **User intent:** API keys don't live in plaintext config. Admins reference environment variables, and any header a gateway needs can be set.
- **Observations:**
  - **[Fact]** Providers and gateways authenticate in three ways: none, `Authorization: Bearer <key>`, or an arbitrary named header, e.g. `x-api-key`, `api-key` for Azure-style gateways *(inferred)*.
  - **[v0.7 choice]** v0.7 modelled these as the auth variants `none`, `bearer` and `header` (arbitrary header name and value).
  - **[v0.7 choice]** v0.7 allowed custom static headers per provider.
  - **[Fact]** OpenRouter wants `HTTP-Referer` and `X-Title` for attribution.
  - **[Rule RULE-AI-3]** A call whose credential is missing or cannot be resolved MUST fail with a clear error naming what is missing. It MUST NOT be sent with a blank or placeholder credential.
  - **[v0.7 choice]** **Interpolation:** in v0.7, `${ENV:VAR_NAME}` could appear in base URLs, header values, auth values and harness env vars, and was resolved at call time. A missing variable was a hard, clear error for auth. For catalogue browsing it was a soft pass-through.
  - **[v0.7 choice]** v0.7 applied auth headers *after* custom headers, so a custom header couldn't override auth.
- **How v0.7 did it (non-normative):** A string-template interpolator over the config values.
- **Known problems in v0.7:**
  - **Inconsistent bearer convention.** The CLI stored `value: "Bearer <key>"` and the chat path sent it as-is. Catalogue fetch and provider test then prepended `Bearer ` again (`Bearer Bearer …`). Store the secret only and let the scheme add the prefix.
  - The CLI wizard recommended env vars but then stored the literal key.
  - Secrets were not encrypted.
- **Better options today:** Encrypted secret store with env/file references as one secret-provider type ([CFG-3]). Keep the `${ENV:…}` *reference* idea as a secret source, not as string templating spread through config.
- **PRD refs:** [CFG-1], [CFG-3], [MODEL-5], [PRIN-9].

### 1.7 Streaming and tool-call accumulation (cross-provider lessons)
- **User intent:** Tokens stream smoothly, and tool calls are exact.
- **Observations:**
  - **[Fact]** OpenAI-style tool-call deltas arrive as fragments keyed by `index`. The first fragment carries `id` and `function.name`, and later ones append `function.arguments`. Some servers send the whole call in one chunk, or omit `index`.
  - **[Fact]** The finish reason can be `tool_calls` or the legacy `function_call`.
  - **[v0.7 choice]** v0.7 mapped unknown finish reasons to `stop`.
  - **[Fact]** Image token cost is not visible in text tokenisation (§1.11).
  - **[Rule RULE-AI-4]** Malformed tool-call arguments MUST be returned to the model as a visible tool error so it can retry. They MUST NOT be silently replaced (e.g. with `{}`) or dropped.
- **How v0.7 did it (non-normative):** Every provider was transcoded into OpenAI SSE, then re-parsed.
- **Known problems in v0.7:** The transcoding was lossy (signatures, usage, citations, parallel calls), and the bespoke event protocol had no replay. The PRD already rejects this.
- **Better options today:** The AI SDK `streamText` full stream, or pi-ai events, mapped to AG-UI events (D6). Use provider-native parts internally ([RUN-2]).
- **PRD refs:** [MODEL-2], [RUN-2], [STREAM-1], D5, D6.

### 1.8 Text-mode (JSON-in-text) tool calling
- **User intent:** Small local models without reliable native function calling can still use tools.
- **Observations:**
  - **[v0.7 choice]** **History.** Text mode was v0.7's *original* approach (v0.3–v0.5 era). It was replaced by native tool calling in Jan 2026 ("more robust native tool calling" in the changelog). At v0.7 the library still supported three modes (`native`, `text`, `off`), but the app only ever used `native` or `off`. Capability validation's error still suggested "text-based tool extraction" as the fallback when a model lacked `tools`.
  - **[v0.7 choice]** **Format v0.7 taught to the model:**
    - A fenced ```` ```json ```` block or an inline object: `{"type":"tool_calls","calls":[{"name":…,"args":{…}}]}`.
    - Tool signatures were rendered as TypeScript-like one-liners in the system prompt: `function name(param?: type, …): Promise<any>; // description`.
    - Dates had to be ISO 8601 strings.
  - **[v0.7 choice]** **v0.7's parsing approach:**
    - Strip `<think>` first, then parse.
    - Accept fenced and inline forms.
    - Remove parsed tool JSON from the visible answer.
    - Assign synthetic call ids per step.
    - The streaming detector matched only the exact prefix `{"type": "tool_calls"` with one space, which is brittle to whitespace.
    - Signatures lost nested types (`param?: object`), which made models guess argument shapes.
  - **[Fact]** A regex for inline JSON using `[^\]]*` breaks on nested arrays. Use a balanced-brace scanner.
- **How v0.7 did it (non-normative):** Prompt-injected signatures plus a post-hoc text and stream parser.
- **Known problems in v0.7:** Brittle regexes, no schema detail, and no retry on parse failure. Kept alive in code but unused.
- **Better options today:**
  - Most current local servers implement native tool calling from the chat template (llama.cpp `--jinja`, vLLM `--tool-call-parser`, Ollama, LM Studio), and grammar-constrained decoding (llama.cpp GBNF / JSON-schema `response_format`) can enforce valid calls.
  - Prefer native tools plus a capability flag. If a text fallback is ever needed, check whether the AI SDK or pi-ai provide a tool-call middleware rather than rebuilding one *(unsure what exists today)*.
- **PRD refs:** [MODEL-3] (tool-calling capability), [MODEL-2], [QA-6].

### 1.9 Model capability metadata and pre-dispatch validation
- **User intent:** The system knows what each model can do, and refuses a request it can't serve with a clear message instead of a cryptic provider error.
- **Observations:**
  - **[v0.7 choice]** **Fields v0.7 stored per model:**
    - Display name, provider, provider model id.
    - Input and output modalities (`text`, `image`, `audio`, `file`).
    - `streaming`, `tools`, `jsonSchema` (any JSON response format) and `structuredOutputs` (strict schema).
    - Reasoning `{supported, mode, disablePrefix}`.
    - `contextWindow` and `maxOutputTokens`.
    - Tokenizer `{type: tiktoken|sentencepiece|unknown, name}`.
    - Pricing per 1M input and output tokens.
    - Source `{url, format (gguf), quantization, sizeBytes, visionSizeBytes (mmproj), localPath, filename, architecture}`.
  - **[Rule RULE-AI-5]** When a request needs something the selected model can't do, the user MUST get one clear message that lists every unmet capability, not a provider error. This builds on [MODEL-3]'s pre-dispatch validation.
  - **[v0.7 choice]** **v0.7 validated before dispatch and listed all failures:**
    - An image part needs `image` input.
    - Tools need `tools`.
    - A `json_object`/`json_schema` response format needs `jsonSchema`, and a strict schema needs `structuredOutputs`.
    - Requested max output must not exceed the model max.
    - The estimated input must fit the context window.
  - **[v0.7 choice]** **Roles.** v0.7 had two (`backend` = chat, `workers` = processing/vision). The PRD expands these to many roles with fallbacks.
- **How v0.7 did it (non-normative):** A JSON model registry stored in the DB, plus a validator that threw a capability error.
- **Known problems in v0.7:**
  - Imports defaulted `tools: true` for all HF models and `reasoning.supported: false` for everything.
  - The tokenizer field was never used for estimation.
  - There was no locality or data-policy field.
  - Pricing was never imported.
  - Generation parameters were hard-coded (temperature 0.1, max output 2,000, 180 s timeout, 10 steps; harness 300 s).
- **Better options today:**
  - models.dev, an open catalogue of provider and model capabilities, limits and pricing. It is used by OpenCode and others *(check currency)*.
  - OpenRouter `/api/v1/models` (and `/endpoints` per model).
  - pi-ai's generated model registry.
  - The AI SDK's provider registry.
  - Import into the [MODEL-3] registry. Never treat imported flags as truth without an override.
- **PRD refs:** [MODEL-3], [MODEL-4], [MODEL-5], [MODEL-6], [MODEL-7].

### 1.10 Import from Hugging Face and OpenRouter
- **User intent:** Paste a Hugging Face or OpenRouter URL and get a correctly described model, including GGUF quant choices and memory needs.
- **Observations:**
  - **[Fact]** **Hugging Face model info.** `GET https://huggingface.co/api/models/{org}/{repo}` returns:
    - `tags` and `pipeline_tag`: `image-text-to-text` means vision.
    - `cardData.base_model`.
    - `gguf.context_length`.
    - `config.max_position_embeddings`.
    - 404 means not found. 403 means gated or private.
  - **[v0.7 choice]** As a last resort for context size, v0.7 ran a regex over the description for "NNk context". It told the user when a repo was gated or private.
  - **[Fact]** **Hugging Face file list.** `GET https://huggingface.co/api/models/{id}/tree/main`:
    - GGUF files are `*.gguf`, excluding `mmproj-*`.
    - The quant can be parsed from the filename (`Q4_K_XL`, `Q8_0`, `IQ4_XS`, `F16`, …).
    - If any `mmproj-*` files exist the model has vision.
    - **Split GGUFs** are named `-00001-of-0000N`.
  - **[v0.7 choice]** v0.7 sorted GGUF files by size and preferred `mmproj-F16.gguf`, then `mmproj-BF16.gguf`, then the first. It did not handle split GGUFs *(inferred gap)*.
  - **[Fact]** **Hugging Face architecture.** `GET https://huggingface.co/{id}/raw/main/config.json`:
    - GGUF repos (e.g. unsloth) often lack `config.json`, but the `base_model` repo has it.
    - Multimodal configs (Gemma 3) nest the text model's values under `text_config`.
    - Field aliases:
      - layers: `num_hidden_layers` / `n_layer` / `num_layers`
      - KV heads: `num_key_value_heads` / `n_head_kv` / `num_kv_heads`
      - heads: `num_attention_heads` / `n_head`
      - hidden size: `hidden_size` / `n_embd`
    - `head_dim`, or else `hidden_size / num_heads`.
    - `sliding_window` and `sliding_window_pattern`.
  - **[v0.7 choice]** v0.7 fell back to the `base_model` repo when `config.json` was missing, read `text_config` first, and defaulted `head_dim` to 128.
  - **[Fact]** The provider model id for llama.cpp `-hf` is `{repo}:{QUANT}`.
  - **[Fact]** **OpenRouter:**
    - `GET https://openrouter.ai/api/v1/models` returns the full list, to search by id. URL forms are `openrouter.ai/{org}/{model}` and `openrouter.ai/models/{org}/{model}`.
    - Vision: `architecture.input_modalities` includes `image`.
    - Tools and JSON: `supported_parameters` includes `tools` / `response_format`.
    - Context: `context_length`. Pricing is `pricing.prompt` / `completion`, per token *(field available; v0.7 ignored it)*.
  - **[v0.7 choice]** v0.7 used a short timeout (15 s) and a User-Agent for these fetches (starting point; tune).
- **How v0.7 did it (non-normative):** An inspect-then-confirm flow shared by the web UI and the CLI. The architecture fetch was duplicated in both.
- **Known problems in v0.7:**
  - Defaults were optimistic (`tools: true`, context 8192 when unknown).
  - Reasoning was never detected.
  - GGUF metadata in the file header was never read.
  - The import logic was duplicated.
- **Better options today:**
  - Read the GGUF header directly (`@huggingface/gguf` reads metadata over HTTP range requests, *check currency*). It gives the exact layer, head and context values and the chat template, with no `config.json` guessing.
  - The HF Hub JS client (`@huggingface/hub`) for listing and downloads.
  - The chat template (from GGUF or `tokenizer_config.json`) reveals tool and thinking support.
- **PRD refs:** [MODEL-3].

### 1.11 GGUF memory and VRAM estimation
- **User intent:** Before starting local models, the user learns whether the selection fits their GPU or unified memory, and why (weights, KV cache, vision), instead of hitting an OOM.
- **Observations:**
  - **[Fact]** **Formula:** `total = weights + KV + compute + vision`. The pieces grounded in the model format:
    - **Weights** ≈ GGUF file size.
    - **KV cache (known architecture, f16):** `2 (K+V) × layers × kv_heads × head_dim × context × 2 bytes`.
    - **KV cache with sliding-window attention** (Gemma 3): `full_layers = ceil(layers / pattern)`, `swa_layers = layers − full_layers`, and `tokens = full_layers × ctx + swa_layers × min(window, ctx)`. Then `KV = 2 × tokens × kv_heads × head_dim × 2`.
  - **[v0.7 choice]** **v0.7's heuristics for the other pieces** (starting point; tune):
    - **KV fallback (unknown architecture):** `4.5 GiB × (ctx / 32768) × (size_GB / 7)`. This is conservative, calibrated against Qwen3-14B at 40,960 ctx ≈ 6.4 GB KV and 7B at 32k ≈ 3 GB.
    - **Compute buffers:** a flat 500 MiB.
    - **Vision:** `mmproj_size + max(256 MiB, 0.20 × mmproj_size)`. Against the Gemma 3 4B measurement below, the estimate is about 14% over.
    - **Confidence:** high with architecture, medium with the size fallback, low with no size.
  - **[Fact]** **Measurements and calibration notes:**
    - Gemma 3 4B measured 812 MiB mmproj + 121 MiB compute.
    - Without SWA awareness, Gemma 3 at 131k ctx was estimated at about 20 GB against about 6 GB actual.
    - Qwen3 at 40k: estimated about 15 GB, actual about 15 GB.
  - **[Fact]** On Apple Silicon, Metal's `recommendedMaxWorkingSetSize` (printed by `llama-cli` on startup) gives the usable GPU memory. `system_profiler SPDisplaysDataType -json` reports GPU details on macOS.
  - **[v0.7 choice]** **v0.7's available-memory rules:**
    - Apple Silicon: parse `recommendedMaxWorkingSetSize`, otherwise fall back to 68% of RAM.
    - Discrete GPUs: total minus 512 MiB.
    - Only macOS was supported, through `system_profiler`.
  - **[Rule RULE-AI-6]** Before local models start, the user MUST see whether all the models that will run at once fit in available memory, with a breakdown of where the memory goes. Starting a selection that doesn't fit MUST require an explicit override.
  - **[v0.7 choice]** **v0.7's verdict:** OK at 2 GiB or more of headroom (starting point; tune), warning if tight or over. Start was refused unless `--force`. The check summed all models that run at once (assistant + processing).
- **How v0.7 did it (non-normative):** A CLI-side estimator used by `engine up` and `engine doctor`.
- **Known problems in v0.7:**
  - KV quantisation (`-ctk/-ctv q8_0`) was ignored.
  - Flash attention and the actual llama.cpp compute-buffer size were not modelled.
  - There was no Linux or NVIDIA detection.
  - A "danger" status was declared but never produced.
  - The embedding model was ignored (PRD D18 adds a third resident model).
- **Better options today:**
  - Read exact hyperparameters from the GGUF header (§1.10).
  - Check whether llama.cpp now offers a fit/dry-run option (e.g. `--fit` / memory-fit flags in recent builds, *unverified*).
  - Use `nvidia-smi --query-gpu=memory.total,memory.used --format=csv` on Linux.
  - Keep the formula as the explainable fallback: it is simple and was well calibrated.
- **PRD refs:** [MODEL-3] (memory estimate), [DEP-7], D18, [PROC-9].

### 1.12 Token estimation
- **User intent:** Prompts are budgeted to the model's context window, and history is trimmed before the server rejects the request.
- **Observations:**
  - **[v0.7 choice]** v0.7 used `tiktoken` with the model-specific encoding if the model name was known, else `cl100k_base`.
  - **[v0.7 choice]** v0.7's overheads: per message +4 tokens plus the role, plus 2 for reply priming. Each image counted a flat 85 tokens. Reasoning text counted.
  - **[v0.7 choice]** If tiktoken failed, v0.7 fell back to `chars / 4`.
  - **[v0.7 choice]** In v0.7, "fits" meant `estimated ≤ context − max_output` (default reserve 2,000; starting point; tune).
  - **[Fact]** Limits: tiktoken is wrong for Llama, Qwen and Gemma tokenisers (often by 10–30% *(inferred)*). 85 tokens per image is badly low for modern VLMs (hundreds to thousands per image *(inferred)*).
  - **[v0.7 choice]** The tokenizer field in v0.7's registry was never consulted.
- **How v0.7 did it (non-normative):** A synchronous estimator with WASM tiktoken, freed per call.
- **Known problems in v0.7:** No safety margin per tokenizer family, no use of server tokenisation, and no learning from actual `usage.prompt_tokens`.
- **Better options today:**
  - Use the server: llama-server `POST /tokenize`, Anthropic's token-counting endpoint, and Ollama's prompt eval counts.
  - Pure-JS tokenisers such as `gpt-tokenizer` (no WASM) for OpenAI families, and `@huggingface/transformers` tokenisers for open models.
  - Calibrate the estimate from the last call's reported `prompt_tokens`, with a margin of about 10–15%.
- **PRD refs:** [RUN-6], [MODEL-3] (tokenizer), [MODEL-7].

---

## 2. External CLI harnesses (Claude Code, Codex, OpenCode, Pi)

### 2.1 Common integration lessons
- **User intent:** A user who already has Claude Code or Codex (and their subscriptions) can use them as an Eclaire agent's brain.
- **Observations:**
  - **[Fact]** **Two process models:**
    - **One-shot:** spawn per turn, read JSONL from stdout, exit.
    - **Long-lived:** Codex app-server, JSON-RPC over stdio.
  - **[v0.7 choice]** v0.7 serialised app-server turns per thread with a per-thread mutex.
  - **[Fact]** Prompt delivery is per CLI: as an argument after `--`, or on stdin.
  - **[v0.7 choice]** v0.7's timeouts: 5 min default per call (starting point; tune). On cancel it sent SIGTERM, then SIGKILL after a 2 s grace period. It collected stderr for diagnostics.
  - **[v0.7 choice]** v0.7 injected harness env vars per provider, with `${ENV:…}` interpolation.
  - **[v0.7 choice]** **v0.7's decoded event vocabulary** (a useful mapping target):
    - started (session id plus meta: model, cwd, tools, permission mode)
    - content delta
    - reasoning delta
    - action started/completed (tool name, id, input, ok)
    - usage (input and output tokens, cost)
    - completed (answer, session id, ok)
    - error
  - **[v0.7 choice]** If the harness streamed no text deltas, v0.7 used the final `result` text as the answer. If it did stream them, v0.7 didn't duplicate them.
- **How v0.7 did it (non-normative):** Harnesses were "providers" with a CLI config (command, static args, prompt mode, env, timeout). Per-CLI decoders turned output into an internal event list, which was re-encoded as SSE.
- **Known problems in v0.7 (important):**
  - **Only the last user message was sent.** The system prompt (including the minimal harness prompt v0.7 built) and the conversation history were **dropped**.
  - Session resume plumbing existed in the library, but the app never stored or passed the harness session id, so every turn started a fresh session.
  - Harness agents were *forbidden* Eclaire tools and skills: no MCP was wired in. A harness agent could not see the user's data.
  - Codex app-server approvals were **auto-approved by default**. The PRD makes auto-approve off by default.
  - There were no decoder tests for Claude or OpenCode output.
- **Better options today:** See the per-harness entries below. In general, use the harness's SDK or RPC mode, pass Eclaire's MCP server plus a scoped token, store the native session id on the thread, and route pre-tool-use hooks into Eclaire approvals ([INTEROP-2]).
- **PRD refs:** [INTEROP-0], [INTEROP-1], [INTEROP-1a], [INTEROP-2], B.9, [RUN-4], [APPR-1].

### 2.2 Claude Code
- **Observations:**
  - **[Fact]** **Invocation:** `claude -p --output-format stream-json --verbose [--resume <session_id>] [--model <m>] -- "<prompt>"`. `--verbose` is required for stream-json in print mode.
  - **[Fact]** **Events (one JSON object per line):**
    - `{"type":"system","subtype":"init","session_id","model","cwd","tools":[…],"permissionMode"}`
    - `{"type":"assistant","message":{"content":[…]},"parent_tool_use_id","session_id"}`, where blocks are `text`, `thinking` (`thinking`, `signature`) and `tool_use` (`id`, `name`, `input`). A non-null `parent_tool_use_id` marks sub-agent activity.
    - `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id","content","is_error"}]}}`
    - `{"type":"result","subtype","session_id","result","is_error","duration_ms","duration_api_ms","num_turns","total_cost_usd","usage":{input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens}}`
  - **[Fact]** Partial token streaming is enabled with `--include-partial-messages`, which emits `stream_event` lines. Without it, text arrives one assistant message at a time.
  - **[v0.7 choice]** **What v0.7 decoded:** the session id, text, thinking text, tool_use start (with input and parent id), tool_result ok/error, input and output tokens, cost, final result.
  - **[v0.7 choice]** **What v0.7 dropped:** thinking `signature`, tool_result *content*, cache token counts, durations, `num_turns`, and other system subtypes. It did not use partial token streaming.
- **Known problems in v0.7:** No `--append-system-prompt` / `--system-prompt`, no `--mcp-config`, no `--allowedTools` / `--permission-mode`, and no `--permission-prompt-tool` for approvals.
- **Better options today:**
  - The **Claude Agent SDK** (TypeScript) instead of shelling out. It gives in-process MCP servers, `canUseTool` / `PreToolUse` hooks that map onto Eclaire approvals, session resume and fork, streaming partial messages, and system prompt control.
  - The PRD's launch target also needs a Claude Code *plugin* bundling the MCP config and the Eclaire skill ([INTEROP-1a]).
  - Verify the flag names against the current CLI.
- **PRD refs:** [INTEROP-1a], [INTEROP-2], D5.

### 2.3 Codex (`codex exec`)
- **Observations:**
  - **[Fact]** **Invocation:** `codex [extra args, e.g. -m <model>] exec --json --skip-git-repo-check --color=never -`, with the prompt on **stdin**. Resume replaces the trailing `-` with `resume <thread_id> -`.
  - **[v0.7 choice]** v0.7 passed the model through static args.
  - **[Fact]** **Events:**
    - `thread.started` (`thread_id`): the session id.
    - `turn.started`.
    - `turn.completed` (`usage.input_tokens`, `cached_input_tokens`, `output_tokens`).
    - `turn.failed` (`error.message`).
    - `error` (`message`).
    - `item.started` / `item.updated` / `item.completed` with an `item` of one of these types:
      - `agent_message` (`text`)
      - `reasoning` (`text`)
      - `command_execution` (`command`, `aggregated_output`, `exit_code`, `status`)
      - `file_change` (`changes[{path,kind}]`, `status`)
      - `mcp_tool_call` (`server`, `tool`, `arguments`, `status`)
  - **[v0.7 choice]** v0.7 used `agent_message` only on completed. **It dropped** `aggregated_output`, MCP call arguments, cached tokens, other item types (e.g. web search, to-do list *(inferred)*). Agent text was not streamed incrementally.
- **Better options today:** Prefer app-server (next) or the Codex TypeScript SDK (`@openai/codex-sdk`, which wraps `exec` JSON, *check currency*).
- **PRD refs:** [INTEROP-2].

### 2.4 Codex app-server (JSON-RPC over stdio)
- **Observations (as v0.7 implemented it; partly stale, see below):**
  - **[Fact]** Spawn `codex app-server` and speak JSON-RPC 2.0 line-delimited over stdio. Classify each message:
    - `id` + `method` without `result` is a server request.
    - `method` without `id` is a notification.
    - `id` with `result` or `error` is a response.
  - **[Fact]** **Handshake:** an `initialize` request with `clientInfo {name, title, version}` (optional `capabilities.experimentalApi`), then an `initialized` notification.
  - **[Fact]** **Threads:** `thread/start` (→ thread id) and `thread/resume {threadId}`.
  - **[Fact]** **Turns:** `turn/start {threadId, input:[{type:"text",text}]}`.
  - **[Fact]** **Notifications v0.7 decoded:**
    - `item/started`, `item/completed` (same item shapes as exec)
    - `item/agentMessage/delta {itemId, delta}`
    - `item/reasoning/delta`
    - `turn/completed {usage}`
    - `turn/failed {error}`
  - **[Fact]** Several threads can share one app-server process, so events must be filtered by `threadId`.
  - **[Fact]** **Approvals** arrive as a server request.
  - **[v0.7 choice]** v0.7 assumed the approval request was `approval/requested` and replied `{approved:true|false}`.
  - **[v0.7 choice]** **Restart:** on crash, v0.7 restarted up to 3 times with exponential backoff from 1 s (starting point; tune). Requests timed out.
- **Known problems in v0.7:**
  - The method names and shapes are probably **out of date**. Current app-server docs (checked 2026-11) show:
    - Command approvals as the server request `item/commandExecution/requestApproval`, answered with the decisions `accept` / `decline` / `cancel`.
    - Thread results carrying a `thread` object.
    - Many more methods: `thread/fork`, `thread/list`, `thread/read`, `mcpServer/*`, `turn/interrupt`.
  - v0.7 also sent `turn/start` as a *notification* rather than a request.
  - Auto-approve was the default.
  - Abort only stopped reading. It did not interrupt the turn.
- **Better options today:**
  - Generate the protocol types from the installed binary (`codex app-server generate-ts` / `generate-json-schema`, *verify the subcommand names*) and pin a tested Codex version.
  - Map approval requests onto Eclaire's approval records. Use `turn/interrupt` for [RUN-4].
- **PRD refs:** [INTEROP-2], [RUN-4], [APPR-2], D5.

### 2.5 OpenCode
- **Observations:**
  - **[Fact]** **Invocation:** `opencode run --format json [--session <id>] [--model <provider/model>] -- "<prompt>"`.
  - **[Fact]** **Events:** each has `type`, `timestamp` and `sessionID`. The first `sessionID` seen is the session.
    - `step_start`: a step begins (v0.7 emitted started).
    - `text` (`part.text`): answer text (v0.7 appended it to the answer).
    - `tool_use` (`part.callID|id`, `part.tool`, `part.state{status: pending|running|completed|error, input, output, title, error, metadata.exit}`).
    - `step_finish` (`part.reason`): only `reason:"stop"` completes the turn. Other reasons, such as `tool-calls`, are intermediate steps.
    - `error`: the message may be a string, or an object with `data.message` / `message` / `name`.
  - **[v0.7 choice]** **What v0.7 dropped:** tool output and title, token and cost info from `step_finish` *(inferred present)*.
- **Better options today:** OpenCode's HTTP server mode (`opencode serve`) and its JS SDK expose sessions and events with richer structure *(check currency)*.
- **PRD refs:** [INTEROP-2].

### 2.6 Pi (not implemented in v0.7; findings for the rebuild)
- **User intent:** Pi is a launch interop target ([INTEROP-0]).
- **v0.7:** Mentioned only in a comment. There was no integration.
- **Observations (current as of 2026-11, checked against the pi-mono docs):**
  - **[Fact]** **Package:** `@earendil-works/pi-coding-agent` (previously published under `@mariozechner/…`).
  - **[Fact]** **Modes:** interactive, print/JSON, **RPC**, and **SDK**.
  - **[Fact]** **RPC mode:** `pi --mode rpc [--no-session] [--provider …] [--model …] [--session-dir …]`. It is JSON lines over stdin/stdout and splits on LF only (Node `readline` is noted as non-compliant).
    - Commands include `prompt`, `steer`, `follow_up`, `abort`, `new_session`, `switch_session`, `fork`, `get_state`, `get_messages`, `set_model`, `set_thinking_level`, `compact`.
    - Events include `message_update`, `agent_end` and `agent_settled`.
    - Extension UI prompts arrive as `extension_ui_request` and are answered with `extension_ui_response`.
    - For Node hosts the docs recommend embedding `AgentSession` from the SDK instead of spawning.
  - **[Fact]** **Extensions:** TypeScript modules auto-loaded from `~/.pi/agent/extensions/` or `.pi/extensions/` (the latter only after project trust), or from npm/git "Pi packages".
    - `pi.registerTool({name, label, description, parameters (TypeBox), execute, promptSnippet, promptGuidelines})`.
    - Lifecycle events include `tool_call`, which can `{block:true, reason}` or mutate input. This is the approval hook.
    - Also `tool_result`, `before_agent_start`, `context`, `before_provider_request` and session events.
  - **[Fact]** **MCP:** The extension API has `pi.registerMcpServer` and there is a built-in MCP extension. This conflicts with older messaging that "core has no MCP", so re-verify at build time.
  - **[Fact]** Pi has **no built-in permission system**: gates are built in `tool_call` handlers.
  - **[Fact]** **Skills:** supported, SKILL.md style.
- **Implication:** For [INTEROP-1a] the cleanest Pi path is likely a Pi package that bundles the Eclaire skill plus an extension that either registers the Eclaire MCP server or registers CLI-backed tools, with a `tool_call` gate calling Eclaire's approval API. For [INTEROP-2], use the SDK in-process or RPC from a worker.
- **PRD refs:** [INTEROP-0], [INTEROP-1a], [INTEROP-2], decision #15.

### 2.7 Session resume (all harnesses)
- **Observations:**
  - **[Fact]** Resume mechanism per harness:

    | Harness | Resume mechanism |
    |---|---|
    | Claude Code | `--resume <session_id>` (from `system/init` or `result`) |
    | Codex exec | `exec … resume <thread_id> -` |
    | Codex app-server | `thread/resume {threadId}` |
    | OpenCode | `--session <id>` |
    | Pi RPC | `switch_session` / session dir |

  - **[Fact]** Sessions live in the harness's own store on the host. Resuming on another worker host fails unless the store is shared *(inferred)*.
- **Known problems in v0.7:** The id was never persisted (§2.1).
- **Better options today:** Persist `{runtime, native_session_id, host}` on the thread. If the native session is missing, fall back to replaying the canonical transcript as context ([INTEROP-2]).
- **PRD refs:** [INTEROP-2], [RUN-1], [RUN-3].

---

## 3. Tools, MCP and browsing

### 3.1 MCP client: modes, flags, filtering
- **User intent:** Admins plug in external MCP servers (local stdio or remote HTTP) and the assistant gains their tools, with control over which tools appear and where they are allowed.
- **Observations:**
  - **[Fact]** **Transports:** stdio (`command`, `args`, `env`), streamable HTTP, legacy SSE.
  - **[v0.7 choice]** **Timeouts:** connect 15 s, tool call 60 s (starting point; tune).
  - **[v0.7 choice]** **v0.7's tool modes** (now listed in [TOOL-5]):
    - **individual:** each MCP tool becomes an agent tool, optionally prefixed `prefix_toolname`.
    - **grouped:** one dispatcher tool with `{action: enum[tool names], args: object}`. Its description lists every action with its description. This saves context with large servers. Unknown actions return an error listing the valid ones.
    - **managed:** no auto-discovery. A hand-written first-party tool drives the server (this is how Chrome control worked).
  - **[v0.7 choice]** **Other per-server options:** `allowedTools` / `blockedTools`, `accessLevel` (read/write, default write), `promptSnippet` / `promptGuidelines`, `enabled`, `autoConnect`.
  - **[v0.7 choice]** **v0.7's availability flags** (generic enforcement is required by [TOOL-5]):
    - `requireLocal`: disabled when running in a container.
    - `requireHumanAuth`: only with a human, session-authenticated caller.
    - `disableInBackground`: not in background task runs.
  - **[v0.7 choice]** **Availability states:** `available`, `setup_required` (the stdio command was not found, with an "Install X" message) or `disabled` (with a reason).
  - **[Fact]** MCP tool results carry content blocks (text, image and others) and an `isError` flag. `tools/call` accepts request metadata in `_meta`.
  - **[v0.7 choice]** **v0.7's result handling:** it kept text and image content blocks. If none were present, it serialised the whole result as text. It honoured `isError` and forwarded caller identity as `_meta` (userId) on `tools/call`.
  - **[v0.7 choice]** v0.7 passed the raw MCP `inputSchema` through to the model unchanged.
- **How v0.7 did it (non-normative):** The official MCP TS SDK client, a registry built at startup from the DB (falling back to a JSON file), and a synthesised Chrome DevTools entry.
- **Known problems in v0.7:**
  - `requireHumanAuth` and `disableInBackground` were declared but only enforced inside the Chrome tool, not generically.
  - The DB loader dropped most options (prefix, allow/block lists, access level, env, tool timeout).
  - There was no OAuth and no header auth for HTTP servers.
  - No resources or prompts.
  - Discovery happened once at startup, so `tools/list_changed` was ignored.
  - Connections were per process, not per user.
- **Better options today:**
  - The official `@modelcontextprotocol/sdk` client with the MCP authorization spec (OAuth 2.1), `list_changed` handling, and resources and prompts (D7).
  - Map `effect` from MCP tool annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`) with an admin override ([TOOL-5]).
  - Grouped mode is still a sensible context-saving option. Also consider deferred tool loading, a "search tools" meta-tool.
- **PRD refs:** [TOOL-5], [TOOL-1], [TOOL-6], [APPR-1], D7.

### 3.2 Chrome DevTools MCP (live Chrome control)
- **User intent:** When the user is present, the assistant can act in the user's own logged-in Chrome: list tabs, open, navigate, snapshot, click, fill, press keys, screenshot, close.
- **Observations:**
  - **[Fact]** **Server:** `chrome-devtools-mcp --autoConnect` over stdio attaches to the running Chrome.
  - **[v0.7 choice]** v0.7 resolved the command from PATH or local `node_modules/.bin`.
  - **[Fact]** **Underlying MCP tools v0.7 used:** `list_pages`, `new_page {url}`, `select_page`, `close_page`, `navigate_page {url}`, `take_snapshot`, `click {uid}`, `fill {uid, value}`, `press_key {key}`, `take_screenshot`.
  - **[Fact]** **Output parsing:** read `structuredContent` first. The text output format changed between versions (`N: title (url) [selected]` versus `N: url [selected] isolatedContext=…`), so keep a text fallback and test it.
  - **[Fact]** Click and fill require an element ref from a fresh snapshot. Tab ids must come from the tab list.
  - **[v0.7 choice]** **v0.7's other guardrails:**
    - Interactive human sessions only, never in background runs (now required by [TOOL-4] and [TOOL-5]).
    - Only `http`/`https` URLs.
    - Session state was keyed per conversation.
  - **[v0.7 choice]** v0.7 returned screenshots as image content (see [TOOL-6]).
- **Known problems in v0.7:**
  - "Human present" was inferred from the auth method (session/localhost).
  - Access level was `read` even though click and fill are writes.
  - There was no approval.
  - Only one Chrome per host.
- **Better options today:**
  - Chrome DevTools MCP is still the standard for attaching to a user's Chrome *(check flag names)*. Playwright MCP is the option for sandboxed headless use.
  - Classify click and fill as `external` effect with `ask` ([APPR-1]). Use [TOOL-5]'s `requires_human_present`.
- **PRD refs:** [TOOL-4] (browser automation), [TOOL-5], [APPR-1], [PRIN-10].

### 3.3 `agent-browser` CLI for read-only web browsing
- **User intent:** The assistant can research the public web (open, read, screenshot) without touching the user's browser.
- **Observations:**
  - **[Fact]** **CLI (vercel-labs `agent-browser`):**
    - Base flags: `agent-browser --session <name> --profile <dir> --screenshot-dir <dir> --max-output <n> <command>`.
    - Commands: `open <url>`, `snapshot [-i] [-c] [-s <css>]` (`-i` gives interactive elements with `@refs`, the default; `-c` gives compact output), `wait --load <state>|--text <t>|--url <u>|<ms>`, `get title|url|text|html [<selector>]` (a selector is required for text and html), `screenshot <path> [--full]`, `close`.
  - **[v0.7 choice]** v0.7 passed `--max-output 12000`. Its session name was `eclaire-<sanitised conversation id>`, at most 48 characters, with one profile directory per session. Its timeout was the page-navigation timeout.
  - **[v0.7 choice]** **v0.7's SSRF guard (hostname-level; SSRF protection itself is required by [PROC-10] and PRD §8):**
    - Only `http`/`https`, with no credentials in the URL.
    - Blocked hostnames: `localhost`, `0.0.0.0`, `host.docker.internal`, `gateway.docker.internal`, and `*.localhost`, `*.local`, `*.internal`, `*.home.arpa`, `*.lan`.
    - Blocked IPv4: 10/8, 127/8, 0/8, 169.254/16, 192.168/16, 172.16/12.
    - Blocked IPv6: `::1`, `fc*`, `fd*`, `fe80:`.
  - **[v0.7 choice]** v0.7's web browsing was explicitly read-only: no clicks, form fills, logins or downloads.
- **Known problems in v0.7:**
  - The SSRF guard did not cover DNS rebinding, redirects to private addresses, IPv4-mapped IPv6 or CGNAT 100.64/10. It needs to be enforced at the egress proxy ([PRIN-10]).
  - Screenshots were returned as a *file path*, not an image the model could see ([TOOL-6]).
  - The prompt told the model to "load the `agent-browser` skill", which Eclaire did not ship.
- **Better options today:** Run `agent-browser` or Playwright in the sandboxed browser pack behind an egress proxy. Add simple `web.fetch` / `web.readable` / `web.search` tools ([TOOL-4]), which cover most research needs more cheaply than a browser.
- **PRD refs:** [TOOL-4], [TOOL-6], [PRIN-10], [QA-4].

### 3.4 Tool catalogue (capability checklist, not a design)
- **User intent:** The assistant can do everything the UI can do on the user's data, with destructive actions confirmed.
- **Observations:**
  - **[Rule RULE-AI-7]** Anything a user can do to their own data in the UI MUST also be possible for the assistant, under the same permissions and approval policy. The rows marked RULE-AI-7 below are the coverage checklist.
  - **[v0.7 choice]** v0.7's access level was `read` or `write`. The approval default was a static per-tool flag, and admin-scoped tools were filtered by role and API-key scopes.
  - **[v0.7 choice]** v0.7 had hand-written tools per kind. The PRD replaces most of them with generated tools ([TOOL-3]). Use this list to check coverage. Every tool name, access level and approval default in the table is a **[v0.7 choice]**. The last column names the requirement that covers the underlying capability.

  | v0.7 tool | Intent | Access | Approval | Label | Capability covered by |
  |---|---|---|---|---|---|
  | findContent | Search all content (type, text, tags, date range) | read | no | [v0.7 choice] | RULE-AI-7 |
  | findTasks | Task search by status, attention, schedule type, delegate mode | read | no | [v0.7 choice] | RULE-AI-7 |
  | getNote / getBookmark / getDocument / getPhoto / getMedia / getTask | Full item details (note content, media transcript, task with comments) | read | no | [v0.7 choice] | RULE-AI-7 |
  | getTaskComments | Comments on a task | read | no | [v0.7 choice] | RULE-AI-7 |
  | getDueItems | Overdue, due today and due this week, across types | read | no | [v0.7 choice] | RULE-AI-7 |
  | getHistory | Recent create/update/delete activity | read | no | [v0.7 choice] | RULE-AI-7 |
  | getProcessingStatus | Per-item or overall processing status, for diagnosis | read | no | [v0.7 choice] | RULE-AI-7 |
  | listTags | Existing tags, filtered by type or sorted by popularity | read | no | [v0.7 choice] | RULE-AI-7 |
  | getUserSettings | Profile: name, bio, time zone, city, country, email | read | no | [v0.7 choice] | RULE-AI-7 |
  | getMediaInfo | Preview media URL metadata without downloading | read | no | [v0.7 choice] | not required |
  | createNote / createBookmark / createTask | Create items (a task covers reminders, scheduled and recurring agent work) | write | no (prompt says "confirm first") | [v0.7 choice] | RULE-AI-7 |
  | updateNote / updateBookmark / updateDocument / updatePhoto / updateMedia / updateTask | Edit fields, tags, due date, status, schedule (pause recurring with `scheduleType='none'`) | write | no | [v0.7 choice] | RULE-AI-7 |
  | deleteNote / deleteBookmark / deleteDocument / deletePhoto / deleteMedia / deleteTask | Permanent delete, including stored files | write | **yes** | [v0.7 choice] | RULE-AI-7 |
  | quickAction | Flag, pin or set review status on any item | write | no | [v0.7 choice] | RULE-AI-7 |
  | addTaskComment | Comment on a task | write | no | [v0.7 choice] | RULE-AI-7 |
  | importMediaUrl | Import audio or video from a URL (yt-dlp); processing runs in the background | write | no | [v0.7 choice] | RULE-AI-7 |
  | sendNotification | Message the user's configured channels | write | **yes** | [v0.7 choice] | [TOOL-4] |
  | updateUserSettings | Change profile fields (show current vs proposed first) | write | no | [v0.7 choice] | RULE-AI-7 |
  | transcribeAudio | Speech-to-text on a stored media item (only if the audio service is present) | read | no | [v0.7 choice] | [TOOL-4] |
  | synthesizeSpeech | Text-to-speech, returning an audio file path (only if the audio service is present) | write | no | [v0.7 choice] | [TOOL-4] |
  | browseWeb | Read-only public web via agent-browser | read | no | [v0.7 choice] | [TOOL-4] |
  | browseChrome | Act in the user's live Chrome (human sessions only) | read (sic) | no | [v0.7 choice] | [TOOL-4] |
  | loadSkill | Load a skill body on demand (progressive disclosure) | read | no | [v0.7 choice] | [TOOL-4], [SKILL-1] |
  | manageAdminRead | List/get providers, models, MCP servers, selection, instance settings, users, presets | read (admin only) | no | [v0.7 choice] | [TOOL-4] |
  | manageAdminWrite | CRUD on providers, models and MCP servers; set selection; settings; users; imports | write (admin only) | **yes** | [v0.7 choice] | [TOOL-4] |
  | MCP tools | Per server config | server `accessLevel` | no | [v0.7 choice] | [TOOL-5] |

- **Known problems in v0.7:**
  - Most writes relied on *prompt text* ("Always confirm with the user before …") rather than policy. That text is meaningless in background runs.
  - Approvals had a 5-minute in-memory timeout. Background runs got "requires approval" errors.
  - Sending notifications and browsing are really `external` effects.
  - The six create/update/delete copies per kind are the N×6 problem.
- **Better options today:** One registry with `effect` and policy-based approvals ([TOOL-1], [APPR-1]), exposed identically over MCP ([TOOL-2]). Pi's `registerTool` shape (`promptSnippet`, `promptGuidelines`) shows the same "per-tool prompt guidance" idea is mainstream.
- **PRD refs:** [TOOL-1]–[TOOL-4], [TOOL-6], [APPR-1]–[APPR-5], [AGENT-2].

---

## 4. Prompts and skills

### 4.1 System prompt intent
- **User intent:** The assistant knows who the user is and what time it is. It links to items the user can click, schedules and delegates work correctly, never claims actions it didn't take, and doesn't talk about its internals.
- **Observations (verbatim v0.7 text in Appendix A):**
  - **[Rule RULE-AI-8]** The assistant MUST NOT tell the user an action was done unless it was actually performed and succeeded in that run.
  - **[Rule RULE-AI-9]** The assistant MUST know the current date and time and the user's time zone, and MUST resolve relative times ("tomorrow at 9", "in 3 days") against them before acting.
  - **[v0.7 choice]** **Base:** the agent's own instructions, else "You are a helpful assistant [talking to <display name>]". v0.7 added the current date (long form, US locale) plus an ISO timestamp, and user profile lines (display name, full name, bio, city, country, time zone, an admin role marker).
  - **[v0.7 choice]** **Content links:** whenever the model mentioned an item found via tools, it had to write `/{type}/{id}` with the exact id (`/notes/note-…`, `/bookmarks/bm-…`, `/documents/doc-…`, `/photos/photo-…`, `/tasks/task-…`). No markdown links, no external URLs, each link once. The UI turned these into clickable chips. This block was only included when content tools were present. (Clickable references to retrieved items are required by [MEM-1].)
  - **[v0.7 choice]** **Scheduling and delegation** (only when the task-creation tool was present):
    - "Everything is a task." Delegate modes were `manual`, `assist` (agent works, user reviews) and `handle` (autonomous).
    - Intent cues: "do this for me" meant handle, "help me draft" meant assist, personal to-dos were manual.
    - One-off reminder: `one_time` + ISO datetime + notification delivery. Recurring agent work: cron + agent + handle.
    - Convert relative times to absolute ISO using the user's time zone. Common cron examples.
    - Compound recipes ("follow up if no reply in 3 days", "every Monday review PRs"). Pause by clearing the schedule type.
  - **[v0.7 choice]** **Communication style:** never name tools or mechanics ("Let me check your settings", not "I'll use getUserSettings"). Use UI navigation phrasing ("Settings > Channels"). Never claim an action without a successful tool call in this turn.
  - **[v0.7 choice]** v0.7 added a **read-only notice** when the caller's scopes lacked write. **Referenced content:** attached items were inlined, each truncated at 4,000 characters, with "use as primary source" guidance.
  - **[v0.7 choice]** **Background variant:** "you have been assigned to work on a task", with steps (analyse, search related content, give an actionable response) and content links. It had no communication-style or scheduling blocks.
  - **[v0.7 choice]** **Off variant** (no tools): "be conversational and answer directly".
  - **[v0.7 choice]** **External-harness variant:** base, date, profile and referenced content only. Background added "Complete the task described above". (It never reached the harness, see §2.1.)
  - **[v0.7 choice]** **Order:** base, then style, links, scheduling, then the skills catalogue, always-include skill bodies, tool snippets, and finally a bulleted "Tool Guidelines" list aggregated from every tool.
- **Known problems in v0.7:**
  - The profile was concatenated free text ([MEM-3] wants structured data).
  - A per-request date in the system prompt defeats prompt caching. Put volatile context last or in a user-turn preamble.
  - The aggregated "confirm with the user" guidelines contradict background autonomy.
  - Prompts weren't versioned or evaluated.
- **Better options today:**
  - Versioned prompt templates with eval baselines ([QA-6], [PRIN-12]).
  - Content references as structured `citation` parts ([MEM-1], [RUN-2]) instead of a textual `/type/id` convention. Keep a text fallback for channels and harnesses.
  - Surface hints per channel ([RUN-6]).
- **PRD refs:** [RUN-6], [MEM-1], [MEM-3], [TASK-1], [TASK-2], [AGENT-1], [APPR-5].

### 4.2 Skills (SKILL.md)
- **User intent:** Admins and users drop in SKILL.md folders to teach the assistant procedures, loaded only when relevant.
- **Observations:**
  - **[Fact]** **Layout (SKILL.md convention):** `<skills-dir>/<name>/SKILL.md`. The frontmatter `name` must equal the directory name (at most 64 characters). `name` and `description` are the core frontmatter fields.
  - **[v0.7 choice]** v0.7 skipped a skill whose `name` didn't match and truncated `description` at 512 characters.
  - **[v0.7 choice]** **Extra frontmatter fields v0.7 used:** `tags` (inline array) and `alwaysInclude` (camelCase in v0.7; the PRD says `always_include`, so accept both).
  - **[Fact]** **Progressive disclosure** is part of the SKILL.md convention: a catalogue of names and descriptions sits in context and the body is loaded on demand.
  - **[v0.7 choice]** **v0.7's progressive disclosure:**
    - The system prompt listed `- name: description` for enabled skills, plus "Use the loadSkill tool …".
    - `alwaysInclude` bodies were appended inline.
    - Loading a skill returned the body without frontmatter.
    - Enabling any skill auto-added the load tool.
    - The load tool refused skills not enabled for the agent.
  - **[v0.7 choice]** **Sources and precedence (first registered wins; duplicates logged and ignored):**
    1. The instance config skills dir (admin scope).
    2. An admin-configured skills dir (admin).
    3. Local mode only: `~/.agents/skills` (user), then custom user dirs.
  - **[v0.7 choice]** **Admin-only skills:** a fixed set (`admin-guide`) was filtered out for non-admins (enforcement in every path is required by [SKILL-2]).
  - **[v0.7 choice]** **Shipped skills (5):**
    - **admin-guide:** walks admins through adding AI providers (dialects, URLs, auth), adding and importing models, model selection for the assistant and processing roles, MCP servers and instance settings, with step-by-step workflows. Admin only.
    - **media-guide:** explains media items (upload or URL import from YouTube, Vimeo, SoundCloud…), the processing pipeline (metadata, waveform, transcript) and what users can do and organise. Includes tips for helping users.
    - **product-guide:** an overview of the six content types, organisation features (tags, pin, flag, due, review), search, tasks and delegation, channels, and best practices to suggest.
    - **settings-guide:** what the assistant can change directly (profile fields, after showing current vs proposed) versus what needs the UI (Account, Appearance, API keys, Channels, Assistants), with canned request handling such as "passwords only via Settings > Account".
    - **troubleshooting:** a diagnostic playbook for processing failures, channel connectivity, browser automation (Chrome MCP must be configured by an admin) and audio (the service and models must be configured).
- **How v0.7 did it (non-normative):** A directory scanner with a minimal hand-rolled YAML parser, cached until a source was added.
- **Known problems in v0.7:**
  - The hand-rolled YAML parser handled no multi-line values.
  - There was no `allowed-tools` / required-tools field ([SKILL-3]).
  - Bundled files and scripts were not exposed.
  - No per-space skills. Harness agents could not use skills.
  - The shipped skills describe v0.7's UI and will need rewriting.
- **Better options today:**
  - Follow the open Agent Skills spec (agentskills.io; Anthropic's SKILL.md format, adopted by Claude Code, Codex, Pi and others, *check the spec's current field list*: `name`, `description`, optional `license`, `allowed-tools`, `metadata`).
  - Parse with a real YAML library.
  - Expose skills as MCP prompts (P1, [INTEROP-1]) and ship the Eclaire skill to harnesses ([INTEROP-1a]).
- **PRD refs:** [SKILL-1]–[SKILL-3], [INTEROP-1], [INTEROP-1a].

---

## 5. CLI engine, setup and models

### 5.1 Local llama.cpp management (`engine` commands)
- **User intent:** One command starts, stops and checks the local inference server with the selected models, after confirming they fit in memory.
- **Observations:**
  - **[v0.7 choice]** **v0.7's commands:**
    - `engine doctor`: checks the `llama-server` binary (fix: `brew install llama.cpp`), managed-engine config, model selection, model files present, port conflicts, GPU memory and system memory. Each check is pass, warn or fail, with a fix line. Exits non-zero on any failure.
    - `engine status [--json]`.
    - `engine up [--foreground] [--force]`: runs the memory pre-flight, then starts the server.
    - `engine down [--force]`: SIGTERM, wait 10 s, then SIGKILL (immediate with `--force`).
    - `engine logs [-n N] [-f]`.
    - `engine pull <org/repo/file.gguf | HF resolve URL> [--model-id <id>]`: downloads, then records the local path and size on the model.
  - **[Fact]** **llama-server launch flags:**
    - `llama-server --port <p> --host <addr>`, then:
      - one model: `-hf <repo:QUANT>`
      - several models: no model at all (**router mode**, which auto-discovers cached models)
    - Settings: `-ngl <gpuLayers>` (-1 = all), `-c <ctx>`, `-ub <batch>` (ubatch, not `-b`), `-fa on|off`.
    - Notes: repeating `-hf` is deprecated, and comma-separated `-hf` means speculative decoding.
  - **[v0.7 choice]** v0.7 bound to `127.0.0.1`, used `-hf` for one model and router mode for several, and passed extra args through.
  - **[Fact]** **Health:** llama-server exposes `GET /health`.
  - **[v0.7 choice]** v0.7 polled `/health` every 500 ms for up to 60 s (starting point; tune), and detected early exit.
  - **[v0.7 choice]** **State:** PID and log files under `~/.eclaire/{pids,logs}`. Models went in `~/.eclaire/models`.
  - **[Fact]** **Downloads:** `huggingface-cli download <repo> <file> --local-dir …` supports resume and auth. Direct HTTPS download is `https://huggingface.co/{repo}/resolve/main/{file}`.
  - **[v0.7 choice]** v0.7 preferred `huggingface-cli`, fell back to the direct HTTPS download, and skipped files already present.
  - **[v0.7 choice]** In v0.7, all active models had to share one managed provider (one server).
- **Known problems in v0.7:**
  - Pulled files went to `~/.eclaire/models` while router mode discovered from the llama.cpp cache *(inferred mismatch)*.
  - macOS only for VRAM. PID files were the only liveness record.
  - The docs then called router mode "not production-ready" and recommended two servers (ports 11500 and 11501).
- **Better options today:**
  - The PRD makes engine management an optional plugin (§1.4 non-goals).
  - llama-server **router mode** is now established: start with no model, `--models-dir`, `--models-max N`, `--models-autoload`, LRU unload, one process per model (checked via web, 2026-11; *verify the defaults*). It can replace the two-server setup and serve chat, processing and embedding (D18) from one endpoint.
  - The newer `hf` CLI replaces `huggingface-cli` *(check)*.
  - On macOS use launchd rather than PID files ([DEP-7]).
- **PRD refs:** [DEP-7], [CLI-3] (`doctor`), [MODEL-3], D18, [PROC-9].

### 5.2 Onboarding provider presets
- **User intent:** First-run setup gets a working assistant in minutes, local or cloud.
- **Observations:**
  - **[v0.7 choice]** **Steps:** welcome, claim admin, choose preset, configure provider, select models, health check, registration policy, summary. Completion was derived from real state (providers exist, assistant model selected), not just stored flags.
  - **[v0.7 choice]** **Setup presets:**
    - **llama.cpp dual:** two providers on ports 11500 (assistant) and 11501 (processing).
    - **Ollama:** one server for both roles.
    - **OpenRouter:** needs an API key.
    - **OpenAI:** needs an API key.
    - **Custom.**
  - **[Fact]** In the table below, the cloud base URLs, the Anthropic headers, and the Ollama (`11434`) and LM Studio (`1234`) ports are the services' own defaults (see §1.4, §1.5, §1.6).
  - **[v0.7 choice]** **Provider presets (id: dialect, default base URL, auth).** The preset ids and the `11500`, `8080` and MLX ports were v0.7's choices:

    | Preset | Dialect | Default base URL | Auth / notes |
    |---|---|---|---|
    | `llama-cpp` | Chat Completions | `http://127.0.0.1:11500/v1` | none; managed engine, `gpuLayers:-1` |
    | `ollama` | Chat Completions | `http://127.0.0.1:11434/v1` | none; external |
    | `lm-studio` | Chat Completions | `http://127.0.0.1:1234/v1` | none; external |
    | `mlx-lm` | Chat Completions | `http://127.0.0.1:11434/v1` | none; port clashes with Ollama |
    | `mlx-vlm` | MLX native | `http://127.0.0.1:11434` | none; no `/v1` |
    | `openrouter` | Chat Completions | `https://openrouter.ai/api/v1` | bearer `OPENROUTER_API_KEY`; headers `HTTP-Referer`, `X-Title`; catalogue discovery |
    | `openai` | Chat Completions | `https://api.openai.com/v1` | bearer `OPENAI_API_KEY`; catalogue discovery |
    | `anthropic` | Anthropic Messages | `https://api.anthropic.com` | `x-api-key` from `ANTHROPIC_API_KEY`; `anthropic-version: 2023-06-01` |
    | `custom` | Chat Completions | `http://127.0.0.1:8080/v1` | none |

  - **[v0.7 choice]** Env overrides existed per server (`LLAMA_CPP_BASE_URL`, `LLAMA_CPP_BASE_URL_2`, `OLLAMA_BASE_URL`, `LM_STUDIO_BASE_URL`, `MLX_LM_BASE_URL`, `MLX_VLM_BASE_URL`; MLX defaulted to 8080 there).
- **Known problems in v0.7:**
  - Takeover by the first registrant (REVIEW §4.1).
  - No auto-detection of local servers.
  - No Anthropic setup preset.
  - Port inconsistencies.
- **Better options today:** Probe-based detection ([DEP-7]) plus a "fully local" preset. Include Apple on-device models and Gemini (P1).
- **PRD refs:** [DEP-7], [MODEL-1], [MODEL-4], [AUTH-*] (setup token).

### 5.3 Models known to work (from v0.7 docs; all 2025–early 2026 era, re-evaluate)
- **User intent:** Sensible defaults per memory tier for chat with tool calling and for vision processing.
- **Observations (what v0.7 recorded):**
  - **[v0.7 choice]** **Chat and tool calling (the "backend" role):**
    - **Qwen3-14B** (`unsloth/Qwen3-14B-GGUF:Q4_K_XL`) was the default, described as having "excellent tool calling" at 32 GB or more.
    - For 16 GB: Qwen3 8B (Q4) or Mistral 7B.
    - For 8 GB: Qwen3 4B or Gemma 3 4B (Q4).
    - Cloud: "Claude 3.5 Sonnet or GPT-4o via OpenRouter" (outdated).
    - Single-model option: **Qwen3-VL-8B-Instruct** (`unsloth/Qwen3-VL-8B-Instruct-GGUF:Q4_K_XL`) for both roles.
    - Larger example: **Qwen3-VL-30B-A3B-Instruct** (HF GGUF or OpenRouter `qwen/qwen3-vl-30b-a3b-instruct`).
  - **[v0.7 choice]** **Vision (the "workers" role):**
    - **gemma-3-4b-it-qat** (`unsloth/gemma-3-4b-it-qat-GGUF:Q4_K_XL`) was the default.
    - Gemma 3 12B or Qwen3-VL-8B at 32 GB.
  - **[v0.7 choice]** **Context:** `--ctx-size 16384` was recommended to cap memory (starting point; tune).
  - **[v0.7 choice]** **Eval candidates in the model-comparison test:** Qwen3-0.6B Q5_K_M (active), Gemma 3 4B/27B QAT, Mistral-Small-3.2-24B-Instruct-2506 Q5_K_M, Qwen3-30B-A3B Q4_K_M.
  - **[v0.7 choice]** The AI SDK prototype used `mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit` (§6).
  - **[v0.7 choice]** The README claimed text and vision models "from Qwen, Gemma, DeepSeek, Mistral, Kimi".
- **Known problems in v0.7:** Recommendations were not backed by a tool-use eval suite. The comparison test only sent "hey".
- **Better options today:** Re-select with [QA-6] agent evals (tool selection, approval adherence) on the M4 Max 64 GB reference machine (decision #5). Newer Qwen, Gemma and GPT-OSS-class open models likely beat these *(not evaluated here)*.
- **PRD refs:** [QA-6], [MODEL-4], decision #5, D18.

---

## 6. `snippets/ai_sdk` (what it was)

This is a local, git-ignored prototype from Oct–Nov 2025. It had a small Express backend on Vercel AI SDK v5 (`ai` 5.x, `@ai-sdk/openai` 2.x) pointed at a local MLX server (`http://127.0.0.1:11434`) with `mlx-community/Qwen3-30B-A3B-Thinking-2507-4bit`, plus a Vite React chat demo. The backend:
- toggled between `openai.chat()` (Chat Completions) and `openai.responses()` (Responses API)
- wrapped the model with `extractReasoningMiddleware({tagName:'think'})` when thinking was on
- streamed with `createUIMessageStream`

The directory also held a dump of the AI SDK docs (`llms.txt`). It shows the team had already prototyped the AI SDK route, including reasoning extraction for local thinking models. It is relevant evidence for D5. Neighbouring snippets (`oMLX`, `cpu_llm`, `llama-benchmark`) belong to the voice and local-inference areas.

---

## 7. Candidate fixtures

These are v0.7 paths, for mining test inputs only. Don't copy the code.

| Path | What it exercises |
|---|---|
| `packages/ai/src/tests/stream-parser.test.ts` | SSE chunks with `reasoning` / `reasoning_content`, `<think>` tags, tool-call deltas, usage chunk, `[DONE]` |
| `apps/backend/src/tests/integration/stream-parser.test.ts` | End-to-end streaming parse cases, including text-mode tool JSON |
| `packages/ai/src/tests/text-parser.test.ts` | JSON-in-text tool calls (fenced and inline), think-tag stripping, reasoning-field precedence |
| `packages/ai/src/tests/adapters.test.ts` | Anthropic and MLX request bodies and SSE translation, the `chat_template_kwargs` workaround, finish-reason mapping |
| `packages/ai/src/tests/codex-items.test.ts` | Codex item shapes: agent_message, reasoning, command_execution, file_change, mcp_tool_call |
| `packages/ai/src/tests/codex-appserver-decoder.test.ts`, `codex-appserver-jsonrpc.test.ts` | App-server notifications and JSON-RPC message classification (re-record against the current Codex) |
| `packages/ai/src/tests/token-estimation.test.ts`, `validation.test.ts` | Estimator behaviour and capability-validation error lists |
| `packages/ai/src/tests/mcp-tool-bridge.test.ts`, `mcp-connection.test.ts` | Individual and grouped mapping, result normalisation (text, image, fallback), timeouts |
| `apps/backend/src/tests/integration/mcp/` (incl. `helpers/create-in-process-server.ts`) | In-process MCP servers: allow and block filtering, grouped dispatch, `_meta` userId forwarding, DB-sourced config |
| `packages/ai/src/tests/fixtures-integration/{local,openrouter}/` | Minimal provider, model and selection configs for live local and OpenRouter runs |
| `apps/backend/src/tests/integration/ai-model-eval.test.ts` | Seed list of local models for a model bake-off (weak prompt; replace with [QA-6] sets) |
| `config/ai/mcp-servers.json.example` | Chrome DevTools MCP entry with managed mode and all three availability flags |
| `config/ai/skills/*/SKILL.md` | Five SKILL.md samples for parser and progressive-disclosure tests |
| *(missing; record new)* | Claude Code `stream-json` transcripts with sub-agents and thinking, OpenCode `run --format json` transcripts, Pi RPC transcripts, Anthropic parallel-tool-call SSE, Ollama/LM Studio tool-call streams |

---

## Appendix A. v0.7 prompts (eval baseline only, not a template)

These are quoted verbatim unless marked trimmed. They are useful as a baseline when running [QA-6] evals on new prompts.

**A.1 Fallback base instruction**, used when the agent has no instructions:
```
You are a helpful assistant talking to ${displayName}.
```
(or `You are a helpful assistant.` with no name), followed by `Current Date & Time: <weekday, Month D, YYYY> (<ISO timestamp>)` and a `User Profile Information:` list.

**A.2 Communication style**, for interactive runs with tools:
```
**Communication Style**

Never mention tool names, function calls, or internal mechanics in your responses.
The user does not need to know how you work internally.
- Say "Let me check your settings" — not "I'll use the getUserSettings tool"
- Say "Let me look into that" — not "I'll use getProcessingStatus to check"
When directing users to the UI, use natural navigation language like "You can find this in Settings > Channels".

**CRITICAL: Never claim to have performed an action unless you actually called the appropriate tool and received a successful result.**
You MUST use a tool to perform any create, update, or delete action. Reading data also requires a tool call.
Do not say "I've updated X" or "Done" unless the tool was actually called and succeeded in the current turn.
```

**A.3 Content linking**, included when content tools are present:
```
**CRITICAL: Content Linking Requirements**

WHENEVER you reference a content item found through tool calls, you MUST include the internal app link in this EXACT format:

FORMAT: /{content-type}/{exact-id-from-tool}

REQUIRED FORMATS:
- Bookmarks: /bookmarks/bm-oCwyieTY1w
- Documents: /documents/doc-abc123
- Photos: /photos/photo-xyz789
- Tasks: /tasks/task-456
- Notes: /notes/note-789

CRITICAL RULES:
1. ALWAYS use the exact 'id' field returned by tool functions
2. NEVER use markdown links like [text](url)
3. NEVER use external URLs when referencing internal content
4. Include the app link DIRECTLY in your response text
5. These are internal app navigation links, NOT web URLs
6. Include each content link only ONCE — do NOT repeat the same link multiple times in a single response

REMEMBER: These /content-type/id links become clickable buttons in the user interface for easy navigation.
```

**A.4 Task scheduling and delegation**, included when the task-creation tool is present:
```
**Task Scheduling & Delegation**

Everything is a task. Use createTask for work items, reminders, scheduled agent work, and recurring tasks — just set the right properties.

**Delegate Modes**
- manual: No agent involvement. Default for human tasks.
- assist: Agent does the work, output requires user review. Use for "help me draft", "prepare", etc.
- handle: Agent runs autonomously to completion. Use for "do this for me", "handle this".

delegateMode is auto-set when delegating to an agent (defaults to assist). Override when intent is clear:
- "Do this for me" / "Handle this" → handle
- "Help me with" / "Draft" / "Prepare" → assist
- "I need to do X" / personal tasks → manual

When delegateMode is assist, tell the user: "I'll work on this and the output will be ready for your review."

**Scheduling**
- One-off reminders: scheduleType='one_time', scheduleRule=<ISO 8601 datetime>, deliveryTargets=[{type:'notification_channels'}]
- Recurring agent work: scheduleType='recurring', scheduleRule=<cron>, delegateActorId=<agent>, delegateMode='handle'
- One-off agent work: delegateActorId=<agent>, delegateMode='assist' or 'handle'

Convert relative times to absolute ISO 8601 using the current date/time and user timezone.
Common cron: daily at 9am = '0 9 * * *', weekdays = '0 9 * * 1-5', Monday = '0 9 * * 1'.

**Compound Scenarios**

- "If no reply in 3 days, follow up":
  createTask (title: "Follow up if no reply", scheduleType: 'one_time', scheduleRule: +3 days, delegateMode: 'handle', prompt: "Check if there was a reply and follow up if not")

- "Every Monday have the agent review PRs":
  createTask (title: "Weekly PR review", scheduleType: 'recurring', scheduleRule: '0 9 * * 1', delegateMode: 'handle')

- To manage recurring tasks: use findTasks with scheduleType='recurring'. Use updateTask to pause (scheduleType='none') or resume.
```

**A.5 Background task variant**, which replaces A.2 to A.4 for scheduled or delegated runs:
```
You are an AI assistant that has been assigned to work on a task. You have full access to search tools to find related information in the user's knowledge base (notes, bookmarks, documents, photos, and other tasks) that might be relevant to completing this task.

When working on tasks:
1. Analyze the task details provided above
2. Search for related content that might help with the task using available tools
3. Provide a helpful, practical, and actionable response
4. Reference any relevant content you find using the internal app links format
```
(item 4 plus A.3 only when content tools are present)

**A.6 No-tools variant**:
```
Please provide a helpful and informative response based on the user's question and any referenced content above. Be conversational and focus on directly answering their question.
```

**A.7 Read-only notice**:
```
**Read-Only Mode**: You are operating in read-only mode. You can search, retrieve, and analyze content, but you cannot create, update, or delete anything. If the user asks you to make changes, explain that this session is read-only.
```

**A.8 Referenced content**, for items attached to the chat (each truncated to 4,000 characters with `[Content truncated - showing first 4000 characters]`):
```
## Referenced Content

The user has provided the following specific content for you to reference:

### <Type> (ID: <id>)
<content>

When answering the user's question, please reference and use the content above as the primary source. Focus on providing a helpful response based on this content.
```

**A.9 External harness**: base, date, profile and A.8 only. Background adds:
```
You are working on a background task. Complete the task described above.
```

**A.10 Text-mode tool calling**, the legacy JSON-in-text format. It was preceded in background mode by "Analyze the task request. If it requires searching for information or counting items, invoke the appropriate tool from the ones listed below.", and followed by TypeScript-like signatures, one per tool, in the form `function <name>(<param>?: <type>, …): Promise<any>; // <description>`:
````
# Response Format: Plain Text with Optional Tool Calls

Respond with plain text. You may use markdown formatting for better readability.

## Tool Calls (when needed)
If you need to call tools, use this JSON format:
```json
{"type": "tool_calls", "calls": [{"name": "function_name", "args": {...}}, {"name": "another_function", "args": {...}}]}
```

## Rules
1. Use plain text for all responses
2. Only use JSON format for tool calls
3. Group related tool calls in the same JSON object

Dates must be ISO 8601 strings (e.g. "2026-03-26" for dates, "2026-03-26T14:05:00-04:00" for datetimes).
````

**A.11 Skills catalogue**, appended when skills are enabled:
```
## Skills
Available skills:
- <name>: <description>

Use the loadSkill tool to load a skill's full instructions when the task matches its description.
```
Always-include skills are appended as `## <name>\n<body>`.

**A.12 Tool prompt snippets and guidelines**, with each tool's guidelines collected into `## Tool Guidelines` as bullets. This is trimmed: the "Always confirm with the user before <creating|modifying|deleting> <kind>" line repeats once per create/update/delete tool, and for quick actions, task comments, media import and notifications.
- browseWeb snippet: "When you need current public-web information, use browseWeb in short steps. Typical flow: open the page, snapshot it, inspect the result, then use get/wait/screenshot as needed. For complex browser workflows or command examples, load the `agent-browser` skill before proceeding."
- browseWeb guidelines: "Use browseWeb only for public web research in this tool version." / "Do not attempt clicks, form fills, logins, downloads, or other write actions with browseWeb." / "Re-run snapshot after navigation or page changes so element references stay current."
- browseChrome snippet: "Use browseChrome only when a task depends on the user's existing Chrome session, authenticated pages, or interactive browser actions. Prefer browseWeb for public-web research and read-only browsing."
- browseChrome guidelines: "Start with listTabs or open before interactive actions if you do not already know the active tab." / "Use snapshot before click or fill so you have fresh element references." / "Only use tab ids returned by listTabs."
- createTask: "Everything is a task. Use createTask for work items, reminders, scheduled agent runs, and recurring tasks." / "For a reminder: set scheduleType='one_time', scheduleRule=ISO datetime, deliveryTargets=[{type:'notification_channels'}]." / "For recurring agent work: set scheduleType='recurring', scheduleRule=cron, delegateActorId=agent, delegateMode='handle'." / "For one-time agent work: set delegateActorId=agent, delegateMode='assist' (review) or 'handle' (auto-complete)."
- updateTask: "To pause a recurring task, set scheduleType='none'. To resume, restore scheduleType and scheduleRule."
- importMediaUrl: "After importing, inform the user that download and processing happen in the background and may take a few minutes."
- sendNotification: "Describe which channels will receive the message."
- updateUserSettings: "Show both current and proposed values before making changes."
- getProcessingStatus: "When a user reports content not appearing or processing issues, check the processing status to diagnose the problem."
- getUserSettings: "When the user asks about their profile or personal settings, look up their current values."
- manageAdminRead / manageAdminWrite: "Use this tool to inspect admin configuration before making changes." / "Only perform admin write operations when the user explicitly requests them." / "Always show the current state before making changes (use manageAdminRead first)."
- transcribeAudio description: "Transcribe a stored media item's audio to text using local speech-to-text. Use getMedia first to check if a transcript already exists."
- findContent / findTasks descriptions cross-reference each other: "Use findTasks for task-specific filters like status or schedule." / "For general text/tag search across all content types, use findContent instead."
