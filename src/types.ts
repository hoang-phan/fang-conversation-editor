export interface Sprite {
  url: string
  width?: number | null
  height?: number | null
  x?: number | null
  y?: number | null
}

export interface Chat {
  role: 'hero' | 'opponent' | 'other'
  content: string
  position?: number
  sprites?: Sprite[]
}

export interface Conversation {
  background_url?: string
  background_color?: string
  chats: Chat[]
}

export type ConversationFile = Conversation[]
