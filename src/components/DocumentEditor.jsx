import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { getPageStructure, savePageContent } from '../services/DocumentRepository'
import { uploadFigureToS3 } from '../services/extractorApi'
import { buildClipboardEnvelope } from '../utils/clipboard'
import TipTapEditor from './editor/TipTapEditor'
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
}, ref) {
  const [structuredContent, setStructuredContent] = useState(null)
  const [contentKey, setContentKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
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

  if (!docId || pageStatus !== 'ocr-complete') {
    return (
      <div className={containerCls}>
        <EditorPlaceholder text={
          pageStatus === 'layout-detected'
            ? 'Run OCR to see structured content'
            : 'Run layout detection and OCR first'
        } />
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
        <span className="text-xs text-gray-300">Select text to format · Click formula to edit</span>
      </div>

      {/* Document scroll container */}
      <LayoutBlocksContext.Provider value={layoutBlockMap}>
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
