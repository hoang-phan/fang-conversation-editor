import { useEffect, useMemo, useRef, useState } from 'react'
import { parseYaml } from '../parse'
import type { Conversation, ConversationFile } from '../types'
import {
  convertScript,
  DEFAULT_STORY_WRITER_URL,
  fetchEditorCharacters,
  fetchEditorMeta,
  fetchStoryWriterChapter,
  fetchStoryWriterChapters,
  fetchStoryWriterProjects,
  matchEditorCharacter,
  speakerContextFromChapter,
  type CharacterSlot,
  type EditorCharacter,
  type EditorMeta,
  type SpeakerContext,
  type StoryWriterChapter,
  type StoryWriterChapterSummary,
  type StoryWriterProject,
} from '../api'

export interface ScriptImportEnrichment {
  /** Fast-path snapshot used as merge baseline when LLM YAML arrives. */
  baseline: ConversationFile
  /** Resolves to LLM-enriched conversations (`use_llm=true`). */
  promise: Promise<ConversationFile>
  /** Abort in-flight LLM request (e.g. user converts again). */
  abort: () => void
}

interface Props {
  baseUrl: string
  /** `create` (default): pick output filename and replace editor state. `append`: textarea only; caller appends conversations to the end of the current file. */
  mode?: 'create' | 'append'
  onImport: (
    conversations: Conversation[],
    filename: string,
    enrichment?: ScriptImportEnrichment,
  ) => void
  onClose: () => void
}

/** Default kind when the backend does not supply slots (Empire: talk | gift | event). */
const DEFAULT_FE_KIND = 'talk'
const PREFS_STORAGE_KEY = 'conversation-editor:script-import-prefs'
const STORY_WRITER_PREFS_KEY = 'conversation-editor:story-writer-prefs'

type ImportSource = 'paste' | 'storyWriter'

interface StoryWriterPrefs {
  baseUrl: string
  projectId: number | null
}

function readStoryWriterPrefs(): StoryWriterPrefs {
  try {
    const raw = localStorage.getItem(STORY_WRITER_PREFS_KEY)
    if (!raw) return { baseUrl: DEFAULT_STORY_WRITER_URL, projectId: null }
    const parsed = JSON.parse(raw) as Partial<StoryWriterPrefs>
    return {
      baseUrl: parsed.baseUrl?.trim() || DEFAULT_STORY_WRITER_URL,
      projectId: typeof parsed.projectId === 'number' ? parsed.projectId : null,
    }
  } catch {
    return { baseUrl: DEFAULT_STORY_WRITER_URL, projectId: null }
  }
}

function writeStoryWriterPrefs(prefs: StoryWriterPrefs): void {
  try {
    localStorage.setItem(STORY_WRITER_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // ignore quota / private mode
  }
}

interface ScriptImportPrefs {
  characterId: string
  kind: string
  slotKey: string
  eventDescription?: string
}

function readPrefs(baseUrl: string): Partial<ScriptImportPrefs> {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY)
    if (!raw) return {}
    const all = JSON.parse(raw) as Record<string, Partial<ScriptImportPrefs>>
    return all[baseUrl] ?? {}
  } catch {
    return {}
  }
}

function writePrefs(baseUrl: string, prefs: ScriptImportPrefs): void {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY)
    const all = (raw ? JSON.parse(raw) : {}) as Record<string, ScriptImportPrefs>
    all[baseUrl] = prefs
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore quota / private mode
  }
}

