const BASE = ''

// ── Folders ───────────────────────────────────────────────────────────────────

export async function listFolders() {
  const r = await fetch(`${BASE}/api/folders/`)
  if (!r.ok) throw new Error(`listFolders ${r.status}`)
  return r.json()
}

export async function createFolder(name, parentId = null) {
  const r = await fetch(`${BASE}/api/folders/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent_id: parentId }),
  })
  if (!r.ok) throw new Error(`createFolder ${r.status}: ${await r.text()}`)
  return r.json()
}

export async function renameFolder(id, name) {
  const r = await fetch(`${BASE}/api/folders/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!r.ok) throw new Error(`renameFolder ${r.status}`)
  return r.json()
}

export async function moveFolder(id, parentId) {
  const r = await fetch(`${BASE}/api/folders/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent_id: parentId }),
  })
  if (!r.ok) throw new Error(`moveFolder ${r.status}`)
  return r.json()
}

export async function deleteFolder(id) {
  const r = await fetch(`${BASE}/api/folders/${id}/`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`deleteFolder ${r.status}`)
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export async function listTags() {
  const r = await fetch(`${BASE}/api/tags/`)
  if (!r.ok) throw new Error(`listTags ${r.status}`)
  return r.json()
}

export async function createTag(name, color = 'gray') {
  const r = await fetch(`${BASE}/api/tags/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  })
  if (!r.ok) throw new Error(`createTag ${r.status}: ${await r.text()}`)
  return r.json()
}

export async function updateTag(id, payload) {
  const r = await fetch(`${BASE}/api/tags/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error(`updateTag ${r.status}`)
  return r.json()
}

export async function deleteTag(id) {
  const r = await fetch(`${BASE}/api/tags/${id}/`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`deleteTag ${r.status}`)
}

// ── Document actions ──────────────────────────────────────────────────────────

export async function starDocument(id) {
  const r = await fetch(`${BASE}/api/documents/${id}/star/`, { method: 'POST' })
  if (!r.ok) throw new Error(`starDocument ${r.status}`)
  return r.json()
}

export async function moveDocument(id, folderId) {
  const r = await fetch(`${BASE}/api/documents/${id}/move/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_id: folderId }),
  })
  if (!r.ok) throw new Error(`moveDocument ${r.status}`)
  return r.json()
}

export async function setDocumentTags(id, tagIds) {
  const r = await fetch(`${BASE}/api/documents/${id}/tags/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_ids: tagIds }),
  })
  if (!r.ok) throw new Error(`setDocumentTags ${r.status}`)
  return r.json()
}

export async function restoreDocument(id) {
  const r = await fetch(`${BASE}/api/documents/${id}/restore/`, { method: 'POST' })
  if (!r.ok) throw new Error(`restoreDocument ${r.status}`)
  return r.json()
}

export async function hardDeleteDocument(id) {
  const r = await fetch(`${BASE}/api/documents/${id}/?hard=1`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`hardDeleteDocument ${r.status}`)
}

// ── Dashboard data ────────────────────────────────────────────────────────────

export async function listActivity(limit = 10) {
  const r = await fetch(`${BASE}/api/activity/?limit=${limit}`)
  if (!r.ok) throw new Error(`listActivity ${r.status}`)
  return r.json()
}

export async function getStorage() {
  const r = await fetch(`${BASE}/api/storage/`)
  if (!r.ok) throw new Error(`getStorage ${r.status}`)
  return r.json()
}

export async function exportTrainingData(docIds = null) {
  const url = docIds?.length
    ? `${BASE}/api/training-data/export/?doc_ids=${docIds.join(',')}`
    : `${BASE}/api/training-data/export/`
  const r = await fetch(url)
  if (r.status === 404) {
    const body = await r.json().catch(() => ({}))
    throw new Error(body.error || 'no annotated pages available')
  }
  if (!r.ok) throw new Error(`exportTrainingData ${r.status}`)
  const blob = await r.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'layout_training_data.zip'
  a.click()
  URL.revokeObjectURL(a.href)
}
