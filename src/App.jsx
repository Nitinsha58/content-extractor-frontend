import { useState, useCallback, useRef, useEffect } from 'react'
import { usePageWindow } from './usePageWindow'
import pdfjsLib from './pdf/pdfConfig'
import { runLayoutDetection, runTableStructureAnalysis, runTableCellTypeDetection, runOcr, runOcrStream, exportDocument, createDocument, updateDocument, savePageContent, getPage, getDocument } from './services/DocumentRepository'
import { computeReadingOrder } from './utils/readingOrder'
import { addBlankPage, deleteBlankPage } from './services/extractorApi'
import TopBar from './components/TopBar'
import PagesPanel from './components/PagesPanel'
import CanvasPane from './components/CanvasPane'
import DocumentEditor from './components/DocumentEditor'

const A4_W = 2480
const A4_H = 3508

async function compositeBlankPage(placedImages) {
  const canvas = document.createElement('canvas')
  canvas.width = A4_W
  canvas.height = A4_H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, A4_W, A4_H)
  for (const img of placedImages) {
    await new Promise((resolve, reject) => {
      const el = new window.Image()
      el.onload = () => { ctx.drawImage(el, img.x, img.y, img.width, img.height); resolve() }
      el.onerror = reject
      el.src = img.dataUrl
    })
  }
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
}

const INITIAL_BATCH = 8    // pages shown before background PDF loading begins
const DETECTION_WINDOW = 6 // pages ahead of active page to keep auto-detected

// ── Structured content patch helpers ──────────────────────────────────────────
// Used by handleRunOcrSelected to update only affected document nodes in-place,
// preserving the rest of the document (user edits, ordering, structure).

function _inlineContent(blocks) {
  return (blocks || [])
    .filter(b => b.type === 'text' || b.type === 'latex' || b.type === 'image')
    .map(b => {
      if (b.type === 'latex') return { type: 'latex', value: b.value, display: b.display ?? false }
      if (b.type === 'image') return { type: 'image', url: b.url, alt: b.alt || '' }
      return { type: 'text', value: b.value }
    })
}

function _patchNode(node, newBlocksById) {
  // Question nodes span multiple source blocks — handle before the single-block path
  if (node.type === 'question') {
    const [stemId, ...optIds] = node.source_block_ids || []
    const stemBlk = newBlocksById[stemId]
    return {
      ...node,
      stem: stemBlk ? _inlineContent(stemBlk.blocks) : node.stem,
      options: (node.options || []).map((opt, i) => {
        const blk = optIds[i] ? newBlocksById[optIds[i]] : null
        return blk ? { ...opt, content: _inlineContent(blk.blocks) } : opt
      }),
    }
  }

  const blockId = node.source_block_ids?.[0]
  const ocr = blockId ? newBlocksById[blockId] : null
  if (!ocr) return node

  // OCR failed for this block → emit error node regardless of prior type
  if (ocr.error && !(ocr.blocks?.length)) {
    return { id: node.id, type: 'error', source_block_ids: node.source_block_ids, label: ocr.label || '', message: String(ocr.error) }
  }

  const blocks = ocr.blocks || []
  const label = ocr.label || ''

  // Convert to the correct structured type for the (possibly changed) label
  if (label === 'title') {
    return { id: node.id, type: 'section', source_block_ids: node.source_block_ids, level: 2, heading: _inlineContent(blocks), children: node.type === 'section' ? (node.children || []) : [] }
  }
  if (label === 'isolate_formula') {
    const lat = blocks.find(b => b.type === 'latex')
    return { id: node.id, type: 'paragraph', source_block_ids: node.source_block_ids, content: lat ? [{ type: 'latex', value: lat.value, display: true }] : [] }
  }
  if (label === 'table') {
    const tbl = blocks.find(b => b.type === 'table')
    return tbl ? { id: node.id, type: 'table', source_block_ids: node.source_block_ids, rows: tbl.rows, cols: tbl.cols, cells: tbl.cells }
              : { id: node.id, type: 'paragraph', source_block_ids: node.source_block_ids, content: _inlineContent(blocks) }
  }
  if (label === 'figure') {
    const img = blocks.find(b => b.type === 'image')
    return img ? { id: node.id, type: 'image', source_block_ids: node.source_block_ids, url: img.url, alt: img.alt || '', width: img.width || 0, height: img.height || 0 } : node
  }
  // plain_text or unknown → paragraph
  return { id: node.id, type: 'paragraph', source_block_ids: node.source_block_ids, content: _inlineContent(blocks) }
}

function patchStructuredContent(structuredContent, newBlocksById) {
  if (!structuredContent?.nodes) return structuredContent
  const affected = new Set(Object.keys(newBlocksById))

  function walk(nodes) {
    return nodes.map(node => {
      const hit = (node.source_block_ids || []).some(id => affected.has(id))
      const updated = hit ? _patchNode(node, newBlocksById) : node
      return updated.children?.length
        ? { ...updated, children: walk(updated.children) }
        : updated
    })
  }

  return { ...structuredContent, nodes: walk(structuredContent.nodes) }
}


async function generateThumbnail(pdfPage) {
  const viewport = pdfPage.getViewport({ scale: 0.5 })
  const outputScale = Math.max(1, window.devicePixelRatio || 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
  canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
  const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
  await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport, transform }).promise
  const url = await new Promise(resolve =>
    canvas.toBlob(blob => resolve(URL.createObjectURL(blob)), 'image/jpeg', 0.8)
  )
  // hintW/hintH: page dimensions at DEFAULT_SCALE=1.5 (thumbnail is 0.5x, so multiply by 3)
  return { url, hintW: Math.round(viewport.width * 3), hintH: Math.round(viewport.height * 3) }
}

function makePage(i, pdfPage, thumbnail, hintW = 0, hintH = 0) {
  return {
    pageNo: i,
    thumbnail,
    pdfPage,
    status: 'idle',
    sessionId: null,
    imageW: 0,
    imageH: 0,
    hintW,
    hintH,
    layoutBlocks: [],
    ocrBlocks: [],
  }
}

