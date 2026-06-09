/**
 * @smile/connector-sdk — types, validation, and harness helpers for smile:D connectors.
 *
 * Contract types live in the host repo under `src/connectors/contract` and are re-exported
 * here so connector authors can depend on one package while the contract stays single-source.
 */

export { validateConnectorPackage } from './validatePackage'
export type { ConnectorPackageValidation } from './validatePackage'

export { loadConnectorPackage } from './loadPackage'
export type { LoadedConnectorPackage } from './loadPackage'

export { runContractChecks } from '../../../src/connectors/contract/contractChecks'
export type { ContractCheckResult } from '../../../src/connectors/contract/contractChecks'

export {
  CURRENT_API_VERSION,
  isApiVersionSupported,
  parseApiVersion,
  validateManifest,
  normalizeMcpResult,
  contractMigrations,
  resolveMigrations,
  applyManifestMigrations,
  applyHostMigrations,
} from '../../../src/connectors/contract'

export type {
  ApiVersion,
  ParsedApiVersion,
  JSONSchema,
  ConnectorManifest,
  ToolManifest,
  ToolConfirmationTemplate,
  ToolMcpBinding,
  ConnectorHandlerKind,
  ConnectorAuth,
  ConnectorAuthField,
  ConnectorPermissions,
  ConnectorUI,
  PluginToolCategory,
  ToolResult,
  HostBridge,
  HostHttpRequest,
  HostHttpResponse,
  HostLogLevel,
  ConnectorHandlerModule,
  ApproveActionOutcome,
  ReportedWrite,
  HostToSandboxMessage,
  SandboxToHostMessage,
  ContextEnvelope,
  ContractMigration,
  ManifestValidation,
} from '../../../src/connectors/contract'
