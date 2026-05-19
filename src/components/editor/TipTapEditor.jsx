import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent, NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { BlockAnnotation } from './LayoutBlocksContext.jsx'
import StarterKit from '@tiptap/starter-kit'
import { Heading } from '@tiptap/extension-heading'
import { Paragraph } from '@tiptap/extension-paragraph'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import Placeholder from '@tiptap/extension-placeholder'
import MathInline from './extensions/MathInline'
import MathBlock from './extensions/MathBlock'
import ImagePlaceholder from './extensions/ImagePlaceholder'
import ErrorBlock from './extensions/ErrorBlock'
import { guardedNodeView } from './extensions/utils'
import BlockMenu, { moveBlock } from './BlockMenu'
import { structuredToTipTap, tipTapToStructured } from './converters'
import { buildClipboardEnvelope } from '../../utils/clipboard'
import { BlockCtxMenuContext } from './BlockCtxMenuContext'

// Build a clipboard envelope for the current text selection.
// For a partial selection within one block, copies only the selected portion.
// For a cross-block selection, copies each whole touched node.
// Returns null when nothing is selected.
function buildSelectionEnvelope(editor) {
  const { from, to } = editor.state.selection
  console.log('[DEBUG-bse] selType:', editor.state.selection.constructor?.name, 'from:', from, 'to:', to)
  if (from === to) return null

  const slice = editor.state.doc.slice(from, to)
  console.log('[DEBUG-bse] childCount:', slice.content.childCount, 'openStart:', slice.openStart, 'openEnd:', slice.openEnd)

  // Single block selected (paragraph, heading, mathBlock): use only the sliced content
  if (slice.content.childCount === 1) {
    const blockNode = slice.content.firstChild
    const typeName = blockNode?.type.name
    console.log('[DEBUG-bse] single-block typeName:', typeName, 'content items:', blockNode?.content?.childCount)
    if (blockNode && (typeName === 'paragraph' || typeName === 'heading' || typeName === 'mathBlock')) {
      const json = blockNode.toJSON()
      console.log('[DEBUG-bse] blockNode.toJSON().content:', JSON.stringify(json.content))
      const structured = tipTapToStructured({ type: 'doc', content: [json] }, {})
      console.log('[DEBUG-bse] structured.nodes[0]:', !!structured.nodes[0], structured.nodes[0]?.content?.length, 'items')
      if (structured.nodes[0]) return buildClipboardEnvelope('block', structured.nodes[0])
    }
  }

  // Multi-block or complex node (table, image): copy each whole touched top-level node
  console.log('[DEBUG-bse] fallthrough to nodesBetween')
  const touched = []
  editor.state.doc.nodesBetween(from, to, (node, _pos, parent) => {
    if (parent?.type.name === 'doc') touched.push(node)
    return true
  })
  if (!touched.length) return null
  const structured = tipTapToStructured({ type: 'doc', content: touched.map(n => n.toJSON()) }, {})
  return touched.length === 1
    ? buildClipboardEnvelope('block', structured.nodes[0] ?? touched[0].toJSON())
    : buildClipboardEnvelope('nodes', structured.nodes)
}

// ── Table node view with hover menu ───────────────────────────────────────────
// contentDOMElementTag:'tbody' ensures ProseMirror's managed element is a valid
// <tbody> nested inside the <table> rendered by NodeViewContent, giving valid HTML.

