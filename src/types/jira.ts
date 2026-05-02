// Jira metadata types for pre-fetched project information

export interface JiraProject {
  id: string
  key: string
  name: string
  projectTypeKey: string  // 'software', 'business', 'service_desk'
  avatarUrl?: string
  description?: string
}

export interface JiraIssueType {
  id: string
  name: string
  description?: string
  subtask: boolean
  hierarchyLevel: number
  iconUrl?: string
}

export interface JiraFieldAllowedValue {
  id: string
  value: string
  name?: string
}

export interface JiraField {
  id: string              // e.g., "customfield_10001" or "summary"
  key: string             // e.g., "customfield_10001" or "summary"
  name: string            // e.g., "Story Points" or "Summary"
  type: string            // e.g., "number", "string", "array", "option", "user"
  custom: boolean
  required: boolean
  hasDefaultValue: boolean
  defaultValue?: unknown
  allowedValues?: JiraFieldAllowedValue[]
  schema: {
    type: string
    items?: string
    custom?: string
    customId?: number
    system?: string
  }
}

// Alias for backward compatibility
export type JiraCustomField = JiraField

export interface JiraUser {
  accountId: string       // Unique Atlassian account ID
  displayName: string     // Full name like "Enrico Focaccia"
  emailAddress?: string   // Email if available
  avatarUrl?: string
  active: boolean
}

export interface JiraProjectMetadata {
  project: JiraProject
  issueTypes: JiraIssueType[]
  // Fields per issue type: issueTypeId -> fields
  fieldsByIssueType: Record<string, JiraField[]>
}

export interface JiraMetadataStore {
  // Projects the user has chosen to monitor
  monitoredProjects: JiraProject[]
  
  // Full metadata per project (keyed by project key)
  projectMetadata: Record<string, JiraProjectMetadata>
  
  // Standard fields (common across all projects)
  standardFields: JiraField[]
  
  // All users/team members that can be assigned to issues
  users: JiraUser[]
  
  // Timestamps
  lastSynced: string | null
  syncedProjects: string[]  // Project keys that have been synced
}

// Default empty store
export const defaultJiraMetadataStore: JiraMetadataStore = {
  monitoredProjects: [],
  projectMetadata: {},
  standardFields: [],
  users: [],
  lastSynced: null,
  syncedProjects: [],
}

/**
 * Format metadata for the AI system prompt
 * This gives the AI comprehensive knowledge of the Jira environment
 */
