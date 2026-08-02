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
```

### TypeScript types (editor-internal)

```ts
interface Sprite {
  url: string
  width?: number | null
  height?: number | null
  x?: number | null
  y?: number | null
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
- **Change role**: dropdown `hero | opponent | other`
- **Add sprite**: form with url, width, height, x, y fields
- **Remove sprite**: button per sprite
- **Edit sprite fields**: inline inputs per sprite
- **Copy sprites from previous chat**: button appears when the previous chat has sprites; replaces current chat's sprites with a copy of the previous chat's sprites (same url, width, height, x, y)
- **Copy sprites from next chat**: button appears when the next chat has sprites; replaces current chat's sprites with a copy of the next chat's sprites — useful for extending a sprite's appearance backwards
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
- **Clear background**: individual clear (✕) buttons on each field
- **Cut**: splits the current conversation at the selected chat into two conversations. Chats 0..N become conversation A; chats N+1..end become conversation B. Both retain the same background settings.
- **Merge into previous**: appends all chats from the current conversation to the end of the previous conversation, then removes the current conversation. The previous conversation's background settings are kept. Disabled when there is no previous conversation.
- **Duplicate**: clones the conversation
- **Duplicate for Assets**: opens `DuplicateForAssetsDialog` to multi-select videos/images from the backend asset list (checkbox-style, reorderable, same UX as `QuickAddEConversationsDialog`). On confirm, clones the currently selected conversation once per selected asset — each clone keeps the same chats (including sprites) and `background_color`, but has its `background_url` set to that asset's path. Clones are inserted immediately after the source conversation, in the chosen order.
- **Delete**: removes the whole conversation (with confirmation)

### File-level
- **Add conversation**: appends a new empty conversation to the list
- **Reorder conversations**: drag in the left panel
- **Quick Add E-Conversations**: opens `QuickAddEConversationsDialog` to bulk-create e-conversations from backend assets. Each selected asset produces one conversation with `background_url` set to the asset path, and a single chat `{ role: other, content: "(...)" }`. Assets are selected in the left pane (checkbox-style, multi-select) and reordered in the right pane before confirming. The new conversations are appended to the end of the current file.

---

## Keyboard Shortcuts

Shortcuts are handled globally in `App.tsx` via a `keydown` listener. `Mod` means `Cmd` on macOS or `Ctrl` on Windows/Linux.

| Shortcut | Action |
|----------|--------|
| `Mod + O` | Open file picker (load YAML) |
| `Mod + S` | Export YAML (same as clicking the Export button) |
| `Mod + ArrowLeft` | Previous chat; at the first chat of a conversation, jumps to the last chat of the previous conversation |
| `Mod + ArrowRight` | Next chat; at the last chat of a conversation, jumps to the first chat of the next conversation |

All shortcuts prevent browser defaults. Arrow shortcuts are suppressed when focus is inside an `<input>` or `<textarea>` to avoid conflicting with text editing. Open/Save work regardless of focus.

---

## YAML I/O

### Loading
- File picker (`<input type="file" accept=".yml,.yaml">`) reads the file via `FileReader`.
- Parsed with `js-yaml` (`yaml.load()`).
- Validated against the Conversation schema (basic: must be an array, each item must have `chats`).
- Loaded into editor state.

### Script import
- Available from both the start screen ("Import from Script" button) and the header bar when a file is already loaded.
- Opens `ScriptImportDialog`: a modal with interactive inputs to construct the export filename, plus a textarea for pasting the script.
- **Filename inputs** (fetched from `GET {baseUrl}/api/v1/opponent_options` on dialog open):
  - **Opponent** — dropdown of all opponents by name.
  - **Type** — toggle buttons: Chat / Gift / Cinematic.
  - **Gift** — dropdown of that opponent's gift names (only shown when type = Gift; updates when opponent changes).
  - **Cinematic level** — buttons 1–5 (only shown when type = Cinematic).
  - A live filename preview shows the computed name before confirming.
- Filename is constructed as:
  - Chat → `{opponent-id}-conversations.yml`
  - Gift → `{opponent-id}-gift-{gift-name}.yml`
  - Cinematic → `{opponent-id}-cinematic-{level}.yml`
- On confirm (button or Cmd/Ctrl+Enter), calls `POST {baseUrl}/api/v1/scripts/convert` with `{ "text": "..." }` (JSON).
- The backend returns YAML (`text/yaml`) representing a single conversation; the response is parsed via `parseYaml` and loaded as the full editor state. The computed filename is set as both the loaded filename and the export name.
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
| `src/components/AssetPickerDialog.tsx` | Modal for browsing backend assets (`/api/v1/assets`); used by EditPanel to pick sprite and background URLs. Accepts optional `title` and `confirmLabel` props to customize the dialog header and confirm button. |
| `src/components/AddChatDialog.tsx` | Modal for choosing a chat block type (plain, cinematic, minigames, multichoice) and configuring its arguments before inserting |
| `src/components/QuickAddEConversationsDialog.tsx` | Modal for bulk-creating e-conversations: multi-select ordered assets from backend, each produces one conversation with `background_url` + single `other/(...)` chat |
| `src/components/DuplicateForAssetsDialog.tsx` | Modal for bulk-duplicating the selected conversation: multi-select ordered assets from backend, each produces one clone of the current conversation with `background_url` overridden |
| `src/components/ScriptImportDialog.tsx` | Modal for pasting a narrative script, calling `POST /api/v1/scripts/convert`, and loading the result as editor state |
| `src/components/YamlPreview.tsx` | Raw YAML collapsible preview — **not yet implemented** |
| `EDITOR_DESIGN.md` | This file — authoritative design reference |

---

## Constraints

- **No live game connection**: URLs are prefixed from a configurable base URL for preview only; the YAML stores relative paths.
- **Minigames are not playable**: special content syntax is rendered as labeled placeholder boxes.
- **No authentication**: local tool, runs entirely in the browser.
- **No server**: pure client-side Vite app. YAML files are loaded and exported via the browser File API.
- **Fidelity over features**: the preview must match what fang renders — when in doubt, check `fang/src/components/Reward/ConversationOverlay.tsx`.
