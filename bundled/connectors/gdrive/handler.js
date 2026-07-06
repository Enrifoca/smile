// Google Drive connector handler — Google REST API via host.call('google.api', ...).
// Runs in a constrained node:vm sandbox; no require, fetch, or filesystem access.

function str(value) {
  return value == null ? '' : String(value)
}

function clamp(value, min, max) {
  const num = Number(value)
  if (!Number.isFinite(num)) return min
  return Math.max(min, Math.min(max, Math.round(num)))
}

async function driveApi(host, endpoint, method, body, queryParams) {
  return host.call('google.api', { endpoint, method, body, queryParams })
}

async function loadFolderScope(host) {
  const ctx = await host.context.get()
  if (!ctx) return { allowedIds: null }

  const raw = ctx.folderIds
  if (!Array.isArray(raw) || raw.length === 0) {
    return { allowedIds: null }
  }

  const allowedIds = raw.map(str).map(s => s.trim()).filter(Boolean)
  if (!allowedIds.length) {
    return { allowedIds: null }
  }

  return { allowedIds }
}

function isFolderAllowed(folderId, allowedIds) {
  if (!allowedIds) return true
  return allowedIds.includes(str(folderId).trim())
}

function resolveFolderId(argsFolderId, scope) {
  const requested = str(argsFolderId).trim()
  if (requested) {
    if (!isFolderAllowed(requested, scope.allowedIds)) {
      return { error: `Folder '${requested}' is not in the context scope: ${(scope.allowedIds || []).join(', ')}.` }
    }
    return { folderId: requested }
  }

  if (scope.allowedIds && scope.allowedIds.length === 1) {
    return { folderId: scope.allowedIds[0] }
  }

  if (scope.allowedIds && scope.allowedIds.length > 1) {
    return { error: `Multiple folders are scoped. Please specify a folderId from: ${scope.allowedIds.join(', ')}.` }
  }

  return { error: 'No folderId provided and no folder scope is set.' }
}

