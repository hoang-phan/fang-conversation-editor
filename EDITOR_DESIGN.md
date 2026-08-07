# Fang Conversation Editor — Design Document

## Purpose

This tool loads conversation YAML seed files from `fang-backend/db/seeds/conversations/`, displays them faithfully as they appear in the `fang` frontend, and allows editing before exporting back to valid YAML.

It is a standalone desktop-style web app — no game connection, no authentication. It exists purely for content authoring.

---

## Data Model

The YAML files contain an array of **Conversation** objects. Each Conversation contains an ordered array of **Chat** objects. Each Chat may have an array of **Sprite** objects.

### YAML schema (fang-backend format)

```yaml
- background_url: "/path/to/image.webp"   # optional
  background_color: "#hexcolor"            # optional
  soundtrack_url: "/path/to/theme.mp3"    # optional — conversation BGM (audio under public/)
  chats:
    - role: hero | opponent | other        # required
      content: "Text content"              # required
      position: 0                          # optional (auto-assigned)
      sprites:                             # optional
        - url: "/path/to/sprite.png"
          width: 200                       # optional
          height: 100                      # optional
          x: 0                             # optional (offset from horizontal center)
          y: 0                             # optional (offset from bottom)
          flip: true                       # optional — horizontal mirror (CSS scaleX(-1))
```

### TypeScript types (editor-internal)

```ts
interface Sprite {
  url: string
  width?: number | null
  height?: number | null
  x?: number | null
  y?: number | null
  flip?: boolean | null
}

interface Chat {
  role: 'hero' | 'opponent' | 'other'
  content: string
  position?: number
  sprites?: Sprite[]
}

interface Conversation {
  background_url?: string
  background_color?: string
  soundtrack_url?: string
  chats: Chat[]
}

type ConversationFile = Conversation[]
```

The editor works with `ConversationFile` as its top-level state. Positions are omitted on export (fang-backend auto-assigns them).

---

## Editor Layout

Three-panel layout:

```
┌─────────────┬──────────────────────────┬─────────────────────┐
│  LEFT PANEL │     CENTER PANEL         │    RIGHT PANEL      │
│             │                          │                     │
│ Conversation│   Preview                │  Edit               │
│ List        │   (ConversationOverlay   │  (selected chat or  │
│             │    faithful render)       │   conversation)     │
│ [Conv #1]   │                          │                     │
│ [Conv #2] ← │  ← active conversation   │  form fields        │
│ [Conv #3]   │      shown here          │                     │
│             │                          │                     │
│ [+ Add]     │  [◀ Prev] [Next ▶]       │  [Save] [Cancel]    │
└─────────────┴──────────────────────────┴─────────────────────┘
```

- **Left panel**: lists all conversations in the file. Click to select. Drag to reorder. Shows background thumbnail if set.
- **Center panel**: renders the currently selected conversation, one chat at a time, exactly as fang would. Click a chat bubble to select it for editing. Navigation buttons step through chats; at the boundary of a conversation the buttons remain enabled if a neighboring conversation exists — Prev on the first chat jumps to the last chat of the previous conversation, Next on the last chat jumps to the first chat of the next conversation.
- **Right panel**: form-based editor for the selected chat or conversation properties.

### State ownership (App.tsx is the single source of truth)

`selectedIndex` (active conversation) and `selectedChatIndex` (active chat within that conversation) are both owned by `App.tsx` and passed down as props. `ConversationPreview` receives `chatIndex` and `onChatIndexChange` — it does **not** manage its own chat cursor state. This keeps the right-panel edit form (`EditPanel`) and the center preview in sync with no extra lifting required.

---

## Rendering Rules

The center panel mirrors `ConversationOverlay.tsx` from the fang frontend. Key rules:

### Background
- If `background_url` ends with `.mp4` → render a `<video>` element (autoplay, loop, muted). Otherwise render `<img>`.
- If no `background_url`, use `background_color` as CSS background. Fallback: dark gray.
- Filenames starting with `e` use `object-contain`; others use `object-cover`.

### Sprites
- Rendered as `<img>` with fixed positioning.
- Horizontal: `left: calc(50% + {x}px - {width/2}px)` (centered with x offset).
- Vertical: `bottom: {y}px`.
- Width/height applied directly; `object-fit: contain`.
- When `flip: true`, apply `transform: scaleX(-1)` (horizontal mirror).

### Dialog box
- Displayed below the sprites, at the bottom of the preview area.
- Background: `#FDC9D4` (pink) for standard; semi-transparent for cinematic mode (detected by no dialog text).
- Speaker label above the bubble text:
  - `hero` → player name (placeholder: "Hero"), blue color
  - `opponent` → opponent name (placeholder: "Opponent"), pink/accent color
  - `other` → no label shown
