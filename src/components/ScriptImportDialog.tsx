import { useEffect, useMemo, useRef, useState } from 'react'
import { parseYaml } from '../parse'
import type { Conversation } from '../types'
import {
  convertScript,
  fetchEditorCharacters,
  fetchEditorMeta,
  type CharacterSlot,
  type EditorCharacter,
  type EditorMeta,
} from '../api'

interface Props {
  baseUrl: string
  /** `create` (default): pick output filename and replace editor state. `append`: textarea only; caller appends conversations to the end of the current file. */
  mode?: 'create' | 'append'
  onImport: (conversations: Conversation[], filename: string) => void
  onClose: () => void
}

/** Prefer affection when present (Empire); fang has no affection kind. */
const PREFERRED_KIND = 'affection'
const PREFS_STORAGE_KEY = 'conversation-editor:script-import-prefs'

interface ScriptImportPrefs {
  characterId: string
  kind: string
  slotKey: string
}

function readPrefs(baseUrl: string): Partial<ScriptImportPrefs> {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY)
    if (!raw) return {}
    const all = JSON.parse(raw) as Record<string, Partial<ScriptImportPrefs>>
    return all[baseUrl] ?? {}
  } catch {
    return {}
  }
}

function writePrefs(baseUrl: string, prefs: ScriptImportPrefs): void {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY)
    const all = (raw ? JSON.parse(raw) : {}) as Record<string, ScriptImportPrefs>
    all[baseUrl] = prefs
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore quota / private mode
  }
}

function orderKinds(kinds: string[]): string[] {
  const preferred = kinds.filter(k => k === PREFERRED_KIND)
  const rest = kinds.filter(k => k !== PREFERRED_KIND)
  return [...preferred, ...rest]
}

function pickDefaultSlotKey(
  character: EditorCharacter,
  preferredKind: string | undefined,
  preferredSlotKey: string | undefined,
): string {
  const kinds = orderKinds([...new Set(character.slots.map(s => s.kind))])
  const kind =
    (preferredKind && character.slots.some(s => s.kind === preferredKind)
      ? preferredKind
      : null) ??
    (kinds.includes(PREFERRED_KIND) ? PREFERRED_KIND : kinds[0]) ??
    ''
  const kindSlots = character.slots.filter(s => s.kind === kind)
  return kindSlots.find(s => s.key === preferredSlotKey)?.key ?? kindSlots[0]?.key ?? ''
}

