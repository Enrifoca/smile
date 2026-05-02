/**
 * Memory Sync Utility
 * 
 * Syncs user's writing style from Jira issues to the memory system.
 */

// Types for MCP and Jira metadata APIs
interface McpAPI {
  searchIssues: (jql: string, maxResults?: number, fields?: string | string[]) => Promise<{
    success: boolean
    data?: unknown
    error?: string
  }>
  getCurrentUser: () => Promise<{
    success: boolean
    data?: unknown
    error?: string
  }>
}

interface JiraMetadataAPI {
  get: () => Promise<{
    monitoredProjects: Array<{ id: string; key: string; name: string; projectTypeKey: string; avatarUrl?: string }>
    projectMetadata: Record<string, {
      issueTypes?: Array<{ id: string; name: string; description?: string; subtask: boolean }>
    }>
  }>
}

interface MemoryAPI {
  syncIssueExamples: (issueTypeName: string, issueTypeId: string, examples: Array<{
    issueKey: string
    summary: string
    description?: string
    createdAt: string
    customFields?: Record<string, unknown>
  }>) => Promise<{ success: boolean; error?: string }>
  addCommonPhrase: (phrase: string) => Promise<{ success: boolean; error?: string }>
  addLexicon: (content: string, source?: 'learned' | 'user') => Promise<{ success: boolean; error?: string }>
  updateLastSynced: () => Promise<{ success: boolean; error?: string }>
}

interface JiraIssue {
  key: string
  fields: {
    summary?: string
    description?: string | { content?: Array<{ content?: Array<{ text?: string }> }> }
    issuetype?: {
      id: string
      name: string
    }
    created?: string
    reporter?: {
      accountId?: string
      displayName?: string
    }
    [key: string]: unknown
  }
}

/**
 * Extract text from Atlassian Document Format (ADF)
 */
function extractTextFromADF(adf: unknown): string {
  if (typeof adf === 'string') return adf
  if (!adf || typeof adf !== 'object') return ''
  
  const doc = adf as { content?: Array<{ content?: Array<{ text?: string }> }> }
  if (!doc.content) return ''
  
  const textParts: string[] = []
  
  function extractFromContent(content: unknown[]): void {
    for (const node of content) {
      if (typeof node !== 'object' || !node) continue
      const typedNode = node as { type?: string; text?: string; content?: unknown[] }
      
      if (typedNode.type === 'text' && typedNode.text) {
        textParts.push(typedNode.text)
      }
      if (typedNode.content && Array.isArray(typedNode.content)) {
        extractFromContent(typedNode.content)
      }
    }
  }
  
  extractFromContent(doc.content)
  return textParts.join(' ')
}

/**
 * Extract common phrases from text
 */
function extractCommonPhrases(texts: string[]): string[] {
  const allText = texts.join(' ').toLowerCase()
  
  // Common PM phrases to look for
  const phrasePatterns = [
    /need[s]? to\s+\w+/gi,
    /should\s+\w+/gi,
    /must\s+\w+/gi,
    /please\s+\w+/gi,
    /as a\s+\w+/gi,
    /in order to\s+\w+/gi,
    /so that\s+\w+/gi,
    /given\s+\w+/gi,
    /when\s+\w+/gi,
    /then\s+\w+/gi,
    /acceptance criteria/gi,
    /steps to reproduce/gi,
    /expected behavior/gi,
    /actual behavior/gi,
    /blocked by/gi,
    /depends on/gi,
    /related to/gi,
  ]
  
  const foundPhrases: string[] = []
  
  for (const pattern of phrasePatterns) {
    const matches = allText.match(pattern)
    if (matches) {
      for (const match of matches) {
        const phrase = match.trim()
        if (phrase.length > 3 && !foundPhrases.includes(phrase)) {
          foundPhrases.push(phrase)
        }
      }
    }
  }
  
  // Return top 20 most common
  return foundPhrases.slice(0, 20)
}

/**
 * Analyze writing style from issues
 */