function TableView({ node, editor, getPos, deleteNode }) {
  const [hovered, setHovered] = useState(false)
  const openCtxMenu = useContext(BlockCtxMenuContext)
  const nodeId = node.attrs.nodeId || undefined
  const sourceBlock = node.attrs.sourceBlockIds?.split(',')[0] || undefined

  const handleContextMenu = (e) => {
    e.preventDefault()
    const selEnvelope = buildSelectionEnvelope(editor)
    const blockJson = tipTapToStructured({ type: 'doc', content: [node.toJSON()] }, {})
    const blockEnvelope = buildClipboardEnvelope('block', blockJson.nodes[0] ?? node.toJSON())
    openCtxMenu?.(e.clientX, e.clientY, [
      { label: '↑ Move up', onClick: () => moveBlock(editor, getPos, 'up') },
      { label: '↓ Move down', onClick: () => moveBlock(editor, getPos, 'down') },
      { separator: true },
      { label: '⎘ Copy block', copyFeedback: true, onClick: () => navigator.clipboard.writeText(JSON.stringify(blockEnvelope, null, 2)) },
      ...(selEnvelope ? [{ label: 'Copy selected', copyFeedback: true, onClick: () => navigator.clipboard.writeText(JSON.stringify(selEnvelope, null, 2)) }] : []),
      { separator: true },
      { label: '✕ Delete', danger: true, onClick: () => deleteNode() },
    ])
  }

  return (
    <NodeViewWrapper
      as="div"
      draggable={true}
      className="relative"
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
      {hovered && (
        <BlockMenu
          editor={editor}
          getPos={getPos}
          onDelete={() => deleteNode()}
          onCopy={() => {
            const structured = tipTapToStructured({ type: 'doc', content: [node.toJSON()] }, {})
            navigator.clipboard.writeText(JSON.stringify(buildClipboardEnvelope('block', structured.nodes[0] ?? node.toJSON()), null, 2))
          }}
        />
      )}
      <NodeViewContent as="table" style={{ whiteSpace: 'normal' }} />
    </NodeViewWrapper>
  )
}

// ── Paragraph node view with hover menu ───────────────────────────────────────

