import { useState } from 'react'
import type { Chat, Conversation, Sprite } from '../types'
import { AssetPickerDialog } from './AssetPickerDialog'
import { AddChatDialog } from './AddChatDialog'

interface Props {
  conversation: Conversation
  chat: Chat
  chatIndex: number
  baseUrl: string
  onChange: (updated: Chat) => void
  onConversationChange: (updated: Conversation) => void
  onSplitHere: (chatIndex: number) => void
  onAddChat: (chat: Chat, insertAt: number) => void
  onDeleteChat: (chatIndex: number) => void
}

export function EditPanel({ conversation, chat, chatIndex, baseUrl, onChange, onConversationChange, onSplitHere, onAddChat, onDeleteChat }: Props) {
  const [showAddChat, setShowAddChat] = useState(false)
  const [addChatInsertAt, setAddChatInsertAt] = useState(0)
  const [pickerTarget, setPickerTarget] = useState<'new' | number | 'background' | null>(null)

  const sprites = chat.sprites ?? []
  const prevSprites = chatIndex > 0 ? (conversation.chats[chatIndex - 1].sprites ?? []) : []
  const nextSprites = chatIndex < conversation.chats.length - 1 ? (conversation.chats[chatIndex + 1].sprites ?? []) : []

  function copySpritesFromPrev() {
    onChange({ ...chat, sprites: prevSprites.length ? prevSprites.map(s => ({ ...s })) : undefined })
  }

  function copySpritesFromNext() {
    onChange({ ...chat, sprites: nextSprites.length ? nextSprites.map(s => ({ ...s })) : undefined })
  }

  function updateSprite(index: number, patch: Partial<Sprite>) {
    const updated = sprites.map((s, i) => i === index ? { ...s, ...patch } : s)
    onChange({ ...chat, sprites: updated })
  }

  function removeSprite(index: number) {
    const updated = sprites.filter((_, i) => i !== index)
    onChange({ ...chat, sprites: updated.length ? updated : undefined })
  }

  function addSprite(url: string) {
    const updated = [...sprites, { url, width: 500 }]
    onChange({ ...chat, sprites: updated })
    setPickerTarget(null)
  }

  function replaceSpritUrl(index: number, url: string) {
    updateSprite(index, { url })
    setPickerTarget(null)
  }

  function numVal(raw: string): number | null {
    const n = Number(raw)
    return raw.trim() === '' || isNaN(n) ? null : n
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-700 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Edit — Chat {chatIndex + 1}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-4 min-h-0">
        {/* Background */}
        <div className="flex flex-col gap-2 pb-3 border-b border-gray-700">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-widest">Background</span>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">URL</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={conversation.background_url ?? ''}
                onChange={e => onConversationChange({ ...conversation, background_url: e.target.value || undefined })}
                placeholder="/path/to/image.webp"
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-pink-500 min-w-0"
              />
              <button
                onClick={() => setPickerTarget('background')}
                className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors shrink-0"
                title="Browse assets"
              >
                Browse
              </button>
              {conversation.background_url && (
                <button
                  onClick={() => onConversationChange({ ...conversation, background_url: undefined })}
                  className="text-xs px-2 py-0.5 rounded bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors shrink-0"
                  title="Clear background URL"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Color (fallback)</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={conversation.background_color ?? '#222222'}
                onChange={e => onConversationChange({ ...conversation, background_color: e.target.value })}
                className="h-7 w-10 rounded border border-gray-600 bg-transparent cursor-pointer"
              />
              <input
                type="text"
                value={conversation.background_color ?? ''}
                onChange={e => onConversationChange({ ...conversation, background_color: e.target.value || undefined })}
                placeholder="#hexcolor"
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-pink-500"
              />
              {conversation.background_color && (
                <button
                  onClick={() => onConversationChange({ ...conversation, background_color: undefined })}
                  className="text-xs px-2 py-0.5 rounded bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors shrink-0"
                  title="Clear color"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Chat actions */}
        <div className="flex flex-col gap-2 pb-3 border-b border-gray-700">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-widest">Chat</span>
          <button
            onClick={() => { setAddChatInsertAt(chatIndex); setShowAddChat(true) }}
            className="text-xs px-3 py-1.5 rounded bg-pink-700/70 hover:bg-pink-600 text-white transition-colors text-left"
          >
            + Add chat before this
          </button>
          <button
            onClick={() => { setAddChatInsertAt(chatIndex + 1); setShowAddChat(true) }}
            className="text-xs px-3 py-1.5 rounded bg-pink-700 hover:bg-pink-600 text-white transition-colors text-left"
          >
            + Add chat after this
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Delete chat ${chatIndex + 1}?`)) onDeleteChat(chatIndex)
            }}
            disabled={conversation.chats.length <= 1}
            className="text-xs px-3 py-1.5 rounded bg-red-900/60 hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-red-300 transition-colors text-left"
            title="Delete this chat"
          >
            Delete this chat
          </button>
        </div>

        {/* Conversation actions */}
        <div className="flex flex-col gap-2 pb-3 border-b border-gray-700">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-widest">Conversation</span>
          <button
            onClick={() => onSplitHere(chatIndex)}
            disabled={chatIndex >= conversation.chats.length - 1}
            className="text-xs px-3 py-1.5 rounded bg-indigo-800 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors text-left"
            title="Split the conversation here — chats after this one become a new conversation"
          >
            Split after this chat
          </button>
        </div>

        {/* Role */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium">Role</label>
          <select
            value={chat.role}
            onChange={e => onChange({ ...chat, role: e.target.value as Chat['role'] })}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-pink-500"
          >
            <option value="other">other</option>
            <option value="hero">hero</option>
            <option value="opponent">opponent</option>
          </select>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium">Content</label>
          <textarea
            value={chat.content}
            onChange={e => onChange({ ...chat, content: e.target.value })}
            rows={4}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 resize-none focus:outline-none focus:border-pink-500 font-mono"
          />
        </div>

        {/* Sprites */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs text-gray-400 font-medium">Sprites</span>
            <div className="flex gap-1">
              {prevSprites.length > 0 && (
                <button
                  onClick={copySpritesFromPrev}
                  className="text-xs px-2 py-0.5 rounded bg-gray-600 hover:bg-gray-500 text-gray-200 transition-colors"
                  title="Replace current sprites with those from the previous chat"
                >
                  Copy from prev
                </button>
              )}
              {nextSprites.length > 0 && (
                <button
                  onClick={copySpritesFromNext}
                  className="text-xs px-2 py-0.5 rounded bg-gray-600 hover:bg-gray-500 text-gray-200 transition-colors"
                  title="Replace current sprites with those from the next chat"
                >
                  Copy from next
                </button>
              )}
              <button
                onClick={() => setPickerTarget('new')}
                className="text-xs px-2 py-0.5 rounded bg-pink-700 hover:bg-pink-600 text-white transition-colors"
              >
                + Add Sprite
              </button>
            </div>
          </div>

          {sprites.length === 0 && (
            <p className="text-xs text-gray-600 italic">No sprites on this chat.</p>
          )}

          {sprites.map((sprite, i) => (
            <div
              key={i}
              className="border border-gray-700 rounded-lg p-3 flex flex-col gap-2 bg-gray-800/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500 font-mono truncate flex-1" title={sprite.url}>
                  {sprite.url || <span className="italic">no url</span>}
                </span>
                <button
                  onClick={() => setPickerTarget(i)}
                  className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors shrink-0"
                  title="Browse assets"
                >
                  Browse
                </button>
                <button
                  onClick={() => removeSprite(i)}
                  className="text-xs px-2 py-0.5 rounded bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors shrink-0"
                >
                  Remove
                </button>
              </div>

              {/* URL manual edit */}
              <input
                type="text"
                value={sprite.url}
                onChange={e => updateSprite(i, { url: e.target.value })}
                placeholder="/path/to/sprite.png"
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-pink-500 w-full"
              />

              {/* Numeric fields */}
              <div className="grid grid-cols-2 gap-2">
                {(['width', 'height', 'x', 'y'] as const).map(field => (
                  <label key={field} className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">{field}</span>
                    <input
                      type="number"
                      value={sprite[field] ?? ''}
                      onChange={e => updateSprite(i, { [field]: numVal(e.target.value) })}
                      placeholder="—"
                      className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add chat dialog */}
      {showAddChat && (
        <AddChatDialog
          onAdd={chat => { onAddChat(chat, addChatInsertAt); setShowAddChat(false) }}
          onClose={() => setShowAddChat(false)}
        />
      )}

      {/* Asset picker dialog */}
      {pickerTarget !== null && (
        <AssetPickerDialog
          baseUrl={baseUrl}
          title={pickerTarget === 'background' ? 'Set Background' : 'Add Sprite'}
          confirmLabel={pickerTarget === 'background' ? 'Set' : 'Add'}
          onSelect={path => {
            if (pickerTarget === 'background') {
              onConversationChange({ ...conversation, background_url: path })
              setPickerTarget(null)
            } else if (pickerTarget === 'new') {
              addSprite(path)
            } else {
              replaceSpritUrl(pickerTarget as number, path)
            }
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  )
}
