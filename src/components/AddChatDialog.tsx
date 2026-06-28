import { useState } from 'react'
import type { Chat } from '../types'

interface Props {
  onAdd: (chat: Chat) => void
  onClose: () => void
}

type BlockType =
  | 'plain'
  | 'cinematic'
  | 'click-game'
  | 'words-catcher'
  | 'shuffle-puzzle'
  | 'multichoice'

interface BlockDef {
  type: BlockType
  label: string
  description: string
  hasArgs: boolean
}

const BLOCKS: BlockDef[] = [
  { type: 'plain', label: 'Plain chat', description: 'Regular dialogue line', hasArgs: false },
  { type: 'cinematic', label: '(...) Cinematic', description: 'Cinematic pause — no dialogue box', hasArgs: false },
  { type: 'click-game', label: '(click-game:...) Click Game', description: 'Click mini-game', hasArgs: true },
  { type: 'words-catcher', label: '(words-catcher:...) Words Catcher', description: 'Words catcher game', hasArgs: true },
  { type: 'shuffle-puzzle', label: '(shuffle-puzzle:...) Shuffle Puzzle', description: 'Sliding tile puzzle', hasArgs: true },
  { type: 'multichoice', label: '(multichoice:...) Multiple Choice', description: 'Multiple choice prompt — first option is correct', hasArgs: true },
]

function buildContent(type: BlockType, args: string, options: string[]): string {
  switch (type) {
    case 'plain': return args
    case 'cinematic': return '(...)'
    case 'click-game': return `(click-game:${args})`
    case 'words-catcher': return `(words-catcher:${args})`
    case 'shuffle-puzzle': return `(shuffle-puzzle:${args})`
    case 'multichoice': return `(multichoice:${options.join(':')})`
  }
}

export function AddChatDialog({ onAdd, onClose }: Props) {
  const [step, setStep] = useState<'pick' | 'args'>('pick')
  const [selectedType, setSelectedType] = useState<BlockType>('plain')
  const [role, setRole] = useState<Chat['role']>('other')
  const [args, setArgs] = useState('')
  const [options, setOptions] = useState<string[]>(['Correct answer', 'Wrong option'])
  const [newOption, setNewOption] = useState('')

  function handlePickType(type: BlockType) {
    setSelectedType(type)
    const def = BLOCKS.find(b => b.type === type)!
    if (!def.hasArgs) {
      // No args needed — go straight to confirm
      const content = buildContent(type, '', [])
      onAdd({ role, content })
    } else {
      setStep('args')
    }
  }

  function handleConfirm() {
    if (selectedType === 'multichoice' && options.length < 2) return
    const content = buildContent(selectedType, args.trim(), options)
    onAdd({ role, content })
  }

  function addOption() {
    const val = newOption.trim()
    if (!val) return
    setOptions(prev => [...prev, val])
    setNewOption('')
  }

  function removeOption(i: number) {
    setOptions(prev => prev.filter((_, idx) => idx !== i))
  }

  function moveOption(i: number, dir: -1 | 1) {
    const next = [...options]
    const target = i + dir
    if (target < 0 || target >= next.length) return
    ;[next[i], next[target]] = [next[target], next[i]]
    setOptions(next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="font-semibold text-gray-100 text-sm">
            {step === 'pick' ? 'Add Chat' : `Configure ${BLOCKS.find(b => b.type === selectedType)?.label}`}
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        {/* Role picker — always shown */}
        <div className="px-4 pt-3 flex items-center gap-3">
          <span className="text-xs text-gray-400 shrink-0">Speaker</span>
          <div className="flex gap-1.5">
            {(['other', 'hero', 'opponent'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  role === r
                    ? 'bg-pink-600 border-pink-500 text-white'
                    : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-gray-200'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Step: pick block type */}
        {step === 'pick' && (
          <div className="px-4 py-3 flex flex-col gap-1.5">
            <p className="text-xs text-gray-500 mb-1">Choose chat type:</p>
            {BLOCKS.map(def => (
              <button
                key={def.type}
                onClick={() => handlePickType(def.type)}
                className="text-left px-3 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-pink-600 transition-colors flex flex-col gap-0.5"
              >
                <span className="text-sm text-gray-100 font-mono">{def.label}</span>
                <span className="text-xs text-gray-500">{def.description}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step: args / options */}
        {step === 'args' && (
          <div className="px-4 py-3 flex flex-col gap-3">
            {selectedType === 'multichoice' ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-gray-400">Options — first is the <span className="text-green-400">correct answer</span>:</p>
                <div className="flex flex-col gap-1">
                  {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className={`text-xs w-4 text-center shrink-0 ${i === 0 ? 'text-green-400' : 'text-gray-600'}`}>
                        {i === 0 ? '✓' : '·'}
                      </span>
                      <span className="flex-1 text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono truncate">
                        {opt}
                      </span>
                      <button
                        onClick={() => moveOption(i, -1)}
                        disabled={i === 0}
                        className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 px-1"
                        title="Move up"
                      >▲</button>
                      <button
                        onClick={() => moveOption(i, 1)}
                        disabled={i === options.length - 1}
                        className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 px-1"
                        title="Move down"
                      >▼</button>
                      <button
                        onClick={() => removeOption(i)}
                        className="text-xs text-red-500 hover:text-red-400 px-1"
                        title="Remove"
                      >✕</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newOption}
                    onChange={e => setNewOption(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
                    placeholder="New option…"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                  />
                  <button
                    onClick={addOption}
                    className="text-xs px-3 py-1 rounded bg-pink-700 hover:bg-pink-600 text-white transition-colors"
                  >
                    Add
                  </button>
                </div>
                {options.length < 2 && (
                  <p className="text-xs text-red-400">At least 2 options required.</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Description / label (optional)</label>
                <input
                  type="text"
                  value={args}
                  onChange={e => setArgs(e.target.value)}
                  placeholder="e.g. Fight minigame"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-pink-500 font-mono"
                />
              </div>
            )}

            {/* Preview */}
            <div className="bg-gray-950 border border-gray-700 rounded px-3 py-2">
              <p className="text-xs text-gray-500 mb-0.5">Preview</p>
              <p className="text-xs text-gray-300 font-mono break-all">
                {buildContent(selectedType, args.trim(), options) || <span className="text-gray-600 italic">—</span>}
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 flex justify-end gap-2">
          {step === 'args' && (
            <button
              onClick={() => setStep('pick')}
              className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            Cancel
          </button>
          {step === 'args' && (
            <button
              onClick={handleConfirm}
              disabled={selectedType === 'multichoice' && options.length < 2}
              className="text-xs px-4 py-1.5 rounded bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors"
            >
              Add Chat
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