- Rounded corners: `rounded-xl rounded-tl-none` (no top-left radius).

### Special content syntax (non-interactive previews)
These appear in `chat.content` and are rendered as labeled placeholder boxes instead of playable games:

| Syntax | Placeholder label |
|--------|------------------|
| `(click-game:...)` | `[Click Game]` |
| `(words-catcher:...)` | `[Words Catcher Game]` |
| `(shuffle-puzzle:...)` | `[Shuffle Puzzle Game]` |
| `(multichoice:A:B:C:D)` | `[Multiple Choice: A / B / C / D]` |
| `(...)` (other) | `[Interactive]` |

Template token `{{PLAYER}}` is substituted with "Hero" in the preview.

---

## Editing Operations

### Chat-level
- **Edit content**: free text input; special syntax preserved as-is
- **Change role**: 3-way toggle `other | hero | opponent` (same control in EditPanel and AddChatDialog)
- **Add sprite**: form with url, width, height, x, y fields
- **Remove sprite**: button per sprite
- **Edit sprite fields**: inline inputs per sprite (url, width, height, x, y) plus a **Flip horizontally** checkbox (`flip`)
- **Copy sprites**: copies **all** of the current chat's sprites (1 or many) into an in-memory clipboard (enabled when the chat has sprites). Clipboard is owned by `App.tsx` so it survives EditPanel remounts and chat/conversation navigation while the file is open. The Copy button label shows the count, e.g. `Copy (2)`.
- **Paste sprites**: replaces the current chat's sprites with a deep copy of the clipboard contents (enabled when the clipboard is non-empty). The Paste button label shows the clipboard count, e.g. `Paste (2)`. Copied fields include `flip`.
- **Copy sprites from previous chat**: button appears when the previous chat has any sprites (1 or many); replaces current chat's sprites with a full copy of the previous chat's sprites (url, width, height, x, y, flip). Label shows count, e.g. `Copy from prev (2)`.
- **Copy sprites from next chat**: button appears when the next chat has any sprites; replaces current chat's sprites with a full copy of the next chat's sprites — useful for extending a sprite's appearance backwards. Label shows count, e.g. `Copy from next (2)`.
- **Reorder chats**: drag handles or up/down buttons
- **Add chat before / after**: opens `AddChatDialog` to choose a block type and role, then inserts the new chat at the selected position. Default role is `other`.
- **Delete chat**: button removes the selected chat (with confirmation); disabled when it is the only chat in the conversation

### AddChatDialog block types

| Block | Content produced | Extra input required |
|-------|-----------------|---------------------|
| Plain chat | Free text | Text field (content) |
| `(...)` Cinematic | `(...)` | None — inserted immediately |
| `(click-game:...)` | `(click-game:<desc>)` | Optional description string |
| `(words-catcher:...)` | `(words-catcher:<desc>)` | Optional description string |
| `(shuffle-puzzle:...)` | `(shuffle-puzzle:<desc>)` | Optional description string |
| `(multichoice:...)` | `(multichoice:<A>:<B>:...)` | Add/remove/reorder option list; first option is the correct answer; minimum 2 options |

### Conversation-level
- **Set background_url**: text input (URL string) + Browse button (opens `AssetPickerDialog`) + clear button
- **Set background_color**: color picker + hex input + clear button
- **Set soundtrack_url**: text input (URL string) + Browse button (opens `AssetPickerDialog` filtered to audio extensions `.mp3`, `.ogg`, `.wav`, `.m4a`, `.aac`, `.flac`) + clear button. Parallel to `background_url`; persisted in YAML as-is. The editor preview does not play the soundtrack (game clients do).
- **Clear background / soundtrack**: individual clear (✕) buttons on each field
- **Cut**: splits the current conversation at the selected chat into two conversations. Chats 0..N become conversation A; chats N+1..end become conversation B. Both retain the same background and soundtrack settings.
- **Merge into previous**: appends all chats from the current conversation to the end of the previous conversation, then removes the current conversation. The previous conversation's background and soundtrack settings are kept. Disabled when there is no previous conversation.
- **Duplicate**: clones the conversation
- **Duplicate for Assets**: opens `DuplicateForAssetsDialog` to multi-select videos/images from the backend asset list (checkbox-style, reorderable, same UX as `QuickAddEConversationsDialog`). On confirm, clones the currently selected conversation once per selected asset — each clone keeps the same chats (including sprites) and `background_color`, but has its `background_url` set to that asset's path. Clones are inserted immediately after the source conversation, in the chosen order.
- **Delete**: removes the whole conversation (with confirmation)

