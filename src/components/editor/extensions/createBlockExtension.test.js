import { describe, it, expect } from 'vitest'
import { createBlockExtension } from './createBlockExtension'

function MockView() {}

describe('createBlockExtension — with nodeTypeName', () => {
  const ext = createBlockExtension({
    name: 'questionBlock',
    nodeTypeName: 'question',
    dataAttr: 'data-question-block',
    extraAttributes: {
      number: { default: null },
      stem: { default: '[]' },
    },
    ViewComponent: MockView,
  })

  it('sets group to block', () => {
    expect(ext.config.group).toBe('block')
  })

  it('sets atom to true', () => {
    expect(ext.config.atom).toBe(true)
  })

  it('sets name', () => {
    expect(ext.name).toBe('questionBlock')
  })

  it('addAttributes includes shared attrs', () => {
    const attrs = ext.config.addAttributes.call({})
    expect(attrs).toHaveProperty('nodeId')
    expect(attrs).toHaveProperty('sourceBlockIds')
    expect(attrs).toHaveProperty('nodeType')
  })

  it('nodeType.renderHTML returns empty object — ProseMirror collision guard', () => {
    const attrs = ext.config.addAttributes.call({})
    expect(attrs.nodeType.renderHTML({ nodeType: 'question' })).toEqual({})
  })

  it('nodeType default equals nodeTypeName', () => {
    const attrs = ext.config.addAttributes.call({})
    expect(attrs.nodeType.default).toBe('question')
  })

  it('addAttributes includes extraAttributes', () => {
    const attrs = ext.config.addAttributes.call({})
    expect(attrs).toHaveProperty('number')
    expect(attrs).toHaveProperty('stem')
  })

  it('parseHTML derived from dataAttr', () => {
    const parse = ext.config.parseHTML.call({})
    expect(parse).toEqual([{ tag: 'div[data-question-block]' }])
  })

  it('renderHTML derived from dataAttr', () => {
    const render = ext.config.renderHTML.call({}, { HTMLAttributes: {} })
    expect(render).toEqual(['div', { 'data-question-block': '' }])
  })

  it('addNodeView returns a function', () => {
    const nodeViewFactory = ext.config.addNodeView.call({})
    expect(typeof nodeViewFactory).toBe('function')
  })

  it('addNodeView result is not the raw ViewComponent — it is wrapped', () => {
    const nodeViewFactory = ext.config.addNodeView.call({})
    expect(nodeViewFactory).not.toBe(MockView)
  })
})

describe('createBlockExtension — without nodeTypeName (MathBlock case)', () => {
  const ext = createBlockExtension({
    name: 'mathBlock',
    dataAttr: 'data-math-block',
    extraAttributes: { latex: { default: '' } },
    ViewComponent: MockView,
  })

  it('addAttributes excludes nodeId', () => {
    const attrs = ext.config.addAttributes.call({})
    expect(attrs).not.toHaveProperty('nodeId')
  })

  it('addAttributes excludes sourceBlockIds', () => {
    const attrs = ext.config.addAttributes.call({})
    expect(attrs).not.toHaveProperty('sourceBlockIds')
  })

  it('addAttributes excludes nodeType', () => {
    const attrs = ext.config.addAttributes.call({})
    expect(attrs).not.toHaveProperty('nodeType')
  })

  it('addAttributes includes extraAttributes', () => {
    const attrs = ext.config.addAttributes.call({})
    expect(attrs).toHaveProperty('latex')
  })

  it('parseHTML derived from dataAttr', () => {
    const parse = ext.config.parseHTML.call({})
    expect(parse).toEqual([{ tag: 'div[data-math-block]' }])
  })

  it('renderHTML derived from dataAttr', () => {
    const render = ext.config.renderHTML.call({}, { HTMLAttributes: {} })
    expect(render).toEqual(['div', { 'data-math-block': '' }])
  })
})

describe('createBlockExtension — extraAttributes conflict with shared attrs', () => {
  const ext = createBlockExtension({
    name: 'testBlock',
    nodeTypeName: 'test',
    dataAttr: 'data-test-block',
    extraAttributes: {
      nodeType: { default: 'OVERRIDE_IGNORED' },
      myAttr: { default: 42 },
    },
    ViewComponent: MockView,
  })

  it('shared nodeType wins over conflicting extraAttribute', () => {
    const attrs = ext.config.addAttributes.call({})
    expect(attrs.nodeType.default).toBe('test')
    expect(attrs.nodeType.renderHTML({ nodeType: 'test' })).toEqual({})
  })

  it('non-conflicting extraAttributes are still included', () => {
    const attrs = ext.config.addAttributes.call({})
    expect(attrs).toHaveProperty('myAttr')
    expect(attrs.myAttr.default).toBe(42)
  })
})
