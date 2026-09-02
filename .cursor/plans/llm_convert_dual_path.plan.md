---
name: Dual-path LLM convert (frontend)
overview: >-
  Backend already supports use_llm on POST /scripts/convert. Wire fang-conversation-editor
  to fire a fast use_llm=false convert first, then use_llm=true in parallel, and merge the
  enriched YAML into the current edit state when the LLM response arrives.
todos:
  - id: api-client
    content: Pass use_llm on convert API calls (false for fast path, true for enrich)
    status: completed
  - id: dual-fire
    content: Fire fast + LLM convert in parallel; apply fast result immediately
    status: completed
  - id: merge-rules
    content: Merge LLM YAML into current editing state without clobbering user edits
    status: completed
  - id: ux-status
    content: Show enrich-in-progress / enrich-done (or error) without blocking edit
    status: completed
isProject: true
---

# Dual-path script convert — frontend follow-up

Backend work lives in `conversation-editor` and is **done**. Continue here in **fang-conversation-editor**.

## Backend contract (ready)

`POST /api/v1/editor/scripts/convert` body params:

| Param | Default | Behavior |
|-------|---------|----------|
| `text` | required | Script text |
| `use_llm` | **false** | Parse only (no Ollama). `true` → background detect + speaker categorize |

Response is **`text/yaml`** — same array-of-conversations shape for both paths. No merge metadata from the API.

**Backend merge rule (affects fast-path shape):** consecutive conversations are merged only when they share the same **non-empty** `background_url`. Blank/missing backgrounds stay separate, so `-*-` chunks from the fast path remain distinct conversations for the UI to map/merge against.

```mermaid
sequenceDiagram
  participant UI as fang_conversation_editor
  participant API as scripts_convert

  UI->>API: POST convert use_llm=false
  API-->>UI: fast YAML parse only
  Note over UI: Apply to editor state immediately

  UI->>API: POST convert use_llm=true
  Note over UI: User may edit meanwhile
  API-->>UI: enriched YAML
  Note over UI: Merge into current edit state
```

## Frontend work

### 1. API client

Wherever convert is called, accept/pass `use_llm` (default false to match backend).

### 2. Dual request

On convert:

1. Start `use_llm=false` and `use_llm=true` together (or start LLM right after kicking off fast).
2. When fast returns → load into the modifying editor state immediately.
3. Keep editing unlocked while LLM is in flight.
4. When LLM returns → merge into **current** state (not a blind replace of the fast snapshot if the user already edited).

Cancel/ignore stale LLM responses if the user converts again with different text.

### 3. Merge rules (implemented in `src/mergeLlmConvert.ts`)

Align chats by sequential content against the fast-path baseline:

- **FE delete** → stay deleted (BE cannot resurrect)
- **FE add** (typically `(...)`) → keep
- **FE splits** + **BE splits** → union of cut points on the chat stream
- **background_url**: FE if set, else BE
- **sprites / soundtrack / background_color / content**: always FE
- **role**: BE enrichment on content-matched chats

### 4. UX

Lightweight status: enriching… / enriched / enrich failed. Do not block the editor on the LLM request.

## Backend reference (completed in conversation-editor)

- Controller: `use_llm` boolean → service
- Service: `call(text, use_llm: false)`; LLM gated; blank backgrounds never consecutive-merged
- Docs: `docs/ARCHITECTURE.md`, skill endpoint bullet

## Out of scope here

- Changing YAML response shape or adding merge metadata headers
- Async job/streaming convert on the backend
- Parallelizing Ollama inside a single `use_llm=true` request
