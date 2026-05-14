import { NodeViewWrapper } from '@tiptap/react'
import { createBlockExtension } from './createBlockExtension'
import { useState } from 'react'
import BlockMenu from '../BlockMenu'
import { BlockAnnotation } from '../LayoutBlocksContext.jsx'

function ErrorBlockView({ node, editor, getPos, deleteNode }) {
  const [hovered, setHovered] = useState(false)
  const label = (node.attrs.label || '').replace(/_/g, ' ')

  return (
    <NodeViewWrapper>
      <div
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <BlockAnnotation sourceBlockIdsStr={node.attrs.sourceBlockIds} />
        <div className="my-3 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 flex items-start gap-3">
          <span className="text-amber-400 mt-0.5 shrink-0 text-base">⚠</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-800 capitalize">
              {label || 'Block'} recognition failed
            </p>
            {node.attrs.message && (
              <p className="text-xs text-amber-500 mt-0.5 break-words">{node.attrs.message}</p>
            )}
          </div>
        </div>
        {hovered && (
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

const ErrorBlock = createBlockExtension({
  name: 'errorBlock',
  nodeTypeName: 'error',
  dataAttr: 'data-error-block',
  extraAttributes: {
    label: { default: '' },
    message: { default: '' },
  },
  ViewComponent: ErrorBlockView,
})

export default ErrorBlock
