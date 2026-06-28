import { useEffect, useRef, useState } from 'react'
import { parseYaml } from '../parse'
import type { Conversation } from '../types'

interface OpponentOption {
  id: string
  name: string
  giftNames: string[]
}

type ConvType = 'chat' | 'gift' | 'cinematic'

interface Props {
  baseUrl: string
  onImport: (conversations: Conversation[], filename: string) => void
  onClose: () => void
}

export function ScriptImportDialog({ baseUrl, onImport, onClose }: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [opponents, setOpponents] = useState<OpponentOption[]>([])
  const [opponentsLoading, setOpponentsLoading] = useState(true)
  const [opponentsError, setOpponentsError] = useState<string | null>(null)

  const [selectedOpponent, setSelectedOpponent] = useState<string>('')
  const [convType, setConvType] = useState<ConvType>('chat')
  const [selectedGift, setSelectedGift] = useState<string>('')
  const [cinematicLevel, setCinematicLevel] = useState<number>(1)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch(`${baseUrl}/api/v1/opponent_options`)
      .then(r => r.json())
      .then((data: OpponentOption[]) => {
        setOpponents(data)
        if (data.length > 0) {
          setSelectedOpponent(data[0].id)
          setSelectedGift(data[0].giftNames[0] ?? '')
        }
        setOpponentsLoading(false)
      })
      .catch(err => {
        setOpponentsError(err instanceof Error ? err.message : String(err))
        setOpponentsLoading(false)
      })
  }, [baseUrl])

  // When opponent changes, reset gift to first gift of new opponent
  function handleOpponentChange(id: string) {
    setSelectedOpponent(id)
    const opp = opponents.find(o => o.id === id)
    setSelectedGift(opp?.giftNames[0] ?? '')
  }

  function computeFilename(): string {
    if (!selectedOpponent) return 'imported-script.yml'
    if (convType === 'chat') return `${selectedOpponent}-conversations.yml`
    if (convType === 'gift') return `${selectedOpponent}-gift-${selectedGift || 'unknown'}.yml`
    if (convType === 'cinematic') return `${selectedOpponent}-cinematic-${cinematicLevel}.yml`
    return 'imported-script.yml'
  }

  async function handleConvert() {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${baseUrl}/api/v1/scripts/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Server error (${res.status}): ${body}`)
      }
      const yamlText = await res.text()
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

  const currentOpponent = opponents.find(o => o.id === selectedOpponent)

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

          {/* File name inputs */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 flex flex-col gap-3">
            <p className="text-xs font-medium text-gray-300">Output file name</p>

            {opponentsLoading ? (
              <p className="text-xs text-gray-500">Loading opponents…</p>
            ) : opponentsError ? (
              <p className="text-xs text-red-400">Failed to load opponents: {opponentsError}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {/* Opponent */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400 w-24 shrink-0">Opponent</label>
                  <select
                    value={selectedOpponent}
                    onChange={e => handleOpponentChange(e.target.value)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                  >
                    {opponents.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>

                {/* Type */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400 w-24 shrink-0">Type</label>
                  <div className="flex gap-2">
                    {(['chat', 'gift', 'cinematic'] as ConvType[]).map(t => (
                      <button
                        key={t}
                        onClick={() => setConvType(t)}
                        className={`px-3 py-1 text-xs rounded transition-colors ${
                          convType === t
                            ? 'bg-pink-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gift selector */}
                {convType === 'gift' && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-24 shrink-0">Gift</label>
                    {currentOpponent && currentOpponent.giftNames.length > 0 ? (
                      <select
                        value={selectedGift}
                        onChange={e => setSelectedGift(e.target.value)}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                      >
                        {currentOpponent.giftNames.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-500 italic">No gifts for this opponent</span>
                    )}
                  </div>
                )}

                {/* Cinematic level */}
                {convType === 'cinematic' && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-24 shrink-0">Level</label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          onClick={() => setCinematicLevel(n)}
                          className={`w-8 h-8 text-xs rounded transition-colors ${
                            cinematicLevel === n
                              ? 'bg-pink-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Computed filename preview */}
                <div className="flex items-center gap-2 pt-1 border-t border-gray-700">
                  <label className="text-xs text-gray-400 w-24 shrink-0">Filename</label>
                  <span className="text-xs font-mono text-green-400">{computeFilename()}</span>
                </div>
              </div>
            )}
          </div>

          {/* Script textarea */}
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