### File-level
- **Add conversation**: appends a new empty conversation to the list
- **Reorder conversations**: drag in the left panel
- **Quick Add E-Conversations**: opens `QuickAddEConversationsDialog` to bulk-create e-conversations from backend assets. Each selected asset produces one conversation with `background_url` set to the asset path, and a single chat `{ role: other, content: "(...)" }`. Assets are selected in the left pane (checkbox-style, multi-select) and reordered in the right pane before confirming. The new conversations are inserted immediately after the currently selected conversation, in the chosen order.

---

## Keyboard Shortcuts

Shortcuts are handled globally in `App.tsx` via a `keydown` listener. `Mod` means `Cmd` on macOS or `Ctrl` on Windows/Linux.

| Shortcut | Action |
|----------|--------|
| `Mod + O` | Open conversation picker (load YAML from backend seeds) |
| `Mod + S` | Export YAML (same as clicking the Export button) |
| `Mod + ArrowLeft` | Previous chat; at the first chat of a conversation, jumps to the last chat of the previous conversation |
| `Mod + ArrowRight` | Next chat; at the last chat of a conversation, jumps to the first chat of the next conversation |

All shortcuts prevent browser defaults. Arrow shortcuts are suppressed when focus is inside an `<input>` or `<textarea>` to avoid conflicting with text editing. Open/Save work regardless of focus.

---

## YAML I/O

