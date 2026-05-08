import { useEffect, useRef, useState } from 'react'
import katex from 'katex'

export default function FormulaEditor({ value = '', display = false, onChange, readOnly = false }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const mathFieldRef = useRef(null)
  const containerRef = useRef(null)

  // Sync draft when value changes from outside
  useEffect(() => { setDraft(value) }, [value])

  // When entering edit mode, import MathLive and mount math-field
  useEffect(() => {
    if (!editing) return
    let cancelled = false

    import('mathlive').then(() => {
      if (cancelled || !mathFieldRef.current) return
      const mf = mathFieldRef.current
      mf.value = draft
      mf.focus()

      const handleInput = () => setDraft(mf.value)
      mf.addEventListener('input', handleInput)
      return () => mf.removeEventListener('input', handleInput)
    })

    return () => { cancelled = true }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    setEditing(false)
    if (draft !== value) onChange?.(draft)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setDraft(value); setEditing(false) }
  }

  const renderedHtml = (() => {
    try {
      return katex.renderToString(value, { displayMode: display, throwOnError: false })
    } catch {
      return `<code>$${value}$</code>`
    }
  })()

  if (editing) {
    return (
      <span ref={containerRef} onBlur={commit} onKeyDown={handleKeyDown}>
        {/* @ts-ignore — math-field is a custom element from mathlive */}
        <math-field
          ref={mathFieldRef}
          style={{ fontSize: 'inherit', minWidth: 60, display: display ? 'block' : 'inline-block' }}
          class="border border-blue-400 rounded px-1"
        />
      </span>
    )
  }

  const cls = display
    ? 'text-center my-2 cursor-pointer hover:bg-yellow-50 rounded px-1'
    : 'cursor-pointer hover:bg-yellow-50 rounded px-0.5 inline'

  return (
    <span
      className={cls}
      onClick={() => { if (!readOnly) setEditing(true) }}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  )
}
