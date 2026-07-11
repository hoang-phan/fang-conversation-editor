import { useEffect, useRef, useState } from 'react'

interface Props {
  baseUrl: string
  onConfirm: (paths: string[]) => void
  onClose: () => void
}

export function DuplicateForAssetsDialog({ baseUrl, onConfirm, onClose }: Props) {
  const [assets, setAssets] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
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

  function toggleAsset(path: string) {
    setSelected(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    )
  }

  function moveUp(index: number) {
    if (index === 0) return
    setSelected(prev => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  function moveDown(index: number) {
    setSelected(prev => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && selected.length > 0) onConfirm(selected)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col"
        style={{ width: 760, maxHeight: '85vh' }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <span className="text-sm font-semibold text-gray-200">Duplicate Conversation for Assets</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left: asset browser */}
          <div className="flex flex-col w-1/2 border-r border-gray-700 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-700 shrink-0">
              <input
                ref={searchRef}
                type="text"
                placeholder="Filter assets…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-pink-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {loading && (
                <div className="flex items-center justify-center h-32 text-gray-500 text-sm">Loading assets…</div>
              )}
              {error && (
                <div className="flex items-center justify-center h-32 text-red-400 text-sm px-4 text-center">
                  Failed to load assets: {error}
                </div>
              )}
              {!loading && !error && filtered.length === 0 && (
                <div className="flex items-center justify-center h-32 text-gray-500 text-sm">No assets match.</div>
              )}
              {!loading && !error && filtered.map(path => {
                const isChosen = selected.includes(path)
                return (
                  <button
                    key={path}
                    onClick={() => toggleAsset(path)}
                    className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors hover:bg-gray-800 flex items-center gap-2 ${
                      isChosen
                        ? 'bg-pink-900/40 text-pink-300 border-l-2 border-pink-500'
                        : 'text-gray-300 border-l-2 border-transparent'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 text-[10px] ${
                      isChosen ? 'bg-pink-500 border-pink-500 text-white' : 'border-gray-500'
                    }`}>
                      {isChosen ? '✓' : ''}
                    </span>
                    <span className="truncate">{path}</span>
                  </button>
                )
              })}
            </div>
            <div className="px-3 py-1.5 border-t border-gray-700 shrink-0 text-xs text-gray-500">
              {loading ? '…' : `${filtered.length} of ${assets.length}`} assets
            </div>
          </div>

          {/* Right: selected order */}
          <div className="flex flex-col w-1/2 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-700 shrink-0 text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Selected order ({selected.length})
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {selected.length === 0 && (
                <div className="flex items-center justify-center h-32 text-gray-600 text-xs text-center px-4">
                  Click assets on the left to add them here in order.
                </div>
              )}
              {selected.map((path, i) => (
                <div key={path} className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-800 hover:bg-gray-800/50">
                  <span className="text-[10px] text-gray-500 w-5 shrink-0 text-right">{i + 1}.</span>
                  {path.endsWith('.mp4') ? (
                    <div className="w-8 h-8 rounded shrink-0 bg-gray-800 flex items-center justify-center text-gray-400 text-[9px]">
                      MP4
                    </div>
                  ) : (
                    <img
                      src={`${baseUrl}${path}`}
                      alt=""
                      className="w-8 h-8 object-contain rounded shrink-0 bg-gray-800"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                    />
                  )}
                  <span className="text-xs font-mono text-gray-300 flex-1 truncate min-w-0">{path}</span>
                  <button
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="text-gray-500 hover:text-gray-200 disabled:opacity-20 px-1 text-xs"
                    title="Move up"
                  >▲</button>
                  <button
                    onClick={() => moveDown(i)}
                    disabled={i === selected.length - 1}
                    className="text-gray-500 hover:text-gray-200 disabled:opacity-20 px-1 text-xs"
                    title="Move down"
                  >▼</button>
                  <button
                    onClick={() => toggleAsset(path)}
                    className="text-gray-600 hover:text-red-400 px-1 text-xs"
                    title="Remove"
                  >✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 shrink-0">
          <span className="text-xs text-gray-500">
            Each selected video/image duplicates the current conversation, with its background_url set to that asset.
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(selected)}
              disabled={selected.length === 0}
              className="px-3 py-1 text-xs rounded bg-pink-600 hover:bg-pink-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Duplicate for {selected.length > 0 ? `${selected.length} ` : ''}Asset{selected.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
