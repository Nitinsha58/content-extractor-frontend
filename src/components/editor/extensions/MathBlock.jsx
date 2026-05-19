import { NodeViewWrapper } from '@tiptap/react'
import { createBlockExtension } from './createBlockExtension'
import { useState, useContext } from 'react'
import katex from 'katex'
import BlockMenu, { moveBlock } from '../BlockMenu'
import MathPopup from '../MathPopup'
import { BlockAnnotation } from '../LayoutBlocksContext.jsx'
import { BlockCtxMenuContext } from '../BlockCtxMenuContext'
import { tipTapToStructured } from '../converters'
import { buildClipboardEnvelope } from '../../../utils/clipboard'

function MathBlockView({ node, updateAttributes, selected, editor, getPos, deleteNode }) {
  const [hovered, setHovered] = useState(false)
  const [popupAnchor, setPopupAnchor] = useState(null)
  const openCtxMenu = useContext(BlockCtxMenuContext)

  const buildEnvelope = () => {
    const blockJson = tipTapToStructured({ type: 'doc', content: [node.toJSON()] }, {})
    return buildClipboardEnvelope('block', blockJson.nodes[0] ?? node.toJSON())
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    openCtxMenu?.(e.clientX, e.clientY, [
      { label: '↑ Move up', onClick: () => moveBlock(editor, getPos, 'up') },
      { label: '↓ Move down', onClick: () => moveBlock(editor, getPos, 'down') },
      { separator: true },
      { label: '⎘ Copy block', copyFeedback: true, onClick: () => navigator.clipboard.writeText(JSON.stringify(buildEnvelope(), null, 2)) },
      { separator: true },
      { label: '✕ Delete', danger: true, onClick: () => deleteNode() },
    ])
  }

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

  const nodeId = node.attrs.nodeId || undefined
  const sourceBlock = node.attrs.sourceBlockIds?.split(',')[0] || undefined

  return (
    <NodeViewWrapper
      as="div"
      draggable={true}
      className="relative my-4"
      data-node-id={nodeId}
      data-source-block={sourceBlock}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={handleContextMenu}
    >
      <div
        data-drag-handle
        contentEditable={false}
        className={`absolute -left-6 top-1 cursor-grab text-base text-gray-400 leading-none select-none transition-opacity ${hovered ? 'opacity-60' : 'opacity-0'}`}
      >
        ⠿
      </div>
      <BlockAnnotation sourceBlockIdsStr={node.attrs.sourceBlockIds} />
      {hovered && !popupAnchor && (
        <BlockMenu
          editor={editor}
          getPos={getPos}
          onDelete={() => deleteNode()}
          onCopy={() => navigator.clipboard.writeText(JSON.stringify(buildEnvelope(), null, 2))}
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
          onDragStart={(e) => e.preventDefault()}
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
