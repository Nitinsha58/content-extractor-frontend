import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as repo from './DocumentRepository'

function okResponse(body, blobBody) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    blob: vi.fn().mockResolvedValue(blobBody ?? new Blob([JSON.stringify(body)])),
  }
}

function errorResponse(status) {
  return {
    ok: false,
    status,
    json: vi.fn(),
    text: vi.fn().mockResolvedValue(`Error ${status}`),
    blob: vi.fn(),
  }
}

describe('DocumentRepository', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('runLayoutDetection', () => {
    it('POSTs to /api/debug/layout/ with a FormData body containing the image blob and returns parsed JSON', async () => {
      const payload = { session_id: 's1', layout_blocks: [], image_width: 800, image_height: 600 }
      fetch.mockResolvedValue(okResponse(payload))
      const blob = new Blob(['img'], { type: 'image/png' })
      const result = await repo.runLayoutDetection(blob, 'page-1.png')
      expect(result).toEqual(payload)
      expect(fetch).toHaveBeenCalledOnce()
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe('/api/debug/layout/')
      expect(opts.method).toBe('POST')
      expect(opts.body).toBeInstanceOf(FormData)
      expect(opts.body.get('file')).toBeTruthy()
    })
  })

  describe('runOcr', () => {
    it('POSTs to /api/debug/ocr/ with session_id and layout_blocks, returns parsed JSON', async () => {
      const payload = { ocr_blocks: [{ block_id: 'b1' }] }
      fetch.mockResolvedValue(okResponse(payload))
      const result = await repo.runOcr('s1', [{ id: 'b1', label: 'plain_text' }])
      expect(result).toEqual(payload)
      expect(fetch).toHaveBeenCalledOnce()
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe('/api/debug/ocr/')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({
        session_id: 's1',
        layout_blocks: [{ id: 'b1', label: 'plain_text' }],
      })
    })
  })

  describe('exportDocument', () => {
    it('returns a Blob for docx format', async () => {
      const docBlob = new Blob(['binary'])
      fetch.mockResolvedValue(okResponse(null, docBlob))
      const result = await repo.exportDocument('s1', 'docx', [])
      expect(result).toBe(docBlob)
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe('/api/export/')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toMatchObject({ session_id: 's1', format: 'docx' })
    })

    it('POSTs to /api/export/ and returns text for non-docx formats', async () => {
      fetch.mockResolvedValue(okResponse('# Hello'))
      const result = await repo.exportDocument('s1', 'markdown', [{ block_id: 'b1' }])
      expect(result).toBe('# Hello')
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe('/api/export/')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toMatchObject({ session_id: 's1', format: 'markdown' })
    })
  })

  describe('createDocument', () => {
    it('POSTs to /api/documents/ with FormData containing pdf, filename, page_count and returns parsed JSON', async () => {
      const doc = { id: 'doc1', filename: 'test.pdf' }
      fetch.mockResolvedValue(okResponse(doc))
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
      const result = await repo.createDocument(file, 5)
      expect(result).toEqual(doc)
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe('/api/documents/')
      expect(opts.method).toBe('POST')
      expect(opts.body).toBeInstanceOf(FormData)
      expect(opts.body.get('pdf')).toBeTruthy()
      expect(opts.body.get('filename')).toBe('test.pdf')
      expect(opts.body.get('page_count')).toBe('5')
    })
  })

  describe('savePageContent', () => {
    it('POSTs to /api/documents/:docId/pages/:pageNo/ with payload and returns JSON', async () => {
      const saved = { page_number: 2, status: 'layout-detected' }
      fetch.mockResolvedValue(okResponse(saved))
      const result = await repo.savePageContent('doc1', 2, { layout_blocks: [], status: 'layout-detected' })
      expect(result).toEqual(saved)
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe('/api/documents/doc1/pages/2/')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ layout_blocks: [], status: 'layout-detected' })
    })
  })

  describe('getPage', () => {
    it('returns null on 404 without throwing', async () => {
      fetch.mockResolvedValue(errorResponse(404))
      const result = await repo.getPage('doc1', 1)
      expect(result).toBeNull()
      const [url] = fetch.mock.calls[0]
      expect(url).toBe('/api/documents/doc1/pages/1/')
    })

    it('returns parsed JSON on success', async () => {
      const page = { page_number: 1, status: 'ocr-complete', layout_blocks: [] }
      fetch.mockResolvedValue(okResponse(page))
      const result = await repo.getPage('doc1', 1)
      expect(result).toEqual(page)
      const [url] = fetch.mock.calls[0]
      expect(url).toBe('/api/documents/doc1/pages/1/')
    })
  })

  describe('getPageStructure', () => {
    it('POSTs to /api/documents/:docId/pages/:pageNo/structure/ and returns parsed JSON', async () => {
      const structure = { structured_content: { nodes: [] } }
      fetch.mockResolvedValue(okResponse(structure))
      const result = await repo.getPageStructure('doc1', 1)
      expect(result).toEqual(structure)
      const [url, opts] = fetch.mock.calls[0]
      expect(url).toBe('/api/documents/doc1/pages/1/structure/')
      expect(opts.method).toBe('POST')
    })
  })

  describe('error normalisation', () => {
    it('throws a normalised error with the operation name on failure', async () => {
      fetch.mockResolvedValue(errorResponse(500))
      await expect(repo.runLayoutDetection(new Blob(['img']), 'page.png')).rejects.toMatchObject({
        operation: 'runLayoutDetection',
        message: expect.stringContaining('500'),
      })
    })

    it('normalised error includes the original cause error', async () => {
      fetch.mockResolvedValue(errorResponse(503))
      await expect(repo.runOcr('s1', [])).rejects.toMatchObject({
        operation: 'runOcr',
        cause: expect.any(Error),
      })
    })

    it('savePageContent tags the operation field correctly', async () => {
      fetch.mockResolvedValue(errorResponse(422))
      await expect(repo.savePageContent('doc1', 1, {})).rejects.toMatchObject({
        operation: 'savePageContent',
      })
    })
  })

  describe('static URL helpers', () => {
    it('figureCropUrl builds the correct URL', () => {
      expect(repo.figureCropUrl('sess1', [10, 20, 100, 200])).toBe(
        '/api/debug/crop/?session_id=sess1&bbox=10,20,100,200'
      )
    })

    it('sessionImageUrl builds the correct URL', () => {
      expect(repo.sessionImageUrl('sess1')).toBe('/api/debug/session-image/sess1/')
    })
  })
})
