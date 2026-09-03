const PREFIX = 'fang-conversation-editor:sprite-scale:'
const STORAGE_KEY = PREFIX + 'prefs'

export type SpriteScalePrefs = {
  eBackgroundScale: number
  nonEBackgroundScale: number
}

const DEFAULTS: SpriteScalePrefs = {
  eBackgroundScale: 1,
  nonEBackgroundScale: 1,
}

function isValidPrefs(value: unknown): value is SpriteScalePrefs {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return Number.isFinite(v.eBackgroundScale) && Number.isFinite(v.nonEBackgroundScale)
}

export function loadSpriteScalePrefs(): SpriteScalePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null) return { ...DEFAULTS }
    const parsed: unknown = JSON.parse(raw)
    if (!isValidPrefs(parsed)) return { ...DEFAULTS }
    return {
      eBackgroundScale: parsed.eBackgroundScale,
      nonEBackgroundScale: parsed.nonEBackgroundScale,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSpriteScalePrefs(prefs: SpriteScalePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Ignore quota / private-mode failures; prefs still work in-memory.
  }
}
