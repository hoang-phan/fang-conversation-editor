import type { Chat, Conversation, ConversationFile } from './types'
import { ensureEBackgroundCinematics } from './ensureEBackgroundCinematics'

/**
 * Merge LLM-enriched convert YAML into the current editor state.
 *
 * Skeleton / structure come from FE (current):
 * - FE deletes stay deleted (BE cannot resurrect chats)
 * - FE-added chats (typically `(...)`) stay
 * - FE conversation splits stay
 * - BE conversation splits are also applied (union of cut points)
 *
 * Enrichments from BE (llm):
 * - role on content-matched chats
 * - background_url when FE has none (FE wins if both set)
 *
 * Always kept from FE: sprites, soundtrack_url, background_color, chat content.
 */

type FeItem =
  | { kind: 'matched'; baselineIndex: number; chat: Chat; feConvIndex: number }
  | { kind: 'insert'; chat: Chat; feConvIndex: number }

interface BeEnrichment {
  role: Chat['role']
  beConvIndex: number
  background_url?: string
}

function flattenBaselineContents(baseline: ConversationFile): string[] {
  return baseline.flatMap(conv => conv.chats.map(c => c.content))
}

/** Align FE chats to baseline by sequential content match; unmatched → insert; skipped baseline → deleted. */
function alignFlat(current: ConversationFile, baselineContents: string[]): FeItem[] {
  const items: FeItem[] = []
  let b = 0
  current.forEach((conv, feConvIndex) => {
    for (const chat of conv.chats) {
      let found = -1
      for (let i = b; i < baselineContents.length; i++) {
        if (baselineContents[i] === chat.content) {
          found = i
          break
        }
      }
      if (found === -1) {
        items.push({ kind: 'insert', chat, feConvIndex })
      } else {
        items.push({ kind: 'matched', baselineIndex: found, chat, feConvIndex })
        b = found + 1
      }
    }
  })
  return items
}

function buildBeMap(llm: ConversationFile, baselineContents: string[]): Map<number, BeEnrichment> {
  const map = new Map<number, BeEnrichment>()
  let b = 0
  llm.forEach((conv, beConvIndex) => {
    for (const chat of conv.chats) {
      let found = -1
      for (let i = b; i < baselineContents.length; i++) {
        if (baselineContents[i] === chat.content) {
          found = i
          break
        }
      }
      if (found === -1) continue // BE-only chat — ignore (cannot invent into FE)
      map.set(found, {
        role: chat.role,
        beConvIndex,
        background_url: conv.background_url,
      })
      b = found + 1
    }
  })
  return map
}

function enrichChat(feChat: Chat, be: BeEnrichment | undefined): Chat {
  return {
    ...feChat,
    role: be?.role ?? feChat.role,
  }
}

function conversationMeta(fe: Conversation | undefined, beBg: string | undefined): Pick<
  Conversation,
  'background_url' | 'background_color' | 'soundtrack_url'
> {
  const feBg = fe?.background_url
  return {
    background_url: feBg || beBg || undefined,
    background_color: fe?.background_color,
    soundtrack_url: fe?.soundtrack_url,
  }
}

export function mergeLlmConvert(
  current: ConversationFile,
  baseline: ConversationFile,
  llm: ConversationFile,
): ConversationFile {
  if (current.length === 0) return current

  const baselineContents = flattenBaselineContents(baseline)
  const feItems = alignFlat(current, baselineContents)
  const beMap = buildBeMap(llm, baselineContents)

  const result: ConversationFile = []
  let chats: Chat[] = []
  let feConvIndexForMeta: number | null = null
  let beBgForMeta: string | undefined
  let prevFeConvIndex: number | null = null
  let prevBeConvIndex: number | null = null

  function flush() {
    if (chats.length === 0) return
    const fe = feConvIndexForMeta != null ? current[feConvIndexForMeta] : undefined
    result.push({
      ...conversationMeta(fe, beBgForMeta),
      chats,
    })
    chats = []
    feConvIndexForMeta = null
    beBgForMeta = undefined
    prevBeConvIndex = null
  }

  for (const item of feItems) {
    const be = item.kind === 'matched' ? beMap.get(item.baselineIndex) : undefined

    const feSplit = prevFeConvIndex != null && item.feConvIndex !== prevFeConvIndex
    const beSplit =
      item.kind === 'matched' &&
      be != null &&
      prevBeConvIndex != null &&
      be.beConvIndex !== prevBeConvIndex

    if (chats.length > 0 && (feSplit || beSplit)) {
      flush()
    }

    if (feConvIndexForMeta == null) feConvIndexForMeta = item.feConvIndex
    if (be?.background_url && !beBgForMeta) beBgForMeta = be.background_url

    chats.push(enrichChat(item.chat, be))
    prevFeConvIndex = item.feConvIndex
    if (item.kind === 'matched' && be != null) {
      prevBeConvIndex = be.beConvIndex
    }
  }

  flush()
  const merged = result.length > 0 ? result : current
  return ensureEBackgroundCinematics(merged)
}