function analyzeWritingStyle(issues: JiraIssue[]): string[] {
  const observations: string[] = []
  
  // Calculate averages
  const summaries = issues.map(i => i.fields.summary || '').filter(s => s)
  const descriptions = issues.map(i => {
    const desc = i.fields.description
    return typeof desc === 'string' ? desc : extractTextFromADF(desc)
  }).filter(d => d)
  
  if (summaries.length > 0) {
    const avgSummaryLength = summaries.reduce((a, b) => a + b.length, 0) / summaries.length
    observations.push(`Average summary length: ~${Math.round(avgSummaryLength)} characters`)
    
    // Check if user uses specific patterns in summaries
    const hasBrackets = summaries.filter(s => /\[.*\]/.test(s)).length / summaries.length
    if (hasBrackets > 0.3) {
      observations.push('Often uses [brackets] in summaries for categorization')
    }
    
    const hasColon = summaries.filter(s => s.includes(':')).length / summaries.length
    if (hasColon > 0.3) {
      observations.push('Often uses colons in summaries as separators')
    }
    
    const startsWithVerb = summaries.filter(s => /^(add|fix|update|remove|create|implement|refactor)/i.test(s)).length / summaries.length
    if (startsWithVerb > 0.3) {
      observations.push('Summaries often start with action verbs (Add, Fix, Update, etc.)')
    }
  }
  
  if (descriptions.length > 0) {
    const avgDescLength = descriptions.reduce((a, b) => a + b.length, 0) / descriptions.length
    observations.push(`Average description length: ~${Math.round(avgDescLength)} characters`)
    
    const hasHeadings = descriptions.filter(d => /#+\s|##|###/.test(d) || /\*\*[^*]+\*\*:/.test(d)).length / descriptions.length
    if (hasHeadings > 0.2) {
      observations.push('Often uses headings/sections in descriptions')
    }
    
    const hasBullets = descriptions.filter(d => /^[\s]*[-*]\s/m.test(d)).length / descriptions.length
    if (hasBullets > 0.3) {
      observations.push('Frequently uses bullet points in descriptions')
    }
  }
  
  return observations
}

/**
 * Sync memory from Jira issues
 */
export async function syncMemoryFromJira(
  mcpAPI: McpAPI,
  _jiraMetadataAPI: JiraMetadataAPI, // Reserved for future use (e.g., getting issue types)
  projectKeys: string[],
  memoryAPI?: MemoryAPI
): Promise<void> {
  console.log('[MemorySync] Starting memory sync for projects:', projectKeys)
  
  // Get memory API if not provided
  if (!memoryAPI) {
    const electronAPI = (window as { electronAPI?: { memory?: MemoryAPI } }).electronAPI
    if (!electronAPI?.memory) {
      console.error('[MemorySync] Memory API not available')
      return
    }
    memoryAPI = electronAPI.memory
  }
  
  try {
    // Get current user to filter issues
    console.log('[MemorySync] Getting current user...')
    const userResult = await mcpAPI.getCurrentUser()
    let currentUserAccountId: string | null = null
    
    if (userResult.success && userResult.data) {
      // Parse MCP response format
      const rawData = userResult.data as { accountId?: string } | { content?: Array<{ text?: string; type?: string }> }
      
      if ('content' in rawData && Array.isArray(rawData.content)) {
        // MCP format - extract from text
        for (const item of rawData.content) {
          if (item.type === 'text' && item.text) {
            try {
              const parsed = JSON.parse(item.text) as { accountId?: string }
              currentUserAccountId = parsed.accountId || null
              break
            } catch {
              // Try to extract accountId from text directly
              const match = item.text.match(/"accountId"\s*:\s*"([^"]+)"/)
              if (match) {
                currentUserAccountId = match[1]
              }
            }
          }
        }
      } else if ('accountId' in rawData) {
        currentUserAccountId = rawData.accountId || null
      }
      
      console.log('[MemorySync] Current user accountId:', currentUserAccountId)
    } else {
      console.log('[MemorySync] Failed to get current user:', userResult.error)
    }
    
    // Build JQL to get user's recent issues
    const projectJql = projectKeys.length > 0 
      ? `project in (${projectKeys.join(',')})` 
      : ''
    
    // Search for issues created by the current user
    const creatorFilter = currentUserAccountId 
      ? `reporter = "${currentUserAccountId}"` 
      : ''
    
    const jql = [projectJql, creatorFilter]
      .filter(Boolean)
      .join(' AND ')
      + ' ORDER BY created DESC'
    
    console.log('[MemorySync] Searching with JQL:', jql)
    
    const searchResult = await mcpAPI.searchIssues(jql, 100, ['summary', 'description', 'issuetype', 'created', 'reporter'])
    
    if (!searchResult.success || !searchResult.data) {
      console.error('[MemorySync] Failed to search issues:', searchResult.error)
      return
    }
    
    // Parse issues from response - MCP returns { content: [{ text: "JSON string" }] }
    let issues: JiraIssue[] = []
    
    console.log('[MemorySync] Raw search result data type:', typeof searchResult.data)
    
    const data = searchResult.data as { issues?: JiraIssue[] } | { content?: Array<{ text?: string; type?: string }> } | string
    
    if (typeof data === 'string') {
      console.log('[MemorySync] Data is string, attempting to parse')
      try {
        const parsed = JSON.parse(data) as { issues?: JiraIssue[] }
        issues = parsed.issues || []
      } catch (e) {
        console.error('[MemorySync] Failed to parse issues from string:', e)
      }
    } else if ('issues' in data && Array.isArray(data.issues)) {
      console.log('[MemorySync] Data has issues array directly')
      issues = data.issues
    } else if ('content' in data && Array.isArray(data.content)) {
      // MCP format - extract text from content array
      console.log('[MemorySync] Data is MCP format with content array, length:', data.content.length)
      
      for (const item of data.content) {
        if (item.type === 'text' && item.text) {
          console.log('[MemorySync] Found text content, length:', item.text.length)
          try {
            const parsed = JSON.parse(item.text) as { issues?: JiraIssue[] }
            if (parsed.issues && Array.isArray(parsed.issues)) {
              issues = parsed.issues
              console.log('[MemorySync] Successfully parsed', issues.length, 'issues from MCP text')
              break
            }
          } catch (e) {
            console.error('[MemorySync] Failed to parse MCP text content:', e)
          }
        }
      }
    } else {
      console.log('[MemorySync] Unknown data format:', JSON.stringify(data).substring(0, 500))
    }
    
    console.log(`[MemorySync] Found ${issues.length} issues`)
    
    if (issues.length === 0) {
      console.log('[MemorySync] No issues found, skipping memory sync')
      await memoryAPI.updateLastSynced()
      return
    }
    
    // Group issues by type
    const issuesByType: Map<string, { typeId: string; issues: JiraIssue[] }> = new Map()
    
    for (const issue of issues) {
      const issueType = issue.fields.issuetype
      if (!issueType?.name) continue
      
      const existing = issuesByType.get(issueType.name)
      if (existing) {
        existing.issues.push(issue)
      } else {
        issuesByType.set(issueType.name, {
          typeId: issueType.id,
          issues: [issue]
        })
      }
    }
    
    console.log(`[MemorySync] Grouped into ${issuesByType.size} issue types`)
    
    // Sync examples for each issue type (max 10 examples per type)
    for (const [typeName, typeData] of issuesByType.entries()) {
      const examples = typeData.issues.slice(0, 10).map(issue => ({
        issueKey: issue.key,
        summary: issue.fields.summary || '',
        description: typeof issue.fields.description === 'string' 
          ? issue.fields.description 
          : extractTextFromADF(issue.fields.description),
        createdAt: issue.fields.created || new Date().toISOString(),
      }))
      
      console.log(`[MemorySync] Syncing ${examples.length} examples for ${typeName}`)
      
      await memoryAPI.syncIssueExamples(typeName, typeData.typeId, examples)
    }
    
    // Extract common phrases and lexicon
    const allSummaries = issues.map(i => i.fields.summary || '')
    const allDescriptions = issues.map(i => {
      const desc = i.fields.description
      return typeof desc === 'string' ? desc : extractTextFromADF(desc)
    })
    
    const commonPhrases = extractCommonPhrases([...allSummaries, ...allDescriptions])
    console.log(`[MemorySync] Found ${commonPhrases.length} common phrases`)
    
    for (const phrase of commonPhrases) {
      await memoryAPI.addCommonPhrase(phrase)
    }
    
    // Analyze and save writing style observations
    const styleObservations = analyzeWritingStyle(issues)
    console.log(`[MemorySync] Learned ${styleObservations.length} style patterns`)
    
    for (const observation of styleObservations) {
      await memoryAPI.addLexicon(observation, 'learned')
    }
    
    // Update last synced
    await memoryAPI.updateLastSynced()
    
    console.log('[MemorySync] Memory sync complete')
  } catch (error) {
    console.error('[MemorySync] Error during sync:', error)
    throw error
  }
}

