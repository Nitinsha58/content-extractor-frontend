import { describe, it, expect } from 'vitest'
import { computeReadingOrder } from './readingOrder'

function block(id, bbox) {
  return { id, bbox }
}

describe('computeReadingOrder', () => {
  it('returns [] for empty input', () => {
    expect(computeReadingOrder([], 800)).toEqual([])
  })

  it('returns [] for null input', () => {
    expect(computeReadingOrder(null, 800)).toEqual([])
  })

  it('single block gets column_idx 0 and reading_order 0', () => {
    const result = computeReadingOrder([block('a', [0, 10, 400, 50])], 800)
    expect(result).toHaveLength(1)
    expect(result[0].column_idx).toBe(0)
    expect(result[0].reading_order).toBe(0)
  })

  it('full-width blocks (>70% of imageW) get column_idx 0', () => {
    // blockW = 600, imageW = 800 → 600/800 = 75% > 70%
    const result = computeReadingOrder([block('a', [0, 0, 600, 50])], 800)
    expect(result[0].column_idx).toBe(0)
  })

  it('single-column: blocks sorted top-to-bottom by bbox[1]', () => {
    const blocks = [
      block('b', [0, 200, 600, 250]),
      block('a', [0, 50, 600, 100]),
    ]
    const result = computeReadingOrder(blocks, 800)
    expect(result.map(b => b.id)).toEqual(['a', 'b'])
    expect(result.map(b => b.reading_order)).toEqual([0, 1])
  })

  it('two-column: left blocks (centerX <= imageW/2) get column_idx 0', () => {
    // centerX = 150, imageW/2 = 400 → left
    const result = computeReadingOrder([block('a', [0, 0, 300, 50])], 800)
    expect(result[0].column_idx).toBe(0)
  })

  it('two-column: right blocks (centerX > imageW/2) get column_idx 1', () => {
    // centerX = 600, imageW/2 = 400 → right, blockW=200 < 560 (70%)
    const result = computeReadingOrder([block('a', [500, 0, 700, 50])], 800)
    expect(result[0].column_idx).toBe(1)
  })

  it('two-column: all left-column blocks appear before right-column blocks', () => {
    const blocks = [
      block('right', [500, 0, 700, 50]),
      block('left', [0, 100, 300, 150]),
    ]
    const result = computeReadingOrder(blocks, 800)
    expect(result[0].id).toBe('left')
    expect(result[1].id).toBe('right')
  })

  it('mixed: full-width block with lowest bbox[1] appears first', () => {
    const blocks = [
      block('right', [500, 10, 700, 60]),
      block('left', [0, 30, 300, 80]),
      block('full', [0, 0, 700, 40]),
    ]
    const result = computeReadingOrder(blocks, 800)
    expect(result[0].id).toBe('full')
  })

  it('imageW=0: all blocks treated as single-column, sorted by bbox[1]', () => {
    const blocks = [
      block('b', [500, 200, 700, 250]),
      block('a', [0, 50, 300, 100]),
    ]
    const result = computeReadingOrder(blocks, 0)
    expect(result.every(b => b.column_idx === 0)).toBe(true)
    expect(result[0].id).toBe('a')
    expect(result[1].id).toBe('b')
  })

  it('stable sort: identical column_idx and bbox[1] preserves original order', () => {
    const blocks = [
      block('first', [0, 100, 200, 150]),
      block('second', [50, 100, 250, 150]),
    ]
    const result = computeReadingOrder(blocks, 800)
    expect(result[0].id).toBe('first')
    expect(result[1].id).toBe('second')
  })

  it('malformed bbox (null): block placed at column_idx 0 without throwing', () => {
    const blocks = [{ id: 'bad', bbox: null }]
    expect(() => computeReadingOrder(blocks, 800)).not.toThrow()
    const result = computeReadingOrder(blocks, 800)
    expect(result[0].column_idx).toBe(0)
  })

  it('immutability: input array and block objects are not mutated', () => {
    const blocks = [block('a', [0, 0, 300, 50]), block('b', [500, 0, 700, 50])]
    const original = blocks.map(b => ({ ...b, bbox: [...b.bbox] }))
    computeReadingOrder(blocks, 800)
    expect(blocks[0]).toEqual(original[0])
    expect(blocks[1]).toEqual(original[1])
  })

  it('reading_order is 0-based sequential with no gaps', () => {
    const blocks = [
      block('a', [0, 0, 300, 50]),
      block('b', [0, 100, 300, 150]),
      block('c', [500, 0, 700, 50]),
    ]
    const result = computeReadingOrder(blocks, 800)
    expect(result.map(b => b.reading_order)).toEqual([0, 1, 2])
  })
})
