import SectionNode from './SectionNode'
import ParagraphNode from './ParagraphNode'
import TableNode from './TableNode'
import ImageNode from './ImageNode'

function renderNode(node, { onChange, onSelect, highlightedNodeId }) {
  const isHighlighted = node.id === highlightedNodeId
  const props = {
    node,
    onChange: (updated) => onChange(node.id, updated),
    onSelect: () => onSelect(node.source_block_ids?.[0] ?? null),
    isHighlighted,
  }
  const sourceAttr = (node.source_block_ids || []).reduce((acc, id) => {
    acc['data-source-block'] = id  // use first id for scroll-anchor
    return acc
  }, {})

  let inner = null
  switch (node.type) {
    case 'section':
      inner = (
        <>
          <SectionNode {...props} />
          {(node.children || []).map(child =>
            renderNode(child, { onChange, onSelect, highlightedNodeId })
          )}
        </>
      )
      break
    case 'paragraph': inner = <ParagraphNode {...props} />; break
    case 'table':     inner = <TableNode     {...props} />; break
    case 'image':     inner = <ImageNode     {...props} />; break
    default: return null
  }

  return (
    <div key={node.id} {...sourceAttr}>
      {inner}
    </div>
  )
}

export default function StructuredDocument({
  structuredContent,
  onContentChange,
  highlightedNodeId,
  onSelectBlock,
}) {
  const nodes = structuredContent?.nodes ?? []

  const handleNodeChange = (nodeId, updatedNode) => {
    const updateInList = (list) =>
      list.map(n => {
        if (n.id === nodeId) return updatedNode
        if (n.children) return { ...n, children: updateInList(n.children) }
        return n
      })
    onContentChange({ ...structuredContent, nodes: updateInList(nodes) })
  }

  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        No structured content — run OCR first
      </div>
    )
  }

  return (
    <div className="font-serif text-sm leading-relaxed space-y-2">
      {nodes.map(node =>
        renderNode(node, {
          onChange: handleNodeChange,
          onSelect: onSelectBlock,
          highlightedNodeId,
        })
      )}
    </div>
  )
}
