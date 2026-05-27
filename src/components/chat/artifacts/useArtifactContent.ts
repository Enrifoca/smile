import { useEffect, useState } from 'react'
import { useElectron } from '../../../hooks/useElectron'

/** Load markdown from the workspace. Keys on path + reloadKey (e.g. artifact message id). */
export function useArtifactContent(path: string, reloadKey?: string) {
  const readFile = useElectron().file.read
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setContent(null)
    setError(null)

    readFile(path).then(result => {
      if (cancelled) return
      setLoading(false)
      if (result.success && result.data !== undefined) {
        setContent(result.data)
      } else {
        setError(result.error || 'Could not load report')
      }
    }).catch(() => {
      if (!cancelled) {
        setLoading(false)
        setError('Could not load report')
      }
    })

    return () => { cancelled = true }
  }, [path, reloadKey, readFile])

  return { content, error, loading }
}
