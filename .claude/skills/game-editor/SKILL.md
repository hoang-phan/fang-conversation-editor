---
name: game-editor
description: Conversation editor assistant — enforces reading EDITOR_DESIGN.md before making changes, ensures rendering fidelity to the fang frontend, and keeps YAML output valid and compatible with fang-backend seeds.
argument-hint: '[brief description of the task]'
---

# Game Editor Skill

You are working on `fang-conversation-editor`, a standalone browser tool for editing conversation YAML files used by `fang-backend` and rendered in the `fang` frontend.

## Steps

1. **Read `EDITOR_DESIGN.md` in full before doing anything else.** It is the authoritative source of truth for data structures, rendering rules, editing operations, and YAML I/O. Never guess at schemas or layout decisions — check the doc first.

2. **Identify which section of EDITOR_DESIGN.md covers the task:**
   - Data Model — types, YAML schema
   - Editor Layout — three-panel structure
   - Rendering Rules — how to mirror fang's ConversationOverlay.tsx
   - Editing Operations — what mutations are allowed and how
   - YAML I/O — loading, exporting, base URL handling
   - File Map — which file owns which responsibility

3. **Locate relevant source files using the File Map.** Read the specific files before editing them.

4. **Check the fang reference implementation when rendering fidelity is in question.** The ground truth for how conversations render is:
   - `fang/src/components/Reward/ConversationOverlay.tsx` — main renderer
   - `fang/src/components/Reward/Sprite.tsx` — sprite positioning
   - `fang/src/hooks/useConversationAdvance.ts` — conversation flow logic
   - `fang/src/types/index.ts` — canonical TypeScript types

5. **Understand existing patterns before writing new code.** Check how similar components are structured in the editor before adding new ones.

6. **Implement the change**, keeping:
   - Rendering faithful to ConversationOverlay.tsx
   - YAML export valid and loadable by fang-backend seeds (no extra keys, no position fields, relative URLs preserved)
   - TypeScript types consistent with `src/types.ts`

7. **Verify:**
   - Does the editor preview match what fang would render for the same chat?
   - Is the YAML output parseable by `js-yaml` and valid per the schema in EDITOR_DESIGN.md?
   - Are TypeScript types satisfied (no `any` escapes)?

8. **Flag drift** — if EDITOR_DESIGN.md is out of date with the actual implementation, note it explicitly and suggest an update. Don't silently accept a mismatch.

## File Map (quick reference)

| File | Responsibility |
|------|---------------|
| `EDITOR_DESIGN.md` | Authoritative design — read first |
| `src/App.tsx` | Top-level layout, file load state |
| `src/types.ts` | TypeScript interfaces |
| `src/parse.ts` | YAML load/validate/export |
| `src/components/ConversationList.tsx` | Left panel |
| `src/components/ConversationPreview.tsx` | Center panel (faithful render) |
| `src/components/ChatBubble.tsx` | Single chat render |
| `src/components/SpriteLayer.tsx` | Sprite overlay |
| `src/components/EditPanel.tsx` | Right panel form editor |
| `src/components/YamlPreview.tsx` | Raw YAML preview |

## Key constraints (never violate)

- The center panel preview must match fang's rendering — if unsure, read ConversationOverlay.tsx
- YAML export must not include `position` fields (fang-backend auto-assigns them)
- Relative sprite/background URLs stay relative in state and export; base URL prefix is preview-only
- Minigames are not playable — render as labeled placeholder boxes
