import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { getPageStructure, savePageContent } from '../services/DocumentRepository'
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