export function ScriptImportDialog({ baseUrl, mode = 'create', onImport, onClose }: Props) {
  const isAppend = mode === 'append'
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [meta, setMeta] = useState<EditorMeta | null>(null)
  const [characters, setCharacters] = useState<EditorCharacter[]>([])
  const [charsLoading, setCharsLoading] = useState(!isAppend)
  const [charsError, setCharsError] = useState<string | null>(null)

  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [selectedSlotKey, setSelectedSlotKey] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isAppend) return

    let cancelled = false
    setCharsLoading(true)
    setCharsError(null)

    Promise.all([fetchEditorMeta(baseUrl), fetchEditorCharacters(baseUrl)])
      .then(([metaData, chars]) => {
        if (cancelled) return
        setMeta(metaData)
        setCharacters(chars)
        if (chars.length > 0) {
          const prefs = readPrefs(baseUrl)
          const character =
            chars.find(c => c.id === prefs.characterId) ?? chars[0]
          setSelectedCharacterId(character.id)
          setSelectedSlotKey(
            pickDefaultSlotKey(character, prefs.kind, prefs.slotKey),
          )
        }
        setCharsLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setCharsError(err instanceof Error ? err.message : String(err))
        setCharsLoading(false)
      })

    return () => { cancelled = true }
  }, [baseUrl, isAppend])

  const currentCharacter = characters.find(c => c.id === selectedCharacterId)
  const slots = currentCharacter?.slots ?? []

  const slotsByKind = useMemo(() => {
    const map = new Map<string, CharacterSlot[]>()
    for (const slot of slots) {
      const list = map.get(slot.kind) ?? []
      list.push(slot)
      map.set(slot.kind, list)
    }
    return map
  }, [slots])

  const selectedSlot = slots.find(s => s.key === selectedSlotKey) ?? slots[0] ?? null
  const selectedKind = selectedSlot?.kind ?? meta?.slotKinds[0] ?? ''

  useEffect(() => {
    if (isAppend) return
    if (!selectedCharacterId || !selectedSlotKey || !selectedKind) return
    writePrefs(baseUrl, {
      characterId: selectedCharacterId,
      kind: selectedKind,
      slotKey: selectedSlotKey,
    })
  }, [baseUrl, isAppend, selectedCharacterId, selectedKind, selectedSlotKey])

  function handleCharacterChange(id: string) {
    setSelectedCharacterId(id)
    const character = characters.find(c => c.id === id)
    if (!character) {
      setSelectedSlotKey('')
      return
    }
    // Keep current type when the new character has it; else affection, else first.
    setSelectedSlotKey(pickDefaultSlotKey(character, selectedKind, undefined))
  }

  function handleKindChange(kind: string) {
    const kindSlots = slotsByKind.get(kind) ?? []
    setSelectedSlotKey(kindSlots[0]?.key ?? '')
  }

  function computeFilename(): string {
    return selectedSlot?.filename ?? 'imported-script.yml'
  }

  async function handleConvert() {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    try {
      const yamlText = await convertScript(baseUrl, text)
      const conversations = parseYaml(yamlText)
      onImport(conversations, isAppend ? '' : computeFilename())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleConvert()
  }

  const characterLabel = meta?.characterLabel ?? 'Character'
  const kindOptions = orderKinds(
    meta?.slotKinds?.length
      ? meta.slotKinds.filter(k => slotsByKind.has(k) || slots.some(s => s.kind === k))
      : [...slotsByKind.keys()],
  )

  const kindSlots = slotsByKind.get(selectedKind) ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col"
        style={{ width: 660, maxHeight: '85vh' }}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <span className="text-sm font-semibold text-gray-200">
            {isAppend ? 'Append from Script' : 'Import from Script'}
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        <div className="flex flex-col flex-1 overflow-y-auto min-h-0 p-4 gap-4">
          <p className="text-xs text-gray-400">
            Paste a narrative script below. Dialogue in double quotes becomes{' '}
            <span className="text-blue-400 font-mono">hero</span> lines; surrounding narrative becomes{' '}
            <span className="text-gray-300 font-mono">other</span> lines.
            {isAppend
              ? ' Converted conversations are appended to the end of the current file.'
              : ' The result replaces the current editor content.'}
          </p>

          {!isAppend && (
            <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 flex flex-col gap-3">
              <p className="text-xs font-medium text-gray-300">Output file name</p>

              {charsLoading ? (
                <p className="text-xs text-gray-500">Loading {characterLabel.toLowerCase()}s…</p>
              ) : charsError ? (
                <p className="text-xs text-red-400">Failed to load characters: {charsError}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-24 shrink-0">{characterLabel}</label>
                    <select
                      value={selectedCharacterId}
                      onChange={e => handleCharacterChange(e.target.value)}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                    >
                      {characters.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {kindOptions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-400 w-24 shrink-0">Type</label>
                      <div className="flex flex-wrap gap-2">
                        {kindOptions.map(kind => (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => handleKindChange(kind)}
                            className={`px-3 py-1 text-xs rounded transition-colors ${
                              selectedKind === kind
                                ? 'bg-pink-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {kind.charAt(0).toUpperCase() + kind.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {kindSlots.length > 1 && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-400 w-24 shrink-0">Slot</label>
                      <select
                        value={selectedSlot?.key ?? ''}
                        onChange={e => setSelectedSlotKey(e.target.value)}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                      >
                        {kindSlots.map(slot => (
                          <option key={slot.key} value={slot.key}>{slot.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1 border-t border-gray-700">
                    <label className="text-xs text-gray-400 w-24 shrink-0">Filename</label>
                    <span className="text-xs font-mono text-green-400">{computeFilename()}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'She smiled. "Hello there," she said. He nodded in silence.'}
            className="flex-1 min-h-[160px] bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-pink-500 resize-none font-mono"
            autoFocus
          />

          {error && (
            <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 shrink-0">
          <span className="text-xs text-gray-500">Cmd/Ctrl+Enter to convert</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConvert}
              disabled={loading || !text.trim()}
              className="px-3 py-1 text-xs rounded bg-pink-600 hover:bg-pink-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Converting…' : isAppend ? 'Convert & Append' : 'Convert & Load'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
