import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Heading } from '@tiptap/extension-heading'
import { Paragraph } from '@tiptap/extension-paragraph'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import Placeholder from '@tiptap/extension-placeholder'
import MathInline from './extensions/MathInline'
import MathBlock from './extensions/MathBlock'
import QuestionBlock from './extensions/QuestionBlock'
import ImagePlaceholder from './extensions/ImagePlaceholder'
import ErrorBlock from './extensions/ErrorBlock'
import { guardedNodeView } from './extensions/utils'
import BlockMenu from './BlockMenu'
import { structuredToTipTap, tipTapToStructured } from './converters'

// ── Paragraph node view with hover menu ───────────────────────────────────────

function ParagraphView({ node, editor, getPos, deleteNode }) {
  const [hovered, setHovered] = useState(false)
  const nodeId = node.attrs.nodeId || undefined
  const sourceBlock = node.attrs.sourceBlockIds?.split(',')[0] || undefined

  return (
    <NodeViewWrapper
      as="div"
      className="relative"
      data-node-id={nodeId}
      data-source-block={sourceBlock}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <NodeViewContent as="p" />
      {hovered && (
        <BlockMenu
          editor={editor}
          getPos={getPos}
          onDelete={() => deleteNode()}
          convertLabel="→H2"
          onConvert={() => {
            const pos = getPos?.()
            if (pos == null) return
            editor.chain().focus(pos + 1).setHeading({ level: 2 }).run()
          }}
        />
      )}
    </NodeViewWrapper>
  )
}

// ── Heading node view with hover menu ─────────────────────────────────────────

function HeadingView({ node, editor, getPos, deleteNode }) {
  const [hovered, setHovered] = useState(false)
  const nodeId = node.attrs.nodeId || undefined
  const sourceBlock = node.attrs.sourceBlockIds?.split(',')[0] || undefined
  const Tag = `h${node.attrs.level || 2}`

  return (
    <NodeViewWrapper
      as="div"
      className="relative"
      data-node-id={nodeId}
      data-source-block={sourceBlock}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <NodeViewContent as={Tag} />
      {hovered && (
        <BlockMenu
          editor={editor}
          getPos={getPos}
          onDelete={() => deleteNode()}
          convertLabel="→P"
          onConvert={() => {
            const pos = getPos?.()
            if (pos == null) return
            editor.chain().focus(pos + 1).setParagraph().run()
          }}
        />
      )}
    </NodeViewWrapper>
  )
}

// ── Extended nodes with meta attrs + node views ────────────────────────────────

const ParagraphWithMeta = Paragraph.extend({
  addAttributes() {
    return {
      nodeId: { default: null, renderHTML: (a) => a.nodeId ? { 'data-node-id': a.nodeId } : {} },
      sourceBlockIds: { default: '', renderHTML: (a) => a.sourceBlockIds ? { 'data-source-block': a.sourceBlockIds.split(',')[0] } : {} },
      nodeType: { default: 'paragraph', renderHTML: () => ({}) },
    }
  },
  addNodeView() {
    return guardedNodeView(ParagraphView)
  },

})

const HeadingWithMeta = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      nodeId: { default: null, renderHTML: (a) => a.nodeId ? { 'data-node-id': a.nodeId } : {} },
      sourceBlockIds: { default: '', renderHTML: (a) => a.sourceBlockIds ? { 'data-source-block': a.sourceBlockIds.split(',')[0] } : {} },
      nodeType: { default: 'section', renderHTML: () => ({}) },
    }
  },
  addNodeView() {
    return guardedNodeView(HeadingView)
  },
})

