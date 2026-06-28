import { useEffect, useRef, useState } from 'react'
import type { Chat, Conversation, ConversationFile } from './types'
import { parseYaml, exportYaml } from './parse'
import { ConversationList } from './components/ConversationList'
import { ConversationPreview } from './components/ConversationPreview'
import { EditPanel } from './components/EditPanel'
import { QuickAddEConversationsDialog } from './components/QuickAddEConversationsDialog'

export default function App() {
  const [conversations, setConversations] = useState<ConversationFile | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedChatIndex, setSelectedChatIndex] = useState(0)
  const [fileName, setFileName] = useState<string | null>(null)
  const [exportName, setExportName] = useState<string>('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000')
  const [uploadConfirm, setUploadConfirm] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [showQuickAddE, setShowQuickAddE] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleExport() {
    if (!conversations || !fileName) return
    const yaml = exportYaml(conversations)
    const blob = new Blob([yaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = exportName || fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleUpload() {
    if (!conversations || !fileName) return
    setUploadConfirm(false)
    setUploadStatus(null)
    const yaml = exportYaml(conversations)
    const blob = new Blob([yaml], { type: 'text/yaml' })
    const targetName = exportName || fileName
    const form = new FormData()
    form.append('file', blob, targetName)
    form.append('filename', targetName)
    try {
      const res = await fetch(`${baseUrl}/api/v1/assets/upload_conversation_yml`, {
        method: 'POST',
        body: form,
      })
      if (res.ok) {
        const data = await res.json()
        setUploadStatus({ ok: true, message: `Saved to ${data.path}` })
      } else {
        const text = await res.text()
        setUploadStatus({ ok: false, message: `Upload failed (${res.status}): ${text}` })
      }
    } catch (err) {
      setUploadStatus({ ok: false, message: `Upload error: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

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
        setExportName(file.name)
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
  const selectedChat = selectedConv?.chats[selectedChatIndex] ?? null

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      const tag = (e.target as HTMLElement).tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable

      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault()
        fileInputRef.current?.click()
        return
      }

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        if (!conversations || !fileName) return
        const yaml = exportYaml(conversations)
        const blob = new Blob([yaml], { type: 'text/yaml' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = exportName || fileName
        a.click()
        URL.revokeObjectURL(url)
        return
      }

      if (isTyping) return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (!conversations) return
        if (selectedChatIndex > 0) {
          setSelectedChatIndex(selectedChatIndex - 1)
        } else if (selectedIndex > 0) {
          const prevIdx = selectedIndex - 1
          setSelectedIndex(prevIdx)
          setSelectedChatIndex(conversations[prevIdx].chats.length - 1)
        }
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (!conversations) return
        const chatCount = conversations[selectedIndex].chats.length
        if (selectedChatIndex < chatCount - 1) {
          setSelectedChatIndex(selectedChatIndex + 1)
        } else if (selectedIndex < conversations.length - 1) {
          setSelectedIndex(selectedIndex + 1)
          setSelectedChatIndex(0)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [conversations, selectedIndex, selectedChatIndex, fileName, exportName])

  function handleChatChange(updated: Chat) {
    if (!conversations) return
    setConversations(conversations.map((conv, ci) => {
      if (ci !== selectedIndex) return conv
      return {
        ...conv,
        chats: conv.chats.map((chat, i) => i === selectedChatIndex ? updated : chat),
      }
    }))
  }

  function handleConversationChange(updated: Conversation) {
    if (!conversations) return
    setConversations(conversations.map((conv, ci) => ci === selectedIndex ? updated : conv))
  }

  function handleAddChat(chat: Chat, insertAt: number) {
    if (!conversations) return
    setConversations(conversations.map((conv, ci) => {
      if (ci !== selectedIndex) return conv
      const chats = [...conv.chats]
      chats.splice(insertAt, 0, chat)
      return { ...conv, chats }
    }))
    setSelectedChatIndex(insertAt)
  }

  function handleDeleteChat(chatIndex: number) {
    if (!conversations) return
    const conv = conversations[selectedIndex]
    if (conv.chats.length <= 1) return // don't delete the last chat
    setConversations(conversations.map((c, ci) => {
      if (ci !== selectedIndex) return c
      return { ...c, chats: c.chats.filter((_, i) => i !== chatIndex) }
    }))
    setSelectedChatIndex(Math.min(chatIndex, conv.chats.length - 2))
  }

  function handleSplitHere(chatIndex: number) {
    if (!conversations) return
    const conv = conversations[selectedIndex]
    if (chatIndex >= conv.chats.length - 1) return // nothing to split off
    const convA: Conversation = {
      ...conv,
      chats: conv.chats.slice(0, chatIndex + 1),
    }
    const convB: Conversation = {
      ...conv,
      chats: conv.chats.slice(chatIndex + 1),
    }
    const next = [
      ...conversations.slice(0, selectedIndex),
      convA,
      convB,
      ...conversations.slice(selectedIndex + 1),
    ]
    setConversations(next)
    setSelectedChatIndex(0)
    // keep selectedIndex pointing at convA; convB is at selectedIndex + 1
  }

  function handleQuickAddEConversations(paths: string[]) {
    const newConvs: Conversation[] = paths.map(path => ({
      background_url: path,
      chats: [{ role: 'other' as const, content: '(...)' }],
    }))
    setConversations(prev => prev ? [...prev, ...newConvs] : newConvs)
    setShowQuickAddE(false)
  }

  function handleMergeWithPrev() {
    if (!conversations) return
    if (selectedIndex === 0) return
    const prev = conversations[selectedIndex - 1]
    const curr = conversations[selectedIndex]
    const merged: Conversation = {
      ...prev,
      chats: [...prev.chats, ...curr.chats],
    }
    const next = [
      ...conversations.slice(0, selectedIndex - 1),
      merged,
      ...conversations.slice(selectedIndex + 1),
    ]
    setConversations(next)
    setSelectedIndex(selectedIndex - 1)
    setSelectedChatIndex(prev.chats.length) // first chat from the merged-in block
  }

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
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={exportName}
            onChange={e => setExportName(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs text-gray-200 w-44 font-mono"
            placeholder="output.yml"
          />
          <button
            onClick={handleExport}
            className="px-3 py-1 bg-pink-700 hover:bg-pink-600 text-white text-xs rounded transition-colors"
          >
            Export YAML
          </button>
          <button
            onClick={() => setShowQuickAddE(true)}
            className="px-3 py-1 bg-indigo-700 hover:bg-indigo-600 text-white text-xs rounded transition-colors"
          >
            Quick Add E-Convs
          </button>
          <button
            onClick={() => setUploadConfirm(true)}
            className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white text-xs rounded transition-colors"
          >
            Upload to Backend
          </button>
        </div>
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
              chatIndex={selectedChatIndex}
              onChatIndexChange={setSelectedChatIndex}
              hasPrevConversation={selectedIndex > 0}
              hasNextConversation={selectedIndex < conversations.length - 1}
              onPrevConversation={() => {
                const prevIdx = selectedIndex - 1
                setSelectedIndex(prevIdx)
                setSelectedChatIndex(conversations[prevIdx].chats.length - 1)
              }}
              onNextConversation={() => {
                setSelectedIndex(selectedIndex + 1)
                setSelectedChatIndex(0)
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Select a conversation to preview.
            </div>
          )}
        </div>

        {/* Quick Add E-Conversations dialog */}
        {showQuickAddE && (
          <QuickAddEConversationsDialog
            baseUrl={baseUrl}
            onAdd={handleQuickAddEConversations}
            onClose={() => setShowQuickAddE(false)}
          />
        )}

        {/* Upload confirmation modal */}
        {uploadConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-80 flex flex-col gap-4 shadow-xl">
              <p className="text-sm text-gray-200 font-semibold">Upload to backend?</p>
              <p className="text-xs text-gray-400">
                This will write <span className="text-gray-200 font-mono">{exportName || fileName}</span> to{' '}
                <span className="text-gray-200">db/seeds/conversations/</span> on{' '}
                <span className="text-gray-200">{baseUrl}</span>.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setUploadConfirm(false)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs rounded transition-colors"
                >
                  Upload
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload status toast */}
        {uploadStatus && (
          <div
            className={`fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs shadow-lg flex items-center gap-3 ${
              uploadStatus.ok ? 'bg-green-800 text-green-100' : 'bg-red-900 text-red-200'
            }`}
          >
            <span>{uploadStatus.message}</span>
            <button
              onClick={() => setUploadStatus(null)}
              className="text-current opacity-60 hover:opacity-100 font-bold leading-none"
            >
              ✕
            </button>
          </div>
        )}

        {/* Right panel — edit panel */}
        <div className="w-72 shrink-0 border-l border-gray-700 bg-gray-900 flex flex-col">
          {selectedChat && selectedConv ? (
            <EditPanel
              conversation={selectedConv}
              chat={selectedChat}
              chatIndex={selectedChatIndex}
              baseUrl={baseUrl}
              onChange={handleChatChange}
              onConversationChange={handleConversationChange}
              onSplitHere={handleSplitHere}
              onMergeWithPrev={handleMergeWithPrev}
              hasPrevConversation={selectedIndex > 0}
              onAddChat={handleAddChat}
              onDeleteChat={handleDeleteChat}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-xs text-center px-4">
              Select a conversation to edit.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
