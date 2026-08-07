import { normalizeScriptText } from './normalizeScript'

export interface EditorMeta {
  id: string
  characterLabel: string
  slotKinds: string[]
}

export interface CharacterSlot {
  kind: string
  key: string
  label: string
  filename: string
}

export interface EditorCharacter {
  id: string
  name: string
  slots: CharacterSlot[]
}

export interface ServerProfile {
  id: string
  label: string
  baseUrl: string
}

export const SERVER_PROFILES: ServerProfile[] = [
  { id: 'fang', label: 'Fang', baseUrl: 'http://localhost:3000' },
  { id: 'empire', label: 'Empire', baseUrl: 'http://localhost:3001' },
  { id: 'custom', label: 'Custom', baseUrl: '' },
]

/** Query param used for landing-page deep links, e.g. `?server=empire`. */
export const SERVER_QUERY_PARAM = 'server'

export function isServerProfileId(id: string): boolean {
  return SERVER_PROFILES.some(p => p.id === id)
}

/** Read `?server=` from the current URL; falls back to `fang` when missing/invalid. */
export function serverProfileIdFromLocation(search: string = window.location.search): string {
  const param = new URLSearchParams(search).get(SERVER_QUERY_PARAM)
  if (param && isServerProfileId(param)) return param
  return 'fang'
}

/** Keep `?server=` in sync with the selected profile (replaceState, no navigation). */
export function syncServerQueryParam(profileId: string): void {
  const url = new URL(window.location.href)
  if (isServerProfileId(profileId) && profileId !== 'fang') {
    url.searchParams.set(SERVER_QUERY_PARAM, profileId)
  } else {
    url.searchParams.delete(SERVER_QUERY_PARAM)
  }
  window.history.replaceState(null, '', url)
}

export function editorUrl(baseUrl: string, path: string): string {
  const root = baseUrl.replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${root}/api/v1/editor${suffix}`
}

export async function fetchEditorMeta(baseUrl: string): Promise<EditorMeta> {
  const res = await fetch(editorUrl(baseUrl, '/meta'))
  if (!res.ok) throw new Error(`meta ${res.status}`)
  return res.json()
}

export async function fetchEditorCharacters(baseUrl: string): Promise<EditorCharacter[]> {
  const res = await fetch(editorUrl(baseUrl, '/characters'))
  if (!res.ok) throw new Error(`characters ${res.status}`)
  return res.json()
}

export async function fetchEditorAssets(baseUrl: string): Promise<string[]> {
  const res = await fetch(editorUrl(baseUrl, '/assets'))
  if (!res.ok) throw new Error(`assets ${res.status}`)
  return res.json()
}

export async function fetchConversationYmls(baseUrl: string): Promise<string[]> {
  const res = await fetch(editorUrl(baseUrl, '/conversations'))
  if (!res.ok) throw new Error(`conversations ${res.status}`)
  return res.json()
}

export async function fetchConversationYml(baseUrl: string, filename: string): Promise<string> {
  const res = await fetch(editorUrl(baseUrl, `/conversations/${encodeURIComponent(filename)}`))
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to load ${filename} (${res.status}): ${body}`)
  }
  return res.text()
}

export async function convertScript(baseUrl: string, text: string): Promise<string> {
  const res = await fetch(editorUrl(baseUrl, '/scripts/convert'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: normalizeScriptText(text) }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Server error (${res.status}): ${body}`)
  }
  return res.text()
}

export async function uploadConversationYml(
  baseUrl: string,
  filename: string,
  yaml: string,
): Promise<{ path: string }> {
  const form = new FormData()
  form.append('file', new Blob([yaml], { type: 'text/yaml' }), filename)
  form.append('filename', filename)
  const res = await fetch(editorUrl(baseUrl, '/assets/upload_conversation_yml'), {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Upload failed (${res.status}): ${text}`)
  }
  return res.json()
}
