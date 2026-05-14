// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditableNode } from './useEditableNode'

describe('useEditableNode — initial state', () => {
  it('editing is false', () => {
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef: null, onCommit: vi.fn() })
    )
    expect(result.current.editing).toBe(false)
  })

  it('draft equals currentValue', () => {
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef: null, onCommit: vi.fn() })
    )
    expect(result.current.draft).toBe('hello')
  })
})

describe('useEditableNode — start editing', () => {
  it('setEditing(true) sets editing to true', () => {
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef: null, onCommit: vi.fn() })
    )
    act(() => { result.current.setEditing(true) })
    expect(result.current.editing).toBe(true)
  })
})

describe('useEditableNode — commit', () => {
  it('value changed: closes editing, calls onCommit with trimmed draft', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef: null, onCommit })
    )
    act(() => { result.current.setDraft('  new value  ') })
    act(() => { result.current.commit() })
    expect(result.current.editing).toBe(false)
    expect(onCommit).toHaveBeenCalledWith('new value')
  })

  it('value changed: draft stays at trimmed value after commit', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef: null, onCommit })
    )
    act(() => { result.current.setDraft('new value') })
    act(() => { result.current.commit() })
    expect(result.current.draft).toBe('new value')
  })

  it('value unchanged: does not call onCommit', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef: null, onCommit })
    )
    act(() => { result.current.commit() })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('value unchanged: reverts draft to currentValue', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef: null, onCommit })
    )
    act(() => { result.current.commit() })
    expect(result.current.draft).toBe('hello')
  })

  it('value unchanged: closes editing', () => {
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef: null, onCommit: vi.fn() })
    )
    act(() => { result.current.setEditing(true) })
    act(() => { result.current.commit() })
    expect(result.current.editing).toBe(false)
  })

  it('trims whitespace before calling onCommit', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: '', inputRef: null, onCommit })
    )
    act(() => { result.current.setDraft('  x^2  ') })
    act(() => { result.current.commit() })
    expect(onCommit).toHaveBeenCalledWith('x^2')
  })

  it('alwaysCommit: true — calls onCommit even when draft equals currentValue', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef: null, onCommit, alwaysCommit: true })
    )
    act(() => { result.current.commit() })
    expect(onCommit).toHaveBeenCalledWith('hello')
  })

  it('onCommit throws: editing still closes, no unhandled rejection', () => {
    const onCommit = vi.fn(() => { throw new Error('editor destroyed') })
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef: null, onCommit })
    )
    act(() => { result.current.setDraft('changed') })
    expect(() => act(() => { result.current.commit() })).not.toThrow()
    expect(result.current.editing).toBe(false)
  })
})

describe('useEditableNode — cancel', () => {
  it('closes editing', () => {
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef: null, onCommit: vi.fn() })
    )
    act(() => { result.current.setEditing(true) })
    act(() => { result.current.cancel() })
    expect(result.current.editing).toBe(false)
  })

  it('reverts draft to currentValue', () => {
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef: null, onCommit: vi.fn() })
    )
    act(() => { result.current.setDraft('changed') })
    act(() => { result.current.cancel() })
    expect(result.current.draft).toBe('hello')
  })

  it('does not call onCommit', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef: null, onCommit })
    )
    act(() => { result.current.setDraft('changed') })
    act(() => { result.current.cancel() })
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('useEditableNode — external update', () => {
  it('rerender with new currentValue updates draft', () => {
    const { result, rerender } = renderHook(
      ({ cv }) => useEditableNode({ currentValue: cv, inputRef: null, onCommit: vi.fn() }),
      { initialProps: { cv: 'hello' } }
    )
    act(() => { rerender({ cv: 'updated by undo' }) })
    expect(result.current.draft).toBe('updated by undo')
  })
})

describe('useEditableNode — focus effect', () => {
  it('when editing becomes true and inputRef is provided, calls focus and select', () => {
    const inputRef = { current: { focus: vi.fn(), select: vi.fn() } }
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef, onCommit: vi.fn() })
    )
    act(() => { result.current.setEditing(true) })
    expect(inputRef.current.focus).toHaveBeenCalled()
    expect(inputRef.current.select).toHaveBeenCalled()
  })

  it('when inputRef is null, does not throw', () => {
    const { result } = renderHook(() =>
      useEditableNode({ currentValue: 'hello', inputRef: null, onCommit: vi.fn() })
    )
    expect(() => act(() => { result.current.setEditing(true) })).not.toThrow()
  })
})
