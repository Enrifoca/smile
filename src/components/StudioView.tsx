import PlaygroundSection from './studio/PlaygroundSection'

/**
 * Studio — build and test connector packages without the agent loop.
 * Playground is the first module; builder UI can extend this view later.
 */
export default function StudioView() {
  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="content-shell page-shell space-y-8">
        <header>
          <h1 className="text-xl font-medium text-neutral-950">Studio</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Test and debug connectors installed in your workspace before using them in chat.
          </p>
        </header>
        <PlaygroundSection />
      </div>
    </div>
  )
}
