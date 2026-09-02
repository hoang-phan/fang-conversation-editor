const PREFIX = 'fang-conversation-editor:last-filter:'

export const CONVERSATION_PICKER_FILTER_KEY = 'conversation-picker'
export const ASSET_PICKER_FILTER_KEY = 'asset-picker'
export const ASSET_PICKER_AUDIO_FILTER_KEY = 'asset-picker-audio'

export function loadLastFilter(key: string): string {
  try {
    return localStorage.getItem(PREFIX + key) ?? ''
  } catch {
    return ''
  }
}

export function saveLastFilter(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value)
  } catch {
    // Ignore quota / private-mode failures; filter still works in-memory.
  }
}