export function formatJiraMetadataForPrompt(metadata: JiraMetadataStore): string {
  // Defensive checks for all arrays
  const monitoredProjects = metadata?.monitoredProjects || []
  const users = metadata?.users || []
  const projectMetadata = metadata?.projectMetadata || {}
  
  if (monitoredProjects.length === 0) {
    return 'No Jira projects are being monitored.'
  }

  const lines: string[] = [
    '## Your Jira Knowledge',
    '',
    'You have detailed knowledge of the following Jira environment. Use this information to help users effectively.',
    '',
    '### Monitored Projects',
  ]

  // List projects
  for (const project of monitoredProjects) {
    lines.push(`- **${project.key}**: "${project.name}" (${project.projectTypeKey})`)
  }

  lines.push('')
  lines.push('Project scoping: the user may scope a single chat message with `/ "Project Name"` or `/ PROJECTKEY`. Treat that as applying only to the current message. If multiple managed projects are relevant, build JQL with `project in (...)`; otherwise infer the best matching managed project from the message and project names.')

  // List users/team members
  if (users.length > 0) {
    lines.push('')
    lines.push('### Team Members (Assignable Users)')
    lines.push('')
    for (const user of users) {
      const email = user.emailAddress ? ` <${user.emailAddress}>` : ''
      lines.push(`- **${user.displayName}**${email} (accountId: \`${user.accountId}\`)`)
    }
  }

  lines.push('')
  lines.push('### Issue Types by Project')

  // List issue types per project
  for (const project of monitoredProjects) {
    const projectMeta = projectMetadata[project.key]
    if (!projectMeta) continue

    const issueTypes = projectMeta.issueTypes || []
    lines.push(``)
    lines.push(`**${project.key}** (${project.name}):`)
    for (const issueType of issueTypes) {
      const subtaskLabel = issueType.subtask ? ' [subtask]' : ''
      lines.push(`- ${issueType.name} (id: \`${issueType.id}\`)${subtaskLabel}`)
    }
  }

  lines.push('')
  lines.push('### Custom Fields')
  lines.push('')
  lines.push('Below are the custom fields available for each project and issue type. Use the field ID when setting values.')
  lines.push('')

  // List custom fields per project/issue type
  for (const project of monitoredProjects) {
    const projectMeta = projectMetadata[project.key]
    if (!projectMeta) continue

    const issueTypes = projectMeta.issueTypes || []
    const fieldsByIssueType = projectMeta.fieldsByIssueType || {}
    
    for (const issueType of issueTypes) {
      const fields = fieldsByIssueType[issueType.id]
      if (!fields || fields.length === 0) continue

      // Only show custom fields (not standard ones like summary, description)
      const customFields = fields.filter(f => f.custom)
      if (customFields.length === 0) continue

      lines.push(`**${project.key} / ${issueType.name}**:`)
      for (const field of customFields.slice(0, 30)) { // Limit to prevent prompt explosion
        const requiredLabel = field.required ? ' **[required]**' : ''
        let optionsLabel = ''
        if (field.allowedValues && field.allowedValues.length > 0) {
          const options = field.allowedValues.slice(0, 10).map(v => v.value || v.name || v.id).join(', ')
          const moreLabel = field.allowedValues.length > 10 ? `, ... +${field.allowedValues.length - 10} more` : ''
          optionsLabel = ` → Options: [${options}${moreLabel}]`
        }
        lines.push(`- \`${field.id}\` **${field.name}** (${field.type})${requiredLabel}${optionsLabel}`)
      }
      lines.push('')
    }
  }

  lines.push('---')
  lines.push('')
  lines.push('### CRITICAL RULES FOR JIRA OPERATIONS')
  lines.push('')
  lines.push('1. **Projects**: ONLY work with the monitored projects above unless user EXPLICITLY asks about others')
  lines.push('2. **Issue Types**: Use the exact issue type name when creating issues (e.g., "Task", "Bug", "Tech Task")')
  lines.push('3. **Custom Fields**: Use the field ID (e.g., `customfield_10001`) when setting custom field values')
  lines.push('4. **Field Options**: For dropdown/select fields, use ONLY values from the allowed options list')
  lines.push('5. **Assignees**: Use the accountId to assign users, NOT their display name')
  lines.push('6. **Confirmation**: ALWAYS ask for confirmation before creating, updating, or transitioning issues')

  return lines.join('\n')
}

// Helper to get field by name for a specific project/issue type
export function findFieldByName(
  metadata: JiraMetadataStore,
  projectKey: string,
  issueTypeId: string,
  fieldName: string
): JiraField | undefined {
  const projectMeta = metadata.projectMetadata[projectKey]
  if (!projectMeta) return undefined

  const fields = projectMeta.fieldsByIssueType[issueTypeId]
  if (!fields) return undefined

  return fields.find(f => 
    f.name.toLowerCase() === fieldName.toLowerCase() ||
    f.id.toLowerCase() === fieldName.toLowerCase()
  )
}

// Helper to get issue type by name for a project
export function findIssueTypeByName(
  metadata: JiraMetadataStore,
  projectKey: string,
  issueTypeName: string
): JiraIssueType | undefined {
  const projectMeta = metadata.projectMetadata[projectKey]
  if (!projectMeta) return undefined

  return projectMeta.issueTypes.find(it =>
    it.name.toLowerCase() === issueTypeName.toLowerCase() ||
    it.id === issueTypeName
  )
}

// Helper to find user by name or email
export function findUserByName(
  metadata: JiraMetadataStore,
  searchTerm: string
): JiraUser | undefined {
  const term = searchTerm.toLowerCase()
  return metadata.users.find(u =>
    u.displayName.toLowerCase().includes(term) ||
    (u.emailAddress && u.emailAddress.toLowerCase().includes(term))
  )
}

// Helper to find user by account ID
export function findUserByAccountId(
  metadata: JiraMetadataStore,
  accountId: string
): JiraUser | undefined {
  return metadata.users.find(u => u.accountId === accountId)
}
