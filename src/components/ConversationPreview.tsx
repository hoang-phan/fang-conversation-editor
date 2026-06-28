import { useState } from 'react'
import type { Conversation } from '../types'
import { SpriteLayer } from './SpriteLayer'
import { ChatBubble } from './ChatBubble'

interface Props {
  conversation: Conversation
  baseUrl: string
}

export function ConversationPreview({ conversation, baseUrl }: Props) {
  const [chatIndex, setChatIndex] = useState(0)

  const chats = conversation.chats
  const current = chats[chatIndex] ?? null
  const bgUrl = conversation.background_url
    ? (conversation.background_url.startsWith('/') ? `${baseUrl}${conversation.background_url}` : conversation.background_url)
    : null
  const isVideo = bgUrl?.endsWith('.mp4') ?? false
  const isImage = !!(bgUrl && !isVideo)
  const fileParts = bgUrl?.split('/')
  const isEBackground = fileParts ? fileParts[fileParts.length - 1].startsWith('e') : false
  const backgroundColor = conversation.background_color ?? '#1a232c'

  const sprites = current?.sprites ?? []
  const isCinematic = current?.content === '(...)'
  const isMinigame = !!(current && (
    current.content.startsWith('(click-game:') ||
    current.content.startsWith('(words-catcher:') ||
    current.content.startsWith('(shuffle-puzzle:')
  ))

  const showSpriteLayer = !isCinematic || isMinigame

  function prev() {
    setChatIndex(i => Math.max(0, i - 1))
  }
  function next() {
    setChatIndex(i => Math.min(chats.length - 1, i + 1))
  }

  if (!current) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        No chats in this conversation.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Preview area */}
      <div
        className="relative flex-1 overflow-hidden flex flex-col"
        style={{ backgroundColor }}
      >
        {isImage && (
          <img
            src={bgUrl!}
            alt="background"
            className={`absolute inset-0 w-full h-full ${isEBackground ? 'object-contain' : 'object-cover'}`}
          />
        )}
        {isVideo && (
          <video
            key={bgUrl}
            src={bgUrl!}
            autoPlay
            muted
            loop
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}

        {showSpriteLayer && (
          <div className="relative flex-1 overflow-hidden">
            <SpriteLayer sprites={sprites} baseUrl={baseUrl} />
          </div>
        )}

        {/* Dialog box */}
        <div className="relative shrink-0 pb-2 px-4">
          <ChatBubble chat={current} isVideo={isVideo} />
        </div>
      </div>

      {/* Navigation */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-gray-900 border-t border-gray-700">
        <button
          onClick={prev}
          disabled={chatIndex === 0}
          className="px-3 py-1 rounded text-sm bg-gray-700 text-gray-200 disabled:opacity-30 hover:bg-gray-600 transition-colors"
        >
          ◀ Prev
        </button>
        <span className="text-xs text-gray-400">
          Chat {chatIndex + 1} / {chats.length}
        </span>
        <button
          onClick={next}
          disabled={chatIndex === chats.length - 1}
          className="px-3 py-1 rounded text-sm bg-gray-700 text-gray-200 disabled:opacity-30 hover:bg-gray-600 transition-colors"
        >
          Next ▶
        </button>
      </div>
    </div>
  )
}
