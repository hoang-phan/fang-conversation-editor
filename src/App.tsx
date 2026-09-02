import { useEffect, useRef, useState } from 'react'
import type { Chat, Conversation, ConversationFile, Sprite } from './types'
import { parseYaml, exportYaml } from './parse'
import { mergeLlmConvert } from './mergeLlmConvert'
import { ensureEBackgroundCinematics } from './ensureEBackgroundCinematics'
import {
  SERVER_PROFILES,
  serverProfileIdFromLocation,
  syncServerQueryParam,
  uploadConversationYml,
} from './api'
import { ConversationList } from './components/ConversationList'
import { ConversationPreview } from './components/ConversationPreview'
import { EditPanel } from './components/EditPanel'
import { QuickAddEConversationsDialog } from './components/QuickAddEConversationsDialog'
import { DuplicateForAssetsDialog } from './components/DuplicateForAssetsDialog'
import { ScriptImportDialog, type ScriptImportEnrichment } from './components/ScriptImportDialog'
import { ConversationPickerDialog } from './components/ConversationPickerDialog'

type EnrichStatus =
  | { state: 'enriching' }
  | { state: 'enriched' }
  | { state: 'error'; message: string }

export default function App() {
  const [conversations, setConversations] = useState<ConversationFile | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedChatIndex, setSelectedChatIndex] = useState(0)
  const [fileName, setFileName] = useState<string | null>(null)
  const [exportName, setExportName] = useState<string>('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [serverProfileId, setServerProfileId] = useState(serverProfileIdFromLocation)
  const [customBaseUrl, setCustomBaseUrl] = useState('http://localhost:3001')
  const [uploadConfirm, setUploadConfirm] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [showQuickAddE, setShowQuickAddE] = useState(false)
  const [showDuplicateForAssets, setShowDuplicateForAssets] = useState(false)
  // Survives EditPanel remounts (e.g. chat index briefly out of range) so multi-sprite paste still works
  const [spriteClipboard, setSpriteClipboard] = useState<Sprite[] | null>(null)
  const [showScriptImport, setShowScriptImport] = useState(false)
  const [showConversationPicker, setShowConversationPicker] = useState(false)
  const [enrichStatus, setEnrichStatus] = useState<EnrichStatus | null>(null)

  /** Abort handle for the in-flight LLM enrich request (stale converts). */
  const enrichAbortRef = useRef<(() => void) | null>(null)
  const enrichGenerationRef = useRef(0)

  const activeProfile = SERVER_PROFILES.find(p => p.id === serverProfileId) ?? SERVER_PROFILES[0]
  const baseUrl = serverProfileId === 'custom' ? customBaseUrl : activeProfile.baseUrl

  function cancelEnrich() {
    enrichAbortRef.current?.()
    enrichAbortRef.current = null
    enrichGenerationRef.current += 1
    setEnrichStatus(null)
  }

  function beginEnrich(
    enrichment: ScriptImportEnrichment,
    /** For append mode: conversations before this index are left untouched. */
    appendStart: number | null,
  ) {
    cancelEnrich()
    const generation = enrichGenerationRef.current
    enrichAbortRef.current = enrichment.abort
    setEnrichStatus({ state: 'enriching' })

    enrichment.promise
      .then(llmConversations => {
        if (generation !== enrichGenerationRef.current) return
        setConversations(prev => {
          if (!prev) return prev
          if (appendStart == null) {
            return mergeLlmConvert(prev, enrichment.baseline, llmConversations)
          }
          const head = prev.slice(0, appendStart)
          const tail = prev.slice(appendStart)
          return [...head, ...mergeLlmConvert(tail, enrichment.baseline, llmConversations)]
        })
        setEnrichStatus({ state: 'enriched' })
        enrichAbortRef.current = null
      })
      .catch(err => {
        if (generation !== enrichGenerationRef.current) return
        const aborted =
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError')
        if (aborted) {
          setEnrichStatus(null)
          return
        }
        const message = err instanceof Error ? err.message : String(err)
        setEnrichStatus({ state: 'error', message })
        enrichAbortRef.current = null
      })
  }

  function handleScriptImport(
    imported: Conversation[],
    filename: string,
    enrichment: ScriptImportEnrichment | undefined,
    mode: 'create' | 'append',
  ) {
    const withCinematics = ensureEBackgroundCinematics(imported)
    if (mode === 'create') {
      setConversations(withCinematics)
      setSelectedIndex(0)
      setSelectedChatIndex(0)
      setFileName(filename)
      setExportName(filename)
      setShowScriptImport(false)
      if (enrichment) beginEnrich(enrichment, null)
      else cancelEnrich()
      return
    }

    const appendAt = conversations?.length ?? 0
    setConversations(prev => (prev ? [...prev, ...withCinematics] : withCinematics))
    setSelectedIndex(appendAt)
    setSelectedChatIndex(0)
    setShowScriptImport(false)
    if (enrichment) beginEnrich(enrichment, appendAt)
    else cancelEnrich()
  }

  function handleServerProfileChange(id: string) {
    setServerProfileId(id)
    syncServerQueryParam(id)
  }

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
    const targetName = exportName || fileName
    try {
      const data = await uploadConversationYml(baseUrl, targetName, yaml)
      setUploadStatus({ ok: true, message: `Saved to ${data.path}` })
    } catch (err) {
      setUploadStatus({ ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }

  function handleOpenYaml(filename: string, text: string) {
    setParseError(null)
    try {
      const parsed = parseYaml(text)
      cancelEnrich()
      setConversations(parsed)
      setSelectedIndex(0)
      setSelectedChatIndex(0)
      setFileName(filename)
      setExportName(filename)
      setShowConversationPicker(false)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err))
      setConversations(null)
      setFileName(null)
      setShowConversationPicker(false)
    }
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
        setShowConversationPicker(true)
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
    setConversations(prev => {
      if (!prev || prev.length === 0) return newConvs
      return [
        ...prev.slice(0, selectedIndex + 1),
        ...newConvs,
        ...prev.slice(selectedIndex + 1),
      ]
    })
    setShowQuickAddE(false)
  }

  function handleDuplicateForAssets(paths: string[]) {
    if (!conversations) return
    const source = conversations[selectedIndex]
    const clones: Conversation[] = paths.map(path => ({
      ...source,
      background_url: path,
      chats: source.chats.map(chat => ({
        ...chat,
        sprites: chat.sprites ? chat.sprites.map(s => ({ ...s })) : undefined,
      })),
    }))
    const next = [
      ...conversations.slice(0, selectedIndex + 1),
      ...clones,
      ...conversations.slice(selectedIndex + 1),
    ]
    setConversations(next)
    setShowDuplicateForAssets(false)
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

  function handleMoveChatToPrev(chatIndex: number) {
    if (!conversations) return
    if (selectedIndex === 0) return
    const prev = conversations[selectedIndex - 1]
    const curr = conversations[selectedIndex]
    const chat = curr.chats[chatIndex]
    if (!chat) return

    const updatedPrev: Conversation = {
      ...prev,
      chats: [...prev.chats, chat],
    }
    const remainingChats = curr.chats.filter((_, i) => i !== chatIndex)

    if (remainingChats.length === 0) {
      const next = [
        ...conversations.slice(0, selectedIndex - 1),
        updatedPrev,
        ...conversations.slice(selectedIndex + 1),
      ]
      setConversations(next)
      setSelectedIndex(selectedIndex - 1)
      setSelectedChatIndex(updatedPrev.chats.length - 1)
      return
    }

    const updatedCurr: Conversation = { ...curr, chats: remainingChats }
    setConversations(conversations.map((c, i) => {
      if (i === selectedIndex - 1) return updatedPrev
      if (i === selectedIndex) return updatedCurr
      return c
    }))
    setSelectedChatIndex(Math.min(chatIndex, remainingChats.length - 1))
  }

  function handleDeleteConversation() {
    if (!conversations) return
    if (conversations.length <= 1) return // don't delete the last conversation
    const next = conversations.filter((_, i) => i !== selectedIndex)
    setConversations(next)
    const newIndex = Math.min(selectedIndex, next.length - 1)
    setSelectedIndex(newIndex)
    setSelectedChatIndex(0)
  }

  function handleReorderConversations(fromIndex: number, toIndex: number) {
    if (!conversations) return
    if (fromIndex === toIndex) return
    const next = [...conversations]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setConversations(next)

    if (selectedIndex === fromIndex) {
      setSelectedIndex(toIndex)
    } else if (fromIndex < selectedIndex && toIndex >= selectedIndex) {
      setSelectedIndex(selectedIndex - 1)
    } else if (fromIndex > selectedIndex && toIndex <= selectedIndex) {
      setSelectedIndex(selectedIndex + 1)
    }
  }

  if (!conversations) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center gap-6">
        <h1 className="text-3xl font-bold text-pink-400">Fang Conversation Editor</h1>
        <label className="text-xs text-gray-400 flex items-center gap-2">
          Server
          <select
            value={serverProfileId}
            onChange={e => handleServerProfileChange(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs text-gray-200"
          >
            {SERVER_PROFILES.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-400 flex items-center gap-2">
          Base URL
          <input
            type="text"
            value={baseUrl}
            onChange={e => {
              handleServerProfileChange('custom')
              setCustomBaseUrl(e.target.value)
            }}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs text-gray-200 w-52"
          />
        </label>
        <p className="text-gray-400 text-sm">Load a conversation YAML file to get started.</p>
        {parseError && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 px-4 py-2 rounded text-sm max-w-md text-center">
            {parseError}
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => setShowConversationPicker(true)}
            className="px-6 py-3 bg-pink-500 hover:bg-pink-400 text-white font-semibold rounded-lg transition-colors"
          >
            Open YAML file
          </button>
          <button
            onClick={() => setShowScriptImport(true)}
            className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg transition-colors"
          >
            Import from Script
          </button>
        </div>
        {showConversationPicker && (
          <ConversationPickerDialog
            baseUrl={baseUrl}
            onSelect={handleOpenYaml}
            onClose={() => setShowConversationPicker(false)}
          />
        )}
        {showScriptImport && (
          <ScriptImportDialog
            baseUrl={baseUrl}
            mode="create"
            onImport={(imported, filename, enrichment) => {
              handleScriptImport(imported, filename, enrichment, 'create')
            }}
            onClose={() => setShowScriptImport(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="shrink-0 flex items-center gap-4 px-4 py-2 bg-gray-900 border-b border-gray-700">
        <span className="text-pink-400 font-bold text-sm">Fang Conversation Editor</span>
        <span className="text-gray-500 text-xs">{fileName}</span>
        {enrichStatus?.state === 'enriching' && (
          <span className="text-xs text-violet-300 animate-pulse">LLM enriching…</span>
        )}
        {enrichStatus?.state === 'enriched' && (
          <span className="text-xs text-green-400">LLM enriched</span>
        )}
        {enrichStatus?.state === 'error' && (
          <span className="text-xs text-red-400" title={enrichStatus.message}>
            LLM enrich failed
          </span>
        )}
        <div className="flex-1" />
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
            onClick={() => setShowScriptImport(true)}
            className="px-3 py-1 bg-violet-700 hover:bg-violet-600 text-white text-xs rounded transition-colors"
          >
            Import Script
          </button>
          <button
            onClick={() => setShowQuickAddE(true)}
            className="px-3 py-1 bg-indigo-700 hover:bg-indigo-600 text-white text-xs rounded transition-colors"
          >
            Quick Add E-Convs
          </button>
          <button
            onClick={() => setShowDuplicateForAssets(true)}
            disabled={!selectedConv}
            className="px-3 py-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded transition-colors"
            title="Duplicate the selected conversation once per chosen video/image asset"
          >
            Duplicate for Assets
          </button>
          <button
            onClick={() => setUploadConfirm(true)}
            className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white text-xs rounded transition-colors"
          >
            Upload to Backend
          </button>
        </div>
        <button
          onClick={() => setShowConversationPicker(true)}
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors"
        >
          Open file
        </button>
      </header>

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — conversation list */}
        <div className="w-56 shrink-0 border-r border-gray-700 overflow-hidden flex flex-col bg-gray-900">
          <ConversationList
            conversations={conversations}
            selectedIndex={selectedIndex}
            baseUrl={baseUrl}
            onSelect={i => { setSelectedIndex(i); setSelectedChatIndex(0) }}
            onReorder={handleReorderConversations}
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

        {/* Conversation picker dialog */}
        {showConversationPicker && (
          <ConversationPickerDialog
            baseUrl={baseUrl}
            onSelect={handleOpenYaml}
            onClose={() => setShowConversationPicker(false)}
          />
        )}

        {/* Script import dialog */}
        {showScriptImport && (
          <ScriptImportDialog
            baseUrl={baseUrl}
            mode="append"
            onImport={(imported, _filename, enrichment) => {
              handleScriptImport(imported, '', enrichment, 'append')
            }}
            onClose={() => setShowScriptImport(false)}
          />
        )}

        {/* Quick Add E-Conversations dialog */}
        {showQuickAddE && (
          <QuickAddEConversationsDialog
            baseUrl={baseUrl}
            onAdd={handleQuickAddEConversations}
            onClose={() => setShowQuickAddE(false)}
          />
        )}

        {/* Duplicate for Assets dialog */}
        {showDuplicateForAssets && (
          <DuplicateForAssetsDialog
            baseUrl={baseUrl}
            onConfirm={handleDuplicateForAssets}
            onClose={() => setShowDuplicateForAssets(false)}
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

        {/* Upload / enrich status toast */}
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
        {!uploadStatus && enrichStatus?.state === 'enriching' && (
          <div className="fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs shadow-lg bg-violet-900 text-violet-100">
            LLM enriching in background…
          </div>
        )}
        {!uploadStatus && enrichStatus?.state === 'error' && (
          <div className="fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs shadow-lg flex items-center gap-3 bg-red-900 text-red-200">
            <span>LLM enrich failed: {enrichStatus.message}</span>
            <button
              onClick={() => setEnrichStatus(null)}
              className="text-current opacity-60 hover:opacity-100 font-bold leading-none"
            >
              ✕
            </button>
          </div>
        )}
        {!uploadStatus && enrichStatus?.state === 'enriched' && (
          <div className="fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs shadow-lg flex items-center gap-3 bg-green-800 text-green-100">
            <span>LLM enrich applied</span>
            <button
              onClick={() => setEnrichStatus(null)}
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
              spriteClipboard={spriteClipboard}
              onSpriteClipboardChange={setSpriteClipboard}
              onChange={handleChatChange}
              onConversationChange={handleConversationChange}
              onSplitHere={handleSplitHere}
              onMoveChatToPrev={handleMoveChatToPrev}
              onMergeWithPrev={handleMergeWithPrev}
              hasPrevConversation={selectedIndex > 0}
              onAddChat={handleAddChat}
              onDeleteChat={handleDeleteChat}
              onDeleteConversation={handleDeleteConversation}
              canDeleteConversation={conversations.length > 1}
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
