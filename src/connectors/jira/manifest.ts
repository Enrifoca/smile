export const jiraManifest = {
  id: 'jira',
  name: 'Jira',
  description: 'Example connector for Atlassian Jira work tracking.',
  auth: {
    provider: 'atlassian',
    type: 'oauth-with-rest-token',
  },
  ui: {
    catalogLabel: 'Jira',
    connectedLabel: 'Atlassian connection',
    scopeLabel: 'Monitored projects',
  },
} as const
