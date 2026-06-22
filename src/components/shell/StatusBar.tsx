import { useEffect, useState } from 'react'
import { useElectron } from '../../hooks/useElectron'
import type { AIConfig, OCRConfig } from '../../shared/modelCatalog'
import { FolderIcon } from './shellIcons'

function shortenPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  if (parts.length <= 3) return normalized
  return `…/${parts.slice(-2).join('/')}`
}

export default function StatusBar() {
  const { storage, file } = useElectron()
  const [chatModel, setChatModel] = useState<string | null>(null)
  const [reasoningModel, setReasoningModel] = useState<string | null>(null)
  const [reasoningOn, setReasoningOn] = useState(false)
  const [ocrModel, setOcrModel] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<string | null>(null)

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const aiConfigStr = await storage.getSecure('aiConfig')
        if (aiConfigStr) {
          const config = JSON.parse(aiConfigStr) as AIConfig
          setChatModel(config.model || config.provider)
        }
        const reasoningStr = await storage.getSecure('reasoningConfig')
        if (reasoningStr) {
          const rc = JSON.parse(reasoningStr) as AIConfig
          setReasoningModel(rc.model || rc.provider)
          setReasoningOn(true)
        }
        const ocrStr = await storage.getSecure('ocrConfig')
        if (ocrStr) {
          const oc = JSON.parse(ocrStr) as OCRConfig
          setOcrModel(oc.model || oc.provider)
        }
        const ws = await file.getWorkspace()
        setWorkspace(ws)
      } catch (error) {
        console.error('Failed to load status bar:', error)
      }
    }

    void loadStatus()
    const refresh = () => {
      void loadStatus()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('workspace:changed', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('workspace:changed', refresh)
    }
  }, [storage, file])

  return (
    <footer className="ui-statusbar">
      {chatModel ? <span className="ui-statusbar__item ui-statusbar__item--model">{chatModel}</span> : null}
      {reasoningModel ? (
        <span className={`ui-statusbar__item ${reasoningOn ? '' : 'opacity-55'}`}>
          {reasoningModel}{reasoningOn ? '' : ' (off)'}
        </span>
      ) : null}
      {ocrModel ? <span className="ui-statusbar__item">{ocrModel}</span> : null}
      <span className="ui-statusbar__spacer" />
      {workspace ? (
        <span className="ui-statusbar__item ui-statusbar__item--clickable" title={workspace}>
          <FolderIcon />
          {shortenPath(workspace)}
        </span>
      ) : null}
    </footer>
  )
}
