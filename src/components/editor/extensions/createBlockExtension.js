import { Node, mergeAttributes } from '@tiptap/core'
import { guardedNodeView } from './utils'

export function createBlockExtension({
  name,
  nodeTypeName,
  dataAttr,
  extraAttributes = {},
  ViewComponent,
}) {
  const sharedAttrs = nodeTypeName
    ? {
        nodeId: { default: null },
        sourceBlockIds: { default: '' },
        nodeType: { default: nodeTypeName, renderHTML: () => ({}) },
      }
    : {}

  return Node.create({
    name,
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
      return {
        ...extraAttributes,
        ...sharedAttrs,
      }
    },

    parseHTML() {
      return [{ tag: `div[${dataAttr}]` }]
    },

    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes({ [dataAttr]: '' }, HTMLAttributes)]
    },

    addNodeView() {
      return guardedNodeView(ViewComponent)
    },
  })
}
