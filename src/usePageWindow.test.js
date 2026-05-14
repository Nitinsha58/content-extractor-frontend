// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePageWindow } from './usePageWindow'

const RENDER_WINDOW = 8
const UNLOAD_BUFFER = 15

function makePages(count) {
  return Array.from({ length: count }, (_, i) => ({ pageNo: i + 1 }))
}

function makeMockPdfDoc() {
  return { getPage: vi.fn(async pageNo => ({ pageNumber: pageNo })) }
}

describe('usePageWindow — initial load', () => {
  it('pages within RENDER_WINDOW get pdfPage populated on mount', async () => {
    const pdfDoc = makeMockPdfDoc()
    const { result } = renderHook(() =>
      usePageWindow({ pdfDoc, activePage: 0, initialPages: makePages(20) })
    )
    await act(async () => {})
    for (let i = 0; i <= RENDER_WINDOW; i++) {
      expect(result.current.pages[i].pdfPage, `page index ${i}`).toBeDefined()
    }
    for (let i = RENDER_WINDOW + 1; i < 20; i++) {
      expect(result.current.pages[i].pdfPage, `page index ${i}`).toBeUndefined()
    }
  })
})

describe('usePageWindow — window advance', () => {
  it('advancing activePage loads new render-window pages', async () => {
    const pdfDoc = makeMockPdfDoc()
    const { result, rerender } = renderHook(
      ({ ap }) => usePageWindow({ pdfDoc, activePage: ap, initialPages: makePages(50) }),
      { initialProps: { ap: 0 } }
    )
    await act(async () => {})
    rerender({ ap: 20 })
    await act(async () => {})
    // new render window = [20 - RENDER_WINDOW, 20 + RENDER_WINDOW] = [12, 28]
    for (let i = 12; i <= 28; i++) {
      expect(result.current.pages[i].pdfPage, `page index ${i}`).toBeDefined()
    }
    // pages outside render window but inside buffer remain unchanged (not loaded)
    for (let i = 29; i <= 20 + UNLOAD_BUFFER; i++) {
      expect(result.current.pages[i].pdfPage, `page index ${i}`).toBeUndefined()
    }
  })
})

describe('usePageWindow — eviction', () => {
  it('pages beyond UNLOAD_BUFFER have pdfPage set to null', async () => {
    const pdfDoc = makeMockPdfDoc()
    const { result, rerender } = renderHook(
      ({ ap }) => usePageWindow({ pdfDoc, activePage: ap, initialPages: makePages(50) }),
      { initialProps: { ap: 0 } }
    )
    await act(async () => {})
    // activePage=0 loads [0, 8]; verify page 0 is loaded before advance
    expect(result.current.pages[0].pdfPage).toBeDefined()

    rerender({ ap: 20 })
    await act(async () => {})
    // unloadStart = 20 - UNLOAD_BUFFER = 5; pages [0, 4] were loaded and are now evicted
    for (let i = 0; i < 5; i++) {
      expect(result.current.pages[i].pdfPage, `page index ${i}`).toBeNull()
    }
    // pages [5, 8]: loaded in initial window, still inside buffer — not evicted
    for (let i = 5; i <= RENDER_WINDOW; i++) {
      expect(result.current.pages[i].pdfPage, `page index ${i}`).toBeDefined()
    }
  })
})

describe('usePageWindow — already-loaded skip', () => {
  it('getPage is not called for a page that already has a pdfPage', async () => {
    const pdfDoc = makeMockPdfDoc()
    const sentinel = { pageNumber: 'sentinel' }
    const initialPages = makePages(20).map((p, i) =>
      i === 0 ? { ...p, pdfPage: sentinel } : p
    )
    const { result } = renderHook(() =>
      usePageWindow({ pdfDoc, activePage: 0, initialPages })
    )
    await act(async () => {})
    // pageNo for index 0 is 1; it should be skipped because pdfPage is already set
    expect(pdfDoc.getPage).not.toHaveBeenCalledWith(1)
    // sentinel value should be preserved — not overwritten
    expect(result.current.pages[0].pdfPage).toBe(sentinel)
  })
})

describe('usePageWindow — generation token', () => {
  it('incrementing loadGenRef while a load is in flight aborts that load', async () => {
    const deferred = []
    const pdfDoc = {
      getPage: vi.fn(() => new Promise(resolve => deferred.push(resolve)))
    }
    const { result } = renderHook(() =>
      usePageWindow({ pdfDoc, activePage: 0, initialPages: makePages(5) })
    )
    // The virtual window effect has fired and loadPagesInRange is suspended at
    // the first await getPage(); deferred holds the pending resolve function(s).
    act(() => { result.current.loadGenRef.current++ })
    await act(async () => { deferred.forEach(resolve => resolve({ pageNumber: 1 })) })
    // After the gen check fails inside loadPagesInRange, setPages is never called.
    for (let i = 0; i < 5; i++) {
      expect(result.current.pages[i].pdfPage, `page index ${i}`).toBeUndefined()
    }
  })
})

describe('usePageWindow — null pdfDoc (image file)', () => {
  it('loadPagesInRange does nothing and does not throw when pdfDoc is null', async () => {
    const { result } = renderHook(() =>
      usePageWindow({ pdfDoc: null, activePage: 0, initialPages: makePages(5) })
    )
    await act(async () => {})
    await act(async () => { await result.current.loadPagesInRange(0, 4) })
    for (let i = 0; i < 5; i++) {
      expect(result.current.pages[i].pdfPage).toBeUndefined()
    }
  })
})

describe('usePageWindow — pagesRef eager mirror', () => {
  it('pagesRef.current reflects loaded pdfPage before the next render cycle', async () => {
    const pdfDoc = makeMockPdfDoc()
    const { result } = renderHook(() =>
      usePageWindow({ pdfDoc, activePage: 0, initialPages: makePages(5) })
    )
    await act(async () => {})
    // loadPagesInRange eagerly sets pagesRef.current[idx] inside the async loop,
    // not just via the pagesRef sync effect after re-render.
    expect(result.current.pagesRef.current[0].pdfPage).toBeDefined()
  })
})

describe('usePageWindow — setPages passthrough', () => {
  it('setPages from outside updates pages state and pagesRef syncs', async () => {
    const pdfDoc = makeMockPdfDoc()
    const { result } = renderHook(() =>
      usePageWindow({ pdfDoc, activePage: 0, initialPages: makePages(3) })
    )
    await act(async () => {})
    act(() => {
      result.current.setPages(prev =>
        prev.map((p, i) => i === 0 ? { ...p, status: 'layout-detected' } : p)
      )
    })
    expect(result.current.pages[0].status).toBe('layout-detected')
    // pagesRef is kept in sync by the useEffect that watches pages
    expect(result.current.pagesRef.current[0].status).toBe('layout-detected')
  })
})
