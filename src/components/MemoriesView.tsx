import { useState, useEffect } from 'react'
import { useElectron } from '../hooks/useElectron'
import { MemoryEntry, MemoryStore } from '../types/memory'

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

const defaultUserMarkdown = ''

const defaultMemory: MemoryStore = {
  userMarkdown: defaultUserMarkdown,
  general: { entries: [] },
  lexicon: { entries: [], commonPhrases: [], vocabularyNotes: [] },
  issueTypes: {},
  lastSyncedAt: null,
  version: 2,
}

export default function MemoriesView() {
  const [memory, setMemory] = useState<MemoryStore>(defaultMemory)
  const [isLoading, setIsLoading] = useState(true)
  const [userMemoryDraft, setUserMemoryDraft] = useState(defaultUserMarkdown)
  const [userMemoryStatus, setUserMemoryStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const { memory: memoryAPI } = useElectron()

  useEffect(() => {
    loadMemories()
  }, [])

  const loadMemories = async () => {
    setIsLoading(true)
    try {
      const result = await memoryAPI.getAll()
      if (result.success && result.data) {
        const loadedMemory = result.data as MemoryStore
        setMemory(loadedMemory)
        setUserMemoryDraft(loadedMemory.userMarkdown || '')
      }
    } catch (error) {
      console.error('Failed to load memories:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveUserMemory = async () => {
    setUserMemoryStatus('saving')
    try {
      const result = await memoryAPI.saveUserMarkdown(userMemoryDraft)
      if (!result.success) throw new Error(result.error || 'Failed to save user memory')
      setMemory(prev => ({ ...prev, userMarkdown: userMemoryDraft }))
      setUserMemoryStatus('saved')
      setTimeout(() => setUserMemoryStatus('idle'), 1600)
    } catch (error) {
      console.error('Failed to save user memory:', error)
      setUserMemoryStatus('error')
    }
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
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-neutral-900 border-t-transparent"></div>
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

        <section className="bg-white rounded-2xl border-2 border-neutral-950 p-5 space-y-4">
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
              setUserMemoryDraft(e.target.value)
              setUserMemoryStatus('idle')
            }}
            className="w-full min-h-[420px] px-4 py-3 border-2 border-neutral-950 rounded-xl text-sm leading-relaxed resize-y focus:ring-2 focus:ring-neutral-500 focus:border-transparent"
            spellCheck={false}
          />

          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-500">
              Saved to <code className="bg-gray-100 px-1 py-0.5 rounded">.smile/memories/user.md</code>
            </p>
            <button
              onClick={handleSaveUserMemory}
              disabled={userMemoryStatus === 'saving'}
              className="px-5 py-2.5 text-sm bg-neutral-950 text-white rounded-xl hover:bg-neutral-700 disabled:opacity-50"
            >
              {userMemoryStatus === 'saving' ? 'Saving...' : userMemoryStatus === 'saved' ? 'Saved' : 'Save Memory'}
            </button>
          </div>
          {userMemoryStatus === 'error' && (
            <p className="text-sm text-red-600">Could not save memory. Check the console for details.</p>
          )}
        </section>

        <section className="bg-white rounded-2xl border-2 border-neutral-950 p-5 space-y-3">
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
