import type { Chat } from '../types'

interface Props {
  chat: Chat
  isVideo: boolean
}

const HERO_NAME = 'Hero'
const OPPONENT_NAME = 'Opponent'

function renderContent(content: string): React.ReactNode {
  if (content.startsWith('(click-game:')) return <PlaceholderBox label="Click Game" />
  if (content.startsWith('(words-catcher:')) return <PlaceholderBox label="Words Catcher Game" />
  if (content.startsWith('(shuffle-puzzle:')) return <PlaceholderBox label="Shuffle Puzzle Game" />
  if (content.startsWith('(multichoice:')) {
    const inner = content.slice('(multichoice:'.length, -1)
    const options = inner.split(':')
    return <PlaceholderBox label={`Multiple Choice: ${options.join(' / ')}`} />
  }
  if (content === '(...)') return <PlaceholderBox label="Interactive" />
  return content.replaceAll('{{PLAYER}}', HERO_NAME)
}

function PlaceholderBox({ label }: { label: string }) {
  return (
    <span className="inline-block px-3 py-1 rounded bg-gray-700 text-gray-300 text-sm font-mono border border-gray-600">
      [{label}]
    </span>
  )
}

export function ChatBubble({ chat, isVideo }: Props) {
  const isHero = chat.role === 'hero'
  const isOther = chat.role === 'other'
  const speaker = isHero ? HERO_NAME : isOther ? null : OPPONENT_NAME

  const isCinematic = chat.content === '(...)'
  if (isCinematic) return null

  return (
    <div className="w-full rounded-xl rounded-tl-none border border-gray-600 p-5 shadow-lg"
      style={{
        minHeight: '140px',
        backgroundColor: isVideo ? '#FDC9D411' : '#FDC9D4',
      }}
    >
      <div className="flex flex-col gap-3 h-full">
        {speaker && (
          <div
            className="font-bold text-sm"
            style={{ color: isHero ? '#6aafff' : '#f472b6' }}
          >
            {speaker}
          </div>
        )}
        <p
          className="text-xl font-bold leading-relaxed flex-1"
          style={{
            color: isVideo ? '#ffe0ee' : '#7a4060',
            textShadow: isVideo
              ? '-1px 0 black, 0 1px black, 1px 0 black, 0 -1px black'
              : undefined,
          }}
        >
          {renderContent(chat.content)}
        </p>
      </div>
    </div>
  )
}
