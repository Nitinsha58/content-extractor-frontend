import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { structuredToTipTap, tipTapToStructured } from './converters'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ORIG = { page_id: 'p1' } // minimal originalStructured passed to tipTapToStructured

function structured(...nodes) {
  return { nodes }
}

function tipTapDoc(...nodes) {
  return { content: nodes }
}

// structured node fixtures (fields used by structuredToTipTap: id, type, source_block_ids)
const PARA = { type: 'paragraph', id: 'n1', source_block_ids: ['b1'], content: [{ type: 'text', value: 'Hello' }] }
const SECTION = { type: 'section', id: 'n2', source_block_ids: ['b2'], heading: [{ type: 'text', value: 'Chapter 1' }], level: 1 }
const QUESTION = {
  type: 'question', id: 'n3', source_block_ids: ['b3'], number: 1,
  stem: [{ type: 'text', value: 'What is 2+2?' }],
  options: [{ label: 'A', value: '4' }, { label: 'B', value: '3' }],
}
const IMAGE = { type: 'image', id: 'n4', source_block_ids: ['b4'], url: 'fig.png', alt: 'Figure 1' }
const ERROR = { type: 'error', id: 'n5', source_block_ids: ['b5'], label: 'OCR error', message: 'Failed to parse' }
const TABLE = {
  type: 'table', id: 'n6', source_block_ids: ['b6'],
  cells: [
    [[{ type: 'text', value: 'Header' }]],
    [[{ type: 'text', value: 'Cell' }]],
  ],
}

// TipTap node fixtures (fields used by tipTapToStructured: type, attrs, content)
const TT_HEADING = { type: 'heading', attrs: { level: 1, nodeId: 'n2', sourceBlockIds: 'b2', nodeType: 'section' }, content: [{ type: 'text', text: 'Chapter 1' }] }
const TT_PARA = { type: 'paragraph', attrs: { nodeId: 'n1', sourceBlockIds: 'b1', nodeType: 'paragraph' }, content: [{ type: 'text', text: 'Hello' }] }
const TT_MATHBLOCK = { type: 'mathBlock', attrs: { latex: 'E=mc^2' } }
const TT_QUESTION = { type: 'questionBlock', attrs: { nodeId: 'n3', sourceBlockIds: 'b3', nodeType: 'question', number: 1, stem: '[{"type":"text","value":"Q?"}]', options: '[{"label":"A"}]' } }
const TT_IMAGE = { type: 'imagePlaceholder', attrs: { nodeId: 'n4', sourceBlockIds: 'b4', nodeType: 'image', url: 'fig.png', alt: 'Figure 1' } }
const TT_ERROR = { type: 'errorBlock', attrs: { nodeId: 'n5', sourceBlockIds: 'b5', nodeType: 'error', label: 'OCR error', message: 'Failed to parse' } }
const TT_TABLE = {
  type: 'table',
  attrs: { nodeId: 'n6', sourceBlockIds: 'b6', nodeType: 'table' },
  content: [{
    type: 'tableRow',
    content: [{
      type: 'tableHeader',
      attrs: { colspan: 1, rowspan: 1 },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'H1' }] }],
    }],
  }],
}

