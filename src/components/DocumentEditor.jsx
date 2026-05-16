import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { getPageStructure, savePageContent } from '../services/DocumentRepository'
import { uploadFigureToS3 } from '../services/extractorApi'
import { buildClipboardEnvelope } from '../utils/clipboard'
import TipTapEditor from './editor/TipTapEditor'
import InlineContent from './editor/InlineContent'
import { LayoutBlocksContext } from './editor/LayoutBlocksContext.jsx'

const DocumentEditor = forwardRef(function DocumentEditor({
  docId,
  pageNo,
  pageStatus,
  selectedBlockId,
  onSelectBlock,
  ocrVersion = 0,
  onStructureChange,
  layoutBlocks,
  streamingOcrState,
}, ref) {
  const [structuredContent, setStructuredContent] = useState(null)
  const [contentKey, setContentKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showAnnotations, setShowAnnotations] = useState(
    () => localStorage.getItem('showBlockAnnotations') !== 'false'
  )

  const toggleAnnotations = () => setShowAnnotations(v => {
    const next = !v
    localStorage.setItem('showBlockAnnotations', String(next))
    return next
  })

  const handleSortByReadingOrder = () => {
    if (!structuredContent?.nodes?.length) return
    const sorted = { ...structuredContent, nodes: sortByReadingOrder(structuredContent.nodes, layoutBlockMap) }
    setStructuredContent(sorted)
    setContentKey(k => k + 1)
    handleContentChange(sorted)
  }
  const saveTimerRef = useRef(null)
  const scrollRef = useRef(null)
  const onStructureChangeRef = useRef(onStructureChange)

  const layoutBlockMap = useMemo(() => {
    if (!layoutBlocks?.length) return {}
    return Object.fromEntries(
      layoutBlocks.map(b => [b.id, { readingOrder: b.reading_order, confidence: b.confidence ?? 1 }])
    )
  }, [layoutBlocks])
  useEffect(() => { onStructureChangeRef.current = onStructureChange }, [onStructureChange])

  useImperativeHandle(ref, () => ({
    patchContent: (newContent) => {
      setStructuredContent(newContent)
      setContentKey(k => k + 1)
      onStructureChangeRef.current?.(newContent)
    },
  }), [])

  useEffect(() => {
    if (!docId || !pageNo) return
    if (pageStatus !== 'ocr-complete') return

    let cancelled = false
    setLoading(true)
    setError(null)

    getPageStructure(docId, pageNo)
      .then(({ structured_content }) => {
        if (cancelled) return
        setStructuredContent(structured_content)
        setContentKey(k => k + 1)
        onStructureChangeRef.current?.(structured_content)
      })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [docId, pageNo, pageStatus, ocrVersion])

  const highlightedNodeId = findNodeIdByBlockId(structuredContent, selectedBlockId)

  const handleContentChange = (updated) => {
    setStructuredContent(updated)
    onStructureChangeRef.current?.(updated)
    if (!docId || !pageNo) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      savePageContent(docId, pageNo, {
        structured_content: updated,
        structure_status: 'edited',
      }).catch(e => console.warn('save failed:', e.message))
    }, 800)
  }

  // Upload all un-uploaded images, patch s3_urls into structuredContent, return the patched copy.
  const uploadAllImages = async (content, onProgress) => {
    const allNodes = collectImageNodes(content.nodes)
    const pending = allNodes.filter(n => n.url && !n.s3_url)
    if (!pending.length) return content

    let done = 0
    const patches = {}
    await Promise.all(pending.map(async (imgNode) => {
      try {
        const { s3_url } = await uploadFigureToS3(imgNode.url)
        patches[imgNode.id] = s3_url
      } catch (e) {
        console.warn('S3 upload failed for', imgNode.url, e)
      } finally {
        onProgress(++done, pending.length)
      }
    }))

    // Return patched content (without mutating the original)
    const patchNodes = (nodes) => nodes.map(node => {
      if (node.type === 'image' && patches[node.id]) {
        return { ...node, s3_url: patches[node.id] }
      }
      if (node.children) return { ...node, children: patchNodes(node.children) }
      return node
    })
    return { ...content, nodes: patchNodes(content.nodes) }
  }

  const containerCls = 'flex-1 min-w-0 flex flex-col border-l border-gray-200 bg-white overflow-hidden'

  // ── Streaming skeleton phase ─────────────────────────────────────────────────
  if (streamingOcrState) {
    return (
      <div className={containerCls}>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">Document</span>
          <div className="flex-1" />
          <span className="text-xs text-gray-400 animate-pulse">Processing OCR…</span>
        </div>
        <OcrStreamingSkeleton streamingOcrState={streamingOcrState} />
      </div>
    )
  }

  if (!docId || pageStatus !== 'ocr-complete') {
    return (
      <div className={containerCls}>
        {pageStatus === 'layout-detected'
          ? <OcrPendingPlaceholder blockCount={layoutBlocks?.length ?? 0} />
          : <EditorPlaceholder text="Run layout detection and OCR first" />
        }
      </div>
    )
  }

  if (loading && !structuredContent) {
    return (
      <div className={containerCls}>
        <EditorPlaceholder spinner text="Building document structure…" />
      </div>
    )
  }

  if (error && !structuredContent) {
    return (
      <div className={containerCls}>
        <EditorPlaceholder text={`Error: ${error}`} />
      </div>
    )
  }

  return (
    <div className={containerCls}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">Document</span>
        <div className="flex-1" />
        {structuredContent && (
          <CopyPageBtn
            structuredContent={structuredContent}
            onUploadAllImages={uploadAllImages}
            onContentPatched={(patched) => {
              setStructuredContent(patched)
              setContentKey(k => k + 1)
              handleContentChange(patched)
            }}
          />
        )}
        <button
          onClick={toggleAnnotations}
          title={showAnnotations ? 'Hide block labels' : 'Show block labels'}
          className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors ${
            showAnnotations ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-gray-500'
          }`}
        >
          #blocks
        </button>
        {structuredContent && layoutBlocks?.length > 0 && (
          <button
            onClick={handleSortByReadingOrder}
            title="Re-order nodes by canvas reading order"
            className="text-[10px] px-1.5 py-0.5 rounded font-mono text-gray-300 hover:text-gray-500 transition-colors"
          >
            ↕ order
          </button>
        )}
        <span className="text-xs text-gray-300">Select text to format · Click formula to edit</span>
      </div>

      {/* Document scroll container */}
      <LayoutBlocksContext.Provider value={{ map: layoutBlockMap, showAnnotations }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-100">
          <div className="max-w-[720px] mx-auto my-8 bg-white rounded-xl shadow-sm border border-gray-200 px-12 py-10 min-h-[calc(100vh-200px)]">
            {structuredContent && (
              <TipTapEditor
                structuredContent={structuredContent}
                contentKey={contentKey}
                onContentChange={handleContentChange}
                highlightedNodeId={highlightedNodeId}
              />
            )}
          </div>
        </div>
      </LayoutBlocksContext.Provider>
    </div>
  )
})

export default DocumentEditor

// ── CopyPageBtn ───────────────────────────────────────────────────────────────

function CopyPageBtn({ structuredContent, onUploadAllImages, onContentPatched }) {
  const [status, setStatus] = useState('idle') // idle | uploading | copied | error
  const [progress, setProgress] = useState('')

  const handleCopy = async () => {
    if (status === 'uploading') return
    setStatus('uploading')
    setProgress('')

    try {
      const patched = await onUploadAllImages(structuredContent, (done, total) => {
        setProgress(total > 1 ? `${done}/${total}` : '')
      })

      // Persist patched s3_urls and re-render TipTap green borders
      onContentPatched(patched)

      const forClipboard = buildClipboardEnvelope('page', {
        ...patched,
        nodes: substituteS3Urls(patched.nodes),
      })
      navigator.clipboard.writeText(JSON.stringify(forClipboard, null, 2))
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 1800)
    } catch (e) {
      console.error('Copy page failed:', e)
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2500)
    }
  }

  const isUploading = status === 'uploading'
  const label = isUploading
    ? (progress ? `Uploading ${progress}…` : 'Uploading…')
    : status === 'copied'
      ? 'Copied!'
      : status === 'error'
        ? 'Failed'
        : 'Copy Page'

  const colorCls = status === 'error'
    ? 'border-red-300 text-red-500'
    : status === 'copied'
      ? 'border-green-400 text-green-600 bg-green-50'
      : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800'

  return (
    <>
      {isUploading && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2 pointer-events-none">
          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
          {label}
        </div>
      )}
      <button
        onClick={handleCopy}
        disabled={isUploading}
        title="Copy entire page as JSON (uploads any images to S3 first)"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${colorCls}`}
      >
        {isUploading && (
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
        )}
        {label}
      </button>
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function collectImageNodes(nodes) {
  const result = []
  const walk = (list) => {
    for (const n of list) {
      if (n.type === 'image') result.push(n)
      if (n.children) walk(n.children)
    }
  }
  walk(nodes)
  return result
}

function substituteS3Urls(nodes) {
  return nodes.map(node => {
    if (node.type === 'image' && node.s3_url) {
      return { ...node, url: node.s3_url }
    }
    if (node.children) return { ...node, children: substituteS3Urls(node.children) }
    return node
  })
}

function sortByReadingOrder(nodes, blockMap) {
  const getOrder = (node) => {
    const id = node.source_block_ids?.[0]
    return id && blockMap[id] ? blockMap[id].readingOrder : Infinity
  }
  return [...nodes]
    .sort((a, b) => getOrder(a) - getOrder(b))
    .map(node => node.children?.length
      ? { ...node, children: sortByReadingOrder(node.children, blockMap) }
      : node
    )
}

function findNodeIdByBlockId(structuredContent, blockId) {
  if (!blockId || !structuredContent?.nodes) return null
  const search = (nodes) => {
    for (const n of nodes) {
      if (n.source_block_ids?.includes(blockId)) return n.id
      if (n.children) {
        const found = search(n.children)
        if (found) return found
      }
    }
    return null
  }
  return search(structuredContent.nodes)
}

// ── OcrStreamingSkeleton ──────────────────────────────────────────────────────

function OcrStreamingSkeleton({ streamingOcrState }) {
  const { blockIds, results } = streamingOcrState
  const processingIdx = blockIds.findIndex(id => !results[id])
  const rowWidths = ['w-3/4', 'w-full', 'w-5/6', 'w-2/3', 'w-full', 'w-4/5']

  return (
    <div className="flex-1 overflow-y-auto bg-gray-100">
      <div className="max-w-[720px] mx-auto my-8 bg-white rounded-xl shadow-sm border border-gray-200 px-12 py-10 min-h-[calc(100vh-200px)]">
        <div className="space-y-6">
          {blockIds.map((blockId, i) => {
            const isDone = Boolean(results[blockId])
            const isProcessing = i === processingIdx

            return (
              <div key={blockId} className="relative pb-1">
                {isDone ? (
                  <BlockPreview result={results[blockId]} />
                ) : (
                  <div className={`space-y-2 ${!isProcessing ? 'animate-pulse' : ''}`}>
                    <div className={`h-3 bg-gray-200 rounded ${rowWidths[i % rowWidths.length]}`} />
                    <div className="h-3 bg-gray-200 rounded w-full" />
                    <div className={`h-3 bg-gray-200 rounded ${rowWidths[(i + 2) % rowWidths.length]}`} />
                  </div>
                )}
                {isProcessing && (
                  <div
                    className="absolute bottom-0 left-0 h-0.5 bg-green-400 rounded-full"
                    style={{ animation: 'ocr-progress 3s ease-out forwards' }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── BlockPreview — lightweight read-only render of a completed OCR block ──────

function BlockPreview({ result }) {
  if (!result) return null
  const { label, blocks = [] } = result

  if (label === 'title') {
    return <p className="text-lg font-bold text-gray-900 leading-snug"><InlineContent content={blocks} /></p>
  }

  if (label === 'figure') {
    const img = blocks.find(b => b.type === 'image')
    return img?.url
      ? <img src={img.url} className="max-w-full rounded" alt="figure" />
      : <div className="h-16 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">Figure</div>
  }

  if (label === 'isolate_formula') {
    return <div className="py-2"><InlineContent content={blocks} /></div>
  }

  if (label === 'table') {
    const tbl = blocks.find(b => b.type === 'table')
    if (tbl) return <TablePreview tbl={tbl} />
  }

  return <p className="text-sm text-gray-800 leading-relaxed"><InlineContent content={blocks} /></p>
}

function TablePreview({ tbl }) {
  const { rows, cols, cells } = tbl
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse border border-gray-300 w-full">
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c} className="border border-gray-300 px-2 py-1 text-gray-700 align-top">
                  <InlineContent content={cells?.[r]?.[c] ?? []} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OcrPendingPlaceholder({ blockCount }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-5" style={{ userSelect: 'none' }}>
        {/* Document wireframe illustration */}
        <svg width="160" height="148" viewBox="0 0 160 148" fill="none" xmlns="http://www.w3.org/2000/svg">
          <style>{`
            @keyframes ocrPulse {
              0%, 100% { opacity: 0.35 }
              50%       { opacity: 0.75 }
            }
            .p1 { animation: ocrPulse 2.2s ease-in-out infinite }
            .p2 { animation: ocrPulse 2.2s ease-in-out 0.3s infinite }
            .p3 { animation: ocrPulse 2.2s ease-in-out 0.6s infinite }
            .p4 { animation: ocrPulse 2.2s ease-in-out 0.9s infinite }
            .p5 { animation: ocrPulse 2.2s ease-in-out 1.2s infinite }
          `}</style>

          {/* Page shadow */}
          <rect x="18" y="6" width="124" height="140" rx="4" fill="rgba(0,0,0,0.06)" />

          {/* Page surface */}
          <rect x="14" y="2" width="124" height="140" rx="4" fill="white" stroke="#e5e7eb" strokeWidth="1" />

          {/* Title block — purple */}
          <rect className="p1" x="24" y="14" width="80" height="9" rx="2" fill="#a855f7" />
          <rect className="p1" x="24" y="14" width="80" height="9" rx="2" fill="#a855f7" />

          {/* Text lines — green */}
          <rect className="p2" x="24" y="32" width="104" height="6" rx="1.5" fill="#22c55e" />
          <rect className="p2" x="24" y="42" width="88"  height="6" rx="1.5" fill="#22c55e" />
          <rect className="p2" x="24" y="52" width="96"  height="6" rx="1.5" fill="#22c55e" />

          {/* Formula block — amber */}
          <rect className="p3" x="24" y="66" width="104" height="22" rx="3" fill="rgba(245,158,11,0.12)" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 2" />
          <rect className="p3" x="52" y="73" width="48" height="8" rx="1.5" fill="#f59e0b" />

          {/* Text lines — green */}
          <rect className="p4" x="24" y="97"  width="104" height="6" rx="1.5" fill="#22c55e" />
          <rect className="p4" x="24" y="107" width="68"  height="6" rx="1.5" fill="#22c55e" />

          {/* Table block — blue */}
          <rect className="p5" x="24" y="120" width="104" height="14" rx="2" fill="rgba(59,130,246,0.10)" stroke="#3b82f6" strokeWidth="1" />
          <line className="p5" x1="57"  y1="120" x2="57"  y2="134" stroke="#3b82f6" strokeWidth="0.75" />
          <line className="p5" x1="90"  y1="120" x2="90"  y2="134" stroke="#3b82f6" strokeWidth="0.75" />
          <line className="p5" x1="123" y1="120" x2="123" y2="134" stroke="#3b82f6" strokeWidth="0.75" />
        </svg>

        {/* Labels */}
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm font-semibold text-gray-700">
            {blockCount > 0 ? `${blockCount} block${blockCount === 1 ? '' : 's'} detected` : 'Layout detected'}
          </p>
          <p className="text-xs text-gray-400">Run OCR to extract structured content</p>
        </div>

        {/* Type legend */}
        <div className="flex items-center gap-3">
          {[
            { color: '#a855f7', label: 'Title' },
            { color: '#22c55e', label: 'Text' },
            { color: '#f59e0b', label: 'Formula' },
            { color: '#3b82f6', label: 'Table' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
              <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'system-ui' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EditorPlaceholder({ text, spinner = false }) {
  return (
    <div className="flex-1 flex items-center justify-center text-gray-400">
      <div className="text-center space-y-2">
        {spinner && (
          <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto" />
        )}
        <p className="text-sm">{text}</p>
      </div>
    </div>
  )
}
