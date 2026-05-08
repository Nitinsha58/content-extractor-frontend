import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper } from '@tiptap/react'
import { guardedNodeView } from './utils'
import { useCallback, useEffect, useRef, useState } from 'react'
import katex from 'katex'
import BlockMenu from '../BlockMenu'

function MathBlockView({ node, updateAttributes, selected, editor, getPos, deleteNode }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.attrs.latex)
  const [hovered, setHovered] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => { setDraft(node.attrs.latex) }, [node.attrs.latex])

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [editing])

  const commit = useCallback(() => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== node.attrs.latex) {
      try { updateAttributes({ latex: trimmed }) } catch { /* editor destroyed during navigation */ }
    } else {
      setDraft(node.attrs.latex)
    }
  }, [draft, node.attrs.latex, updateAttributes])

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setDraft(node.attrs.latex); setEditing(false) }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit() }
    e.stopPropagation()
  }

  let previewHtml
  try { previewHtml = katex.renderToString(draft || node.attrs.latex, { displayMode: true, throwOnError: false }) }
  catch { previewHtml = `<code>$$${draft}$$</code>` }

  return (
    <NodeViewWrapper>
      <div
        className="relative my-4"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className={`rounded-lg border transition-colors ${
            selected || editing
              ? 'border-blue-300 bg-blue-50'
              : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
          }`}
        >
          {editing ? (
            <div className="p-3">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={handleKeyDown}
                rows={3}
                className="w-full bg-white border border-blue-300 rounded px-2 py-1 text-sm font-mono outline-none resize-none"
                spellCheck={false}
                placeholder="LaTeX formula…"
              />
              <div
                className="mt-2 text-center pointer-events-none"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
              <p className="text-xs text-gray-400 text-right mt-1">Ctrl+Enter to confirm · Esc to cancel</p>
            </div>
          ) : (
            <div
              className="py-2 text-center cursor-pointer"
              onClick={() => setEditing(true)}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          )}
        </div>
        {hovered && !editing && (
          <BlockMenu
            editor={editor}
            getPos={getPos}
            onDelete={() => deleteNode()}
          />
        )}
      </div>
    </NodeViewWrapper>
  )
}

const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return { latex: { default: '' } }
  },

  parseHTML() {
    return [{ tag: 'div[data-math-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-math-block': '' }, HTMLAttributes)]
  },

  addNodeView() {
    return guardedNodeView(MathBlockView)
  },
})

export default MathBlock