### Loading
- Opens `ConversationPickerDialog`, which lists YAML files from `GET {baseUrl}/api/v1/editor/conversations` (basenames under the backend's `db/seeds/conversations/`).
- Selecting a file fetches its contents via `GET {baseUrl}/api/v1/editor/conversations/:filename` (`text/yaml`).
- Parsed with `js-yaml` (`yaml.load()`).
- Validated against the Conversation schema (basic: must be an array, each item must have `chats`).
- Loaded into editor state. The chosen basename becomes both the loaded filename and the export name.
- Requires the selected backend to be running; failures are shown in the dialog (same pattern as `AssetPickerDialog`).

### Script import
- Available from both the start screen ("Import from Script" button) and the header bar when a file is already loaded.
- Opens `ScriptImportDialog` in one of two modes:
  - **`create`** (start screen) — interactive inputs to construct the export filename, plus a textarea for pasting the script. The result **replaces** editor state and sets the filename.
  - **`append`** (header bar while a file is open) — textarea only (no character / type / slot / filename controls). Converted conversations are **appended to the end** of the current `ConversationFile`; filename is unchanged. Selection jumps to the first newly appended conversation.
- **Filename inputs** (`create` mode only; fetched on dialog open from `GET {baseUrl}/api/v1/editor/meta` + `GET {baseUrl}/api/v1/editor/characters`):
  - **Character** — dropdown of characters/commanders (label from meta `characterLabel`).
  - **Type** — toggle buttons from meta `slotKinds` that the selected character has (e.g. Fang: chat / gift / cinematic; Empire: consumable / talk / affection). **Affection is listed first when present** and is the default type when there is no saved preference.
  - **Slot** — dropdown of slots for the selected type (only shown when that type has more than one slot, e.g. Empire affection stages).
  - A live filename preview shows the slot’s `filename` before confirming.
- **Remembered defaults** — character, type, and slot are persisted in `localStorage` (`conversation-editor:script-import-prefs`, keyed by base URL). Reopening the dialog restores the last valid choice for that server; if none, prefer affection (when available), else the first available type/slot.
- On confirm (button or Cmd/Ctrl+Enter), normalizes the pasted text (`src/normalizeScript.ts`) then calls `POST {baseUrl}/api/v1/editor/scripts/convert` with `{ "text": "..." }` (JSON).
- **Normalization** (editor + backend service, before sentence/dialogue parsing): typographic double quotes (`“”«»` etc.) → `"`, typographic single quotes / apostrophes (`‘’` etc.) → `'`, unicode ellipsis (`…`) → `...`. This keeps dialogue detection reliable when pasting from Word/Docs.
- The backend returns YAML (`text/yaml`) representing a conversation file (typically one conversation). In `create` mode the response is loaded as the full editor state and the selected slot’s filename is set as both the loaded filename and the export name. In `append` mode those conversations are concatenated onto the existing file.
- Conversion errors are shown inline in the dialog.

### Exporting
- Serialized with `js-yaml` (`yaml.dump()`, `lineWidth: -1` to prevent wrapping, `noRefs: true`).
- `position` fields are stripped before export (fang-backend assigns them).
- Null/undefined optional fields are omitted.
- Download triggered via a `<a download>` blob URL ("Export YAML" button).
- An editable filename input in the header bar pre-fills with the loaded file's name. The user can change it before exporting/uploading.

### Uploading to backend
- "Upload to Backend" button posts the YAML directly to the backend via `POST {baseUrl}/api/v1/assets/upload_conversation_yml`.
- Accepts `multipart/form-data` with fields: `file` (blob) and `filename` (target basename, must end in `.yml`).
- The backend writes the file into `db/seeds/conversations/` and returns `{ "path": "/absolute/path/..." }` on `200`.
- A confirmation dialog is shown before the upload proceeds, showing the target filename and server URL.
- On success/failure a toast notification appears in the bottom-right corner.
- The base URL input (default `http://localhost:3000`) controls which server the upload targets — same as the preview base URL.

### Raw YAML preview
- Collapsible panel showing the current state as YAML text (read-only, updated live).

### Base URL
- A configurable input (default: `http://localhost:3000`) is prepended to all relative sprite/background URLs in the preview only. URLs in the editor state and exported YAML remain as-is (relative).
- Server profiles on the landing page: **Fang** (`http://localhost:3000`), **Empire** (`http://localhost:3001`), or **Custom** (free-form base URL).

### Deep linking (landing page)
- Query param `server` selects the landing-page server profile on load: `?server=fang` (default), `?server=empire`, or `?server=custom`.
- Invalid or missing values fall back to Fang.
- Changing the Server select (or editing Base URL, which switches to Custom) updates the URL via `history.replaceState` so the link stays shareable. Fang omits the param; Empire/Custom keep `?server=…`.

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/App.tsx` | Top-level layout: three panels, file load state |
| `src/types.ts` | TypeScript interfaces: Conversation, Chat, Sprite |
| `src/parse.ts` | YAML load/validate/export logic using js-yaml |
| `src/components/ConversationList.tsx` | Left panel: conversation list, reorder, add/delete |
| `src/components/ConversationPreview.tsx` | Center panel: faithful render of one conversation |
| `src/components/ChatBubble.tsx` | Single chat render (role, content, speaker label) |
| `src/components/SpriteLayer.tsx` | Sprite overlay positioning |
| `src/components/EditPanel.tsx` | Right panel: form editor for selected chat/conversation |
| `src/components/AssetPickerDialog.tsx` | Modal for browsing backend assets (`/api/v1/editor/assets`); used by EditPanel to pick sprite, background, and soundtrack URLs. Accepts optional `title`, `confirmLabel`, and `extensions` (lowercase ext list with leading dots, e.g. `.mp3`) to filter the list. Audio selections preview with an `<audio>` control instead of an image. |
| `src/components/ConversationPickerDialog.tsx` | Modal for browsing seed conversation YAML files (`GET /api/v1/editor/conversations`) and loading one via `GET /api/v1/editor/conversations/:filename` |
| `src/components/AddChatDialog.tsx` | Modal for choosing a chat block type (plain, cinematic, minigames, multichoice) and configuring its arguments before inserting |
| `src/components/QuickAddEConversationsDialog.tsx` | Modal for bulk-creating e-conversations: multi-select ordered assets from backend, each produces one conversation with `background_url` + single `other/(...)` chat |
| `src/components/DuplicateForAssetsDialog.tsx` | Modal for bulk-duplicating the selected conversation: multi-select ordered assets from backend, each produces one clone of the current conversation with `background_url` overridden |
| `src/components/ScriptImportDialog.tsx` | Modal for pasting a narrative script and calling `POST /api/v1/editor/scripts/convert`. `mode="create"` builds a filename and replaces editor state; `mode="append"` is textarea-only and appends conversations to the current file |
| `src/normalizeScript.ts` | Pre-convert typography normalize (smart quotes → ASCII, `…` → `...`) used by `convertScript` |
| `src/components/YamlPreview.tsx` | Raw YAML collapsible preview — **not yet implemented** |
| `EDITOR_DESIGN.md` | This file — authoritative design reference |

---

## Constraints

- **No live game connection**: URLs are prefixed from a configurable base URL for preview only; the YAML stores relative paths.
- **Minigames are not playable**: special content syntax is rendered as labeled placeholder boxes.
- **No authentication**: local tool, runs entirely in the browser.
- **Backend-backed open/upload**: YAML open and upload go through the selected backend's `/api/v1/editor/*` routes (seed files under `db/seeds/conversations/`). Export download remains client-side via the browser File API.
- **Fidelity over features**: the preview must match what fang renders — when in doubt, check `fang/src/components/Reward/ConversationOverlay.tsx`.