function ParagraphView({ node, editor, getPos, deleteNode }) {
  const [hovered, setHovered] = useState(false)
  const openCtxMenu = useContext(BlockCtxMenuContext)
  const nodeId = node.attrs.nodeId || undefined
  const sourceBlock = node.attrs.sourceBlockIds?.split(',')[0] || undefined

  // Don't show block-level menu for paragraphs that live inside table cells.
  // Rapid mount/unmount of BlockMenu per cell causes layout thrash that makes
  // the whole table shake vertically.
  const insideTable = useMemo(() => {
    const pos = getPos?.()
    if (pos == null || !editor) return false
    try {
      const $pos = editor.state.doc.resolve(pos)
      for (let d = $pos.depth; d >= 0; d--) {
        const t = $pos.node(d).type.name
        if (t === 'tableCell' || t === 'tableHeader') return true
      }
    } catch { /* ignore */ }
    return false
  }, []) // stable: paragraph's table-containment doesn't change without remount

  const handleContextMenu = (e) => {
    if (insideTable) return
    e.preventDefault()
    const selEnvelope = buildSelectionEnvelope(editor)
    const blockJson = tipTapToStructured({ type: 'doc', content: [node.toJSON()] }, {})
    const blockEnvelope = buildClipboardEnvelope('block', blockJson.nodes[0] ?? node.toJSON())
    openCtxMenu?.(e.clientX, e.clientY, [
      { label: '↑ Move up', onClick: () => moveBlock(editor, getPos, 'up') },
      { label: '↓ Move down', onClick: () => moveBlock(editor, getPos, 'down') },
      { separator: true },
      { label: '⎘ Copy block', copyFeedback: true, onClick: () => navigator.clipboard.writeText(JSON.stringify(blockEnvelope, null, 2)) },
      ...(selEnvelope ? [{ label: 'Copy selected', copyFeedback: true, onClick: () => navigator.clipboard.writeText(JSON.stringify(selEnvelope, null, 2)) }] : []),
      { separator: true },
      { label: '→H2', onClick: () => { const pos = getPos?.(); if (pos != null) editor.chain().focus(pos + 1).setHeading({ level: 2 }).run() } },
      { separator: true },
      { label: '✕ Delete', danger: true, onClick: () => deleteNode() },
    ])
  }

  return (
    <NodeViewWrapper
      as="div"
      draggable={!insideTable}
      className="relative"
      data-node-id={nodeId}
      data-source-block={sourceBlock}
      onMouseEnter={() => !insideTable && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={handleContextMenu}
    >
      {!insideTable && (
        <div
          data-drag-handle
          contentEditable={false}
          className={`absolute -left-6 top-0.5 cursor-grab text-base text-gray-400 leading-none select-none transition-opacity ${hovered ? 'opacity-60' : 'opacity-0'}`}
        >
          ⠿
        </div>
      )}
      {!insideTable && <BlockAnnotation sourceBlockIdsStr={node.attrs.sourceBlockIds} />}
      {!insideTable && hovered && (
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
          onCopy={() => {
            const structured = tipTapToStructured({ type: 'doc', content: [node.toJSON()] }, {})
            navigator.clipboard.writeText(JSON.stringify(buildClipboardEnvelope('block', structured.nodes[0] ?? node.toJSON()), null, 2))
          }}
        />
      )}
      <NodeViewContent as="p" />
    </NodeViewWrapper>
  )
}

// ── Heading node view with hover menu ─────────────────────────────────────────

function HeadingView({ node, editor, getPos, deleteNode }) {
  const [hovered, setHovered] = useState(false)
  const openCtxMenu = useContext(BlockCtxMenuContext)
  const nodeId = node.attrs.nodeId || undefined
  const sourceBlock = node.attrs.sourceBlockIds?.split(',')[0] || undefined
  const Tag = `h${node.attrs.level || 2}`

  const handleContextMenu = (e) => {
    e.preventDefault()
    const selEnvelope = buildSelectionEnvelope(editor)
    const blockJson = tipTapToStructured({ type: 'doc', content: [node.toJSON()] }, {})
    const blockEnvelope = buildClipboardEnvelope('block', blockJson.nodes[0] ?? node.toJSON())
    openCtxMenu?.(e.clientX, e.clientY, [
      { label: '↑ Move up', onClick: () => moveBlock(editor, getPos, 'up') },
      { label: '↓ Move down', onClick: () => moveBlock(editor, getPos, 'down') },
      { separator: true },
      { label: '⎘ Copy block', copyFeedback: true, onClick: () => navigator.clipboard.writeText(JSON.stringify(blockEnvelope, null, 2)) },
      ...(selEnvelope ? [{ label: 'Copy selected', copyFeedback: true, onClick: () => navigator.clipboard.writeText(JSON.stringify(selEnvelope, null, 2)) }] : []),
      { separator: true },
      { label: '→P', onClick: () => { const pos = getPos?.(); if (pos != null) editor.chain().focus(pos + 1).setParagraph().run() } },
      { separator: true },
      { label: '✕ Delete', danger: true, onClick: () => deleteNode() },
    ])
  }

  return (
    <NodeViewWrapper
      as="div"
      draggable={true}
      className="relative"
      data-node-id={nodeId}
      data-source-block={sourceBlock}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={handleContextMenu}
    >
      <div
        data-drag-handle
        contentEditable={false}
        className={`absolute -left-6 top-0.5 cursor-grab text-base text-gray-400 leading-none select-none transition-opacity ${hovered ? 'opacity-60' : 'opacity-0'}`}
      >
        ⠿
      </div>
      <BlockAnnotation sourceBlockIdsStr={node.attrs.sourceBlockIds} />
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
          onCopy={() => {
            const structured = tipTapToStructured({ type: 'doc', content: [node.toJSON()] }, {})
            navigator.clipboard.writeText(JSON.stringify(buildClipboardEnvelope('block', structured.nodes[0] ?? node.toJSON()), null, 2))
          }}
        />
      )}
      <NodeViewContent as={Tag} />
    </NodeViewWrapper>
  )
}

// ── Extended nodes with meta attrs + node views ────────────────────────────────

