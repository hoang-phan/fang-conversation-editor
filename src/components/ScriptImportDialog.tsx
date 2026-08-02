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
  onImport: (conversations: Conversation[], filename: string) => void
  onClose: () => void
}

export function ScriptImportDialog({ baseUrl, onImport, onClose }: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [meta, setMeta] = useState<EditorMeta | null>(null)
  const [characters, setCharacters] = useState<EditorCharacter[]>([])
  const [charsLoading, setCharsLoading] = useState(true)
  const [charsError, setCharsError] = useState<string | null>(null)

  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [selectedSlotKey, setSelectedSlotKey] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    setCharsLoading(true)
    setCharsError(null)

    Promise.all([fetchEditorMeta(baseUrl), fetchEditorCharacters(baseUrl)])
      .then(([metaData, chars]) => {
        if (cancelled) return
        setMeta(metaData)
        setCharacters(chars)
        if (chars.length > 0) {
          setSelectedCharacterId(chars[0].id)
          setSelectedSlotKey(chars[0].slots[0]?.key ?? '')
        }
        setCharsLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setCharsError(err instanceof Error ? err.message : String(err))
        setCharsLoading(false)
      })

    return () => { cancelled = true }
  }, [baseUrl])

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

  function handleCharacterChange(id: string) {
    setSelectedCharacterId(id)
    const character = characters.find(c => c.id === id)
    setSelectedSlotKey(character?.slots[0]?.key ?? '')
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
      onImport(conversations, computeFilename())
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
  const kindOptions = meta?.slotKinds?.length
    ? meta.slotKinds.filter(k => slotsByKind.has(k) || slots.some(s => s.kind === k))
    : [...slotsByKind.keys()]

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
          <span className="text-sm font-semibold text-gray-200">Import from Script</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        <div className="flex flex-col flex-1 overflow-y-auto min-h-0 p-4 gap-4">
          <p className="text-xs text-gray-400">
            Paste a narrative script below. Dialogue in double quotes becomes{' '}
            <span className="text-blue-400 font-mono">hero</span> lines; surrounding narrative becomes{' '}
            <span className="text-gray-300 font-mono">other</span> lines. The result replaces the current editor content.
          </p>

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
              {loading ? 'Converting…' : 'Convert & Load'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
