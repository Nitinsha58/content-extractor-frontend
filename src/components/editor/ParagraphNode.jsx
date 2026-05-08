import { useRef, useState } from 'react'
import FormulaEditor from './FormulaEditor'
import katex from 'katex'

// ── Content ↔ flat-text conversion ───────────────────────────────────────────

function contentToText(content) {
  return content.map(b => {
    if (b.type === 'latex') return b.display ? `$$${b.value}$$` : `$${b.value}$`
    return b.value ?? ''
  }).join(' ').trim()
}

function textToContent(text) {
  if (!text.trim()) return [{ type: 'text', value: '' }]
  const parts = []
  // Split on $$...$$ (display) then $...$ (inline)
  const re = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g
  let lastIndex = 0
  let match
  while ((match = re.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index)
    if (before.trim()) parts.push({ type: 'text', value: before.trim() })
    const raw = match[1]
    const display = raw.startsWith('$$')
    const value = display ? raw.slice(2, -2).trim() : raw.slice(1, -1).trim()
    if (value) parts.push({ type: 'latex', value, display })
    lastIndex = re.lastIndex
  }
  const after = text.slice(lastIndex)
  if (after.trim()) parts.push({ type: 'text', value: after.trim() })
  return parts.length > 0 ? parts : [{ type: 'text', value: text.trim() }]
}

// ── ParagraphNode ─────────────────────────────────────────────────────────────

export default function ParagraphNode({ node, onChange, onSelect, isHighlighted }) {
  const [editing, setEditing] = useState(false)
  const editRef = useRef(null)
  const content = node.content || []

  const editText = contentToText(content)

  const handleBlur = () => {
    setEditing(false)
    const newText = (editRef.current?.innerText ?? editText).trim()
    if (newText !== editText) {
      onChange({ ...node, content: textToContent(newText) })
    }
  }

  const baseCls = `leading-relaxed text-gray-800 rounded px-1 py-0.5 ${
    isHighlighted ? 'ring-2 ring-yellow-400 bg-yellow-50' : 'hover:bg-gray-50'
  }`

  // ── Edit mode: full paragraph as one editable block ──────────────────────
  if (editing) {
    return (
      <p className={baseCls}>
        <span
          ref={editRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          className="outline-none border-b border-blue-400 block w-full whitespace-pre-wrap"
        >
          {editText}
        </span>
      </p>
    )
  }

  // ── Display mode: render text + inline formulas ───────────────────────────
  const hasLatex = content.some(b => b.type === 'latex')
  return (
    <p
      className={`${baseCls} cursor-pointer`}
      onClick={onSelect}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
    >
      {hasLatex ? (
        <InlineDisplay content={content} />
      ) : (
        // Pure text — join with spaces to fix multi-chunk legacy content
        content.map(b => b.value ?? '').join(' ').trim()
      )}
    </p>
  )
}

// ── Inline display: text spans + rendered formulas ────────────────────────────

function InlineDisplay({ content }) {
  return (
    <>
      {content.map((block, i) => {
        const spacer = i > 0 ? ' ' : ''
        if (block.type === 'latex') {
          try {
            const html = katex.renderToString(block.value, {
              displayMode: block.display === true,
              throwOnError: false,
            })
            return block.display
              ? <div key={i} className="text-center my-2" dangerouslySetInnerHTML={{ __html: html }} />
              : <span key={i}>{spacer}<span dangerouslySetInnerHTML={{ __html: html }} /></span>
          } catch {
            return <span key={i}>{spacer}<code className="text-sm bg-gray-100 px-1 rounded">${block.value}$</code></span>
          }
        }
        return <span key={i}>{spacer}{block.value ?? ''}</span>
      })}
    </>
  )
}
