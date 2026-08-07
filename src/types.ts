export interface Sprite {
  url: string
  width?: number | null
  height?: number | null
  x?: number | null
  y?: number | null
  /** When true, render with horizontal mirror (CSS scaleX(-1)). */
  flip?: boolean | null
}

export interface Chat {
  role: 'other' | 'hero' | 'opponent'
  content: string
  position?: number
  sprites?: Sprite[]
}

export interface Conversation {
  background_url?: string
  background_color?: string
  /** Optional BGM / ambient audio path under host public/ (e.g. .mp3, .ogg). */
  soundtrack_url?: string
  chats: Chat[]
}

export type ConversationFile = Conversation[]
