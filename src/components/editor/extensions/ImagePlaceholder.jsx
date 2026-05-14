import { NodeViewWrapper } from '@tiptap/react'
import { createBlockExtension } from './createBlockExtension'
import { useRef, useState } from 'react'
import BlockMenu from '../BlockMenu'
import { BlockAnnotation } from '../LayoutBlocksContext.jsx'

function ImagePlaceholderView({ node, updateAttributes, selected, editor, getPos, deleteNode }) {
  const [editingAlt, setEditingAlt] = useState(false)
  const [hovered, setHovered] = useState(false)
  const altRef = useRef(null)

  const handleAltBlur = () => {
    setEditingAlt(false)
    const newAlt = altRef.current?.innerText ?? node.attrs.alt
    if (newAlt !== node.attrs.alt) {
      try { updateAttributes({ alt: newAlt }) } catch { /* editor destroyed during navigation */ }
    }
  }

  return (
    <NodeViewWrapper>
      <div
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <BlockAnnotation sourceBlockIdsStr={node.attrs.sourceBlockIds} />
        <div
          className={`my-4 rounded-lg border transition-colors ${
            selected ? 'border-blue-300' : 'border-transparent'
          }`}
        >
          {node.attrs.url ? (
            <img
              src={node.attrs.url}
              alt={node.attrs.alt}
              className="max-w-full h-auto block mx-auto rounded"
            />
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-sm text-gray-400">
              Figure (image unavailable)
            </div>
          )}
          <div className="text-center mt-1 text-xs text-gray-500">
            {editingAlt ? (
              <span
                ref={altRef}
                contentEditable
                suppressContentEditableWarning
                onBlur={handleAltBlur}
                className="outline-none border-b border-blue-400 px-1 italic"
              >
                {node.attrs.alt}
              </span>
            ) : (
              <span
                className="italic hover:text-gray-700 cursor-text"
                onDoubleClick={() => setEditingAlt(true)}
              >
                {node.attrs.alt || 'Figure'}
              </span>
            )}
          </div>
        </div>
        {hovered && !editingAlt && (
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

const ImagePlaceholder = createBlockExtension({
  name: 'imagePlaceholder',
  nodeTypeName: 'image',
  dataAttr: 'data-image-placeholder',
  extraAttributes: {
    url: { default: '' },
    alt: { default: '' },
  },
  ViewComponent: ImagePlaceholderView,
})

export default ImagePlaceholder
