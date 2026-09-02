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

/** Fang Story Writer JSON export (read-only). Default port avoids fang-backend :3000. */
export const DEFAULT_STORY_WRITER_URL = 'http://localhost:3002'

const PLAYER_SLUGS = new Set(['hito', 'mitsu'])

export interface StoryWriterCastMember {
  id: number
  slug: string
  name: string
  aliases: string[]
  gender: string
  pronouns: string
  summary: string
}

export interface StoryWriterProject {
  id: number
  title: string
  status: string
  chapterCount: number
}

export interface StoryWriterChapterSummary {
  id: number
  position: number
  title: string
  status: string
  hasScript: boolean
}

export interface StoryWriterChapter extends StoryWriterChapterSummary {
  storyline: string
  script: string
  cast: StoryWriterCastMember[]
}

export interface SpeakerContext {
  heroName?: string
  opponentName?: string
  storyline?: string
  cast?: StoryWriterCastMember[]
}

export function inferHeroName(cast: StoryWriterCastMember[]): string | undefined {
  const row = cast.find(c =>
    PLAYER_SLUGS.has((c.slug || '').toLowerCase()) || PLAYER_SLUGS.has(c.name.toLowerCase()),
  )
  return row?.name
}

export function matchEditorCharacter(
  characters: EditorCharacter[],
  cast: StoryWriterCastMember[],
): EditorCharacter | undefined {
  const npc = cast.find(c =>
    !PLAYER_SLUGS.has((c.slug || '').toLowerCase()) && !PLAYER_SLUGS.has(c.name.toLowerCase()),
  )
  const preferred = npc ?? cast[0]
  if (!preferred) return undefined
  return characters.find(c =>
    c.id.toLowerCase() === preferred.slug.toLowerCase()
    || c.name.toLowerCase() === preferred.name.toLowerCase(),
  )
}

export function speakerContextFromChapter(
  chapter: StoryWriterChapter,
  opponentName?: string,
): SpeakerContext {
  return {
    heroName: inferHeroName(chapter.cast),
    opponentName: opponentName || undefined,
    storyline: chapter.storyline || undefined,
    cast: chapter.cast,
  }
}

function storyWriterUrl(baseUrl: string, path: string): string {
  const root = baseUrl.replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${root}/api/v1${suffix}`
}

export async function fetchStoryWriterProjects(baseUrl: string): Promise<StoryWriterProject[]> {
  const res = await fetch(storyWriterUrl(baseUrl, '/projects'))
  if (!res.ok) throw new Error(`story-writer projects ${res.status}`)
  return res.json()
}

export async function fetchStoryWriterChapters(
  baseUrl: string,
  projectId: number,
): Promise<StoryWriterChapterSummary[]> {
  const res = await fetch(storyWriterUrl(baseUrl, `/projects/${projectId}/chapters`))
  if (!res.ok) throw new Error(`story-writer chapters ${res.status}`)
  return res.json()
}

export async function fetchStoryWriterChapter(
  baseUrl: string,
  projectId: number,
  chapterId: number,
): Promise<StoryWriterChapter> {
  const res = await fetch(storyWriterUrl(baseUrl, `/projects/${projectId}/chapters/${chapterId}`))
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to load chapter (${res.status}): ${body}`)
  }
  return res.json()
}

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

export async function convertScript(
  baseUrl: string,
  text: string,
  options: { useLlm?: boolean; speakerContext?: SpeakerContext; signal?: AbortSignal } = {},
): Promise<string> {
  const body: Record<string, unknown> = {
    text: normalizeScriptText(text),
    use_llm: options.useLlm ?? false,
  }
  if (options.speakerContext) body.speakerContext = options.speakerContext
  const res = await fetch(editorUrl(baseUrl, '/scripts/convert'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
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