function escapeDriveQuery(value) {
  return str(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function formatFile(file) {
  return {
    id: str(file.id),
    name: str(file.name),
    mimeType: str(file.mimeType),
    parents: file.parents || [],
    webViewLink: str(file.webViewLink),
    modifiedTime: str(file.modifiedTime),
    createdTime: str(file.createdTime),
    size: file.size ? str(file.size) : undefined,
  }
}

async function handleListFiles(host, args) {
  const scope = await loadFolderScope(host)
  if (scope.error) return { success: false, error: scope.error }

  const resolved = resolveFolderId(args.folderId, scope)
  if (resolved.error) return { success: false, error: resolved.error }

  const pageSize = clamp(args.pageSize, 1, 100) || 20
  const q = `'${escapeDriveQuery(resolved.folderId)}' in parents and trashed=false`
  const result = await driveApi(host, '/drive/v3/files', 'GET', undefined, {
    q,
    pageSize: String(pageSize),
    fields: 'files(id,name,mimeType,parents,webViewLink,modifiedTime,createdTime,size)',
  })

  if (!result.success) return result
  return { success: true, data: { folderId: resolved.folderId, files: (result.data.files || []).map(formatFile) } }
}

async function handleSearchFiles(host, args) {
  const scope = await loadFolderScope(host)
  if (scope.error) return { success: false, error: scope.error }

  const name = str(args.name).trim()
  if (!name) return { success: false, error: 'name is required.' }

  const pageSize = clamp(args.pageSize, 1, 100) || 20
  let q = `name contains '${escapeDriveQuery(name)}' and trashed=false`
  if (scope.allowedIds && scope.allowedIds.length > 0) {
    const folderClauses = scope.allowedIds.map(id => `'${escapeDriveQuery(id)}' in parents`).join(' or ')
    q += ` and (${folderClauses})`
  }

  const result = await driveApi(host, '/drive/v3/files', 'GET', undefined, {
    q,
    pageSize: String(pageSize),
    fields: 'files(id,name,mimeType,parents,webViewLink,modifiedTime,createdTime,size)',
  })

  if (!result.success) return result
  return { success: true, data: { files: (result.data.files || []).map(formatFile) } }
}

async function handleGetFile(host, args) {
  const fileId = str(args.fileId).trim()
  if (!fileId) return { success: false, error: 'fileId is required.' }

  const result = await driveApi(host, `/drive/v3/files/${encodeURIComponent(fileId)}`, 'GET', undefined, {
    fields: 'id,name,mimeType,parents,webViewLink,modifiedTime,createdTime,size',
  })

  if (!result.success) return result
  return { success: true, data: formatFile(result.data) }
}

async function handleDownloadText(host, args) {
  const fileId = str(args.fileId).trim()
  if (!fileId) return { success: false, error: 'fileId is required.' }

  const metaResult = await driveApi(host, `/drive/v3/files/${encodeURIComponent(fileId)}`, 'GET', undefined, {
    fields: 'id,name,mimeType',
  })
  if (!metaResult.success) return metaResult

  const mimeType = str(metaResult.data.mimeType)
  const isGoogleWorkspace = mimeType.startsWith('application/vnd.google-apps.')

  let result
  if (isGoogleWorkspace) {
    const exportMimeType = str(args.mimeType) || 'text/plain'
    result = await driveApi(host, `/drive/v3/files/${encodeURIComponent(fileId)}/export`, 'GET', undefined, {
      mimeType: exportMimeType,
    })
  } else {
    result = await driveApi(host, `/drive/v3/files/${encodeURIComponent(fileId)}`, 'GET', undefined, { alt: 'media' })
  }

  if (!result.success) return result
  return { success: true, data: { name: str(metaResult.data.name), mimeType, content: str(result.data) } }
}

async function handleCreateFolder(host, args) {
  const scope = await loadFolderScope(host)
  if (scope.error) return { success: false, error: scope.error }

  const resolved = resolveFolderId(args.parentId, scope)
  if (resolved.error) return { success: false, error: resolved.error }

  const name = str(args.name).trim()
  if (!name) return { success: false, error: 'name is required.' }

  const body = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [resolved.folderId],
  }

  const result = await driveApi(host, '/drive/v3/files', 'POST', body)
  if (!result.success) return result
  return { success: true, data: formatFile(result.data) }
}

async function handleUploadFile(host, args) {
  const scope = await loadFolderScope(host)
  if (scope.error) return { success: false, error: scope.error }

  const resolved = resolveFolderId(args.folderId, scope)
  if (resolved.error) return { success: false, error: resolved.error }

  const name = str(args.name).trim()
  const content = str(args.content)
  const mimeType = str(args.mimeType).trim() || 'text/plain'

  if (!name) return { success: false, error: 'name is required.' }

  // Step 1: upload media content to get a file id.
  const uploadResult = await driveApi(host, '/upload/drive/v3/files', 'POST', content, {
    uploadType: 'media',
  })
  if (!uploadResult.success) return uploadResult

  const fileId = str(uploadResult.data.id)
  if (!fileId) return { success: false, error: 'Upload succeeded but no file id was returned.' }

  // Step 2: patch metadata (name) and add parent folder.
  const patchResult = await driveApi(host, `/drive/v3/files/${encodeURIComponent(fileId)}`, 'PATCH', { name }, {
    addParents: resolved.folderId,
  })

  if (!patchResult.success) return patchResult
  return { success: true, data: formatFile(patchResult.data) }
}

async function handleMoveFile(host, args) {
  const scope = await loadFolderScope(host)
  if (scope.error) return { success: false, error: scope.error }

  const resolved = resolveFolderId(args.folderId, scope)
  if (resolved.error) return { success: false, error: resolved.error }

  const fileId = str(args.fileId).trim()
  if (!fileId) return { success: false, error: 'fileId is required.' }

  const metaResult = await driveApi(host, `/drive/v3/files/${encodeURIComponent(fileId)}`, 'GET', undefined, {
    fields: 'parents',
  })
  if (!metaResult.success) return metaResult

  const removeParents = (metaResult.data.parents || []).join(',')
  const result = await driveApi(host, `/drive/v3/files/${encodeURIComponent(fileId)}`, 'PATCH', undefined, {
    addParents: resolved.folderId,
    removeParents,
  })

  if (!result.success) return result
  return { success: true, data: { fileId, folderId: resolved.folderId, previousParents: metaResult.data.parents || [] } }
}

async function executeTool(name, args, host) {
  switch (name) {
    case 'gdrive_list_files':
      return handleListFiles(host, args)
    case 'gdrive_search_files':
      return handleSearchFiles(host, args)
    case 'gdrive_get_file':
      return handleGetFile(host, args)
    case 'gdrive_download_text':
      return handleDownloadText(host, args)
    case 'gdrive_create_folder':
      return handleCreateFolder(host, args)
    case 'gdrive_upload_file':
      return handleUploadFile(host, args)
    case 'gdrive_move_file':
      return handleMoveFile(host, args)
    default:
      return { success: false, error: `Unknown tool: ${name}` }
  }
}

async function approveAction(actionType, data, host) {
  return { handled: false }
}

module.exports = { executeTool, approveAction }