export default function App({ docId, freshUpload = false, initialPdfFile = null, onNavigateToDashboard }) {
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [fileType, setFileType] = useState(null)   // 'pdf'|'image'|'other'|'blank'
  const [docFilename, setDocFilename] = useState(null)  // for blank docs (no pdfFile)
  const canvasMouseRef = useRef(null)  // { pageIdx, x, y } in canvas space — updated by CanvasPane
  const [activePage, setActivePage] = useState(0)
  const [splitRatio, setSplitRatio] = useState(0.5) // fraction of width given to CanvasPane in split mode
  const splitContainerRef = useRef(null)
  const isDraggingSplitRef = useRef(false)
  const [selectedBlockId, setSelectedBlockId] = useState(null)
  const [selectedBlockIds, setSelectedBlockIds] = useState([])
  const [activeTool, setActiveTool] = useState('select')
  const [viewMode, setViewMode] = useState('split')
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [ocrVersion, setOcrVersion] = useState(0)
  const [tatrRunningBlockIds, setTatrRunningBlockIds] = useState(() => new Set())
  const [finalizingBlockIds, setFinalizingBlockIds] = useState(() => new Set())
  // { blockId, row, col } — selected cell within a finalized table block
  const [selectedCell, setSelectedCell] = useState(null)
  const [pdfLoadProgress, setPdfLoadProgress] = useState(null)
  const [structuredContent, setStructuredContent] = useState(null)
  // null while idle; { blockIds: string[], results: Record<blockId, ocrBlock> } while streaming
  const [streamingOcrState, setStreamingOcrState] = useState(null)
  const streamingGenRef = useRef(0)

  // ── Page window hook ───────────────────────────────────────────────────────
  const { pages, pagesRef, setPages, loadPagesInRange, loadGenRef } = usePageWindow({ pdfDoc, activePage })

  // ── Persistence ref ────────────────────────────────────────────────────────
  const documentIdRef = useRef(docId || null)

  // ── DocumentEditor refs ────────────────────────────────────────────────────
  const documentEditorRef = useRef(null)
  const structuredContentRef = useRef(null)

  // ── Auto-detection refs ────────────────────────────────────────────────────
  const detectionQueueRef = useRef([])          // page indices waiting to be detected
  const isDetectionRunningRef = useRef(false)   // one worker at a time
  const detectionGenRef = useRef(0)             // incremented on file open to abort worker
  const autoDetectInitiatedRef = useRef(false)  // auto-start fires only once per file
  const blocksSaveTimerRef = useRef({})         // per-page debounce timers for block saves
  const tatrRetriggerTimerRef = useRef({})      // per-block debounce timers for TATR re-runs after bbox resize

  // ── Detection worker ───────────────────────────────────────────────────────
  const runDetectionWorker = useCallback(async () => {
    if (isDetectionRunningRef.current) return
    isDetectionRunningRef.current = true
    const gen = detectionGenRef.current

    while (detectionQueueRef.current.length > 0) {
      if (detectionGenRef.current !== gen) break  // new file opened — abort

      const idx = detectionQueueRef.current.shift()
      const page = pagesRef.current[idx]
      if ((!page?.pdfPage && !page?.imageBlob) || page.status !== 'queued') continue

      // Mark as actively detecting for UI feedback
      setPages(prev => {
        const u = [...prev]
        if (u[idx]) u[idx] = { ...u[idx], status: 'detecting' }
        return u
      })

      // Check backend for existing layout blocks before running ML
      if (documentIdRef.current) {
        try {
          const saved = await getPage(documentIdRef.current, page.pageNo)
          if (saved?.layout_blocks?.length > 0) {
            setPages(prev => {
              const u = [...prev]
              if (u[idx]) {
                u[idx] = {
                  ...u[idx],
                  sessionId: saved.session_id || u[idx].sessionId,
                  imageW: saved.image_w || u[idx].imageW,
                  imageH: saved.image_h || u[idx].imageH,
                  layoutBlocks: saved.layout_blocks,
                  status: saved.status || 'layout-detected',
                }
              }
              return u
            })
            // Re-trigger TATR for any table blocks missing structure (e.g. prior
            // save failed or document was opened before TATR completed).
            if (saved.session_id) {
              const needsStructure = saved.layout_blocks.filter(
                b => b.label === 'table' && !b.table_structure
              )
              if (needsStructure.length > 0) {
                triggerTatrForTableBlocks(idx, saved.session_id, saved.layout_blocks)
                  .catch(e => console.warn('TATR re-trigger (restore) failed:', e.message))
              }
            }
            continue
          }
        } catch (e) {
          // ignore — fall through to ML detection
        }
        if (detectionGenRef.current !== gen) break
      }

      try {
        let imageBlob
        if (page.pdfPage) {
          const pdfPage = pagesRef.current[idx].pdfPage
          const viewport = pdfPage.getViewport({ scale: 200 / 72 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
          if (detectionGenRef.current !== gen) break
          imageBlob = await new Promise(r => canvas.toBlob(r, 'image/png'))
        } else {
          imageBlob = page.imageBlob
        }

        if (detectionGenRef.current !== gen) break

        const result = await runLayoutDetection(imageBlob, `page-${page.pageNo}.png`)

        if (detectionGenRef.current !== gen) break

        const orderedBlocks = computeReadingOrder(result.layout_blocks, result.image_width)

        setPages(prev => {
          const u = [...prev]
          if (u[idx]) {
            u[idx] = {
              ...u[idx],
              sessionId: result.session_id,
              imageW: result.image_width,
              imageH: result.image_height,
              layoutBlocks: orderedBlocks,
              status: 'layout-detected',
            }
          }
          return u
        })

        if (documentIdRef.current) {
          savePageContent(documentIdRef.current, page.pageNo, {
            session_id: result.session_id,
            image_w: result.image_width,
            image_h: result.image_height,
            layout_blocks: orderedBlocks,
            status: 'layout-detected',
          }).catch(e => console.warn('layout save failed:', e.message))
        }

        // Fire TATR for any table blocks — non-blocking, updates state when done
        triggerTatrForTableBlocks(idx, result.session_id, orderedBlocks)
          .catch(e => console.warn('TATR trigger failed:', e.message))
      } catch (err) {
        console.warn(`Auto-detect page ${idx + 1}:`, err.message)
        setPages(prev => {
          const u = [...prev]
          if (u[idx]?.status === 'detecting') u[idx] = { ...u[idx], status: 'error' }
          return u
        })
      }
    }

    isDetectionRunningRef.current = false
  }, []) // stable — only uses refs and setPages

  // ── TATR auto-trigger — fires after layout detection for each table block ──
  // Stable callback ([] deps) — only uses refs and setPages.
  const triggerTatrForTableBlocks = useCallback(async (pageIdx, sessionId, blocks) => {
    const tableBlocks = blocks.filter(b => b.label === 'table' && !b.table_structure)
    if (tableBlocks.length === 0) return

    // Mark these blocks as TATR-pending so BlockOverlay can show a spinner
    const pendingIds = tableBlocks.map(b => b.id)
    setTatrRunningBlockIds(prev => new Set([...prev, ...pendingIds]))

    const settled = await Promise.allSettled(
      tableBlocks.map(async (block) => {
        const result = await runTableStructureAnalysis(sessionId, block.id, block.bbox)
        return { blockId: block.id, table_structure: result.table_structure }
      })
    )

    const successMap = {}
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value?.table_structure) {
        successMap[r.value.blockId] = r.value.table_structure
      } else if (r.status === 'rejected') {
        console.warn('TATR failed for block:', r.reason?.message)
      }
    }

    // Clear pending state for all blocks we attempted (success or failure)
    setTatrRunningBlockIds(prev => {
      const next = new Set(prev)
      pendingIds.forEach(id => next.delete(id))
      return next
    })

    if (Object.keys(successMap).length === 0) return

    setPages(prev => {
      const u = [...prev]
      if (!u[pageIdx]) return prev
      u[pageIdx] = {
        ...u[pageIdx],
        layoutBlocks: u[pageIdx].layoutBlocks.map(b =>
          successMap[b.id] ? { ...b, table_structure: successMap[b.id] } : b
        ),
      }
      return u
    })

    if (documentIdRef.current) {
      const docId = documentIdRef.current
      // Use the current page state (pagesRef is one render behind setPages, so wait a
      // tick — this also prevents the save from racing with in-flight block edits).
      setTimeout(() => {
        const currentPage = pagesRef.current[pageIdx]
        if (!currentPage) return
        // Apply table_structure onto whatever blocks are current (preserves user edits).
        const toSave = currentPage.layoutBlocks.map(b =>
          successMap[b.id] ? { ...b, table_structure: successMap[b.id] } : b
        )
        savePageContent(docId, currentPage.pageNo, {
          layout_blocks: toSave,
        }).catch(e => console.warn('tatr save failed:', e.message))
      }, 0)
    }
  }, []) // stable — only uses refs and setPages

  // ── Finalize table block — lock structure + run per-cell YOLO ─────────────
  const handleFinalizeBlock = useCallback(async (blockId) => {
    const page = pagesRef.current[activePage]
    if (!page) return
    const block = page.layoutBlocks.find(b => b.id === blockId)
    if (!block?.table_structure) return

    setFinalizingBlockIds(prev => new Set([...prev, blockId]))

    try {
      const result = await runTableCellTypeDetection(page.sessionId, blockId, block.bbox, block.table_structure)
      const cellTypes = result.cell_types

      setPages(prev => {
        const u = [...prev]
        if (!u[activePage]) return prev
        u[activePage] = {
          ...u[activePage],
          layoutBlocks: u[activePage].layoutBlocks.map(b =>
            b.id === blockId
              ? { ...b, table_structure: { ...b.table_structure, cell_types: cellTypes, finalized: true } }
              : b
          ),
        }
        return u
      })

      if (documentIdRef.current) {
        setTimeout(() => {
          const currentPage = pagesRef.current[activePage]
          if (!currentPage) return
          savePageContent(documentIdRef.current, currentPage.pageNo, {
            layout_blocks: currentPage.layoutBlocks.map(b =>
              b.id === blockId
                ? { ...b, table_structure: { ...b.table_structure, cell_types: cellTypes, finalized: true } }
                : b
            ),
          }).catch(e => console.warn('finalize save failed:', e.message))
        }, 0)
      }
    } catch (err) {
      console.warn('Finalize failed:', err.message)
    } finally {
      setFinalizingBlockIds(prev => {
        const next = new Set(prev)
        next.delete(blockId)
        return next
      })
    }
  }, [activePage]) // stable — only uses refs and setPages/setFinalizingBlockIds

  // ── Queue helper ───────────────────────────────────────────────────────────
  const enqueueDetection = useCallback((indices) => {
    const current = pagesRef.current
    const eligible = indices.filter(idx => {
      const p = current[idx]
      return (p?.pdfPage || p?.imageBlob) && p.status === 'idle' && !detectionQueueRef.current.includes(idx)
    })
    if (eligible.length === 0) return

    detectionQueueRef.current.push(...eligible)

    // Eagerly update pagesRef so runDetectionWorker (called below) sees 'queued'
    // immediately — setPages is async and won't update pagesRef until the next render.
    const eager = [...pagesRef.current]
    for (const idx of eligible) {
      if (eager[idx]?.status === 'idle') eager[idx] = { ...eager[idx], status: 'queued' }
    }
    pagesRef.current = eager

    setPages(prev => {
      const u = [...prev]
      for (const idx of eligible) {
        if (u[idx]?.status === 'idle') u[idx] = { ...u[idx], status: 'queued' }
      }
      return u
    })

    runDetectionWorker()
  }, [runDetectionWorker])

  // ── Auto-start: queue first window once INITIAL_BATCH pages are loaded ─────
  useEffect(() => {
    if (pages.length >= INITIAL_BATCH && !autoDetectInitiatedRef.current) {
      autoDetectInitiatedRef.current = true
      enqueueDetection(
        Array.from({ length: Math.min(pages.length, DETECTION_WINDOW) }, (_, i) => i)
      )
    }
  }, [pages.length, enqueueDetection])

  // ── Extend window when user scrolls or new pages become available ──────────
  useEffect(() => {
    if (pages.length === 0) return
    const end = Math.min(activePage + DETECTION_WINDOW, pages.length - 1)
    enqueueDetection(
      Array.from({ length: end - activePage + 1 }, (_, i) => activePage + i)
    )
  }, [activePage, pages.length, enqueueDetection])

  // ── File loading ───────────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (file) => {
    if (!file) return

    // Abort any in-flight detection and PDF loading from the previous file.
    detectionGenRef.current++
    isDetectionRunningRef.current = false
    detectionQueueRef.current = []
    autoDetectInitiatedRef.current = false

    const gen = ++loadGenRef.current
    setDocFilename(file.name)
    setPdfFile(file)

    // Create a persistent document record if this is a fresh user-selected file.
    if (!documentIdRef.current) {
      createDocument(file, 0)
        .then(doc => { documentIdRef.current = doc.id })
        .catch(e => console.warn('createDocument failed:', e.message))
    }
    setPdfLoadProgress({ loaded: 0, total: 0, allReady: false })
    setPages([])
    setActivePage(0)
    setSelectedBlockId(null)
    setSelectedBlockIds([])
    setUndoStack([])
    setRedoStack([])

    // ── Image file path ──────────────────────────────────────────────────────
    if (file.type.startsWith('image/')) {
      try {
        const imageUrl = URL.createObjectURL(file)
        const dims = await new Promise((resolve, reject) => {
          const img = new window.Image()
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
          img.onerror = reject
          img.src = imageUrl
        })
        if (loadGenRef.current !== gen) return
        const page = {
          pageNo: 1, thumbnail: imageUrl, pdfPage: null,
          imageBlob: file, imageUrl,
          imageW: dims.w, imageH: dims.h,
          status: 'idle', sessionId: null, layoutBlocks: [], ocrBlocks: [],
        }
        setPages([page])
        pagesRef.current = [page]
        setPdfDoc(null)
        setPdfLoadProgress({ loaded: 1, total: 1, allReady: true })
        setTimeout(() => {
          if (documentIdRef.current) updateDocument(documentIdRef.current, { page_count: 1 }).catch(() => {})
        }, 2000)
      } catch (err) {
        if (loadGenRef.current === gen) {
          alert(`Failed to load image: ${err.message}`)
          setPdfLoadProgress(null)
        }
      }
      return
    }

    // ── PDF file path ────────────────────────────────────────────────────────
    try {
      const buffer = await file.arrayBuffer()
      if (loadGenRef.current !== gen) return

      const doc = await pdfjsLib.getDocument({
        data: buffer,
        cMapUrl: '/pdfjs-cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/pdfjs-fonts/',
        wasmUrl: '/pdfjs-wasm/',
      }).promise

      if (loadGenRef.current !== gen) return

      const total = doc.numPages
      setPdfDoc(doc)
      setPdfLoadProgress({ loaded: 0, total, allReady: false })

      // Patch the document record with the correct page count once we know it.
      // Use a small delay so the createDocument call above has time to resolve.
      setTimeout(() => {
        if (documentIdRef.current) {
          updateDocument(documentIdRef.current, { page_count: total }).catch(() => {})
        }
      }, 2000)

      // First batch — render immediately so the user can start working.
      const firstCount = Math.min(INITIAL_BATCH, total)
      const firstPages = []
      for (let i = 1; i <= firstCount; i++) {
        if (loadGenRef.current !== gen) return
        const pdfPage = await doc.getPage(i)
        const { url: thumbnail, hintW, hintH } = await generateThumbnail(pdfPage)
        firstPages.push(makePage(i, pdfPage, thumbnail, hintW, hintH))
      }

      if (loadGenRef.current !== gen) return
      setPages(firstPages)
      setPdfLoadProgress({ loaded: firstCount, total, allReady: firstCount === total })

      // Background — generate thumbnails for remaining pages but store pdfPage: null.
      // The window management effect loads pdfPage on demand as the user scrolls.
      for (let i = firstCount + 1; i <= total; i++) {
        if (loadGenRef.current !== gen) return
        const pdfPage = await doc.getPage(i)
        const { url: thumbnail, hintW, hintH } = await generateThumbnail(pdfPage)
        if (loadGenRef.current !== gen) return
        setPages(prev => [...prev, makePage(i, null, thumbnail, hintW, hintH)])
        setPdfLoadProgress({ loaded: i, total, allReady: i === total })
        await new Promise(r => setTimeout(r, 0))
      }
    } catch (err) {
      if (loadGenRef.current === gen) {
        alert(`Failed to load PDF: ${err.message}`)
        setPdfLoadProgress(null)
      }
    }
  }, [])

  // ── Restore a previously saved document on mount ──────────────────────────
  const handleFileChangeWithRestore = useCallback(async (file, savedPageMap) => {
    if (!file) return

    detectionGenRef.current++
    isDetectionRunningRef.current = false
    detectionQueueRef.current = []
    autoDetectInitiatedRef.current = false

    const gen = ++loadGenRef.current
    setPdfFile(file)
    setPdfLoadProgress({ loaded: 0, total: 0, allReady: false })
    setPages([])
    setActivePage(0)
    setSelectedBlockId(null)
    setSelectedBlockIds([])
    setUndoStack([])
    setRedoStack([])

    // ── Image restore path ───────────────────────────────────────────────────
    if (file.type.startsWith('image/')) {
      try {
        const imageUrl = URL.createObjectURL(file)
        const dims = await new Promise((resolve, reject) => {
          const img = new window.Image()
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
          img.onerror = reject
          img.src = imageUrl
        })
        if (loadGenRef.current !== gen) return
        const saved = savedPageMap[1]
        const page = {
          pageNo: 1, thumbnail: imageUrl, pdfPage: null,
          imageBlob: file, imageUrl,
          imageW: saved?.image_w || dims.w, imageH: saved?.image_h || dims.h,
          status: saved?.status || 'idle', sessionId: saved?.session_id || null,
          layoutBlocks: saved?.layout_blocks || [], ocrBlocks: saved?.ocr_blocks || [],
        }
        setPages([page])
        pagesRef.current = [page]
        setPdfDoc(null)
        setPdfLoadProgress({ loaded: 1, total: 1, allReady: true })
      } catch (err) {
        if (loadGenRef.current === gen) {
          alert(`Failed to restore image: ${err.message}`)
          setPdfLoadProgress(null)
        }
      }
      return
    }

    // ── PDF restore path ─────────────────────────────────────────────────────
    try {
      const buffer = await file.arrayBuffer()
      if (loadGenRef.current !== gen) return

      const doc = await pdfjsLib.getDocument({
        data: buffer,
        cMapUrl: '/pdfjs-cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/pdfjs-fonts/',
        wasmUrl: '/pdfjs-wasm/',
      }).promise

      if (loadGenRef.current !== gen) return

      const total = doc.numPages
      setPdfDoc(doc)
      setPdfLoadProgress({ loaded: 0, total, allReady: false })

      const firstCount = Math.min(INITIAL_BATCH, total)
      const firstPages = []
      for (let i = 1; i <= firstCount; i++) {
        if (loadGenRef.current !== gen) return
        const pdfPage = await doc.getPage(i)
        const { url: thumbnail, hintW, hintH } = await generateThumbnail(pdfPage)
        const saved = savedPageMap[i]
        firstPages.push({
          ...makePage(i, pdfPage, thumbnail, hintW, hintH),
          ...(saved ? {
            sessionId: saved.session_id,
            imageW: saved.image_w,
            imageH: saved.image_h,
            layoutBlocks: saved.layout_blocks,
            ocrBlocks: saved.ocr_blocks,
            status: saved.status,
          } : {}),
        })
      }

      if (loadGenRef.current !== gen) return
      setPages(firstPages)
      setPdfLoadProgress({ loaded: firstCount, total, allReady: firstCount === total })

      for (let i = firstCount + 1; i <= total; i++) {
        if (loadGenRef.current !== gen) return
        const pdfPage = await doc.getPage(i)
        const { url: thumbnail, hintW, hintH } = await generateThumbnail(pdfPage)
        if (loadGenRef.current !== gen) return
        const saved = savedPageMap[i]
        setPages(prev => [...prev, {
          ...makePage(i, null, thumbnail, hintW, hintH),
          ...(saved ? {
            sessionId: saved.session_id,
            imageW: saved.image_w,
            imageH: saved.image_h,
            layoutBlocks: saved.layout_blocks,
            ocrBlocks: saved.ocr_blocks,
            status: saved.status,
          } : {}),
        }])
        setPdfLoadProgress({ loaded: i, total, allReady: i === total })
        await new Promise(r => setTimeout(r, 0))
      }
    } catch (err) {
      if (loadGenRef.current === gen) {
        alert(`Failed to restore document: ${err.message}`)
        setPdfLoadProgress(null)
      }
    }
  }, [])

  useEffect(() => {
    if (!docId || freshUpload) return
    getDocument(docId)
      .then(async (doc) => {
        // ── Blank document path ──────────────────────────────────────────────
        if (doc.file_type === 'blank') {
          documentIdRef.current = docId
          setFileType('blank')
          setDocFilename(doc.filename)
          const initialPages = (doc.pages || []).map(p => ({
            pageNo: p.page_number,
            pdfPage: null,
            imageBlob: null,
            imageUrl: null,
            imageW: A4_W,
            imageH: A4_H,
            status: p.status || 'idle',
            sessionId: p.session_id || null,
            layoutBlocks: p.layout_blocks || [],
            ocrBlocks: p.ocr_blocks || [],
            placedImages: p.placed_images || [],
          }))
          setPages(initialPages.length ? initialPages : [{
            pageNo: 1, pdfPage: null, imageBlob: null, imageUrl: null,
            imageW: A4_W, imageH: A4_H, status: 'idle', sessionId: null,
            layoutBlocks: [], ocrBlocks: [], placedImages: [],
          }])
          pagesRef.current = initialPages
          setPdfDoc(null)
          setPdfLoadProgress({ loaded: 1, total: 1, allReady: true })
          return
        }

        // ── Normal file path ─────────────────────────────────────────────────
        setDocFilename(doc.filename)
        const savedPageMap = {}
        for (const p of doc.pages) savedPageMap[p.page_number] = p
        const resp = await fetch(doc.pdf_url)
        const blob = await resp.blob()
        const mimeType = blob.type || (doc.filename.match(/\.(jpe?g|png|tiff?|bmp|webp)$/i) ? `image/${RegExp.$1.replace('jpg','jpeg')}` : 'application/pdf')
        const file = new File([blob], doc.filename, { type: mimeType })
        handleFileChangeWithRestore(file, savedPageMap)
      })
      .catch(e => alert(`Failed to load document: ${e.message}`))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load the PDF that was just uploaded from the Dashboard (freshUpload path).
  // documentIdRef is already set to docId so handleFileChange won't create a duplicate record.
  useEffect(() => {
    if (freshUpload && initialPdfFile) {
      handleFileChange(initialPdfFile)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Blank document: add page ───────────────────────────────────────────────
  const handleAddBlankPage = useCallback(async () => {
    if (!documentIdRef.current) return
    try {
      const result = await addBlankPage(documentIdRef.current)
      const newPage = {
        pageNo: result.page_number,
        pdfPage: null, imageBlob: null, imageUrl: null,
        imageW: A4_W, imageH: A4_H,
        status: 'idle', sessionId: null,
        layoutBlocks: [], ocrBlocks: [], placedImages: [],
      }
      setPages(prev => [...prev, newPage])
    } catch (err) {
      alert(`Failed to add page: ${err.message}`)
    }
  }, [])

  // ── Rename document ───────────────────────────────────────────────────────
  const handleRenameFile = useCallback(async (newName) => {
    setDocFilename(newName)
    if (documentIdRef.current) {
      updateDocument(documentIdRef.current, { filename: newName })
        .catch(e => console.warn('rename failed:', e.message))
    }
  }, [])

  // ── Blank document: delete page ──────────────────────────────────────────
  const handleDeletePage = useCallback(async (pageIdx) => {
    if (pages.length <= 1) return
    const page = pages[pageIdx]
    if (!page || !documentIdRef.current) return
    const ok = window.confirm(`Delete page ${page.pageNo}? This cannot be undone.`)
    if (!ok) return
    try {
      await deleteBlankPage(documentIdRef.current, page.pageNo)
      setPages(prev => {
        const updated = prev.filter((_, i) => i !== pageIdx)
        // Re-number pages in state to match backend renumbering
        return updated.map((p, i) => ({ ...p, pageNo: i + 1 }))
      })
      setActivePage(prev => Math.min(prev, pages.length - 2))
    } catch (err) {
      alert(`Failed to delete page: ${err.message}`)
    }
  }, [pages])

  // ── Blank document: clipboard image paste ────────────────────────────────
  useEffect(() => {
    if (fileType !== 'blank') return
    const handlePaste = async (e) => {
      const items = Array.from(e.clipboardData?.items || [])
      const imgItem = items.find(i => i.type.startsWith('image/'))
      if (!imgItem) return
      e.preventDefault()
      const blob = imgItem.getAsFile()
      if (!blob) return
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = ev => resolve(ev.target.result)
        reader.readAsDataURL(blob)
      })
      const dims = await new Promise((resolve, reject) => {
        const img = new window.Image()
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = reject
        img.src = dataUrl
      })
      const maxW = Math.min(dims.w, 1200)
      const scale = maxW / dims.w
      const imgW = Math.round(dims.w * scale)
      const imgH = Math.round(dims.h * scale)

      // Use tracked canvas mouse position if available, else center
      const mouse = canvasMouseRef.current
      const x = (mouse?.pageIdx === activePage)
        ? Math.max(0, Math.min(A4_W - imgW, mouse.x - imgW / 2))
        : Math.max(0, (A4_W - imgW) / 2)
      const y = (mouse?.pageIdx === activePage)
        ? Math.max(0, Math.min(A4_H - imgH, mouse.y - imgH / 2))
        : 100

      const placedImg = { id: crypto.randomUUID(), dataUrl, x, y, width: imgW, height: imgH }

      setPages(prev => {
        const u = [...prev]
        if (u[activePage]) {
          u[activePage] = {
            ...u[activePage],
            placedImages: [...(u[activePage].placedImages || []), placedImg],
          }
        }
        return u
      })

      if (documentIdRef.current) {
        const currentPage = pagesRef.current[activePage]
        savePageContent(documentIdRef.current, currentPage.pageNo, {
          placed_images: [...(currentPage.placedImages || []), placedImg],
        }).catch(e => console.warn('placed_images save failed:', e.message))
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [fileType, activePage])

  // ── Manual detect (single page, takes priority, sets isProcessing) ─────────
  const handleRecognize = useCallback(async () => {
    const page = pages[activePage]
    const hasContent = page?.pdfPage || page?.imageBlob || page?.placedImages?.length > 0
    if (!hasContent) return

    if (page.layoutBlocks?.length > 0) {
      const ok = window.confirm(
        'This page already has layout boxes. Re-running detection will replace them with new ML predictions, including any corrections you made.\n\nContinue?'
      )
      if (!ok) return
    }

    setIsProcessing(true)
    try {
      let imageBlob
      if (page.pdfPage) {
        const pdfPage = page.pdfPage
        const viewport = pdfPage.getViewport({ scale: 200 / 72 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      } else if (page.placedImages?.length > 0) {
        imageBlob = await compositeBlankPage(page.placedImages)
      } else {
        imageBlob = page.imageBlob
      }
      const layoutResult = await runLayoutDetection(imageBlob, `page-${page.pageNo}.png`)
      const orderedBlocks = computeReadingOrder(layoutResult.layout_blocks, layoutResult.image_width)

      const updatedPages = [...pages]
      updatedPages[activePage] = {
        ...page,
        sessionId: layoutResult.session_id,
        imageW: layoutResult.image_width,
        imageH: layoutResult.image_height,
        layoutBlocks: orderedBlocks,
        status: 'layout-detected',
      }
      setPages(updatedPages)
      setUndoStack([])
      setRedoStack([])

      if (documentIdRef.current) {
        savePageContent(documentIdRef.current, page.pageNo, {
          session_id: layoutResult.session_id,
          image_w: layoutResult.image_width,
          image_h: layoutResult.image_height,
          layout_blocks: orderedBlocks,
          status: 'layout-detected',
        }).catch(e => console.warn('layout save failed:', e.message))
      }

      // Fire TATR for any table blocks — non-blocking
      triggerTatrForTableBlocks(activePage, layoutResult.session_id, orderedBlocks)
        .catch(e => console.warn('TATR trigger failed:', e.message))
    } catch (err) {
      alert(`Layout detection failed: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }, [pages, activePage, triggerTatrForTableBlocks])

  const handleRunOcr = useCallback(async (sessionId, layoutBlocks) => {
    const page = pagesRef.current[activePage]
    if (!page) return

    const currentLayoutBlocks = layoutBlocks || page.layoutBlocks || []
    const sessionIdToUse = sessionId || page.sessionId

    // Start skeleton phase — all blocks pending
    const blockIds = currentLayoutBlocks.map(b => b.id)
    const streamGen = ++streamingGenRef.current
    setStreamingOcrState({ blockIds, results: {} })
    setIsProcessing(true)

    try {
      const allResults = []

      await runOcrStream(sessionIdToUse, currentLayoutBlocks, (block) => {
        if (streamingGenRef.current !== streamGen) return  // page switched — discard
        allResults.push(block)
        setStreamingOcrState(prev =>
          prev ? { ...prev, results: { ...prev.results, [block.block_id]: block } } : null
        )
      })

      // End skeleton phase, commit results
      setStreamingOcrState(null)
      setPages(prev => {
        const u = [...prev]
        if (u[activePage]) u[activePage] = { ...u[activePage], ocrBlocks: allResults, status: 'ocr-complete' }
        return u
      })

      if (documentIdRef.current) {
        try {
          await savePageContent(documentIdRef.current, page.pageNo, {
            ocr_blocks: allResults,
            status: 'ocr-complete',
          })
          setOcrVersion(v => v + 1)
        } catch (e) {
          console.warn('ocr save failed:', e.message)
        }
      }
    } catch (err) {
      setStreamingOcrState(null)
      alert(`OCR failed: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }, [activePage])

  const handleRunOcrSelected = useCallback(async (blockIds) => {
    const page = pages[activePage]
    if (!page?.sessionId || !blockIds?.length) return
    const selectedBlocks = (page.layoutBlocks || []).filter(b => blockIds.includes(b.id))
    if (!selectedBlocks.length) return
    setIsProcessing(true)
    try {
      const ocrResult = await runOcr(page.sessionId, selectedBlocks)
      const existingOcr = page.ocrBlocks || []
      const newOcrById = Object.fromEntries(ocrResult.ocr_blocks.map(b => [b.block_id, b]))
      const merged = [
        ...existingOcr.filter(b => !newOcrById[b.block_id]),
        ...ocrResult.ocr_blocks,
      ]

      const updatedPages = [...pages]
      updatedPages[activePage] = { ...updatedPages[activePage], ocrBlocks: merged, status: 'ocr-complete' }
      setPages(updatedPages)

      // Only use surgical patch when at least one existing node references the new OCR blocks.
      // If none match (e.g. a brand-new canvas block), fall back to a full re-fetch so the
      // backend can generate structured content that includes the new block.
      const newBlockIdSet = new Set(Object.keys(newOcrById))
      function nodeTreeContainsAny(nodes, idSet) {
        return nodes.some(n =>
          (n.source_block_ids || []).some(id => idSet.has(id)) ||
          (n.children?.length && nodeTreeContainsAny(n.children, idSet))
        )
      }
      const anyNodeMatched = nodeTreeContainsAny(
        structuredContentRef.current?.nodes || [],
        newBlockIdSet
      )

      const patched = (structuredContentRef.current && anyNodeMatched)
        ? patchStructuredContent(structuredContentRef.current, newOcrById)
        : null

      // merged may not cover all layout blocks when only a subset was selected.
      // Only trigger a full re-fetch when merged is complete — otherwise the backend
      // would rebuild structured content from an incomplete ocr_blocks list.
      const allLayoutIds = new Set((page.layoutBlocks || []).map(b => b.id))
      const mergedIds = new Set(merged.map(b => b.block_id))
      const isComplete = [...allLayoutIds].every(id => mergedIds.has(id))

      let saveOk = !documentIdRef.current  // no save needed → treat as OK
      if (documentIdRef.current) {
        const savePayload = { ocr_blocks: merged, status: 'ocr-complete' }
        if (patched) {
          savePayload.structured_content = patched
          savePayload.structure_status = 'edited'
        } else if (!isComplete && structuredContentRef.current) {
          // Preserve existing structured content so the backend doesn't invalidate it
          // when merged is incomplete (partial OCR run).
          savePayload.structured_content = structuredContentRef.current
          savePayload.structure_status = 'edited'
        }
        try {
          await savePageContent(documentIdRef.current, page.pageNo, savePayload)
          saveOk = true
        } catch (e) {
          console.warn('ocr save failed:', e.message)
        }
      }

      if (patched) {
        // Surgical update — preserves all other content and user edits
        documentEditorRef.current?.patchContent(patched)
      } else if (isComplete && saveOk) {
        // Full re-fetch only when merged covers all layout blocks AND save succeeded
        setOcrVersion(v => v + 1)
      }
      // Incomplete + no patch: existing document content is unchanged
    } catch (err) {
      alert(`OCR failed: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }, [pages, activePage])

  const handleBlocksChange = useCallback((pageIdx, newBlocks, opts = {}) => {
    if (typeof pageIdx !== 'number') {
      newBlocks = pageIdx
      pageIdx = activePage
    }
    const { skipUndo = false, undoSnapshot } = opts
    const targetPage = pages[pageIdx]
    if (!targetPage) return

    if (!skipUndo) {
      // undoSnapshot: provided by BlockOverlay on mouseUp with the pre-drag state
      // default: snapshot current blocks (for instantaneous changes like draw/delete)
      setUndoStack(prev => [...prev, { pageIdx, blocks: undoSnapshot ?? targetPage.layoutBlocks }])
      setRedoStack([])
    }

    const orderedBlocks = computeReadingOrder(newBlocks, targetPage.imageW || 0)

    const prevBlockIds = new Set((targetPage.layoutBlocks || []).map(b => b.id))
    const newBlockIds = new Set(orderedBlocks.map(b => b.id))
    const deletedIds = new Set([...prevBlockIds].filter(id => !newBlockIds.has(id)))

    // Detect newly drawn table blocks or blocks relabeled to 'table' that need TATR
    const newTableBlocks = orderedBlocks.filter(
      b => b.label === 'table' && !b.table_structure && !prevBlockIds.has(b.id)
    )
    if (newTableBlocks.length > 0 && targetPage.sessionId) {
      triggerTatrForTableBlocks(pageIdx, targetPage.sessionId, newTableBlocks)
        .catch(e => console.warn('TATR trigger (new block) failed:', e.message))
    }

    // Detect bbox-resized table blocks — debounce TATR re-run 800 ms after last drag frame
    const prevBlockMap = Object.fromEntries((targetPage.layoutBlocks || []).map(b => [b.id, b]))
    for (const b of orderedBlocks) {
      if (b.label !== 'table' || !b.table_structure) continue
      const prev = prevBlockMap[b.id]
      if (!prev) continue
      const [ox1, oy1, ox2, oy2] = prev.bbox
      const [nx1, ny1, nx2, ny2] = b.bbox
      if (ox1 === nx1 && oy1 === ny1 && ox2 === nx2 && oy2 === ny2) continue
      // bbox changed — schedule TATR re-run
      clearTimeout(tatrRetriggerTimerRef.current[b.id])
      tatrRetriggerTimerRef.current[b.id] = setTimeout(() => {
        const page = pagesRef.current[pageIdx]
        if (!page?.sessionId) return
        const currentBlock = page.layoutBlocks?.find(lb => lb.id === b.id)
        if (!currentBlock || currentBlock.label !== 'table') return
        // Clear old structure so TATR re-runs on the new bbox
        setPages(prev => {
          const u = [...prev]
          if (!u[pageIdx]) return prev
          u[pageIdx] = {
            ...u[pageIdx],
            layoutBlocks: u[pageIdx].layoutBlocks.map(lb =>
              lb.id === b.id ? { ...lb, table_structure: null, corners: null } : lb
            ),
          }
          return u
        })
        triggerTatrForTableBlocks(pageIdx, page.sessionId, [{ ...currentBlock, table_structure: null }])
          .catch(e => console.warn('TATR retrigger (bbox resize) failed:', e.message))
      }, 800)
    }

    const updatedPages = [...pages]
    updatedPages[pageIdx] = {
      ...updatedPages[pageIdx],
      layoutBlocks: orderedBlocks,
      ...(deletedIds.size > 0 ? {
        ocrBlocks: (updatedPages[pageIdx].ocrBlocks || []).filter(b => !deletedIds.has(b.block_id))
      } : {}),
    }
    setPages(updatedPages)

    if (deletedIds.size > 0 && structuredContentRef.current?.nodes?.length) {
      const cleaned = {
        ...structuredContentRef.current,
        nodes: structuredContentRef.current.nodes
          .map(n => ({
            ...n,
            source_block_ids: (n.source_block_ids || []).filter(id => !deletedIds.has(id))
          }))
          .filter(n => {
            const ids = n.source_block_ids
            if (!ids || ids.length === 0) return true
            return ids.filter(id => !deletedIds.has(id)).length > 0
          })
      }
      setStructuredContent(cleaned)
      structuredContentRef.current = cleaned
      documentEditorRef.current?.patchContent(cleaned)
      if (documentIdRef.current && targetPage) {
        savePageContent(documentIdRef.current, targetPage.pageNo, {
          structured_content: cleaned,
          structure_status: 'edited',
        }).catch(e => console.warn('structured cleanup save failed:', e.message))
      }
    }

    const docId = documentIdRef.current
    if (docId) {
      const p = updatedPages[pageIdx]
      clearTimeout(blocksSaveTimerRef.current[pageIdx])
      blocksSaveTimerRef.current[pageIdx] = setTimeout(() => {
        const latestPage = pagesRef.current[pageIdx]
        const latestBlocks = latestPage?.layoutBlocks ?? orderedBlocks
        savePageContent(docId, p.pageNo, {
          layout_blocks: latestBlocks,
          ...(p.sessionId ? { session_id: p.sessionId } : {}),
          ...(p.imageW ? { image_w: p.imageW } : {}),
          ...(p.imageH ? { image_h: p.imageH } : {}),
          status: p.status || 'layout-detected',
        }).catch(e => console.warn('blocks save failed:', e.message))
      }, 800)
    }
  }, [pages, activePage])

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return
    const last = undoStack[undoStack.length - 1]
    const idx = last.pageIdx
    setRedoStack(prev => [...prev, { pageIdx: idx, blocks: pages[idx].layoutBlocks }])
    setUndoStack(undoStack.slice(0, -1))
    const updatedPages = [...pages]
    updatedPages[idx] = { ...updatedPages[idx], layoutBlocks: last.blocks }
    setPages(updatedPages)
  }, [pages, undoStack])

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    const idx = next.pageIdx
    setUndoStack(prev => [...prev, { pageIdx: idx, blocks: pages[idx].layoutBlocks }])
    setRedoStack(redoStack.slice(0, -1))
    const updatedPages = [...pages]
    updatedPages[idx] = { ...updatedPages[idx], layoutBlocks: next.blocks }
    setPages(updatedPages)
  }, [pages, redoStack])

  const handleSelectPage = useCallback((idx) => {
    streamingGenRef.current++  // invalidate any in-flight streaming callbacks
    setStreamingOcrState(null)
    setActivePage(idx)
    setSelectedBlockId(null)
    setSelectedBlockIds([])
    setStructuredContent(null)
    structuredContentRef.current = null
  }, [])

  const handleExport = useCallback(async (format) => {
    const page = pages[activePage]
    if (!page?.sessionId || !page?.ocrBlocks?.length) {
      alert('Run OCR first before exporting')
      return
    }
    try {
      const result = await exportDocument(page.sessionId, format, page.ocrBlocks)
      const ext = { html: 'html', markdown: 'md', docx: 'docx' }[format]
      const mime = format === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : format === 'html' ? 'text/html' : 'text/markdown'
      const blob = result instanceof Blob ? result : new Blob([result], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `document.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`Export failed: ${err.message}`)
    }
  }, [pages, activePage])

  const labelMap = { text: 'plain_text', title: 'title', formula: 'isolate_formula', table: 'table', figure: 'figure' }
  const handleSetActiveTool = useCallback((toolId) => {
    const newLabel = labelMap[toolId]
    if (newLabel && newLabel !== 'table') {
      if (selectedCell) {
        // Update the type of the selected cell within a finalized table
        const page = pages[activePage]
        const updated = page.layoutBlocks.map(b => {
          if (b.id !== selectedCell.blockId) return b
          const ts = b.table_structure
          if (!ts?.finalized) return b
          const newCellTypes = (ts.cell_types || []).map((row, r) =>
            row.map((t, c) => (r === selectedCell.row && c === selectedCell.col) ? newLabel : t)
          )
          return { ...b, table_structure: { ...ts, cell_types: newCellTypes } }
        })
        const updatedPages = [...pages]
        updatedPages[activePage] = { ...updatedPages[activePage], layoutBlocks: updated }
        setPages(updatedPages)
        if (documentIdRef.current) {
          const p = pages[activePage]
          savePageContent(documentIdRef.current, p.pageNo, {
            layout_blocks: updated,
          }).catch(e => console.warn('cell type save failed:', e.message))
        }
      } else if (selectedBlockId) {
        // Update the label of the selected canvas block (existing behaviour)
        const page = pages[activePage]
        const updated = page.layoutBlocks.map(b =>
          b.id === selectedBlockId ? { ...b, label: newLabel } : b
        )
        const updatedPages = [...pages]
        updatedPages[activePage] = { ...updatedPages[activePage], layoutBlocks: updated }
        setPages(updatedPages)
        if (documentIdRef.current) {
          const p = pages[activePage]
          savePageContent(documentIdRef.current, p.pageNo, {
            layout_blocks: updated,
          }).catch(e => console.warn('block label save failed:', e.message))
        }
      }
    }
    setActiveTool(toolId)
  }, [selectedCell, selectedBlockId, activePage, pages, labelMap])

  useEffect(() => {
    const KEY_TO_TOOL = {
      '1': 'text', '2': 'title', '3': 'formula', '4': 'table', '5': 'figure',
      't': 'text', 'h': 'title', 'f': 'formula', 'b': 'table', 'g': 'figure',
      'Escape': 'select',
    }
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (document.activeElement?.isContentEditable) return
      const toolId = KEY_TO_TOOL[e.key]
      if (!toolId) return
      e.preventDefault()
      handleSetActiveTool(toolId)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSetActiveTool])

  const handleDividerMouseDown = useCallback((e) => {
    e.preventDefault()
    isDraggingSplitRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (e) => {
      if (!isDraggingSplitRef.current || !splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)))
    }

    const onUp = () => {
      isDraggingSplitRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  const activePage_data = pages[activePage]
  const detectingCount = pages.filter(p => p.status === 'detecting' || p.status === 'queued').length

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <TopBar
        filename={docFilename || pdfFile?.name}
        onRenameFile={handleRenameFile}
        fileType={fileType}
        pagesDone={pages.filter(p => p.status === 'ocr-complete').length}
        totalPages={pages.length}
        onFileChange={(e) => {
          documentIdRef.current = null
          handleFileChange(e.target.files?.[0])
        }}
        onRecognize={handleRecognize}
        onRerunOcr={() => handleRunOcr()}
        selectedBlockCount={selectedBlockIds.length}
        onRunOcrSelected={() => handleRunOcrSelected(selectedBlockIds)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        viewMode={viewMode}
        setViewMode={setViewMode}
        isProcessing={isProcessing}
        onExport={handleExport}
        currentPageStatus={activePage_data?.status}
        pdfLoadProgress={pdfLoadProgress}
        detectingCount={detectingCount}
        onNavigateToDashboard={onNavigateToDashboard}
      />

      <div className="flex flex-1 overflow-hidden">
        <PagesPanel
          pages={pages}
          activePage={activePage}
          onSelectPage={handleSelectPage}
          activeTool={activeTool}
          setActiveTool={handleSetActiveTool}
          selectedBlockLabel={
            selectedCell
              ? activePage_data?.layoutBlocks
                  ?.find(b => b.id === selectedCell.blockId)
                  ?.table_structure?.cell_types?.[selectedCell.row]?.[selectedCell.col]
                  ?? 'plain_text'
              : selectedBlockId
                ? activePage_data?.layoutBlocks?.find(b => b.id === selectedBlockId)?.label
                : null
          }
          onPreloadPages={loadPagesInRange}
          isBlankDoc={fileType === 'blank'}
          onDeletePage={fileType === 'blank' ? handleDeletePage : undefined}
          onAddPage={fileType === 'blank' ? handleAddBlankPage : undefined}
        />

        {activePage_data && (
          <div ref={splitContainerRef} className="flex flex-1 min-w-0 overflow-hidden">
            {/* CanvasPane — width controlled by splitRatio in split mode */}
            <div
              className="flex min-w-0 overflow-hidden"
              style={viewMode === 'split' ? { flex: `0 0 ${splitRatio * 100}%` } : { flex: '1 1 0' }}
            >
              <CanvasPane
                pages={pages}
                activePage={activePage}
                pdfLoadProgress={pdfLoadProgress}
                selectedBlockId={selectedBlockId}
                onSelectBlock={(id) => { setSelectedBlockId(id); if (!id) setSelectedCell(null) }}
                onSelectBlocks={setSelectedBlockIds}
                onBlocksChange={handleBlocksChange}
                onActivePageChange={setActivePage}
                activeTool={activeTool}
                viewMode={viewMode}
                tatrRunningBlockIds={tatrRunningBlockIds}
                finalizingBlockIds={finalizingBlockIds}
                onFinalizeBlock={handleFinalizeBlock}
                onCellSelect={setSelectedCell}
                isBlankDoc={fileType === 'blank'}
                canvasMouseRef={canvasMouseRef}
                onPlacedImagesChange={(pageIdx, newImages) => {
                  setPages(prev => {
                    const u = [...prev]
                    if (u[pageIdx]) u[pageIdx] = { ...u[pageIdx], placedImages: newImages }
                    return u
                  })
                  const page = pagesRef.current[pageIdx]
                  if (page && documentIdRef.current) {
                    savePageContent(documentIdRef.current, page.pageNo, {
                      placed_images: newImages,
                    }).catch(e => console.warn('placed_images save failed:', e.message))
                  }
                }}
              />
            </div>

            {viewMode === 'split' && (
              <>
                {/* Drag handle */}
                <div
                  className="w-1 flex-shrink-0 bg-gray-300 hover:bg-blue-400 transition-colors duration-100 cursor-col-resize z-10"
                  onMouseDown={handleDividerMouseDown}
                />
                <DocumentEditor
                  ref={documentEditorRef}
                  docId={documentIdRef.current}
                  pageNo={activePage_data.pageNo}
                  ocrBlocks={activePage_data.ocrBlocks}
                  pageStatus={activePage_data.status}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={setSelectedBlockId}
                  sessionId={activePage_data.sessionId}
                  ocrVersion={ocrVersion}
                  onStructureChange={(c) => { structuredContentRef.current = c; setStructuredContent(c) }}
                  layoutBlocks={activePage_data.layoutBlocks}
                  streamingOcrState={streamingOcrState}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