/**
 * Add a single issue to memory (for auto-update after issue creation)
 */
export async function addIssueToMemory(
  issue: JiraIssue,
  memoryAPI?: MemoryAPI
): Promise<void> {
  if (!memoryAPI) {
    const electronAPI = (window as { electronAPI?: { memory?: MemoryAPI } }).electronAPI
    if (!electronAPI?.memory) {
      console.error('[MemorySync] Memory API not available')
      return
    }
    memoryAPI = electronAPI.memory
  }
  
  const issueType = issue.fields.issuetype
  if (!issueType?.name || !issueType?.id) {
    console.warn('[MemorySync] Issue missing type info, skipping')
    return
  }
  
  const example = {
    issueKey: issue.key,
    summary: issue.fields.summary || '',
    description: typeof issue.fields.description === 'string'
      ? issue.fields.description
      : extractTextFromADF(issue.fields.description),
    createdAt: issue.fields.created || new Date().toISOString(),
  }
  
  // This uses addIssueExample which auto-rotates old examples
  const electronAPI = (window as { electronAPI?: { memory?: { addIssueExample: (a: string, b: string, c: typeof example) => Promise<{ success: boolean }> } } }).electronAPI
  if (electronAPI?.memory?.addIssueExample) {
    await electronAPI.memory.addIssueExample(issueType.name, issueType.id, example)
    console.log(`[MemorySync] Added ${issue.key} to ${issueType.name} memory`)
  }
}
