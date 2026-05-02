import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs/promises'
import path from 'path'
import { MAX_ATTACHMENT_SIZE } from './files'

interface JiraAttachmentConfig {
  baseUrl: string
  email: string
  apiToken: string
}

interface AttachmentResult {
  success: boolean
  data?: {
    id: string
    filename: string
    size: number
    mimeType: string
    self: string
    content: string
  }[]
  error?: string
}

export class JiraAttachmentService {
  private config: JiraAttachmentConfig

  constructor(config: JiraAttachmentConfig) {
    this.config = config
  }

  /**
   * Upload a file to a Jira issue
   * 
   * @param issueKey - The issue key (e.g., PROJ-123)
   * @param filePath - Full path to the file
   * @returns Upload result with attachment info
   */
  async uploadAttachment(issueKey: string, filePath: string): Promise<AttachmentResult> {
    try {
      // Validate config
      if (!this.config.baseUrl || !this.config.email || !this.config.apiToken) {
        console.error('[JiraAttachment] Missing config:', {
          hasBaseUrl: !!this.config.baseUrl,
          hasEmail: !!this.config.email,
          hasApiToken: !!this.config.apiToken
        })
        return {
          success: false,
          error: 'Jira API token not fully configured. Please go to Settings and add your Jira Site URL, Email, and API Token.'
        }
      }

      console.log(`[JiraAttachment] Uploading ${filePath} to ${issueKey}`)
      console.log(`[JiraAttachment] Using baseUrl: ${this.config.baseUrl}`)

      // Read file and check size
      const fileStats = await fs.stat(filePath)
      
      if (fileStats.size > MAX_ATTACHMENT_SIZE) {
        return {
          success: false,
          error: `File is too large (${(fileStats.size / 1024 / 1024).toFixed(2)}MB). Jira allows maximum 10MB per attachment.`
        }
      }

      const fileBuffer = await fs.readFile(filePath)
      const fileName = path.basename(filePath)

      // Create form data
      const formData = new FormData()
      formData.append('file', fileBuffer, {
        filename: fileName,
        contentType: 'application/octet-stream'
      })

      // Upload to Jira
      const response = await axios.post(
        `${this.config.baseUrl}/rest/api/3/issue/${issueKey}/attachments`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Basic ${Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString('base64')}`,
            'X-Atlassian-Token': 'no-check'  // Required for attachment uploads
          }
        }
      )

      console.log(`[JiraAttachment] Successfully uploaded ${fileName} to ${issueKey}`)
      
      return {
        success: true,
        data: response.data
      }
    } catch (error) {
      let errorMessage = 'Failed to upload attachment'
      
      if (axios.isAxiosError(error)) {
        if (error.code === 'ERR_INVALID_URL' || error.message.includes('Invalid URL')) {
          errorMessage = 'Invalid Jira Site URL. Please check your Jira configuration in Settings (e.g., https://your-domain.atlassian.net).'
        } else if (error.response?.status === 401) {
          errorMessage = 'Authentication failed. Please check your Jira API token in Settings.'
        } else if (error.response?.status === 403) {
          errorMessage = 'Permission denied. You may not have permission to attach files to this issue.'
        } else if (error.response?.status === 404) {
          errorMessage = `Issue ${error.config?.url?.split('/').slice(-2, -1)[0]} not found.`
        } else if (error.response?.data?.errorMessages) {
          errorMessage = error.response.data.errorMessages.join(', ')
        } else {
          errorMessage = error.message
        }
      } else if (error instanceof Error) {
        if (error.message.includes('Invalid URL')) {
          errorMessage = 'Invalid Jira Site URL. Please configure it in Settings (e.g., https://your-domain.atlassian.net).'
        } else {
          errorMessage = error.message
        }
      }

      console.error(`[JiraAttachment] Upload failed:`, errorMessage)
      return { success: false, error: errorMessage }
    }
  }
}

// Singleton instance
let jiraAttachmentService: JiraAttachmentService | null = null

export function getJiraAttachmentService(config?: JiraAttachmentConfig): JiraAttachmentService | null {
  if (config) {
    jiraAttachmentService = new JiraAttachmentService(config)
  }
  return jiraAttachmentService
}

export function isJiraAttachmentConfigured(): boolean {
  return jiraAttachmentService !== null
}
