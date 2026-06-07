/**
 * Connector contract (language-neutral).
 *
 * The stable boundary third-party connectors are written against: manifest shape,
 * tool JSON Schema, host capability API, sandboxed handler module, RPC protocol,
 * and versioning/migration. No Electron/Node types leak through here so a future
 * non-Electron host can implement the same contract without breaking connectors.
 *
 * See src/connectors/contract/README.md.
 */
export { CURRENT_API_VERSION, isApiVersionSupported, parseApiVersion } from './version'
export type { ApiVersion, ParsedApiVersion } from './version'

export type { JSONSchema } from './jsonSchema'

export type {
  ConnectorManifest,
  ToolManifest,
  ToolConfirmationTemplate,
  ConnectorAuth,
  ConnectorAuthField,
  ConnectorPermissions,
  ConnectorUI,
  PluginToolCategory,
} from './manifest'

export type { ToolResult } from './result'

export type {
  HostBridge,
  HostHttpRequest,
  HostHttpResponse,
  HostLogLevel,
} from './host'

export type {
  ConnectorHandlerModule,
  ApproveActionOutcome,
  ReportedWrite,
} from './handler'

export type { HostToSandboxMessage, SandboxToHostMessage, ContextEnvelope } from './rpc'

export {
  contractMigrations,
  resolveMigrations,
  applyManifestMigrations,
  applyHostMigrations,
} from './migration'
export type { ContractMigration } from './migration'

export { validateManifest } from './validate'
export type { ManifestValidation } from './validate'
