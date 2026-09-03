import * as yaml from 'js-yaml'
import { isEBackgroundUrl } from './ensureEBackgroundCinematics'
import type { Chat, Conversation, ConversationFile, Sprite } from './types'

export interface ExportOptions {
  /**
   * Independent user-set multipliers applied to sprite width/height on export.
   * Editor state/preview stay at authoring values; only export is scaled.
   * `eBackgroundScale` applies when the conversation background is an e-background;
   * `nonEBackgroundScale` applies otherwise. Both default to 1 when omitted.
   */
  eBackgroundScale?: number
  nonEBackgroundScale?: number
}

export interface ImportOptions {
  /**
   * Independent user-set divisors applied to sprite width/height on parse.
   * Divides (does not multiply) so a previously scaled seed YAML can be
   * de-scaled into editor state/preview. `eBackgroundDescale` applies when the
   * conversation background is an e-background; `nonEBackgroundDescale` applies
   * otherwise. Both default to 1 when omitted.
   */
  eBackgroundDescale?: number
  nonEBackgroundDescale?: number
}

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
    flip: typeof s.flip === 'boolean' ? s.flip : null,
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

function parseConversation(raw: unknown, index: number, options?: ImportOptions): Conversation {
  if (!raw || typeof raw !== 'object') throw new Error(`Conversation ${index} is not an object`)
  const conv = raw as Record<string, unknown>
  if (!Array.isArray(conv.chats)) throw new Error(`Conversation ${index} missing chats array`)
  const background_url = typeof conv.background_url === 'string' ? conv.background_url : undefined
  const parsed: Conversation = {
    background_url,
    background_color: typeof conv.background_color === 'string' ? conv.background_color : undefined,
    soundtrack_url: typeof conv.soundtrack_url === 'string' ? conv.soundtrack_url : undefined,
    chats: conv.chats.map((c, i) => parseChat(c, i)),
  }
  const rawScale = isEBackgroundUrl(background_url)
    ? (options?.eBackgroundDescale ?? 1)
    : (options?.nonEBackgroundDescale ?? 1)
  const scale = Number.isFinite(rawScale) && rawScale >= 0.1 ? rawScale : 0.1
  for (const chat of parsed.chats) {
    for (const sprite of chat.sprites ?? []) {
      if (sprite.width != null) sprite.width = sprite.width / scale
      if (sprite.height != null) sprite.height = sprite.height / scale
    }
  }
  return parsed
}

export function parseYaml(text: string, options?: ImportOptions): ConversationFile {
  const raw = yaml.load(text)
  if (!Array.isArray(raw)) throw new Error('YAML must be an array of conversations')
  return raw.map((item, i) => parseConversation(item, i, options))
}

function cleanForExport(conv: Conversation, options?: ExportOptions): object {
  const scale = isEBackgroundUrl(conv.background_url)
    ? (options?.eBackgroundScale ?? 1)
    : (options?.nonEBackgroundScale ?? 1)
  const result: Record<string, unknown> = {}
  if (conv.background_url) result.background_url = conv.background_url
  if (conv.background_color) result.background_color = conv.background_color
  if (conv.soundtrack_url) result.soundtrack_url = conv.soundtrack_url
  result.chats = conv.chats.map(chat => {
    const c: Record<string, unknown> = { role: chat.role, content: chat.content }
    if (chat.sprites && chat.sprites.length > 0) {
      c.sprites = chat.sprites.map(s => {
        const sp: Record<string, unknown> = { url: s.url }
        if (s.width != null) sp.width = s.width * scale
        if (s.height != null) sp.height = s.height * scale
        if (s.x != null) sp.x = s.x
        if (s.y != null) sp.y = s.y
        if (s.flip) sp.flip = true
        return sp
      })
    }
    return c
  })
  return result
}

export function exportYaml(conversations: ConversationFile, options?: ExportOptions): string {
  return yaml.dump(
    conversations.map(conv => cleanForExport(conv, options)),
    { lineWidth: -1, noRefs: true },
  )
}
