import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'

const SHORTCUTS = [
  { label: 'a/b',  latex: '\\frac{#?}{#?}',              title: 'Fraction (÷)' },
  { label: 'x²',   latex: '^{#?}',                        title: 'Superscript / Exponent' },
  { label: 'xₙ',   latex: '_{#?}',                        title: 'Subscript' },
  { label: '√',    latex: '\\sqrt{#?}',                   title: 'Square root' },
  { label: 'ⁿ√',   latex: '\\sqrt[#?]{#?}',              title: 'nth root' },
  { label: 'Σ',    latex: '\\sum_{#?}^{#?}',              title: 'Summation' },
  { label: '∫',    latex: '\\int_{#?}^{#?}',              title: 'Integral' },
  { label: 'Π',    latex: '\\prod_{#?}^{#?}',             title: 'Product' },
  { label: 'lim',  latex: '\\lim_{#? \\to #?}',           title: 'Limit' },
  { label: '|x|',  latex: '\\left|#?\\right|',            title: 'Absolute value' },
  { label: '(  )', latex: '\\left(#?\\right)',             title: 'Parentheses' },
  { label: '∞',    latex: '\\infty',                      title: 'Infinity' },
  { label: '≤',    latex: '\\leq',                        title: 'Less than or equal' },
  { label: '≥',    latex: '\\geq',                        title: 'Greater than or equal' },
  { label: '±',    latex: '\\pm',                         title: 'Plus-minus' },
]

function computePos(anchorRect) {
  const W = 500
  const H = 270
  const margin = 8
  const vw = window.innerWidth
  const vh = window.innerHeight

  const left = Math.min(Math.max(margin, anchorRect.left), vw - W - margin)
  const spaceBelow = vh - anchorRect.bottom - margin
  const top = spaceBelow >= H
    ? anchorRect.bottom + margin
    : Math.max(margin, anchorRect.top - H - margin)

  return { top, left }
}

// Returns true when the clicked element is part of MathLive's virtual keyboard.
// MathLive appends the keyboard as .ML__keyboard directly to document.body.
function isInsideVirtualKeyboard(target) {
  if (!(target instanceof Element)) return false
  return !!target.closest('.ML__keyboard')
}

export default function MathPopup({ anchorRect, initialLatex, displayMode, onCommit, onCancel }) {
  const mathFieldRef = useRef(null)
  const popupRef = useRef(null)
  const latexRef = useRef(initialLatex)
  const commitRef = useRef(null)
  const [mlReady, setMlReady] = useState(false)

  const pos = computePos(anchorRect)

  const hideVirtualKeyboard = () => {
    try { window.mathVirtualKeyboard?.hide() } catch { /* ignore */ }
  }

  const commit = () => {
    hideVirtualKeyboard()
    onCommit(latexRef.current.trim() || initialLatex)
  }
  const cancel = () => {
    hideVirtualKeyboard()
    onCancel()
  }
  // Keep commitRef current so the document listener (set up once) always calls the latest version
  commitRef.current = commit

  useEffect(() => {
    let mf = null
    const onInput = () => { latexRef.current = mf?.value ?? latexRef.current }

    import('mathlive').then(() => {
      if (!mathFieldRef.current) return
      mf = mathFieldRef.current
      mf.value = latexRef.current
      // mathVirtualKeyboardPolicy is the correct 0.109.x property name.
      // Setting to 'sandboxed' prevents the keyboard from appearing unless inside
      // an iframe — effectively disabling it on a regular page.
      try { mf.mathVirtualKeyboardPolicy = 'sandboxed' } catch { /* pre-0.100 fallback */ }
      try { mf.setAttribute('virtual-keyboard-mode', 'off') } catch { /* ignored */ }
      mf.focus()
      setMlReady(true)
      mf.addEventListener('input', onInput)
    })

    return () => mf?.removeEventListener('input', onInput)
  }, [])

  // Click-outside-to-commit via document listener instead of a blocking backdrop.
  // This lets MathLive's virtual keyboard (which renders outside the popup in
  // document.body at a lower z-index) receive its own clicks without triggering
  // a premature commit.
  useEffect(() => {
    const onPointerDown = (e) => {
      // Inside popup — let it handle its own events
      if (popupRef.current?.contains(e.target)) return
      // Inside MathLive virtual keyboard — allow keyboard interaction
      if (isInsideVirtualKeyboard(e.target)) return
      commitRef.current()
    }

    // Delay 200 ms so the pointerdown that OPENED the popup doesn't immediately
    // close it (the opening click fires before this effect runs, but scheduling
    // ensures it's all flushed first).
    const id = setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown)
    }, 200)

    return () => {
      clearTimeout(id)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); cancel() }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.stopPropagation(); commit() }
  }

  const insertSnippet = (latex) => {
    const mf = mathFieldRef.current
    if (!mf) return
    mf.insert(latex, { selectionMode: 'placeholder', feedback: true, focus: true })
  }

  return createPortal(
    <>
      {/* Cosmetic backdrop — pointer-events: none so the virtual keyboard
          (and anything else behind the popup) can receive its own clicks. */}
      <div className="fixed inset-0 z-[9998] bg-black/5 pointer-events-none" />

      <div
        ref={popupRef}
        role="dialog"
        aria-modal="true"
        aria-label="Formula editor"
        style={{ top: pos.top, left: pos.left, width: 500, maxWidth: 'calc(100vw - 16px)' }}
        className="fixed z-[9999] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4"
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {displayMode ? 'Block formula' : 'Inline formula'}
          </span>
          <span className="text-[10px] text-gray-400">
            <kbd className="font-mono">/</kbd> fraction ·{' '}
            <kbd className="font-mono">^</kbd> power ·{' '}
            <kbd className="font-mono">_</kbd> subscript ·{' '}
            <kbd className="font-mono">Ctrl+Enter</kbd> confirm
          </span>
        </div>

        {/* Shortcut bar */}
        <div className="flex flex-wrap gap-0.5 px-1.5 py-1 bg-gray-50 rounded-lg mb-3 border border-gray-100">
          {SHORTCUTS.map((s) => (
            <button
              key={s.label}
              type="button"
              title={s.title}
              className="px-2 py-0.5 text-[15px] rounded hover:bg-white hover:shadow-sm active:bg-gray-100 transition-all font-serif leading-snug select-none"
              onMouseDown={(e) => {
                // prevent the math-field from blurring before insert runs
                e.preventDefault()
                insertSnippet(s.latex)
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* MathLive structured editor */}
        <math-field
          ref={mathFieldRef}
          class={[
            'w-full block border rounded-lg px-3 py-2 outline-none transition-opacity',
            mlReady ? 'opacity-100 border-blue-300' : 'opacity-0 border-gray-200',
          ].join(' ')}
          style={{
            fontSize: displayMode ? '1.25rem' : '1rem',
            minHeight: displayMode ? 64 : 50,
          }}
        />

        {/* Actions */}
        <div className="flex items-center justify-between mt-3">
          <span className="text-[10px] text-gray-400">
            Tab between placeholders · Shift+Tab back
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              onClick={cancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              onClick={commit}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