const ParagraphWithMeta = Paragraph.extend({
  draggable: true,
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
  draggable: true,
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

const TableWithMeta = Table.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      nodeId: { default: null, renderHTML: (a) => a.nodeId ? { 'data-node-id': a.nodeId } : {} },
      sourceBlockIds: { default: '', renderHTML: (a) => a.sourceBlockIds ? { 'data-source-block': a.sourceBlockIds.split(',')[0] } : {} },
      nodeType: { default: 'table', renderHTML: () => ({}) },
    }
  },
  addNodeView() {
    return guardedNodeView(TableView, { contentDOMElementTag: 'tbody' })
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
  const [tableToolbarPos, setTableToolbarPos] = useState(null)
  const [ctxMenu, setCtxMenu] = useState(null)
  const editorWrapperRef = useRef(null)
  const editorRef = useRef(null)

  const openCtxMenu = useCallback((x, y, items) => setCtxMenu({ x, y, items }), [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        paragraph: false,
        dropcursor: { color: '#3b82f6', width: 2 },
      }),
      ParagraphWithMeta,
      HeadingWithMeta.configure({ levels: [1, 2, 3] }),
      TableWithMeta.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder: 'Start typing…',
        emptyNodeClass: 'is-empty',
      }),
      MathInline,
      MathBlock,
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
      const inTable = editor.isActive('tableCell') || editor.isActive('tableHeader')

      // Text format toolbar — show on text selection, hide inside tables
      if (from === to || inTable) {
        setToolbarPos(null)
      } else {
        const domSel = window.getSelection()
        if (!domSel || domSel.rangeCount === 0) { setToolbarPos(null) }
        else {
          const range = domSel.getRangeAt(0)
          const rect = range.getBoundingClientRect()
          if (!rect.width) { setToolbarPos(null) }
          else {
            const wrapper = editorWrapperRef.current
            if (wrapper) {
              const wRect = wrapper.getBoundingClientRect()
              setToolbarPos({
                top: rect.top - wRect.top - 44,
                left: rect.left - wRect.left + rect.width / 2,
              })
            }
          }
        }
      }

      // Table toolbar — show above the table when cursor is inside a cell (no selection)
      if (inTable && from === to) {
        try {
          const domPos = editor.view.domAtPos(from)
          let el = domPos.node instanceof Element ? domPos.node : domPos.node.parentElement
          while (el && el.tagName !== 'TABLE') el = el.parentElement
          const wrapper = editorWrapperRef.current
          if (el && wrapper) {
            const tRect = el.getBoundingClientRect()
            const wRect = wrapper.getBoundingClientRect()
            setTableToolbarPos({
              top: tRect.top - wRect.top - 38,
              left: tRect.left - wRect.left,
              width: tRect.width,
            })
            return
          }
        } catch { /* ignore */ }
        setTableToolbarPos(null)
      } else {
        setTableToolbarPos(null)
      }
    },
    editorProps: {
      attributes: {
        class: 'tiptap-doc outline-none',
        spellcheck: 'false',
      },
      handleKeyDown(_view, event) {
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'c') {
          event.preventDefault()
          const ed = editorRef.current
          if (ed) {
            const envelope = buildSelectionEnvelope(ed)
            if (envelope) navigator.clipboard.writeText(JSON.stringify(envelope, null, 2))
          }
          return true
        }
        return false
      },
    },
  }, [])

  // Keep editorRef current so handleKeyDown (defined once) can access the live editor.
  useEffect(() => { editorRef.current = editor }, [editor])

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

  // Hide toolbars on outside click
  useEffect(() => {
    const hide = () => { setToolbarPos(null); setTableToolbarPos(null) }
    document.addEventListener('mousedown', hide)
    return () => document.removeEventListener('mousedown', hide)
  }, [])

  if (!editor) return null

  return (
    <>
    <div ref={editorWrapperRef} className="relative">
      {/* Floating format toolbar — appears on text selection (not when in table) */}
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
            <Sep />
            <CopySelBtn editor={editor} />
          </div>
        </div>
      )}

      {/* Table toolbar — appears above the table when cursor is inside a cell */}
      {tableToolbarPos && (
        <div
          className="absolute z-50 pointer-events-auto overflow-x-auto"
          style={{
            top: Math.max(2, tableToolbarPos.top),
            left: tableToolbarPos.left,
            minWidth: tableToolbarPos.width,
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-0.5 bg-gray-800 text-white rounded-lg shadow-xl px-1 py-1 whitespace-nowrap w-fit">
            <TblBtn onClick={() => editor.chain().focus().addRowBefore().run()} title="Add row above">+row↑</TblBtn>
            <TblBtn onClick={() => editor.chain().focus().addRowAfter().run()} title="Add row below">+row↓</TblBtn>
            <Sep />
            <TblBtn onClick={() => editor.chain().focus().deleteRow().run()} title="Delete current row">−row</TblBtn>
            <Sep />
            <TblBtn onClick={() => editor.chain().focus().addColumnBefore().run()} title="Add column left">+col←</TblBtn>
            <TblBtn onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add column right">+col→</TblBtn>
            <Sep />
            <TblBtn onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete current column">−col</TblBtn>
            <Sep />
            <TblBtn onClick={() => editor.chain().focus().deleteTable().run()} title="Delete entire table" danger>✕ table</TblBtn>
          </div>
        </div>
      )}

      <BlockCtxMenuContext.Provider value={openCtxMenu}>
        <EditorContent editor={editor} />
      </BlockCtxMenuContext.Provider>
    </div>

    {ctxMenu && (
      <BlockContextMenu
        x={ctxMenu.x}
        y={ctxMenu.y}
        items={ctxMenu.items}
        onClose={() => setCtxMenu(null)}
      />
    )}
    </>
  )
}

