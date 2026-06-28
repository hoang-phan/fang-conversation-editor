import * as yaml from 'js-yaml'
import type { Chat, Conversation, ConversationFile, Sprite } from './types'

function parseSprite(raw: unknown): Sprite {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid sprite')
  const s = raw as Record<string, unknown>
  if (typeof s.url !== 'string') throw new Error('Sprite missing url')
  return {
    url: s.url,
    width: typeof s.width === 'number' ? s.width : null,
    height: typeof s.height === 'number' ? s.height : null,
    x: typeof s.x === 'number' ? s.x : null,
    y: typeof s.y === 'number' ? s.y : null,
  }
}

function parseChat(raw: unknown, index: number): Chat {
  if (!raw || typeof raw !== 'object') throw new Error(`Chat ${index} is not an object`)
  const c = raw as Record<string, unknown>
  if (c.role !== 'hero' && c.role !== 'opponent' && c.role !== 'other') {
    throw new Error(`Chat ${index} has invalid role: ${c.role}`)
  }
  if (typeof c.content !== 'string') throw new Error(`Chat ${index} missing content`)
  return {
    role: c.role,
    content: c.content,
    sprites: Array.isArray(c.sprites) ? c.sprites.map(parseSprite) : [],
  }
}

function parseConversation(raw: unknown, index: number): Conversation {
  if (!raw || typeof raw !== 'object') throw new Error(`Conversation ${index} is not an object`)
  const conv = raw as Record<string, unknown>
  if (!Array.isArray(conv.chats)) throw new Error(`Conversation ${index} missing chats array`)
  return {
    background_url: typeof conv.background_url === 'string' ? conv.background_url : undefined,
    background_color: typeof conv.background_color === 'string' ? conv.background_color : undefined,
    chats: conv.chats.map((c, i) => parseChat(c, i)),
  }
}

export function parseYaml(text: string): ConversationFile {
  const raw = yaml.load(text)
  if (!Array.isArray(raw)) throw new Error('YAML must be an array of conversations')
  return raw.map((item, i) => parseConversation(item, i))
}

function cleanForExport(conv: Conversation): object {
  const result: Record<string, unknown> = {}
  if (conv.background_url) result.background_url = conv.background_url
  if (conv.background_color) result.background_color = conv.background_color
  result.chats = conv.chats.map(chat => {
    const c: Record<string, unknown> = { role: chat.role, content: chat.content }
    if (chat.sprites && chat.sprites.length > 0) {
      c.sprites = chat.sprites.map(s => {
        const sp: Record<string, unknown> = { url: s.url }
        if (s.width != null) sp.width = s.width
        if (s.height != null) sp.height = s.height
        if (s.x != null) sp.x = s.x
        if (s.y != null) sp.y = s.y
        return sp
      })
    }
    return c
  })
  return result
}

export function exportYaml(conversations: ConversationFile): string {
  return yaml.dump(conversations.map(cleanForExport), { lineWidth: -1, noRefs: true })
}
