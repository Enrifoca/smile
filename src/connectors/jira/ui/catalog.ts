import { jiraManifest } from '../manifest'
import { JiraIcon } from './JiraIcon'

export const jiraCatalogEntry = {
  id: jiraManifest.id,
  name: jiraManifest.name,
  description: jiraManifest.description,
  status: 'available' as const,
  Icon: JiraIcon,
}