/** Empire event slug: lowercase, non-alnum → `_`, collapse repeats, trim edges. */
export function slugifyEventDescription(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/** FE-built seed basename when characters have empty `slots` (Empire). */
export function buildFeFilename(
  characterId: string,
  kind: string,
  eventSlug: string,
): string {
  if (!characterId) return 'imported-script.yml'
  if (kind === 'event') {
    return eventSlug
      ? `${characterId}-event-${eventSlug}.yml`
      : `${characterId}-event-.yml`
  }
  if (kind) return `${characterId}-${kind}.yml`
  return `${characterId}.yml`
}

function pickDefaultSlotKey(
  character: EditorCharacter,
  preferredKind: string | undefined,
  preferredSlotKey: string | undefined,
): string {
  const kinds = [...new Set(character.slots.map(s => s.kind))]
  const kind =
    (preferredKind && character.slots.some(s => s.kind === preferredKind)
      ? preferredKind
      : null) ??
    kinds[0] ??
    ''
  const kindSlots = character.slots.filter(s => s.kind === kind)
  return kindSlots.find(s => s.key === preferredSlotKey)?.key ?? kindSlots[0]?.key ?? ''
}

function pickDefaultFeKind(slotKinds: string[], preferredKind: string | undefined): string {
  if (preferredKind && slotKinds.includes(preferredKind)) return preferredKind
  if (slotKinds.includes(DEFAULT_FE_KIND)) return DEFAULT_FE_KIND
  return slotKinds[0] ?? ''
}

export function ScriptImportDialog({ baseUrl, mode = 'create', onImport, onClose }: Props) {
  const isAppend = mode === 'append'
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<ImportSource>('paste')
  const [storyWriterUrl, setStoryWriterUrl] = useState(() => readStoryWriterPrefs().baseUrl)
  const [projects, setProjects] = useState<StoryWriterProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    () => readStoryWriterPrefs().projectId,
  )
  const [chapters, setChapters] = useState<StoryWriterChapterSummary[]>([])
  const [chaptersLoading, setChaptersLoading] = useState(false)
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null)
  const [loadedChapter, setLoadedChapter] = useState<StoryWriterChapter | null>(null)
  const [chapterLoading, setChapterLoading] = useState(false)

  const [meta, setMeta] = useState<EditorMeta | null>(null)
  const [characters, setCharacters] = useState<EditorCharacter[]>([])
  const [charsLoading, setCharsLoading] = useState(!isAppend)
  const [charsError, setCharsError] = useState<string | null>(null)

  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [selectedSlotKey, setSelectedSlotKey] = useState('')
  /** Used when backend characters have empty slots (Empire FE filename contract). */
  const [selectedFeKind, setSelectedFeKind] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [feFilename, setFeFilename] = useState('imported-script.yml')
  const feFilenameTouchedRef = useRef(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const convertAbortRef = useRef<AbortController | null>(null)
  const enrichHandedOffRef = useRef(false)

  useEffect(() => {
    if (isAppend) return

    let cancelled = false
    setCharsLoading(true)
    setCharsError(null)
    feFilenameTouchedRef.current = false

    Promise.all([fetchEditorMeta(baseUrl), fetchEditorCharacters(baseUrl)])
      .then(([metaData, chars]) => {
        if (cancelled) return
        setMeta(metaData)
        setCharacters(chars)
        if (chars.length > 0) {
          const prefs = readPrefs(baseUrl)
          const character =
            chars.find(c => c.id === prefs.characterId) ?? chars[0]
          setSelectedCharacterId(character.id)
          if (character.slots.length === 0) {
            const kind = pickDefaultFeKind(metaData.slotKinds ?? [], prefs.kind)
            setSelectedFeKind(kind)
            setSelectedSlotKey('')
            setEventDescription(prefs.eventDescription ?? '')
          } else {
            setSelectedSlotKey(
              pickDefaultSlotKey(character, prefs.kind, prefs.slotKey),
            )
            setSelectedFeKind('')
            setEventDescription('')
          }
        }
        setCharsLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setCharsError(err instanceof Error ? err.message : String(err))
        setCharsLoading(false)
      })

    return () => { cancelled = true }
  }, [baseUrl, isAppend])

  useEffect(() => {
    return () => {
      if (!enrichHandedOffRef.current) convertAbortRef.current?.abort()
    }
  }, [])

  const currentCharacter = characters.find(c => c.id === selectedCharacterId)
  const slots = currentCharacter?.slots ?? []
  /** Empire (and any host with empty slots): FE builds filenames from kind + optional event slug. */
  const feFilenameMode = !charsLoading && !charsError && characters.length > 0 && slots.length === 0

  const slotsByKind = useMemo(() => {
    const map = new Map<string, CharacterSlot[]>()
    for (const slot of slots) {
      const list = map.get(slot.kind) ?? []
      list.push(slot)
      map.set(slot.kind, list)
    }
    return map
  }, [slots])

  const selectedSlot = slots.find(s => s.key === selectedSlotKey) ?? slots[0] ?? null
  const selectedKind = feFilenameMode
    ? selectedFeKind
    : (selectedSlot?.kind ?? meta?.slotKinds[0] ?? '')

  const eventSlug = slugifyEventDescription(eventDescription)
  const suggestedFeFilename = buildFeFilename(
    selectedCharacterId,
    selectedKind,
    eventSlug,
  )

  useEffect(() => {
    if (!feFilenameMode || feFilenameTouchedRef.current) return
    setFeFilename(suggestedFeFilename)
  }, [feFilenameMode, suggestedFeFilename])

  useEffect(() => {
    if (isAppend) return
    if (!selectedCharacterId || !selectedKind) return
    writePrefs(baseUrl, {
      characterId: selectedCharacterId,
      kind: selectedKind,
      slotKey: feFilenameMode ? '' : selectedSlotKey,
      eventDescription: feFilenameMode ? eventDescription : undefined,
    })
  }, [
    baseUrl,
    isAppend,
    selectedCharacterId,
    selectedKind,
    selectedSlotKey,
    feFilenameMode,
    eventDescription,
  ])

  useEffect(() => {
    writeStoryWriterPrefs({ baseUrl: storyWriterUrl, projectId: selectedProjectId })
  }, [storyWriterUrl, selectedProjectId])

  useEffect(() => {
    if (source !== 'storyWriter') return

    let cancelled = false
    setProjectsLoading(true)
    setProjectsError(null)
    fetchStoryWriterProjects(storyWriterUrl)
      .then(list => {
        if (cancelled) return
        setProjects(list)
        setProjectsLoading(false)
        setSelectedProjectId(prev => {
          if (prev && list.some(p => p.id === prev)) return prev
          return list[0]?.id ?? null
        })
      })
      .catch(err => {
        if (cancelled) return
        setProjects([])
        setProjectsError(err instanceof Error ? err.message : String(err))
        setProjectsLoading(false)
      })

    return () => { cancelled = true }
  }, [source, storyWriterUrl])

  useEffect(() => {
    if (source !== 'storyWriter' || selectedProjectId == null) {
      setChapters([])
      setSelectedChapterId(null)
      return
    }

    let cancelled = false
    setChaptersLoading(true)
    fetchStoryWriterChapters(storyWriterUrl, selectedProjectId)
      .then(list => {
        if (cancelled) return
        setChapters(list)
        setChaptersLoading(false)
        setSelectedChapterId(list[0]?.id ?? null)
      })
      .catch(err => {
        if (cancelled) return
        setChapters([])
        setChaptersLoading(false)
        setError(err instanceof Error ? err.message : String(err))
      })

    return () => { cancelled = true }
  }, [source, storyWriterUrl, selectedProjectId])

  useEffect(() => {
    if (source !== 'storyWriter' || selectedProjectId == null || selectedChapterId == null) {
      setLoadedChapter(null)
      return
    }

    let cancelled = false
    setChapterLoading(true)
    fetchStoryWriterChapter(storyWriterUrl, selectedProjectId, selectedChapterId)
      .then(chapter => {
        if (cancelled) return
        setLoadedChapter(chapter)
        setText(chapter.script)
        setChapterLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setLoadedChapter(null)
        setChapterLoading(false)
        setError(err instanceof Error ? err.message : String(err))
      })

    return () => { cancelled = true }
  }, [source, storyWriterUrl, selectedProjectId, selectedChapterId])

  useEffect(() => {
    if (isAppend || !loadedChapter || characters.length === 0) return
    const match = matchEditorCharacter(characters, loadedChapter.cast)
    if (match) handleCharacterChange(match.id)
    // Only when a new chapter payload arrives — don't fight manual character picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedChapter, characters, isAppend])

  function handleCharacterChange(id: string) {
    setSelectedCharacterId(id)
    const character = characters.find(c => c.id === id)
    if (!character) {
      setSelectedSlotKey('')
      return
    }
    feFilenameTouchedRef.current = false
    if (character.slots.length === 0) {
      setSelectedSlotKey('')
      setSelectedFeKind(pickDefaultFeKind(meta?.slotKinds ?? [], selectedKind || undefined))
      return
    }
    setSelectedSlotKey(pickDefaultSlotKey(character, selectedKind, undefined))
  }

  function handleKindChange(kind: string) {
    if (feFilenameMode) {
      feFilenameTouchedRef.current = false
      setSelectedFeKind(kind)
      return
    }
    const kindSlots = slotsByKind.get(kind) ?? []
    setSelectedSlotKey(kindSlots[0]?.key ?? '')
  }

  function computeFilename(): string {
    if (feFilenameMode) {
      const trimmed = feFilename.trim()
      if (!trimmed) return suggestedFeFilename
      return trimmed.endsWith('.yml') || trimmed.endsWith('.yaml')
        ? trimmed
        : `${trimmed}.yml`
    }
    return selectedSlot?.filename ?? 'imported-script.yml'
  }

  const eventSlugRequired =
    feFilenameMode && selectedKind === 'event' && eventSlug.length === 0
  const canConvert = Boolean(text.trim()) && !eventSlugRequired && !charsLoading

  async function handleConvert() {
    if (!canConvert) return
    setLoading(true)
    setError(null)

    convertAbortRef.current?.abort()
    enrichHandedOffRef.current = false
    const ac = new AbortController()
    convertAbortRef.current = ac

    const speakerContext: SpeakerContext | undefined =
      source === 'storyWriter' && loadedChapter
        ? speakerContextFromChapter(loadedChapter, currentCharacter?.name)
        : (currentCharacter?.name ? { opponentName: currentCharacter.name } : undefined)
    const convertOpts = { speakerContext, signal: ac.signal }
    const fastPromise = convertScript(baseUrl, text, { ...convertOpts, useLlm: false })
    const llmPromise = convertScript(baseUrl, text, { ...convertOpts, useLlm: true })

    try {
      const yamlText = await fastPromise
      const conversations = parseYaml(yamlText)
      const enrichment: ScriptImportEnrichment = {
        baseline: conversations,
        promise: llmPromise.then(llmYaml => parseYaml(llmYaml)),
        abort: () => ac.abort(),
      }
      enrichHandedOffRef.current = true
      onImport(conversations, isAppend ? '' : computeFilename(), enrichment)
    } catch (err) {
      if (ac.signal.aborted) return
      ac.abort()
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleConvert()
  }

  const characterLabel = meta?.characterLabel ?? 'Character'
  const kindOptions = feFilenameMode
    ? (meta?.slotKinds ?? [])
    : (meta?.slotKinds?.length
      ? meta.slotKinds.filter(k => slotsByKind.has(k) || slots.some(s => s.kind === k))
      : [...slotsByKind.keys()])

  const kindSlots = slotsByKind.get(selectedKind) ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col"
        style={{ width: 720, maxHeight: '85vh' }}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <span className="text-sm font-semibold text-gray-200">
            {isAppend ? 'Append from Script' : 'Import from Script'}
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        <div className="flex flex-col flex-1 overflow-y-auto min-h-0 p-4 gap-4">
          <p className="text-xs text-gray-400">
            Load a Fang Story Writer chapter or paste a narrative script. Dialogue in double quotes becomes{' '}
            <span className="text-blue-400 font-mono">hero</span> lines; surrounding narrative becomes{' '}
            <span className="text-gray-300 font-mono">other</span> lines.
            A fast parse loads immediately; LLM enrichment (backgrounds + speaker roles) uses the chapter cast when present.
            {isAppend
              ? ' Converted conversations are appended to the end of the current file.'
              : ' The result replaces the current editor content.'}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSource('paste')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                source === 'paste' ? 'bg-violet-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Paste script
            </button>
            <button
              type="button"
              onClick={() => setSource('storyWriter')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                source === 'storyWriter' ? 'bg-violet-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              From Story Writer
            </button>
          </div>

          {source === 'storyWriter' && (
            <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 w-24 shrink-0">Story Writer</label>
                <input
                  type="text"
                  value={storyWriterUrl}
                  onChange={e => setStoryWriterUrl(e.target.value)}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 font-mono focus:outline-none focus:border-pink-500"
                />
              </div>
              {projectsLoading ? (
                <p className="text-xs text-gray-500">Loading projects…</p>
              ) : projectsError ? (
                <p className="text-xs text-red-400">
                  {projectsError}. Is Story Writer running at {storyWriterUrl}?
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-24 shrink-0">Project</label>
                    <select
                      value={selectedProjectId ?? ''}
                      onChange={e => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                    >
                      {projects.length === 0 && <option value="">No projects</option>}
                      {projects.map(project => (
                        <option key={project.id} value={project.id}>
                          {project.title} ({project.chapterCount})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-24 shrink-0">Chapter</label>
                    <select
                      value={selectedChapterId ?? ''}
                      onChange={e => setSelectedChapterId(e.target.value ? Number(e.target.value) : null)}
                      disabled={chaptersLoading || chapters.length === 0}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-pink-500 disabled:opacity-40"
                    >
                      {chaptersLoading && <option value="">Loading…</option>}
                      {!chaptersLoading && chapters.length === 0 && <option value="">No chapters</option>}
                      {chapters.map(chapter => (
                        <option key={chapter.id} value={chapter.id} disabled={!chapter.hasScript}>
                          {chapter.position}. {chapter.title}
                          {chapter.hasScript ? '' : ' (empty)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  {chapterLoading && <p className="text-xs text-gray-500">Loading chapter…</p>}
                  {loadedChapter && (
                    <p className="text-[11px] text-gray-500">
                      Cast: {loadedChapter.cast.map(c => c.name).join(', ') || 'none'}
                      {loadedChapter.cast.length > 0
                        ? ' — sent to the speaker parser with this file’s character as opponent.'
                        : ''}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {!isAppend && (
            <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 flex flex-col gap-3">
              <p className="text-xs font-medium text-gray-300">Output file name</p>

              {charsLoading ? (
                <p className="text-xs text-gray-500">Loading {characterLabel.toLowerCase()}s…</p>
              ) : charsError ? (
                <p className="text-xs text-red-400">Failed to load characters: {charsError}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-24 shrink-0">{characterLabel}</label>
                    <select
                      value={selectedCharacterId}
                      onChange={e => handleCharacterChange(e.target.value)}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                    >
                      {characters.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {kindOptions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-400 w-24 shrink-0">Type</label>
                      <div className="flex flex-wrap gap-2">
                        {kindOptions.map(kind => (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => handleKindChange(kind)}
                            className={`px-3 py-1 text-xs rounded transition-colors ${
                              selectedKind === kind
                                ? 'bg-pink-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {kind.charAt(0).toUpperCase() + kind.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {feFilenameMode && selectedKind === 'event' && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-400 w-24 shrink-0">Event</label>
                        <input
                          type="text"
                          value={eventDescription}
                          onChange={e => {
                            feFilenameTouchedRef.current = false
                            setEventDescription(e.target.value)
                          }}
                          placeholder="e.g. First meeting"
                          className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                        />
                      </div>
                      <p className="text-[11px] text-gray-500 pl-[6.5rem]">
                        {eventSlug
                          ? <>Slug: <span className="font-mono text-gray-400">{eventSlug}</span></>
                          : 'Describe the event — used as the filename slug.'}
                      </p>
                    </div>
                  )}

                  {!feFilenameMode && kindSlots.length > 1 && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-400 w-24 shrink-0">Slot</label>
                      <select
                        value={selectedSlot?.key ?? ''}
                        onChange={e => setSelectedSlotKey(e.target.value)}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                      >
                        {kindSlots.map(slot => (
                          <option key={slot.key} value={slot.key}>{slot.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1 border-t border-gray-700">
                    <label className="text-xs text-gray-400 w-24 shrink-0">Filename</label>
                    {feFilenameMode ? (
                      <input
                        type="text"
                        value={feFilename}
                        onChange={e => {
                          feFilenameTouchedRef.current = true
                          setFeFilename(e.target.value)
                        }}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs font-mono text-green-400 focus:outline-none focus:border-pink-500"
                      />
                    ) : (
                      <span className="text-xs font-mono text-green-400">{computeFilename()}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'She smiled. "Hello there," she said. He nodded in silence.'}
            className="flex-1 min-h-[160px] bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-pink-500 resize-none font-mono"
            autoFocus
          />

          {error && (
            <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">
              {error}
            </div>
          )}
          {eventSlugRequired && (
            <div className="text-xs text-amber-400 bg-amber-900/20 border border-amber-800 rounded px-3 py-2">
              Enter an event description so the filename slug is not empty.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 shrink-0">
          <span className="text-xs text-gray-500">Cmd/Ctrl+Enter to convert</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConvert}
              disabled={loading || !canConvert}
              className="px-3 py-1 text-xs rounded bg-pink-600 hover:bg-pink-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Converting…' : isAppend ? 'Convert & Append' : 'Convert & Load'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
