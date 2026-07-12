import { useState } from 'react'
import type { Conversation } from '../types'

interface Props {
  conversations: Conversation[]
  selectedIndex: number
  baseUrl: string
  onSelect: (index: number) => void
  onReorder: (fromIndex: number, toIndex: number) => void
}

export function ConversationList({ conversations, selectedIndex, baseUrl, onSelect, onReorder }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function handleDrop(dropIndex: number) {
    if (dragIndex !== null && dragIndex !== dropIndex) {
      onReorder(dragIndex, dropIndex)
    }
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-700 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Conversations ({conversations.length})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.map((conv, i) => {
          const isSelected = i === selectedIndex
          const bgUrl = conv.background_url
            ? (conv.background_url.startsWith('/') ? `${baseUrl}${conv.background_url}` : conv.background_url)
            : null
          const isVideo = bgUrl?.endsWith('.mp4')
          const previewCount = conv.chats.length
          const isDragging = i === dragIndex
          const isDropTarget = i === overIndex && dragIndex !== null && dragIndex !== i

          return (
            <button
              key={i}
              draggable
              onClick={() => onSelect(i)}
              onDragStart={() => setDragIndex(i)}
              onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
              onDragOver={e => { e.preventDefault(); setOverIndex(i) }}
              onDrop={e => { e.preventDefault(); handleDrop(i) }}
              className={`w-full text-left px-3 py-2 border-b border-gray-800 transition-colors hover:bg-gray-800 flex items-center gap-2 cursor-grab active:cursor-grabbing ${isSelected ? 'bg-gray-800 border-l-2 border-l-pink-400' : ''} ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'border-t-2 border-t-pink-400' : ''}`}
            >
              {bgUrl && !isVideo && (
                <img
                  src={bgUrl}
                  alt=""
                  className="w-10 h-10 object-cover rounded shrink-0 opacity-80"
                />
              )}
              {isVideo && (
                <div className="w-10 h-10 rounded shrink-0 bg-gray-700 flex items-center justify-center text-gray-400 text-xs">
                  MP4
                </div>
              )}
              {!bgUrl && (
                <div
                  className="w-10 h-10 rounded shrink-0"
                  style={{ backgroundColor: conv.background_color ?? '#1a232c' }}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-200 truncate">
                  Conv {i + 1}
                </div>
                <div className="text-xs text-gray-500">
                  {previewCount} chat{previewCount !== 1 ? 's' : ''}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
