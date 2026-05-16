import { ReactNodeViewRenderer } from '@tiptap/react'

/**
 * Wraps ReactNodeViewRenderer with a guard that returns null when
 * editor.contentComponent is not yet set (during EditorView initialization
 * or HMR remount). Returning null lets ProseMirror fall back to the node's
 * renderHTML instead of trying to use an empty {} object as a nodeView spec,
 * which would crash with "appendChild: parameter 1 is not of type Node".
 */
export function guardedNodeView(Component, options = {}) {
  const renderer = ReactNodeViewRenderer(Component, options)
  return (props) => {
    if (!props.editor.contentComponent) return null
    return renderer(props)
  }
}
