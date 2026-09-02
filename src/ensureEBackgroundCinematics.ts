import type { Conversation, ConversationFile } from './types'

const CINEMATIC_CHAT = { role: 'other' as const, content: '(...)' }

/** Basename of a background URL starts with `e-` (same convention as e-conversations). */
export function isEBackgroundUrl(url: string | undefined): boolean {
  if (!url) return false
  const parts = url.split('/')
  const basename = parts[parts.length - 1] ?? ''
  return basename.startsWith('e')
}

function endsWithCinematic(conv: Conversation): boolean {
  const last = conv.chats[conv.chats.length - 1]
  return last?.content === '(...)'
}

/**
 * After script convert / LLM enrich: every e-background conversation except the
 * last one in the file gets a trailing cinematic chat `{ role: other, content: '(...)' }`
 * (same shape as Quick Add E-Conversations). Idempotent if already present.
 */
export function ensureEBackgroundCinematics(file: ConversationFile): ConversationFile {
  if (file.length <= 1) return file
  return file.map((conv, i) => {
    if (i === file.length - 1) return conv
    if (!isEBackgroundUrl(conv.background_url)) return conv
    if (endsWithCinematic(conv)) return conv
    return {
      ...conv,
      chats: [...conv.chats, { ...CINEMATIC_CHAT }],
    }
  })
}
