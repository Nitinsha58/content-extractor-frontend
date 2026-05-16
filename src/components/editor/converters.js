import { v4 as uuidv4 } from 'uuid'

// ── structured content → TipTap JSON ─────────────────────────────────────────

function inlineToTipTap(blocks = []) {
  const nodes = []
  for (const b of blocks) {
    if (b.type === 'latex') {
      if (b.display) {
        // will be handled as block-level by caller if needed
        nodes.push({ type: 'mathInline', attrs: { latex: b.value } })
      } else {
        nodes.push({ type: 'mathInline', attrs: { latex: b.value } })
      }
    } else {
      const text = (b.value ?? '').replace(/\n/g, ' ')
      if (text) nodes.push({ type: 'text', text })
    }
  }
  return nodes
}

function contentToTipTapParagraph(content = [], attrs = {}) {
  // If content has display latex, split into paragraph + mathBlock
  const result = []
  let currentInline = []

  const flushInline = () => {
    if (currentInline.length) {
      const tipTapInline = inlineToTipTap(currentInline)
      result.push({
        type: 'paragraph',
        attrs,
        content: tipTapInline,
      })
      currentInline = []
    }
  }

  for (const b of content) {
    if (b.type === 'latex' && b.display) {
      flushInline()
      result.push({ type: 'mathBlock', attrs: { latex: b.value, ...attrs } })
    } else {
      currentInline.push(b)
    }
  }
  flushInline()

  if (result.length === 0) {
    result.push({ type: 'paragraph', attrs })
  }
  return result
}

export function structuredToTipTap(structuredContent) {
  if (!structuredContent?.nodes?.length) {
    return { type: 'doc', content: [{ type: 'paragraph' }] }
  }

  const tipTapNodes = []

  const processNodes = (nodes) => {
    for (const node of nodes) {
      const meta = {
        nodeId: node.id,
        sourceBlockIds: (node.source_block_ids || []).join(','),
        nodeType: node.type,
      }

      if (node.type === 'section') {
        const headingText = (node.heading || []).map(b => b.value ?? '').join(' ').trim()
        tipTapNodes.push({
          type: 'heading',
          attrs: { level: node.level || 2, ...meta },
          content: headingText ? [{ type: 'text', text: headingText }] : [],
        })
        if (node.children?.length) processNodes(node.children)
      } else if (node.type === 'paragraph') {
        const paras = contentToTipTapParagraph(node.content || [], meta)
        tipTapNodes.push(...paras)
      } else if (node.type === 'table') {
        tipTapNodes.push(buildTable(node, meta))
      } else if (node.type === 'image') {
        tipTapNodes.push({
          type: 'imagePlaceholder',
          attrs: {
            ...meta,
            url: node.url || '',
            alt: node.alt || '',
            s3_url: node.s3_url || '',
          },
        })
      } else if (node.type === 'error') {
        tipTapNodes.push({
          type: 'errorBlock',
          attrs: {
            ...meta,
            label: node.label || '',
            message: node.message || '',
          },
        })
      } else {
        console.warn('[converters] Unknown node type — skipped:', node.type)
      }
    }
  }

  processNodes(structuredContent.nodes)

  return { type: 'doc', content: tipTapNodes.length ? tipTapNodes : [{ type: 'paragraph', content: [] }] }
}

function buildTable(node, meta) {
  const cells = node.cells || []
  if (!cells.length) return { type: 'paragraph', attrs: meta }

  return {
    type: 'table',
    attrs: meta,
    content: cells.map((row, r) => ({
      type: 'tableRow',
      content: row.map(cell => ({
        type: r === 0 ? 'tableHeader' : 'tableCell',
        attrs: { colspan: 1, rowspan: 1 },
        content: [{
          type: 'paragraph',
          content: inlineToTipTap(cell),
        }],
      })),
    })),
  }
}

// ── TipTap JSON → structured content ─────────────────────────────────────────

function tipTapInlineToContent(inlineNodes = []) {
  const content = []
  for (const n of inlineNodes) {
    if (n.type === 'text') {
      if (n.text) content.push({ type: 'text', value: n.text })
    } else if (n.type === 'mathInline') {
      content.push({ type: 'latex', value: n.attrs?.latex || '', display: false })
    }
  }
  return content.length ? content : [{ type: 'text', value: '' }]
}

export function tipTapToStructured(tipTapDoc, originalStructured) {
  const tipTapNodes = tipTapDoc?.content ?? []
  const resultNodes = []

  // We need to re-group paragraphs under sections
  let currentSection = null

  const flushSection = () => {
    if (currentSection) {
      resultNodes.push(currentSection)
      currentSection = null
    }
  }

  for (const n of tipTapNodes) {
    const meta = n.attrs || {}
    const nodeId = meta.nodeId || uuidv4()
    const sourceBlockIds = meta.sourceBlockIds
      ? meta.sourceBlockIds.split(',').filter(Boolean)
      : []

    if (n.type === 'heading') {
      flushSection()
      const headingText = (n.content || []).filter(c => c.type === 'text').map(c => c.text).join('')
      currentSection = {
        id: nodeId,
        type: 'section',
        level: n.attrs?.level || 2,
        heading: [{ type: 'text', value: headingText }],
        source_block_ids: sourceBlockIds,
        children: [],
      }
    } else if (n.type === 'paragraph') {
      const content = tipTapInlineToContent(n.content || [])
      const paraNode = {
        id: nodeId,
        type: 'paragraph',
        content,
        source_block_ids: sourceBlockIds,
      }
      if (currentSection) currentSection.children.push(paraNode)
      else resultNodes.push(paraNode)
    } else if (n.type === 'mathBlock') {
      const blockNode = {
        id: nodeId,
        type: 'paragraph',
        content: [{ type: 'latex', value: n.attrs?.latex || '', display: true }],
        source_block_ids: sourceBlockIds,
      }
      if (currentSection) currentSection.children.push(blockNode)
      else resultNodes.push(blockNode)
    } else if (n.type === 'table') {
      const tableNode = rebuildTable(n, nodeId, sourceBlockIds)
      if (currentSection) currentSection.children.push(tableNode)
      else resultNodes.push(tableNode)
    } else if (n.type === 'imagePlaceholder') {
      const imgNode = {
        id: nodeId,
        type: 'image',
        url: meta.url || '',
        alt: meta.alt || '',
        source_block_ids: sourceBlockIds,
        ...(meta.s3_url ? { s3_url: meta.s3_url } : {}),
      }
      if (currentSection) currentSection.children.push(imgNode)
      else resultNodes.push(imgNode)
    } else if (n.type === 'errorBlock') {
      const errNode = {
        id: nodeId,
        type: 'error',
        label: meta.label || '',
        message: meta.message || '',
        source_block_ids: sourceBlockIds,
      }
      if (currentSection) currentSection.children.push(errNode)
      else resultNodes.push(errNode)
    } else {
      console.warn('[converters] Unknown TipTap node type — skipped:', n.type)
    }
  }

  flushSection()

  return {
    ...originalStructured,
    nodes: resultNodes,
  }
}

function rebuildTable(tableNode, id, sourceBlockIds) {
  const rows = tableNode.content || []
  const cells = rows.map(row =>
    (row.content || []).map(cell => {
      const para = (cell.content || [])[0]
      return tipTapInlineToContent(para?.content || [])
    })
  )
  return {
    id,
    type: 'table',
    rows: cells.length,
    cols: cells[0]?.length || 0,
    cells,
    source_block_ids: sourceBlockIds,
  }
}
