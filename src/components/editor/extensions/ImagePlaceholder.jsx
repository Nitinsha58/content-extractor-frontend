import { NodeViewWrapper } from '@tiptap/react'
import { createBlockExtension } from './createBlockExtension'
import { useRef, useState } from 'react'
import BlockMenu from '../BlockMenu'
import { BlockAnnotation } from '../LayoutBlocksContext.jsx'
import { uploadFigureToS3 } from '../../../services/extractorApi'
import { buildClipboardEnvelope } from '../../../utils/clipboard'

function ImagePlaceholderView({ node, updateAttributes, selected, editor, getPos, deleteNode }) {
  const [editingAlt, setEditingAlt] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [uploading, setUploading] = useState(false)
  const altRef = useRef(null)

  const isS3Uploaded = Boolean(node.attrs.s3_url)

  const handleAltBlur = () => {
    setEditingAlt(false)
    const newAlt = altRef.current?.innerText ?? node.attrs.alt
    if (newAlt !== node.attrs.alt) {
      try { updateAttributes({ alt: newAlt }) } catch { /* editor destroyed during navigation */ }
    }
  }

  const handleCopy = async () => {
    // Use cached s3_url if already uploaded
    if (node.attrs.s3_url) {
      navigator.clipboard.writeText(JSON.stringify(buildClipboardEnvelope('block', {
        type: 'image',
        id: node.attrs.nodeId,
        url: node.attrs.s3_url,
        s3_url: node.attrs.s3_url,
        alt: node.attrs.alt,
      }), null, 2))
      return
    }

    if (!node.attrs.url) return

    setUploading(true)
    try {
      const { s3_url } = await uploadFigureToS3(node.attrs.url)
      updateAttributes({ s3_url })
      navigator.clipboard.writeText(JSON.stringify(buildClipboardEnvelope('block', {
        type: 'image',
        id: node.attrs.nodeId,
        url: s3_url,
        s3_url,
        alt: node.attrs.alt,
      }), null, 2))
    } catch (e) {
      console.error('S3 upload failed:', e)
    } finally {
      setUploading(false)
    }
  }

  return (
    <NodeViewWrapper>
      {/* Upload indicator — fixed top-centre of viewport */}
      {uploading && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2 pointer-events-none">
          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
          Uploading to S3…
        </div>
      )}

      <div
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <BlockAnnotation sourceBlockIdsStr={node.attrs.sourceBlockIds} />
        <div
          className={`my-4 rounded-lg border-2 transition-colors ${
            selected
              ? 'border-blue-300'
              : isS3Uploaded
                ? 'border-green-400'
                : 'border-transparent'
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
          <div className="text-center mt-1 text-xs text-gray-500 flex items-center justify-center gap-1.5">
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
            {isS3Uploaded && (
              <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                S3
              </span>
            )}
          </div>
        </div>
        {hovered && !editingAlt && (
          <BlockMenu
            editor={editor}
            getPos={getPos}
            onDelete={() => deleteNode()}
            onCopy={handleCopy}
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
    s3_url: { default: '' },
  },
  ViewComponent: ImagePlaceholderView,
})

export default ImagePlaceholder
