import { useRef, useState } from 'react'
import type { ConversationFile } from './types'
import { parseYaml } from './parse'
import { ConversationList } from './components/ConversationList'
import { ConversationPreview } from './components/ConversationPreview'

export default function App() {
  const [conversations, setConversations] = useState<ConversationFile | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError(null)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const text = ev.target?.result as string
        const parsed = parseYaml(text)
        setConversations(parsed)
        setSelectedIndex(0)
        setFileName(file.name)
      } catch (err) {
        setParseError(err instanceof Error ? err.message : String(err))
        setConversations(null)
        setFileName(null)
      }
    }
    reader.readAsText(file)
    // Reset input so the same file can be re-loaded
    e.target.value = ''
  }

  const selectedConv = conversations?.[selectedIndex] ?? null

  if (!conversations) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center gap-6">
        <h1 className="text-3xl font-bold text-pink-400">Fang Conversation Editor</h1>
        <p className="text-gray-400 text-sm">Load a conversation YAML file to get started.</p>
        {parseError && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 px-4 py-2 rounded text-sm max-w-md text-center">
            {parseError}
          </div>
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-6 py-3 bg-pink-500 hover:bg-pink-400 text-white font-semibold rounded-lg transition-colors"
        >
          Open YAML file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".yml,.yaml"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="shrink-0 flex items-center gap-4 px-4 py-2 bg-gray-900 border-b border-gray-700">
        <span className="text-pink-400 font-bold text-sm">Fang Conversation Editor</span>
        <span className="text-gray-500 text-xs">{fileName}</span>
        <div className="flex-1" />
        <label className="text-xs text-gray-400 flex items-center gap-2">
          Base URL
          <input
            type="text"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs text-gray-200 w-52"
          />
        </label>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
        >
          Open file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".yml,.yaml"
          className="hidden"
          onChange={handleFileChange}
        />
      </header>

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — conversation list */}
        <div className="w-56 shrink-0 border-r border-gray-700 overflow-hidden flex flex-col bg-gray-900">
          <ConversationList
            conversations={conversations}
            selectedIndex={selectedIndex}
            baseUrl={baseUrl}
            onSelect={i => { setSelectedIndex(i) }}
          />
        </div>

        {/* Center panel — preview */}
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-950">
          {selectedConv ? (
            <ConversationPreview
              key={selectedIndex}
              conversation={selectedConv}
              baseUrl={baseUrl}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Select a conversation to preview.
            </div>
          )}
        </div>

        {/* Right panel — placeholder for edit panel */}
        <div className="w-72 shrink-0 border-l border-gray-700 bg-gray-900 flex flex-col">
          <div className="px-3 py-2 border-b border-gray-700 shrink-0">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Edit</span>
          </div>
          <div className="flex-1 flex items-center justify-center text-gray-600 text-xs text-center px-4">
            Editing panel coming soon.
            <br />Select a chat in the preview.
          </div>
        </div>
      </div>
    </div>
  )
}
