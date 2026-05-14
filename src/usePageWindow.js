import { useCallback, useEffect, useRef, useState } from 'react'

const RENDER_WINDOW = 8   // pages loaded on each side of activePage
const UNLOAD_BUFFER = 15  // pages kept in memory beyond RENDER_WINDOW before unloading

export function usePageWindow({ pdfDoc, activePage, initialPages = [] }) {
  const [pages, setPages] = useState(initialPages)
  const pagesRef = useRef(initialPages)
  const pdfDocRef = useRef(null)
  const loadGenRef = useRef(0)

  // Keep pagesRef in sync so async workers always see latest page state.
  useEffect(() => { pagesRef.current = pages }, [pages])

  // Keep pdfDocRef in sync for use in async callbacks.
  useEffect(() => { pdfDocRef.current = pdfDoc }, [pdfDoc])

  // Loads pdfPage objects for pages in [startIdx, endIdx] that don't have one yet.
  // Called by the virtual window effect and by PagesPanel scroll pre-loading.
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
  }, [])  // stable — only uses refs

  // Virtual render window: load/unload pdfPage objects around activePage.
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

  return { pages, pagesRef, setPages, loadPagesInRange, loadGenRef }
}
