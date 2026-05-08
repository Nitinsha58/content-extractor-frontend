import { useState, useCallback, useRef, useEffect } from 'react'
import pdfjsLib from './pdf/pdfConfig'
import { detectLayout, runOcr, exportDocument, createDocument, updateDocument, savePage, getPage, getDocument } from './services/extractorApi'
import TopBar from './components/TopBar'
import PagesPanel from './components/PagesPanel'
import CanvasPane from './components/CanvasPane'
import DocumentEditor from './components/DocumentEditor'

const INITIAL_BATCH = 8    // pages shown before background PDF loading begins
const DETECTION_WINDOW = 6 // pages ahead of active page to keep auto-detected
const RENDER_WINDOW  = 8   // pages loaded on each side of activePage (must be >= DETECTION_WINDOW)
const UNLOAD_BUFFER  = 15  // pages kept in memory beyond RENDER_WINDOW before unloading

// ── Structured content patch helpers ──────────────────────────────────────────
// Used by handleRunOcrSelected to update only affected document nodes in-place,
// preserving the rest of the document (user edits, ordering, structure).

function _inlineContent(blocks) {
  return (blocks || [])
    .filter(b => b.type === 'text' || b.type === 'latex')
    .map(b => b.type === 'latex'
      ? { type: 'latex', value: b.value, display: b.display ?? false }
      : { type: 'text', value: b.value }
    )
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

function computeReadingOrder(blocks, imageW) {
  if (!blocks?.length) return blocks || []
  const w = imageW || 0
  const enriched = blocks.map(b => {
    const blockW = b.bbox[2] - b.bbox[0]
    const centerX = (b.bbox[0] + b.bbox[2]) / 2
    const isFullWidth = w > 0 && blockW > w * 0.7
    const column_idx = isFullWidth || w === 0 ? 0 : (centerX > w / 2 ? 1 : 0)
    return { ...b, column_idx }
  })
  enriched.sort((a, b) => {
    if (a.column_idx !== b.column_idx) return a.column_idx - b.column_idx
    return a.bbox[1] - b.bbox[1]
  })
  return enriched.map((b, i) => ({ ...b, reading_order: i }))
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
  const [pages, setPages] = useState([])
  const [activePage, setActivePage] = useState(0)
  const [selectedBlockId, setSelectedBlockId] = useState(null)
  const [selectedBlockIds, setSelectedBlockIds] = useState([])
  const [activeTool, setActiveTool] = useState('select')
  const [viewMode, setViewMode] = useState('overlay')
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [ocrVersion, setOcrVersion] = useState(0)
  const [pdfLoadProgress, setPdfLoadProgress] = useState(null)
  const [structuredContent, setStructuredContent] = useState(null)

  // ── Persistence ref ────────────────────────────────────────────────────────
  const documentIdRef = useRef(docId || null)

  // ── DocumentEditor refs ────────────────────────────────────────────────────
  const documentEditorRef = useRef(null)
  const structuredContentRef = useRef(null)

  // ── PDF lazy-loading refs ──────────────────────────────────────────────────
  const loadGenRef = useRef(0)
  const pdfDocRef  = useRef(null)   // mirrors pdfDoc state for async closures

  // ── Auto-detection refs ────────────────────────────────────────────────────
  const pagesRef = useRef([])                   // mirror of pages state for async closures
  const detectionQueueRef = useRef([])          // page indices waiting to be detected
  const isDetectionRunningRef = useRef(false)   // one worker at a time
  const detectionGenRef = useRef(0)             // incremented on file open to abort worker
  const autoDetectInitiatedRef = useRef(false)  // auto-start fires only once per file
  const blocksSaveTimerRef = useRef({})         // per-page debounce timers for block saves

  // Keep pagesRef in sync so async workers always see latest page state.
  useEffect(() => { pagesRef.current = pages }, [pages])

  // Keep pdfDocRef in sync for use in async callbacks.
  useEffect(() => { pdfDocRef.current = pdfDoc }, [pdfDoc])

  // ── On-demand page loader ──────────────────────────────────────────────────
  // Loads pdfPage objects for pages in [startIdx, endIdx] that don't have one yet.
  // Called by the window management effect and by PagesPanel scroll pre-loading.
  const loadPagesInRange = useCallback(async (startIdx, endIdx) => {
    const doc = pdfDocRef.current
    if (!doc) return  // image files have no pdfDoc
    const gen = loadGenRef.current
    const clampedStart = Math.max(0, startIdx)
    const clampedEnd   = Math.min(pagesRef.current.length - 1, endIdx)

    for (let idx = clampedStart; idx <= clampedEnd; idx++) {
      if (loadGenRef.current !== gen) return  // new file opened — abort
      const p = pagesRef.current[idx]
      if (!p || p.pdfPage) continue           // already loaded
      try {
        const pdfPage = await doc.getPage(p.pageNo)
        if (loadGenRef.current !== gen) return
        setPages(prev => {
          const u = [...prev]
          if (u[idx] && !u[idx].pdfPage) u[idx] = { ...u[idx], pdfPage }
          return u
        })
        // Eagerly mirror into pagesRef so the detection worker sees it immediately.
        const eager = [...pagesRef.current]
        if (eager[idx] && !eager[idx].pdfPage) {
          eager[idx] = { ...eager[idx], pdfPage }
          pagesRef.current = eager
        }
      } catch (err) {
        console.warn(`loadPagesInRange page ${idx + 1}:`, err.message)
      }
    }
  }, []) // stable — only uses refs

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

        const result = await detectLayout(imageBlob, `page-${page.pageNo}.png`)

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
          savePage(documentIdRef.current, page.pageNo, {
            session_id: result.session_id,
            image_w: result.image_width,
            image_h: result.image_height,
            layout_blocks: orderedBlocks,
            status: 'layout-detected',
          }).catch(e => console.warn('layout save failed:', e.message))
        }
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

  // ── Virtual render window: load/unload pdfPage objects around activePage ───
  // Keeps only RENDER_WINDOW pages loaded on each side; unloads beyond UNLOAD_BUFFER.
  // Image files (no pdfDoc) are skipped entirely.
  useEffect(() => {
    if (!pdfDoc) return

    const unloadStart = activePage - UNLOAD_BUFFER
    const unloadEnd   = activePage + UNLOAD_BUFFER

    // 1. Unload pdfPage for pages far outside the buffer (frees memory first).
    setPages(prev => {
      let changed = false
      const u = prev.map((p, idx) => {
        if (p.pdfPage && (idx < unloadStart || idx > unloadEnd)) {
          changed = true
          return { ...p, pdfPage: null }
        }
        return p
      })
      return changed ? u : prev
    })
    // Mirror unloads into pagesRef immediately so the detection worker sees them.
    const eager = [...pagesRef.current]
    let eagerChanged = false
    for (let idx = 0; idx < eager.length; idx++) {
      if (eager[idx]?.pdfPage && (idx < unloadStart || idx > unloadEnd)) {
        eager[idx] = { ...eager[idx], pdfPage: null }
        eagerChanged = true
      }
    }
    if (eagerChanged) pagesRef.current = eager

    // 2. Load pdfPage for pages inside the render window.
    loadPagesInRange(activePage - RENDER_WINDOW, activePage + RENDER_WINDOW)
  }, [activePage, pdfDoc, loadPagesInRange])

  // ── File loading ───────────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (file) => {
    if (!file) return

    // Abort any in-flight detection and PDF loading from the previous file.
    detectionGenRef.current++
    isDetectionRunningRef.current = false
    detectionQueueRef.current = []
    autoDetectInitiatedRef.current = false

    const gen = ++loadGenRef.current
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

  // ── Manual detect (single page, takes priority, sets isProcessing) ─────────
  const handleRecognize = useCallback(async () => {
    const page = pages[activePage]
    if (!page?.pdfPage && !page?.imageBlob) return

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
      } else {
        imageBlob = page.imageBlob
      }
      const layoutResult = await detectLayout(imageBlob, `page-${page.pageNo}.png`)
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
        savePage(documentIdRef.current, page.pageNo, {
          session_id: layoutResult.session_id,
          image_w: layoutResult.image_width,
          image_h: layoutResult.image_height,
          layout_blocks: orderedBlocks,
          status: 'layout-detected',
        }).catch(e => console.warn('layout save failed:', e.message))
      }
    } catch (err) {
      alert(`Layout detection failed: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }, [pages, activePage])

  const handleRunOcr = useCallback(async (sessionId, layoutBlocks) => {
    setIsProcessing(true)
    const page = pages[activePage]
    try {
      const currentLayoutBlocks = layoutBlocks || page?.layoutBlocks || []
      const ocrResult = await runOcr(sessionId || page.sessionId, currentLayoutBlocks)

      const updatedPages = [...pages]
      updatedPages[activePage] = {
        ...updatedPages[activePage],
        ocrBlocks: ocrResult.ocr_blocks,
        status: 'ocr-complete',
      }
      setPages(updatedPages)

      if (documentIdRef.current) {
        try {
          await savePage(documentIdRef.current, page.pageNo, {
            ocr_blocks: ocrResult.ocr_blocks,
            status: 'ocr-complete',
          })
        } catch (e) {
          console.warn('ocr save failed:', e.message)
        }
      }
      setOcrVersion(v => v + 1)
    } catch (err) {
      alert(`OCR failed: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }, [pages, activePage])

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
      const anyNodeMatched = (structuredContentRef.current?.nodes || []).some(node =>
        (node.source_block_ids || []).some(id => newBlockIdSet.has(id))
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
          await savePage(documentIdRef.current, page.pageNo, savePayload)
        } catch (e) {
          console.warn('ocr save failed:', e.message)
        }
      }

      if (patched) {
        // Surgical update — preserves all other content and user edits
        documentEditorRef.current?.patchContent(patched)
      } else if (isComplete) {
        // Full re-fetch only when merged covers all layout blocks
        setOcrVersion(v => v + 1)
      }
      // Incomplete + no patch: existing document content is unchanged
    } catch (err) {
      alert(`OCR failed: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }, [pages, activePage])

  const handleBlocksChange = useCallback((pageIdx, newBlocks) => {
    if (typeof pageIdx !== 'number') {
      newBlocks = pageIdx
      pageIdx = activePage
    }
    const targetPage = pages[pageIdx]
    if (!targetPage) return

    setUndoStack(prev => [...prev, { pageIdx, blocks: targetPage.layoutBlocks }])
    setRedoStack([])

    const orderedBlocks = computeReadingOrder(newBlocks, targetPage.imageW || 0)

    const prevBlockIds = new Set((targetPage.layoutBlocks || []).map(b => b.id))
    const newBlockIds = new Set(orderedBlocks.map(b => b.id))
    const deletedIds = new Set([...prevBlockIds].filter(id => !newBlockIds.has(id)))

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
        savePage(documentIdRef.current, targetPage.pageNo, {
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
        savePage(docId, p.pageNo, {
          layout_blocks: orderedBlocks,
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
    if (selectedBlockId && toolId !== 'select' && labelMap[toolId]) {
      const page = pages[activePage]
      const updated = page.layoutBlocks.map(b =>
        b.id === selectedBlockId ? { ...b, label: labelMap[toolId] } : b
      )
      const updatedPages = [...pages]
      updatedPages[activePage] = { ...updatedPages[activePage], layoutBlocks: updated }
      setPages(updatedPages)
    }
    setActiveTool(toolId)
  }, [selectedBlockId, activePage, pages, labelMap])

  const activePage_data = pages[activePage]
  const detectingCount = pages.filter(p => p.status === 'detecting' || p.status === 'queued').length

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <TopBar
        filename={pdfFile?.name}
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
            selectedBlockId
              ? activePage_data?.layoutBlocks?.find(b => b.id === selectedBlockId)?.label
              : null
          }
          onPreloadPages={loadPagesInRange}
        />

        {activePage_data && (
          <div className="flex flex-1 min-w-0 overflow-hidden">
            <CanvasPane
              pages={pages}
              activePage={activePage}
              pdfLoadProgress={pdfLoadProgress}
              selectedBlockId={selectedBlockId}
              onSelectBlock={setSelectedBlockId}
              onSelectBlocks={setSelectedBlockIds}
              onBlocksChange={handleBlocksChange}
              onActivePageChange={setActivePage}
              activeTool={activeTool}
              viewMode={viewMode}
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
            />
          </div>
        )}
      </div>
    </div>
  )
}
