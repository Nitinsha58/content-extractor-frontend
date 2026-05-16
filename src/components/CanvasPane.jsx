import { useEffect, useRef, useState, useCallback } from 'react'
import { sessionImageUrl } from '../services/DocumentRepository'
import BlockOverlay from './BlockOverlay'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'

const DEFAULT_SCALE = 1.5
const NEAR_VIEWPORT_MARGIN = '600px'
// How long to keep programmaticRef=true after a scrollTo fires (ms).
// Must be >= browser smooth-scroll duration.
const SCROLL_SETTLE_MS = 400
// How long after the last scroll event to snap to the nearest page.
const SNAP_DEBOUNCE_MS = 200

// ─────────────────────────────────────────────────────────────────────────────
// PdfPageView — one page rendered on its own canvas with a block overlay
// ─────────────────────────────────────────────────────────────────────────────
function PdfPageView({
  page,
  pageIdx,
  zoom,
  viewMode,
  selectedBlockId,
  activeTool,
  isActive,
  onSelectBlock,
  onSelectBlocks,
  onBlocksChange,
  registerPageEl,
  tatrRunningBlockIds,
  finalizingBlockIds,
  onFinalizeBlock,
  onCellSelect,
}) {
  const wrapperRef = useRef(null)
  const pdfCanvasRef = useRef(null)
  const fallbackCanvasRef = useRef(null)
  const renderTaskRef = useRef(null)

  const [isNear, setIsNear] = useState(false)
  const [renderError, setRenderError] = useState(null)
  const [sessionImgError, setSessionImgError] = useState(false)

  // Reset error flag whenever the session changes so the new image gets a fresh attempt.
  useEffect(() => { setSessionImgError(false) }, [page.sessionId])

  // When pdfPage is unloaded (set to null by the window management effect),
  // cancel any in-flight render and clear canvas memory (width=0 releases GPU buffer).
  useEffect(() => {
    if (page.pdfPage) return
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel() } catch (_) {}
      renderTaskRef.current = null
    }
    if (pdfCanvasRef.current)      { pdfCanvasRef.current.width = 0;      pdfCanvasRef.current.height = 0 }
    if (fallbackCanvasRef.current) { fallbackCanvasRef.current.width = 0; fallbackCanvasRef.current.height = 0 }
  }, [page.pdfPage])

  const pdfNativeViewport = page.pdfPage?.getViewport({ scale: DEFAULT_SCALE })
  const displayW = pdfNativeViewport?.width  || page.hintW || page.imageW || 600
  const displayH = pdfNativeViewport?.height || page.hintH || page.imageH || 800

  // Maps backend bbox coords (imageW space) → display-pixel space.
  const blockScale = page.imageW > 0 && displayW > 0 ? displayW / page.imageW : 1

  useEffect(() => {
    if (wrapperRef.current && registerPageEl) {
      registerPageEl(pageIdx, wrapperRef.current)
    }
    return () => { if (registerPageEl) registerPageEl(pageIdx, null) }
  }, [pageIdx, registerPageEl])

  // Trigger lazy render when page scrolls near the viewport.
  useEffect(() => {
    if (!wrapperRef.current) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { setIsNear(true); obs.disconnect(); break }
        }
      },
      { rootMargin: NEAR_VIEWPORT_MARGIN }
    )
    obs.observe(wrapperRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!isNear || !page.pdfPage) return
    const canvas = viewMode === 'original' ? pdfCanvasRef.current : fallbackCanvasRef.current
    if (!canvas) return

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel() } catch (_) {}
      renderTaskRef.current = null
    }

    const run = async () => {
      try {
        setRenderError(null)
        const viewport = page.pdfPage.getViewport({ scale: DEFAULT_SCALE * zoom })
        const dpr = Math.max(1, window.devicePixelRatio || 1)
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr))
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr))
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        const ctx = canvas.getContext('2d')
        if (!ctx) { setRenderError('No 2D context'); return }
        const task = page.pdfPage.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
        })
        renderTaskRef.current = task
        await task.promise
        renderTaskRef.current = null
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') setRenderError(err?.message || 'Render failed')
        renderTaskRef.current = null
      }
    }
    run()
    return () => {
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel() } catch (_) {} renderTaskRef.current = null }
    }
  }, [isNear, page.pdfPage, zoom, viewMode, page.pageNo])

  const wrapperW = displayW * zoom
  const wrapperH = displayH * zoom

  return (
    <div
      ref={wrapperRef}
      data-page-idx={pageIdx}
      style={{
        width: wrapperW,
        height: wrapperH,
        position: 'relative',
        flexShrink: 0,
        background: 'white',
        boxShadow: isActive
          ? '0 0 0 2px #3b82f6, 0 4px 16px rgba(0,0,0,0.18)'
          : '0 2px 8px rgba(0,0,0,0.1)',
        marginBottom: 24,
        transition: 'box-shadow 0.15s',
      }}
    >
      <div style={{
        position: 'absolute', top: -20, left: 0,
        fontSize: 11, userSelect: 'none',
        color: isActive ? '#3b82f6' : '#9ca3af',
        fontWeight: isActive ? 600 : 400,
      }}>
        Page {page.pageNo}
      </div>

      {/* Original view */}
      {viewMode === 'original' && page.pdfPage && (
        <canvas ref={pdfCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      )}
      {viewMode === 'original' && !page.pdfPage && page.imageUrl && (
        <img
          src={page.imageUrl}
          alt={`Page ${page.pageNo}`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
        />
      )}
      {/* Low-res thumbnail placeholder while the PDF page is outside the render window */}
      {viewMode === 'original' && !page.pdfPage && !page.imageUrl && page.thumbnail && (
        <img
          src={page.thumbnail}
          alt={`Page ${page.pageNo}`}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'contain', filter: 'blur(1px)', opacity: 0.6,
          }}
        />
      )}

      {/* Overlay / split view — priority: session image > local image preview > pdf fallback canvas */}
      {viewMode !== 'original' && page.sessionId && !sessionImgError && (
        <img
          src={sessionImageUrl(page.sessionId)}
          alt={`Page ${page.pageNo}`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
          onError={() => setSessionImgError(true)}
        />
      )}
      {viewMode !== 'original' && (!page.sessionId || sessionImgError) && page.imageUrl && (
        <img
          src={page.imageUrl}
          alt={`Page ${page.pageNo}`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
        />
      )}
      {viewMode !== 'original' && (
        <canvas
          ref={fallbackCanvasRef}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            display: (page.sessionId && !sessionImgError) || page.imageUrl ? 'none' : 'block',
          }}
        />
      )}

      {!isNear && (
        <div style={{
          position: 'absolute', inset: 0, background: '#f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#9ca3af', fontSize: 12,
        }}>
          Page {page.pageNo}
        </div>
      )}

      {renderError && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(254,226,226,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, textAlign: 'center', fontSize: 12, color: '#991b1b',
        }}>
          <AlertTriangle size={14} className="shrink-0" /> {renderError}
        </div>
      )}

      {viewMode !== 'original' && (
        <BlockOverlay
          layoutBlocks={page.layoutBlocks}
          ocrBlocks={page.ocrBlocks}
          selectedBlockId={selectedBlockId}
          activeTool={activeTool}
          zoom={zoom}
          imageW={displayW}
          imageH={displayH}
          blockScale={blockScale}
          bboxW={page.imageW || displayW}
          bboxH={page.imageH || displayH}
          onSelectBlock={onSelectBlock}
          onSelectBlocks={onSelectBlocks}
          onBlocksChange={(newBlocks, opts) => onBlocksChange(pageIdx, newBlocks, opts)}
          tatrRunningBlockIds={tatrRunningBlockIds}
          finalizingBlockIds={finalizingBlockIds}
          onFinalizeBlock={onFinalizeBlock}
          onCellSelect={onCellSelect}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CanvasPane — scrollable container of all pages + status bar
// ─────────────────────────────────────────────────────────────────────────────
export default function CanvasPane({
  pages,
  activePage,
  pdfLoadProgress,
  selectedBlockId,
  onSelectBlock,
  onSelectBlocks,
  onBlocksChange,
  onActivePageChange,
  activeTool,
  viewMode,
  tatrRunningBlockIds,
  finalizingBlockIds,
  onFinalizeBlock,
  onCellSelect,
}) {
  const scrollRef = useRef(null)
  const pageElsRef = useRef(new Map())
  const [zoom, setZoom] = useState(1)
  const [pageInput, setPageInput] = useState('')

  // ── Scroll state refs ──────────────────────────────────────────────────────
  // programmaticRef: true while we're executing a scrollTo ourselves.
  //   Suppresses the scroll listener so our own scroll doesn't re-trigger logic.
  const programmaticRef = useRef(false)
  const settleTimerRef = useRef(null)

  // userScrollingRef: true from first scroll event until SNAP_DEBOUNCE_MS after
  //   the last one.  Suppresses the activePage→scrollToPage effect so external
  //   page changes don't fight the user's finger.
  const userScrollingRef = useRef(false)
  const snapTimerRef = useRef(null)

  // Keep the onActivePageChange callback in a ref so the event listener closure
  // never goes stale (avoids re-creating the listener on every render).
  const onActivePageChangeRef = useRef(onActivePageChange)
  useEffect(() => { onActivePageChangeRef.current = onActivePageChange }, [onActivePageChange])

  // Keep activePage in a ref so the zoom-correction effect can read the current
  // value without listing it as a dependency (which would re-fire on every page nav).
  const activePageRef = useRef(activePage)
  useEffect(() => { activePageRef.current = activePage }, [activePage])

  const registerPageEl = useCallback((idx, el) => {
    if (el) pageElsRef.current.set(idx, el)
    else pageElsRef.current.delete(idx)
  }, [])

  // Returns the index of the page whose vertical centre is closest to the
  // scroll container's centre.  Works even when pages have different heights.
  const findCenteredPage = useCallback(() => {
    const root = scrollRef.current
    if (!root) return 0
    const rootMid = root.getBoundingClientRect().top + root.clientHeight / 2
    let bestIdx = 0
    let bestDist = Infinity
    pageElsRef.current.forEach((el, idx) => {
      if (!el) return
      const r = el.getBoundingClientRect()
      const dist = Math.abs(r.top + r.height / 2 - rootMid)
      if (dist < bestDist) { bestDist = dist; bestIdx = idx }
    })
    return bestIdx
  }, [])

  // Smoothly (or instantly) scrolls so pageIdx is 32px below the top edge.
  const scrollToPage = useCallback((idx, behavior = 'smooth') => {
    const el = pageElsRef.current.get(idx)
    const root = scrollRef.current
    if (!el || !root) return
    clearTimeout(settleTimerRef.current)
    programmaticRef.current = true
    const rootRect = root.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const target = root.scrollTop + (elRect.top - rootRect.top) - 32
    root.scrollTo({ top: Math.max(0, target), behavior })
    settleTimerRef.current = setTimeout(() => {
      programmaticRef.current = false
    }, SCROLL_SETTLE_MS)
  }, [])

  // ── Scroll listener ────────────────────────────────────────────────────────
  // While the user scrolls:
  //   • update activePage for UI feedback (panel highlight, status bar)
  //   • do NOT call scrollToPage (that would fight the scroll)
  // After scrolling stops (SNAP_DEBOUNCE_MS silence):
  //   • snap to the nearest page
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return

    const onScroll = () => {
      if (programmaticRef.current) return

      userScrollingRef.current = true
      clearTimeout(snapTimerRef.current)

      // Live feedback: highlight the most-visible page in the panel.
      const idx = findCenteredPage()
      onActivePageChangeRef.current?.(idx)

      // After the scroll gesture settles, snap cleanly to the nearest page —
      // but only if that page fits within the viewport. When zoomed in, a page
      // can be taller than the container; snapping to its top would prevent the
      // user from ever seeing the bottom half.
      snapTimerRef.current = setTimeout(() => {
        userScrollingRef.current = false
        const snapIdx = findCenteredPage()
        onActivePageChangeRef.current?.(snapIdx)
        const el = pageElsRef.current.get(snapIdx)
        if (el && root && el.offsetHeight <= root.clientHeight) {
          scrollToPage(snapIdx)
        }
      }, SNAP_DEBOUNCE_MS)
    }

    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      clearTimeout(snapTimerRef.current)
    }
  }, [findCenteredPage, scrollToPage])
  // findCenteredPage and scrollToPage have [] deps → stable, won't re-run this effect.

  // ── External activePage change → scroll to target ─────────────────────────
  // Only fires when activePage is changed from outside (PagesPanel click, arrow
  // buttons, page input).  Suppressed while the user is actively scrolling.
  useEffect(() => {
    if (userScrollingRef.current) return
    scrollToPage(activePage)
  }, [activePage, scrollToPage])

  // ── Zoom change → re-anchor on active page ────────────────────────────────
  // When zoom changes, every page's pixel height changes but scrollTop stays
  // fixed, so the viewport drifts to a different page. Jump back instantly.
  useEffect(() => {
    scrollToPage(activePageRef.current, 'instant')
  }, [zoom, scrollToPage])

  // ── Pinch-to-zoom (trackpad) ──────────────────────────────────────────────
  // Pinch fires as wheel + ctrlKey on macOS. Must be non-passive to call
  // preventDefault() and block the browser's own pinch handler.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom(prev => Math.min(3, Math.max(0.5, prev - e.deltaY * 0.008)))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // Sync the editable page-number input.
  useEffect(() => {
    setPageInput(String(pages[activePage]?.pageNo ?? activePage + 1))
  }, [activePage, pages])

  if (!pages.length) {
    return (
      <div className="flex-1 bg-gray-200 flex items-center justify-center text-gray-500">
        <div className="text-center">
          {pdfLoadProgress && !pdfLoadProgress.allReady ? (
            <>
              <div className="text-lg font-semibold mb-1">Loading PDF…</div>
              <div className="text-sm">{pdfLoadProgress.loaded} / {pdfLoadProgress.total} pages</div>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">No document loaded</p>
              <p className="text-sm">Click "Open File" to load a PDF or image</p>
            </>
          )}
        </div>
      </div>
    )
  }

  const handlePageJump = (value) => {
    const num = parseInt(value, 10)
    if (!Number.isNaN(num) && num >= 1 && num <= pages.length) {
      onActivePageChange?.(num - 1)
    } else {
      setPageInput(String(pages[activePage]?.pageNo ?? activePage + 1))
    }
  }

  const allLoaded = !pdfLoadProgress || pdfLoadProgress.allReady
  const totalExpected = pdfLoadProgress?.total ?? pages.length

  return (
    <div className="flex-1 bg-gray-200 flex flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '40px 16px 80px',
          minWidth: 'max-content',
        }}>
          {pages.map((page, idx) => (
            <PdfPageView
              key={idx}
              page={page}
              pageIdx={idx}
              zoom={zoom}
              viewMode={viewMode}
              selectedBlockId={selectedBlockId}
              activeTool={activeTool}
              isActive={idx === activePage}
              onSelectBlock={onSelectBlock}
              onSelectBlocks={onSelectBlocks}
              onBlocksChange={onBlocksChange}
              registerPageEl={registerPageEl}
              tatrRunningBlockIds={tatrRunningBlockIds}
              finalizingBlockIds={finalizingBlockIds}
              onFinalizeBlock={onFinalizeBlock}
              onCellSelect={onCellSelect}
            />
          ))}

          {/* Skeleton placeholders for pages still loading in background */}
          {!allLoaded && Array.from({ length: totalExpected - pages.length }, (_, i) => (
            <div
              key={`skeleton-${i}`}
              style={{
                width: 600 * zoom,
                height: 800 * zoom,
                background: 'white',
                borderRadius: 2,
                marginBottom: 24,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d1d5db',
                fontSize: 12,
              }}
            >
              Page {pages.length + i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-100 border-t border-gray-300 text-xs text-gray-600 select-none">
        {/* Page number + jump input */}
        <div className="flex items-center gap-1 font-medium">
          <input
            type="number"
            min={1}
            max={pages.length}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={(e) => handlePageJump(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handlePageJump(e.target.value)
              if (e.key === 'Escape') setPageInput(String(pages[activePage]?.pageNo ?? activePage + 1))
            }}
            style={{
              width: '3rem', padding: '1px 4px',
              border: '1px solid #d1d5db', borderRadius: 3,
              textAlign: 'center', fontSize: 12, background: 'white',
            }}
          />
          <span className="text-gray-500">/ {pages.length}</span>
        </div>

        {/* Pages-loaded indicator */}
        {!allLoaded && (
          <span className="flex items-center gap-1 text-blue-500">
            <span className="inline-block w-2.5 h-2.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            {pages.length}/{totalExpected} loaded
          </span>
        )}

        {/* Zoom slider */}
        <input
          type="range" min="0.5" max="3" step="0.1"
          value={zoom}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          style={{ width: '6rem' }}
        />
        <span style={{ minWidth: '3rem' }}>{Math.round(zoom * 100)}%</span>

        <div className="flex-1" />

        {/* Prev / Next */}
        <button
          disabled={activePage === 0}
          onClick={() => onActivePageChange?.(activePage - 1)}
          style={{
            padding: '2px 6px', borderRadius: 3,
            border: '1px solid #d1d5db', background: 'white',
            cursor: activePage === 0 ? 'default' : 'pointer',
            opacity: activePage === 0 ? 0.4 : 1,
          }}
        ><ChevronLeft size={14} /></button>
        <button
          disabled={activePage >= pages.length - 1}
          onClick={() => onActivePageChange?.(activePage + 1)}
          style={{
            padding: '2px 6px', borderRadius: 3,
            border: '1px solid #d1d5db', background: 'white',
            cursor: activePage >= pages.length - 1 ? 'default' : 'pointer',
            opacity: activePage >= pages.length - 1 ? 0.4 : 1,
          }}
        ><ChevronRight size={14} /></button>
      </div>
    </div>
  )
}