describe('converters — unknown type warnings', () => {
  let warnSpy

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  describe('structuredToTipTap', () => {
    it('emits console.warn for unknown node type', () => {
      const doc = { nodes: [{ type: 'chemical', id: 'n1', source_block_ids: [] }] }
      structuredToTipTap(doc)
      expect(warnSpy).toHaveBeenCalledWith('[converters] Unknown node type — skipped:', 'chemical')
    })

    it('warn message includes the unrecognised type string', () => {
      const doc = { nodes: [{ type: 'custom_widget', id: 'n1', source_block_ids: [] }] }
      structuredToTipTap(doc)
      expect(warnSpy).toHaveBeenCalledWith('[converters] Unknown node type — skipped:', 'custom_widget')
    })

    it('does not warn for known type: paragraph', () => {
      const doc = { nodes: [{ type: 'paragraph', id: 'n1', source_block_ids: [], content: [] }] }
      structuredToTipTap(doc)
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('does not warn for known type: section', () => {
      const doc = { nodes: [{ type: 'section', id: 'n1', source_block_ids: [], heading: [], level: 2 }] }
      structuredToTipTap(doc)
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('warns for removed type: question (now treated as unknown)', () => {
      const doc = { nodes: [{ type: 'question', id: 'n1', source_block_ids: [], stem: [], options: [] }] }
      structuredToTipTap(doc)
      expect(warnSpy).toHaveBeenCalledWith('[converters] Unknown node type — skipped:', 'question')
    })

    it('does not warn for known type: table', () => {
      const doc = { nodes: [{ type: 'table', id: 'n1', source_block_ids: [], cells: [] }] }
      structuredToTipTap(doc)
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('does not warn for known type: image', () => {
      const doc = { nodes: [{ type: 'image', id: 'n1', source_block_ids: [], url: '', alt: '' }] }
      structuredToTipTap(doc)
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('does not warn for known type: error', () => {
      const doc = { nodes: [{ type: 'error', id: 'n1', source_block_ids: [], label: '', message: '' }] }
      structuredToTipTap(doc)
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('unknown node is skipped — output has fewer nodes than input', () => {
      const doc = {
        nodes: [
          { type: 'paragraph', id: 'n1', source_block_ids: [], content: [{ type: 'text', value: 'hi' }] },
          { type: 'chemical', id: 'n2', source_block_ids: [] },
        ],
      }
      const result = structuredToTipTap(doc)
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('paragraph')
    })
  })

  describe('tipTapToStructured', () => {
    it('emits console.warn for unknown TipTap node type', () => {
      const tipTapDoc = { content: [{ type: 'customWidget', attrs: {} }] }
      tipTapToStructured(tipTapDoc, { nodes: [] })
      expect(warnSpy).toHaveBeenCalledWith('[converters] Unknown TipTap node type — skipped:', 'customWidget')
    })

    it('warn message includes the unrecognised type string', () => {
      const tipTapDoc = { content: [{ type: 'fancyBlock', attrs: {} }] }
      tipTapToStructured(tipTapDoc, { nodes: [] })
      expect(warnSpy).toHaveBeenCalledWith('[converters] Unknown TipTap node type — skipped:', 'fancyBlock')
    })

    it('does not warn for known type: heading', () => {
      const tipTapDoc = { content: [{ type: 'heading', attrs: { level: 2 }, content: [] }] }
      tipTapToStructured(tipTapDoc, { nodes: [] })
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('does not warn for known type: paragraph', () => {
      const tipTapDoc = { content: [{ type: 'paragraph', attrs: {}, content: [] }] }
      tipTapToStructured(tipTapDoc, { nodes: [] })
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('does not warn for known type: mathBlock', () => {
      const tipTapDoc = { content: [{ type: 'mathBlock', attrs: { latex: 'x^2' } }] }
      tipTapToStructured(tipTapDoc, { nodes: [] })
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('warns for removed type: questionBlock (now treated as unknown)', () => {
      const tipTapDoc = { content: [{ type: 'questionBlock', attrs: { stem: '[]', options: '[]' } }] }
      tipTapToStructured(tipTapDoc, { nodes: [] })
      expect(warnSpy).toHaveBeenCalledWith('[converters] Unknown TipTap node type — skipped:', 'questionBlock')
    })

    it('does not warn for known type: table', () => {
      const tipTapDoc = { content: [{ type: 'table', attrs: {}, content: [] }] }
      tipTapToStructured(tipTapDoc, { nodes: [] })
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('does not warn for known type: imagePlaceholder', () => {
      const tipTapDoc = { content: [{ type: 'imagePlaceholder', attrs: { url: '', alt: '' } }] }
      tipTapToStructured(tipTapDoc, { nodes: [] })
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('does not warn for known type: errorBlock', () => {
      const tipTapDoc = { content: [{ type: 'errorBlock', attrs: { label: '', message: '' } }] }
      tipTapToStructured(tipTapDoc, { nodes: [] })
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('unknown TipTap node is skipped — output has fewer nodes than input', () => {
      const tipTapDoc = {
        content: [
          { type: 'paragraph', attrs: {}, content: [] },
          { type: 'unknownWidget', attrs: {} },
        ],
      }
      const result = tipTapToStructured(tipTapDoc, { nodes: [] })
      expect(result.nodes).toHaveLength(1)
      expect(result.nodes[0].type).toBe('paragraph')
    })
  })
})

// ── structuredToTipTap — per-type conversion ──────────────────────────────────

describe('structuredToTipTap — per-type conversion', () => {
  it('paragraph → TipTap paragraph with text content', () => {
    const result = structuredToTipTap(structured(PARA))
    const node = result.content[0]
    expect(node.type).toBe('paragraph')
    expect(node.attrs.nodeId).toBe('n1')
    expect(node.attrs.nodeType).toBe('paragraph')
    expect(node.content[0]).toEqual({ type: 'text', text: 'Hello' })
  })

  it('paragraph with inline math (display: false) → TipTap paragraph with mathInline', () => {
    const node = { type: 'paragraph', id: 'n1', source_block_ids: [], content: [{ type: 'latex', value: 'x^2', display: false }] }
    const result = structuredToTipTap(structured(node))
    const tipTapNode = result.content[0]
    expect(tipTapNode.type).toBe('paragraph')
    expect(tipTapNode.content[0]).toEqual({ type: 'mathInline', attrs: { latex: 'x^2' } })
  })

  it('paragraph with display math (display: true) → standalone mathBlock node', () => {
    const node = { type: 'paragraph', id: 'n1', source_block_ids: [], content: [{ type: 'latex', value: 'E=mc^2', display: true }] }
    const result = structuredToTipTap(structured(node))
    expect(result.content[0].type).toBe('mathBlock')
    expect(result.content[0].attrs.latex).toBe('E=mc^2')
  })

  it('section → TipTap heading with correct level and text', () => {
    const result = structuredToTipTap(structured(SECTION))
    const node = result.content[0]
    expect(node.type).toBe('heading')
    expect(node.attrs.level).toBe(1)
    expect(node.attrs.nodeId).toBe('n2')
    expect(node.attrs.nodeType).toBe('section')
    expect(node.content[0]).toEqual({ type: 'text', text: 'Chapter 1' })
  })

  it('question node is skipped — falls back to empty paragraph', () => {
    const result = structuredToTipTap(structured(QUESTION))
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('paragraph')
  })

  it('image → TipTap imagePlaceholder with url and alt attrs', () => {
    const result = structuredToTipTap(structured(IMAGE))
    const node = result.content[0]
    expect(node.type).toBe('imagePlaceholder')
    expect(node.attrs.url).toBe('fig.png')
    expect(node.attrs.alt).toBe('Figure 1')
    expect(node.attrs.nodeId).toBe('n4')
  })

  it('error → TipTap errorBlock with label and message attrs', () => {
    const result = structuredToTipTap(structured(ERROR))
    const node = result.content[0]
    expect(node.type).toBe('errorBlock')
    expect(node.attrs.label).toBe('OCR error')
    expect(node.attrs.message).toBe('Failed to parse')
  })

  it('table → TipTap table with tableRow and header/cell structure', () => {
    const result = structuredToTipTap(structured(TABLE))
    const node = result.content[0]
    expect(node.type).toBe('table')
    expect(node.content[0].type).toBe('tableRow')
    expect(node.content[0].content[0].type).toBe('tableHeader')
    expect(node.content[1].content[0].type).toBe('tableCell')
  })

  it('source_block_ids array is joined to comma-separated string in attrs', () => {
    const node = { type: 'paragraph', id: 'n1', source_block_ids: ['b1', 'b2'], content: [] }
    const result = structuredToTipTap(structured(node))
    expect(result.content[0].attrs.sourceBlockIds).toBe('b1,b2')
  })
})

// ── tipTapToStructured — per-type conversion ──────────────────────────────────

describe('tipTapToStructured — per-type conversion', () => {
  it('heading → structured section with level and heading text', () => {
    const result = tipTapToStructured(tipTapDoc(TT_HEADING), ORIG)
    const node = result.nodes[0]
    expect(node.type).toBe('section')
    expect(node.level).toBe(1)
    expect(node.id).toBe('n2')
    expect(node.source_block_ids).toEqual(['b2'])
    expect(node.heading).toEqual([{ type: 'text', value: 'Chapter 1' }])
  })

  it('paragraph → structured paragraph with text content item', () => {
    const result = tipTapToStructured(tipTapDoc(TT_PARA), ORIG)
    const node = result.nodes[0]
    expect(node.type).toBe('paragraph')
    expect(node.id).toBe('n1')
    expect(node.source_block_ids).toEqual(['b1'])
    expect(node.content[0]).toEqual({ type: 'text', value: 'Hello' })
  })

  it('mathBlock → structured paragraph with display:true latex content item', () => {
    const result = tipTapToStructured(tipTapDoc(TT_MATHBLOCK), ORIG)
    const node = result.nodes[0]
    expect(node.type).toBe('paragraph')
    expect(node.content[0]).toEqual({ type: 'latex', value: 'E=mc^2', display: true })
  })

  it('questionBlock is skipped — no structured node produced', () => {
    const result = tipTapToStructured(tipTapDoc(TT_QUESTION), ORIG)
    expect(result.nodes).toHaveLength(0)
  })

  it('imagePlaceholder → structured image with url and alt', () => {
    const result = tipTapToStructured(tipTapDoc(TT_IMAGE), ORIG)
    const node = result.nodes[0]
    expect(node.type).toBe('image')
    expect(node.url).toBe('fig.png')
    expect(node.alt).toBe('Figure 1')
    expect(node.source_block_ids).toEqual(['b4'])
  })

  it('errorBlock → structured error with label and message', () => {
    const result = tipTapToStructured(tipTapDoc(TT_ERROR), ORIG)
    const node = result.nodes[0]
    expect(node.type).toBe('error')
    expect(node.label).toBe('OCR error')
    expect(node.message).toBe('Failed to parse')
  })

  it('table → structured table with rows, cols, and cells', () => {
    const result = tipTapToStructured(tipTapDoc(TT_TABLE), ORIG)
    const node = result.nodes[0]
    expect(node.type).toBe('table')
    expect(node.rows).toBe(1)
    expect(node.cols).toBe(1)
    expect(node.cells[0][0][0]).toEqual({ type: 'text', value: 'H1' })
  })

  it('comma-separated sourceBlockIds attr is split back to array', () => {
    const n = { type: 'paragraph', attrs: { nodeId: 'n1', sourceBlockIds: 'b1,b2' }, content: [] }
    const result = tipTapToStructured(tipTapDoc(n), ORIG)
    expect(result.nodes[0].source_block_ids).toEqual(['b1', 'b2'])
  })
})

// ── Round-trip tests ──────────────────────────────────────────────────────────

describe('round-trip: structuredToTipTap → tipTapToStructured', () => {
  it('inline math (display: false) survives round-trip with value intact', () => {
    const node = { type: 'paragraph', id: 'n1', source_block_ids: [], content: [{ type: 'latex', value: 'x^2', display: false }] }
    const tipTap = structuredToTipTap(structured(node))
    const result = tipTapToStructured(tipTap, structured(node))
    const item = result.nodes[0].content[0]
    expect(item.type).toBe('latex')
    expect(item.value).toBe('x^2')
    expect(item.display).toBe(false)
  })

  it('display math (display: true) round-trips as paragraph with display:true latex', () => {
    const node = { type: 'paragraph', id: 'n1', source_block_ids: [], content: [{ type: 'latex', value: 'E=mc^2', display: true }] }
    const tipTap = structuredToTipTap(structured(node))
    const result = tipTapToStructured(tipTap, structured(node))
    const item = result.nodes[0].content[0]
    expect(item.type).toBe('latex')
    expect(item.value).toBe('E=mc^2')
    expect(item.display).toBe(true)
  })

  it('table cell content (text) survives round-trip', () => {
    const tipTap = structuredToTipTap(structured(TABLE))
    const result = tipTapToStructured(tipTap, structured(TABLE))
    expect(result.nodes[0].type).toBe('table')
    expect(result.nodes[0].cells[0][0][0]).toEqual({ type: 'text', value: 'Header' })
    expect(result.nodes[0].cells[1][0][0]).toEqual({ type: 'text', value: 'Cell' })
  })

  it('question node round-trip — fallback paragraph passes through unchanged', () => {
    const tipTap = structuredToTipTap(structured(QUESTION))
    const result = tipTapToStructured(tipTap, structured(QUESTION))
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].type).toBe('paragraph')
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('structuredToTipTap: empty content array does not throw', () => {
    const node = { type: 'paragraph', id: 'n1', source_block_ids: [], content: [] }
    expect(() => structuredToTipTap(structured(node))).not.toThrow()
  })

  it('tipTapToStructured: empty content array does not throw', () => {
    const node = { type: 'paragraph', attrs: {}, content: [] }
    expect(() => tipTapToStructured(tipTapDoc(node), ORIG)).not.toThrow()
  })

  it('multi-node document: question is skipped, others produce nodes in correct order', () => {
    const result = structuredToTipTap(structured(SECTION, PARA, QUESTION, IMAGE, ERROR))
    expect(result.content).toHaveLength(4)
    expect(result.content.map(n => n.type)).toEqual([
      'heading', 'paragraph', 'imagePlaceholder', 'errorBlock',
    ])
  })

  it('structuredToTipTap: null/missing nodes returns a default paragraph', () => {
    expect(structuredToTipTap(null)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(structuredToTipTap({ nodes: [] })).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
  })
})
