import axios, { AxiosInstance } from 'axios'

interface JiraConfig {
  baseUrl: string
  email: string
  apiToken: string
}

interface JiraProject {
  id: string
  key: string
  name: string
  projectTypeKey: string
}

interface JiraIssue {
  id: string
  key: string
  fields: {
    summary: string
    description?: string
    status: { name: string; id: string }
    priority?: { name: string; id: string }
    assignee?: { displayName: string; emailAddress: string }
    reporter?: { displayName: string; emailAddress: string }
    created: string
    updated: string
    duedate?: string
    issuetype: { name: string; id: string }
    project: { key: string; name: string }
    labels?: string[]
    comment?: { comments: Array<{ author: { displayName: string }; body: string; created: string }> }
  }
}

interface JiraSprint {
  id: number
  name: string
  state: string
  startDate?: string
  endDate?: string
  goal?: string
}

interface JiraBoard {
  id: number
  name: string
  type: string
  location?: { projectKey: string; projectName: string }
}

export class JiraService {
  private client: AxiosInstance
  private baseUrl: string

  constructor(config: JiraConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '') // Remove trailing slash
    
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')
    
    this.client = axios.create({
      baseURL: `${this.baseUrl}/rest`,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    })
  }

  /**
   * Test the connection to Jira
   */
  async testConnection(): Promise<{ success: boolean; error?: string; user?: unknown }> {
    try {
      const response = await this.client.get('/api/3/myself')
      return { success: true, user: response.data }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      return { success: false, error: message }
    }
  }

  /**
   * Get all accessible projects
   */
  async getProjects(): Promise<{ success: boolean; data?: JiraProject[]; error?: string }> {
    try {
      const response = await this.client.get('/api/3/project')
      return { success: true, data: response.data }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch projects'
      return { success: false, error: message }
    }
  }

  /**
   * Search issues using JQL
   */
  async searchIssues(jql: string, maxResults: number = 50): Promise<{ success: boolean; data?: { issues: JiraIssue[]; total: number }; error?: string }> {
    try {
      const response = await this.client.post('/api/3/search', {
        jql,
        maxResults,
        fields: [
          'summary', 'description', 'status', 'priority', 'assignee', 
          'reporter', 'created', 'updated', 'duedate', 'issuetype',
          'project', 'labels', 'comment'
        ]
      })
      return { success: true, data: { issues: response.data.issues, total: response.data.total } }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to search issues'
      return { success: false, error: message }
    }
  }

  /**
   * Get a single issue by key
   */
  async getIssue(issueKey: string): Promise<{ success: boolean; data?: JiraIssue; error?: string }> {
    try {
      const response = await this.client.get(`/api/3/issue/${issueKey}`, {
        params: {
          fields: 'summary,description,status,priority,assignee,reporter,created,updated,duedate,issuetype,project,labels,comment'
        }
      })
      return { success: true, data: response.data }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch issue'
      return { success: false, error: message }
    }
  }

  /**
   * Create a new issue
   */
  async createIssue(issueData: {
    projectKey: string
    summary: string
    description?: string
    issueType: string
    priority?: string
    assignee?: string
    labels?: string[]
    dueDate?: string
  }): Promise<{ success: boolean; data?: { id: string; key: string }; error?: string }> {
    try {
      const fields: Record<string, unknown> = {
        project: { key: issueData.projectKey },
        summary: issueData.summary,
        issuetype: { name: issueData.issueType }
      }

      if (issueData.description) {
        fields.description = {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: issueData.description }]
          }]
        }
      }

      if (issueData.priority) fields.priority = { name: issueData.priority }
      if (issueData.assignee) fields.assignee = { id: issueData.assignee }
      if (issueData.labels) fields.labels = issueData.labels
      if (issueData.dueDate) fields.duedate = issueData.dueDate

      const response = await this.client.post('/api/3/issue', { fields })
      return { success: true, data: { id: response.data.id, key: response.data.key } }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create issue'
      return { success: false, error: message }
    }
  }

  /**
   * Update an existing issue
   */
  async updateIssue(issueKey: string, updateData: {
    summary?: string
    description?: string
    priority?: string
    assignee?: string
    labels?: string[]
    dueDate?: string
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const fields: Record<string, unknown> = {}

      if (updateData.summary) fields.summary = updateData.summary
      if (updateData.description) {
        fields.description = {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: updateData.description }]
          }]
        }
      }
      if (updateData.priority) fields.priority = { name: updateData.priority }
      if (updateData.assignee) fields.assignee = { id: updateData.assignee }
      if (updateData.labels) fields.labels = updateData.labels
      if (updateData.dueDate) fields.duedate = updateData.dueDate

      await this.client.put(`/api/3/issue/${issueKey}`, { fields })
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update issue'
      return { success: false, error: message }
    }
  }

  /**
   * Add a comment to an issue
   */
  async addComment(issueKey: string, comment: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const response = await this.client.post(`/api/3/issue/${issueKey}/comment`, {
        body: {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: comment }]
          }]
        }
      })
      return { success: true, data: response.data }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add comment'
      return { success: false, error: message }
    }
  }

  /**
   * Get available transitions for an issue
   */
  async getTransitions(issueKey: string): Promise<{ success: boolean; data?: Array<{ id: string; name: string }>; error?: string }> {
    try {
      const response = await this.client.get(`/api/3/issue/${issueKey}/transitions`)
      return { success: true, data: response.data.transitions }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get transitions'
      return { success: false, error: message }
    }
  }

  /**
   * Transition an issue to a new status
   */
  async transitionIssue(issueKey: string, transitionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.client.post(`/api/3/issue/${issueKey}/transitions`, {
        transition: { id: transitionId }
      })
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to transition issue'
      return { success: false, error: message }
    }
  }

  /**
   * Get all boards
   */
  async getBoards(): Promise<{ success: boolean; data?: JiraBoard[]; error?: string }> {
    try {
      const response = await this.client.get('/agile/1.0/board')
      return { success: true, data: response.data.values }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch boards'
      return { success: false, error: message }
    }
  }

  /**
   * Get sprints for a board
   */
  async getSprints(boardId: number): Promise<{ success: boolean; data?: JiraSprint[]; error?: string }> {
    try {
      const response = await this.client.get(`/agile/1.0/board/${boardId}/sprint`)
      return { success: true, data: response.data.values }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch sprints'
      return { success: false, error: message }
    }
  }

  /**
   * Get issues in a sprint
   */
  async getSprintIssues(sprintId: number): Promise<{ success: boolean; data?: JiraIssue[]; error?: string }> {
    try {
      const response = await this.client.get(`/agile/1.0/sprint/${sprintId}/issue`, {
        params: {
          fields: 'summary,status,priority,assignee,issuetype,project'
        }
      })
      return { success: true, data: response.data.issues }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch sprint issues'
      return { success: false, error: message }
    }
  }
}