export default function TipTapEditor({
  structuredContent,
  contentKey,
  onContentChange,
  highlightedNodeId,
}) {
  const originalStructuredRef = useRef(structuredContent)
  useEffect(() => { originalStructuredRef.current = structuredContent }, [structuredContent])

  const onContentChangeRef = useRef(onContentChange)
  useEffect(() => { onContentChangeRef.current = onContentChange }, [onContentChange])

  const [toolbarPos, setToolbarPos] = useState(null)
  const editorWrapperRef = useRef(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        paragraph: false,
        dropcursor: { color: '#3b82f6', width: 2 },
      }),
      ParagraphWithMeta,
      HeadingWithMeta.configure({ levels: [1, 2, 3] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder: 'Start typing…',
        emptyNodeClass: 'is-empty',
      }),
      MathInline,
      MathBlock,
      QuestionBlock,
      ImagePlaceholder,
      ErrorBlock,
    ],
    content: '',
    onUpdate({ editor }) {
      const tipTapJson = editor.getJSON()
      const newStructured = tipTapToStructured(tipTapJson, originalStructuredRef.current)
      onContentChangeRef.current?.(newStructured)
    },
    onSelectionUpdate({ editor }) {
      const { from, to } = editor.state.selection
      if (from === to) { setToolbarPos(null); return }
      const domSel = window.getSelection()
      if (!domSel || domSel.rangeCount === 0) { setToolbarPos(null); return }
      const range = domSel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      if (!rect.width) { setToolbarPos(null); return }
      const wrapper = editorWrapperRef.current
      if (!wrapper) return
      const wRect = wrapper.getBoundingClientRect()
      setToolbarPos({
        top: rect.top - wRect.top - 44,
        left: rect.left - wRect.left + rect.width / 2,
      })
    },
    editorProps: {
      attributes: {
        class: 'tiptap-doc outline-none',
        spellcheck: 'false',
      },
    },
  }, [])

  // Load content when contentKey changes (external updates: API fetch, patchContent).
  useEffect(() => {
    if (!editor || !structuredContent || !contentKey) return
    let active = true
    const id = setTimeout(() => {
      if (!active || !editor || editor.isDestroyed) return
      try {
        const doc = structuredToTipTap(structuredContent)
        editor.commands.setContent(doc, { emitUpdate: false })
      } catch (e) {
        console.error('TipTap setContent failed:', e)
      }
    }, 0)
    return () => { active = false; clearTimeout(id) }
  }, [contentKey, editor])

  // Scroll to highlighted node (canvas click)
  useEffect(() => {
    if (!highlightedNodeId || !editor) return
    const el = editor.view.dom.querySelector(`[data-node-id="${highlightedNodeId}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [highlightedNodeId, editor])

  // Hide toolbar on outside click
  useEffect(() => {
    const hide = () => setToolbarPos(null)
    document.addEventListener('mousedown', hide)
    return () => document.removeEventListener('mousedown', hide)
  }, [])

  if (!editor) return null

  return (
    <>
      <style>{`
        .tiptap-doc { counter-reset: block-num; }
        .tiptap-doc > [data-node-view-wrapper] {
          counter-increment: block-num;
          position: relative;
        }
        .tiptap-doc > [data-node-view-wrapper]::after {
          content: counter(block-num);
          position: absolute;
          top: 4px;
          right: 6px;
          font-size: 9px;
          line-height: 1;
          font-family: monospace;
          color: rgba(156, 163, 175, 0.45);
          pointer-events: none;
          user-select: none;
        }
      `}</style>
    <div ref={editorWrapperRef} className="relative">
      {/* Floating format toolbar — appears on text selection */}
      {toolbarPos && (
        <div
          className="absolute z-50 pointer-events-auto"
          style={{
            top: Math.max(0, toolbarPos.top),
            left: toolbarPos.left,
            transform: 'translateX(-50%)',
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-0.5 bg-gray-900 text-white rounded-lg shadow-xl px-1 py-1 whitespace-nowrap">
            <FmtBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (⌘B)"><b>B</b></FmtBtn>
            <FmtBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (⌘I)"><i>I</i></FmtBtn>
            <FmtBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (⌘U)"><u>U</u></FmtBtn>
            <Sep />
            <FmtBtn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().setHeading({ level: 1 }).run()} title="Heading 1">H1</FmtBtn>
            <FmtBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().setHeading({ level: 2 }).run()} title="Heading 2">H2</FmtBtn>
            <FmtBtn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().setHeading({ level: 3 }).run()} title="Heading 3">H3</FmtBtn>
            <FmtBtn active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()} title="Paragraph">P</FmtBtn>
            <Sep />
            <FmtBtn title="Insert inline formula" onClick={() => {
              editor.chain().focus().insertContent({ type: 'mathInline', attrs: { latex: 'x' } }).run()
              setToolbarPos(null)
            }}><span className="font-mono">∑</span></FmtBtn>
          </div>
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
    </>
  )
}

function FmtBtn({ onClick, active, title, children }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`px-2 py-0.5 rounded text-sm font-medium transition-colors min-w-6 text-center ${
        active ? 'bg-white text-gray-900' : 'text-gray-200 hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <div className="w-px h-4 bg-gray-600 mx-0.5 shrink-0" />
}
