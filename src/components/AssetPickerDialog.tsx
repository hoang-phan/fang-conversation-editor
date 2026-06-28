import { useEffect, useRef, useState } from 'react'

interface Props {
  baseUrl: string
  onSelect: (path: string) => void
  onClose: () => void
  title?: string
  confirmLabel?: string
}

export function AssetPickerDialog({ baseUrl, onSelect, onClose, title = 'Add Sprite', confirmLabel = 'Add' }: Props) {
  const [assets, setAssets] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
    setLoading(true)
    fetch(`${baseUrl}/api/v1/assets`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<string[]>
      })
      .then(data => {
        setAssets(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [baseUrl])

  const filtered = query
    ? assets.filter(p => p.toLowerCase().includes(query.toLowerCase()))
    : assets

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && selected) onSelect(selected)
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
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <span className="text-sm font-semibold text-gray-200">{title}</span>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-gray-700 shrink-0">
          <input
            ref={searchRef}
            type="text"
            placeholder="Filter by path…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-pink-500"
          />
        </div>

        {/* Preview */}
        {selected && (
          <div className="px-4 py-2 border-b border-gray-700 shrink-0 flex items-center justify-center bg-gray-950" style={{ height: 140 }}>
            <img
              src={`${baseUrl}${selected}`}
              alt="preview"
              style={{ maxHeight: 120, maxWidth: '100%', objectFit: 'contain' }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
              Loading assets…
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-32 text-red-400 text-sm px-4 text-center">
              Failed to load assets: {error}
              <br />
              <span className="text-gray-500 text-xs mt-1">Check that the backend is running at {baseUrl}</span>
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
              No assets match "{query}"
            </div>
          )}
          {!loading && !error && filtered.map(path => (
            <button
              key={path}
              onClick={() => setSelected(path)}
              onDoubleClick={() => onSelect(path)}
              className={`w-full text-left px-4 py-2 text-xs font-mono transition-colors hover:bg-gray-800 ${
                selected === path
                  ? 'bg-pink-900/50 text-pink-300 border-l-2 border-pink-500'
                  : 'text-gray-300 border-l-2 border-transparent'
              }`}
            >
              {path}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 shrink-0">
          <span className="text-xs text-gray-500">
            {loading ? '…' : `${filtered.length} of ${assets.length}`}
            {' '}assets
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
              onClick={() => selected && onSelect(selected)}
              disabled={!selected}
              className="px-3 py-1 text-xs rounded bg-pink-600 hover:bg-pink-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
