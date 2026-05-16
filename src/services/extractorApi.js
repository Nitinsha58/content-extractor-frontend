const BASE = ''

export async function detectLayout(imageBlob, filename = 'page.png') {
  const form = new FormData()
  form.append('file', imageBlob, filename)
  const r = await fetch(`${BASE}/api/debug/layout/`, {
    method: 'POST',
    body: form,
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`Layout ${r.status}: ${text}`)
  }
  return r.json()
}

export async function analyzeCellTypes(sessionId, blockId, bbox, tableStructure) {
  const r = await fetch(`${BASE}/api/debug/table-cell-types/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, block_id: blockId, bbox, table_structure: tableStructure }),
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`CellTypes ${r.status}: ${text}`)
  }
  return r.json()
}

export async function analyzeTableStructure(sessionId, blockId, bbox) {
  const r = await fetch(`${BASE}/api/debug/table-structure/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, block_id: blockId, bbox }),
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`TableStructure ${r.status}: ${text}`)
  }
  return r.json()
}

export async function runOcrStream(sessionId, layoutBlocks, onBlock) {
  const r = await fetch(`${BASE}/api/debug/ocr/stream/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, layout_blocks: layoutBlocks }),
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`OCR stream ${r.status}: ${text}`)
  }
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (line.trim()) {
        try { onBlock(JSON.parse(line)) } catch { /* skip malformed line */ }
      }
    }
  }
}

export async function runOcr(sessionId, layoutBlocks) {
  const r = await fetch(`${BASE}/api/debug/ocr/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      layout_blocks: layoutBlocks,
    }),
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`OCR ${r.status}: ${text}`)
  }
  return r.json()
}

export async function exportDocument(sessionId, format, ocrBlocks) {
  const r = await fetch(`${BASE}/api/export/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      format,
      ocr_blocks: ocrBlocks,
    }),
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`Export ${r.status}: ${text}`)
  }
  if (format === 'docx') return r.blob()
  return r.text()
}

export const figureCropUrl = (sessionId, bbox) =>
  `${BASE}/api/debug/crop/?session_id=${sessionId}&bbox=${bbox.join(',')}`

export const sessionImageUrl = (sessionId) =>
  `${BASE}/api/debug/session-image/${sessionId}/`

// ── Document persistence ──────────────────────────────────────────────────────

export async function createDocument(pdfFile, pageCount, folderId = null) {
  const form = new FormData()
  form.append('pdf', pdfFile, pdfFile.name)
  form.append('filename', pdfFile.name)
  form.append('page_count', String(pageCount))
  if (folderId) form.append('folder_id', folderId)
  const r = await fetch(`${BASE}/api/documents/`, { method: 'POST', body: form })
  if (!r.ok) throw new Error(`createDocument ${r.status}: ${await r.text()}`)
  return r.json()
}

export async function listDocuments(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== '')
  ).toString()
  const r = await fetch(`${BASE}/api/documents/${qs ? '?' + qs : ''}`)
  if (!r.ok) throw new Error(`listDocuments ${r.status}`)
  return r.json()
}

export async function getDocument(docId) {
  const r = await fetch(`${BASE}/api/documents/${docId}/`)
  if (!r.ok) throw new Error(`getDocument ${r.status}`)
  return r.json()
}

export async function updateDocument(docId, payload) {
  const r = await fetch(`${BASE}/api/documents/${docId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error(`updateDocument ${r.status}`)
  return r.json()
}

export async function deleteDocument(docId) {
  const r = await fetch(`${BASE}/api/documents/${docId}/`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`deleteDocument ${r.status}`)
}

export async function savePage(docId, pageNumber, payload) {
  const r = await fetch(`${BASE}/api/documents/${docId}/pages/${pageNumber}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error(`savePage ${r.status}: ${await r.text()}`)
  return r.json()
}

export async function getPage(docId, pageNumber) {
  const r = await fetch(`${BASE}/api/documents/${docId}/pages/${pageNumber}/`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`getPage ${r.status}: ${await r.text()}`)
  return r.json()
}

export async function getPageStructure(docId, pageNumber) {
  const r = await fetch(`${BASE}/api/documents/${docId}/pages/${pageNumber}/structure/`, { method: 'POST' })
  if (!r.ok) throw new Error(`getPageStructure ${r.status}: ${await r.text()}`)
  return r.json()  // { structured_content: {...} }
}

export async function uploadFigureToS3(localUrl) {
  const r = await fetch(`${BASE}/api/figures/upload-s3/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ local_url: localUrl }),
  })
  if (!r.ok) throw new Error(`uploadFigureToS3 ${r.status}: ${await r.text()}`)
  return r.json()  // { s3_url }
}