// ── CopySelBtn ─────────────────────────────────────────────────────────────────
// "Copy" button in the floating selection toolbar. Copies touched nodes as JSON.

function CopySelBtn({ editor }) {
  const [copied, setCopied] = useState(false)
  const handleClick = () => {
    const envelope = buildSelectionEnvelope(editor)
    if (!envelope) return
    navigator.clipboard.writeText(JSON.stringify(envelope, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
      title="Copy selection as JSON (⌘⇧C)"
      className={`px-2 py-0.5 rounded text-sm font-medium transition-colors min-w-6 text-center ${
        copied ? 'bg-green-500 text-white' : 'text-gray-200 hover:bg-gray-700'
      }`}
    >
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

// ── BlockContextMenu ───────────────────────────────────────────────────────────
// Right-click context menu that appears at mouse cursor position.

function BlockContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null)
  const [flashIdx, setFlashIdx] = useState(null)
  const [pos, setPos] = useState({ top: y, left: x })

  // Flip menu if it would overflow the viewport
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom > window.innerHeight ? Math.max(0, y - rect.height) : y,
      left: rect.right > window.innerWidth ? Math.max(0, x - rect.width) : x,
    })
  }, [x, y])

  // Close on outside click or Escape
  useEffect(() => {
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose()
    }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const handleItem = (item, idx) => {
    item.onClick()
    if (item.copyFeedback) {
      setFlashIdx(idx)
      setTimeout(() => { setFlashIdx(null); onClose() }, 700)
    } else {
      onClose()
    }
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[160px] select-none"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="my-1 h-px bg-gray-100" />
        ) : (
          <button
            key={i}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
              item.danger
                ? 'text-red-500 hover:bg-red-50'
                : flashIdx === i
                  ? 'text-green-600 bg-green-50'
                  : 'text-gray-700 hover:bg-gray-50'
            }`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleItem(item, i) }}
          >
            {flashIdx === i && item.copyFeedback ? 'Copied! ✓' : item.label}
          </button>
        )
      )}
    </div>
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

function TblBtn({ onClick, title, danger, children }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors min-w-6 text-center ${
        danger ? 'text-red-300 hover:bg-red-800' : 'text-gray-200 hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )
}
