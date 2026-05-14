import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper } from '@tiptap/react'
import { guardedNodeView } from './utils'
import { useState } from 'react'
import katex from 'katex'
import MathPopup from '../MathPopup'

function MathInlineView({ node, updateAttributes, selected }) {
  const [popupAnchor, setPopupAnchor] = useState(null)

  const openPopup = (e) => setPopupAnchor(e.currentTarget.getBoundingClientRect())

  const handleCommit = (latex) => {
    setPopupAnchor(null)
    if (latex !== node.attrs.latex) updateAttributes({ latex })
  }

  let html
  try {
    html = katex.renderToString(node.attrs.latex || '\\square', { throwOnError: false })
  } catch {
    html = `<code>$${node.attrs.latex}$</code>`
  }

  return (
    <NodeViewWrapper
      as="span"
      className={`inline cursor-pointer rounded px-0.5 transition-colors ${
        selected || popupAnchor
          ? 'bg-blue-100 ring-1 ring-blue-300'
          : 'hover:bg-yellow-50'
      }`}
      onClick={openPopup}
      title="Click to edit formula"
    >
      <span dangerouslySetInnerHTML={{ __html: html }} />
      {popupAnchor && (
        <MathPopup
          anchorRect={popupAnchor}
          initialLatex={node.attrs.latex}
          displayMode={false}
          onCommit={handleCommit}
          onCancel={() => setPopupAnchor(null)}
        />
      )}
    </NodeViewWrapper>
  )
}

const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return { latex: { default: '' } }
  },

  parseHTML() {
    return [{ tag: 'span[data-math-inline]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-math-inline': '' }, HTMLAttributes)]
  },

  addNodeView() {
    return guardedNodeView(MathInlineView)
  },
})

export default MathInline
