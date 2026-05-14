import { NodeViewWrapper } from '@tiptap/react'
import { createBlockExtension } from './createBlockExtension'
import { useState } from 'react'
import katex from 'katex'
import BlockMenu from '../BlockMenu'
import MathPopup from '../MathPopup'
import { BlockAnnotation } from '../LayoutBlocksContext.jsx'

function MathBlockView({ node, updateAttributes, selected, editor, getPos, deleteNode }) {
  const [hovered, setHovered] = useState(false)
  const [popupAnchor, setPopupAnchor] = useState(null)

  const openPopup = (e) => setPopupAnchor(e.currentTarget.getBoundingClientRect())

  const handleCommit = (latex) => {
    setPopupAnchor(null)
    if (latex !== node.attrs.latex) updateAttributes({ latex })
  }

  let previewHtml
  try {
    previewHtml = katex.renderToString(node.attrs.latex || '\\square', {
      displayMode: true,
      throwOnError: false,
    })
  } catch {
    previewHtml = `<code>$$${node.attrs.latex}$$</code>`
  }

  return (
    <NodeViewWrapper>
      <div
        className="relative my-4"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <BlockAnnotation sourceBlockIdsStr={node.attrs.sourceBlockIds} />
        {hovered && !popupAnchor && (
          <BlockMenu
            editor={editor}
            getPos={getPos}
            onDelete={() => deleteNode()}
          />
        )}
        <div
          className={`rounded-lg border transition-colors ${
            selected || popupAnchor
              ? 'border-blue-300 bg-blue-50'
              : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
          }`}
        >
          <div
            className="py-3 text-center cursor-pointer select-none"
            onClick={openPopup}
            title="Click to edit formula"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>

        {popupAnchor && (
          <MathPopup
            anchorRect={popupAnchor}
            initialLatex={node.attrs.latex}
            displayMode={true}
            onCommit={handleCommit}
            onCancel={() => setPopupAnchor(null)}
          />
        )}
      </div>
    </NodeViewWrapper>
  )
}

const MathBlock = createBlockExtension({
  name: 'mathBlock',
  nodeTypeName: 'paragraph',
  dataAttr: 'data-math-block',
  extraAttributes: { latex: { default: '' } },
  ViewComponent: MathBlockView,
})

export default MathBlock
