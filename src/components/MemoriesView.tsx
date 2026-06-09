import { useState, useEffect, useRef } from 'react'
import { useElectron } from '../hooks/useElectron'
import { Spinner, StatusText } from './ui'
import { MemoryEntry, MemoryStore } from '../types/memory'

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

const defaultUserMarkdown = ''

const defaultMemory: MemoryStore = {
  userMarkdown: defaultUserMarkdown,
  learnedRollup: '',
  general: { entries: [] },
  lexicon: { entries: [], commonPhrases: [], vocabularyNotes: [] },
  issueTypes: {},
  lastSyncedAt: null,
  version: 3,
}

const SAVE_DEBOUNCE_MS = 400

export default function MemoriesView() {
  const [memory, setMemory] = useState<MemoryStore>(defaultMemory)
  const [isLoading, setIsLoading] = useState(true)
  const [userMemoryDraft, setUserMemoryDraft] = useState(defaultUserMarkdown)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestDraftRef = useRef(defaultUserMarkdown)
  const { memory: memoryAPI } = useElectron()

  useEffect(() => {
    loadMemories()
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  const loadMemories = async () => {
    setIsLoading(true)
    try {
      const result = await memoryAPI.getAll()
      if (result.success && result.data) {
        const loadedMemory = result.data as MemoryStore
        setMemory(loadedMemory)
        const markdown = loadedMemory.userMarkdown || ''
        setUserMemoryDraft(markdown)
        latestDraftRef.current = markdown
      }
    } catch (error) {
      console.error('Failed to load memories:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const persistUserMemory = async (markdown: string) => {
    setSaveStatus('pending')
    try {
      const result = await memoryAPI.saveUserMarkdown(markdown)
      if (!result.success) throw new Error(result.error || 'Failed to save user memory')
      setMemory(prev => ({ ...prev, userMarkdown: markdown }))
      setSaveStatus('success')
      window.setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (error) {
      console.error('Failed to save user memory:', error)
      setSaveStatus('error')
      window.setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  const scheduleSave = (markdown: string) => {
    latestDraftRef.current = markdown
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      void persistUserMemory(latestDraftRef.current)
    }, SAVE_DEBOUNCE_MS)
  }

  const learnedNotes: Array<MemoryEntry & { kind: 'note' | 'style' }> = [
    ...memory.general.entries
      .filter(entry => entry.source === 'learned')
      .map(entry => ({ ...entry, kind: 'note' as const })),
    ...memory.lexicon.entries
      .filter(entry => entry.source === 'learned')
      .map(entry => ({ ...entry, kind: 'style' as const })),
  ]

  const handleDeleteLearnedNote = async (entry: MemoryEntry & { kind: 'note' | 'style' }) => {
    try {
      const nextMemory: MemoryStore = {
        ...memory,
        general: {
          entries: memory.general.entries.filter(item => item.id !== entry.id),
        },
        lexicon: {
          ...memory.lexicon,
          entries: memory.lexicon.entries.filter(item => item.id !== entry.id),
        },
      }
      const result = await memoryAPI.save(nextMemory)
      if (!result.success) throw new Error(result.error || 'Failed to delete learned note')
      setMemory(nextMemory)
      await loadMemories()
    } catch (error) {
      console.error('Failed to delete learned note:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="content-shell page-shell space-y-8">
        <div>
          <h1 className="text-xl font-medium text-neutral-950">Memory</h1>
          <p className="text-sm text-neutral-500 mt-1">
            User Memory is loaded before every response. Learned Notes are lower-priority hints.
          </p>
        </div>

        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div>
            <h2 className="text-lg font-medium text-neutral-950">User Memory</h2>
            <p className="text-sm text-neutral-500 mt-1">
              Edit this Markdown to control what the agent should always remember and follow.
            </p>
          </div>

          <textarea
            value={userMemoryDraft}
            placeholder="Add durable instructions, preferences, and workspace conventions here..."
            onChange={(e) => {
              const nextValue = e.target.value
              setUserMemoryDraft(nextValue)
              scheduleSave(nextValue)
            }}
            className="w-full min-h-[420px] px-4 py-3 border border-gray-300 rounded-xl text-sm leading-relaxed resize-y focus:ring-2 focus:ring-neutral-500 focus:border-transparent"
            spellCheck={false}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">
              Saved to <code className="bg-gray-100 px-1 py-0.5 rounded">.smile/memories/user.md</code>
            </p>
            <StatusText
              busy={saveStatus === 'pending'}
              status={saveStatus === 'success' ? 'success' : saveStatus === 'error' ? 'error' : 'idle'}
              busyMessage="Saving…"
              successMessage="Saved"
              errorMessage="Could not save"
              size="sm"
            />
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div>
            <h2 className="text-lg font-medium text-neutral-950">Learned Notes</h2>
            <p className="text-sm text-neutral-500 mt-1">
              Notes the agent saved automatically. They never override User Memory.
            </p>
          </div>

          {learnedNotes.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">
              No learned notes yet.
            </p>
          ) : (
            <div className="space-y-2">
              {learnedNotes.map(entry => (
                <div key={entry.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3">
                  <div className="flex-1">
                    <p className="text-gray-700">{entry.content}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Learned {entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteLearnedNote(entry)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                    title="Delete learned note"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
