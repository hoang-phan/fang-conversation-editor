import { useEffect, useRef, useState } from 'react'
import { fetchConversationYml, fetchConversationYmls } from '../api'
import { fuzzyFilter } from '../fuzzyFilter'
import {
  CONVERSATION_PICKER_FILTER_KEY,
  loadLastFilter,
  saveLastFilter,
} from '../lastFilter'

interface Props {
  baseUrl: string
  onSelect: (filename: string, yamlText: string) => void
  onClose: () => void
  eBackgroundDescale: number
  nonEBackgroundDescale: number
  onEBackgroundDescaleChange: (v: number) => void
  onNonEBackgroundDescaleChange: (v: number) => void
}

export function ConversationPickerDialog({
  baseUrl,
  onSelect,
  onClose,
  eBackgroundDescale,
  nonEBackgroundDescale,
  onEBackgroundDescaleChange,
  onNonEBackgroundDescaleChange,
}: Props) {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState(() => loadLastFilter(CONVERSATION_PICKER_FILTER_KEY))
  const [selected, setSelected] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
    setLoading(true)
    fetchConversationYmls(baseUrl)
      .then(data => {
        setFiles(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [baseUrl])

  const filtered = fuzzyFilter(files, query)

  function updateQuery(value: string) {
    setQuery(value)
    saveLastFilter(CONVERSATION_PICKER_FILTER_KEY, value)
  }

  async function openFile(filename: string) {
    setOpening(true)
    setOpenError(null)
    try {
      const yamlText = await fetchConversationYml(baseUrl, filename)
      onSelect(filename, yamlText)
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : String(err))
      setOpening(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && selected && !opening) void openFile(selected)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <span className="text-sm font-semibold text-gray-200">Open conversation YAML</span>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-2 border-b border-gray-700 shrink-0">
          <input
            ref={searchRef}
            type="text"
            placeholder="Filter by filename (fuzzy)…"
            value={query}
            onChange={e => updateQuery(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-pink-500"
          />
          <p className="mt-1.5 text-[11px] text-gray-500">
            Files from <span className="font-mono text-gray-400">db/seeds/conversations/</span> on {baseUrl}
          </p>
          <div className="flex flex-col gap-2 mt-2">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-widest">Import Sprite De-scale</span>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-500">E-Background Sprite De-scale</span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={eBackgroundDescale}
                  onChange={e => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n)) onEBackgroundDescaleChange(n)
                  }}
                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-500">Non-E-Background Sprite De-scale</span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={nonEBackgroundDescale}
                  onChange={e => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n)) onNonEBackgroundDescaleChange(n)
                  }}
                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
              Loading conversation files…
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-32 text-red-400 text-sm px-4 text-center">
              Failed to load files: {error}
              <br />
              <span className="text-gray-500 text-xs mt-1">Check that the backend is running at {baseUrl}</span>
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
              {files.length === 0 ? 'No conversation YAML files found' : `No files match "${query}"`}
            </div>
          )}
          {!loading && !error && filtered.map(name => (
            <button
              key={name}
              onClick={() => { setSelected(name); setOpenError(null) }}
              onDoubleClick={() => { if (!opening) void openFile(name) }}
              className={`w-full text-left px-4 py-2 text-xs font-mono transition-colors hover:bg-gray-800 ${
                selected === name
                  ? 'bg-pink-900/50 text-pink-300 border-l-2 border-pink-500'
                  : 'text-gray-300 border-l-2 border-transparent'
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        {openError && (
          <div className="px-4 py-2 border-t border-red-900/50 bg-red-950/40 text-red-300 text-xs shrink-0">
            {openError}
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 shrink-0">
          <span className="text-xs text-gray-500">
            {loading ? '…' : `${filtered.length} of ${files.length}`}
            {' '}files
            {selected && <> · <span className="text-pink-400">{selected}</span></>}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => selected && void openFile(selected)}
              disabled={!selected || opening}
              className="px-3 py-1 text-xs rounded bg-pink-600 hover:bg-pink-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {opening ? 'Opening…' : 'Open'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
