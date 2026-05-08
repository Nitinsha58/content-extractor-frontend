import { useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'

const COLORS = {
  plain_text:      { border: '#22c55e', bg: 'rgba(34,197,94,0.1)',  label: 'TEXT' },
  title:           { border: '#a855f7', bg: 'rgba(168,85,247,0.1)', label: 'TITLE' },
  isolate_formula: { border: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'FORMULA' },
  table:           { border: '#3b82f6', bg: 'rgba(59,130,246,0.1)', label: 'TABLE' },
  figure:          { border: '#ef4444', bg: 'rgba(239,68,68,0.1)',  label: 'FIGURE' },
}

// Map PagesPanel tool ids to backend label keys (kept in sync with App.jsx labelMap)
const TOOL_TO_LABEL = {
  text: 'plain_text',
  title: 'title',
  formula: 'isolate_formula',
  table: 'table',
  figure: 'figure',
}

export default function BlockOverlay({
  layoutBlocks,
  selectedBlockId,
  activeTool,
  zoom,
  imageW,
  imageH,
  blockScale = 1,
  bboxW,
  bboxH,
  onSelectBlock,
  onSelectBlocks,
  onBlocksChange,
}) {
  // Coordinate bounds for clamping drag/resize. In bbox space (same as block.bbox values).
  const maxX = bboxW || imageW / blockScale
  const maxY = bboxH || imageH / blockScale
  const containerRef = useRef(null)
  const [selectedIds, setSelectedIds] = useState(new Set(selectedBlockId ? [selectedBlockId] : []))
  const [dragging, setDragging] = useState(null)
  const [resizing, setResizing] = useState(null)
  const [drawing, setDrawing] = useState(null)
  const [lasso, setLasso] = useState(null) // rubber-band selection rect

  // Sync external selectedBlockId into local selection state.
  // Skip the sync when the incoming id is already part of a multi-selection —
  // that means WE just called onSelectBlock internally and the parent echoed it
  // back; overwriting would collapse the multi-selection to a single block.
  useEffect(() => {
    setSelectedIds(prev => {
      if (selectedBlockId && prev.has(selectedBlockId) && prev.size > 1) return prev
      return new Set(selectedBlockId ? [selectedBlockId] : [])
    })
  }, [selectedBlockId])

  // Convert viewport coords to image (bbox) coords
  const toImageCoords = (e) => {
    if (!containerRef.current) return { x: 0, y: 0 }
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / zoom / blockScale,
      y: (e.clientY - rect.top) / zoom / blockScale,
    }
  }

  // Handle selection with multi-select support
  const handleSelectBlock = (blockId, multiSelect = false) => {
    if (multiSelect) {
      const newSelected = new Set(selectedIds)
      if (newSelected.has(blockId)) {
        newSelected.delete(blockId)
      } else {
        newSelected.add(blockId)
      }
      setSelectedIds(newSelected)
      const ids = Array.from(newSelected)
      onSelectBlock(ids.length > 0 ? ids[0] : null)
      onSelectBlocks?.(ids)
    } else {
      setSelectedIds(new Set([blockId]))
      onSelectBlock(blockId)
      onSelectBlocks?.([blockId])
    }
  }

  // Delete selected blocks via keyboard
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault()
        const updated = layoutBlocks.filter(b => !selectedIds.has(b.id))
        onBlocksChange(updated)
        setSelectedIds(new Set())
        onSelectBlock(null)
        onSelectBlocks?.([])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIds, layoutBlocks, onBlocksChange])

  // Container mouse down — start lasso (select tool) or start drawing (draw tools)
  const handleContainerMouseDown = (e) => {
    if (e.target !== containerRef.current) return

    const { x, y } = toImageCoords(e)

    if (activeTool === 'select') {
      setLasso({ startX: x, startY: y, currentX: x, currentY: y })
      return
    }

    setDrawing({ startX: x, startY: y, currentX: x, currentY: y })
  }

  // Container mouse move — update drag / resize / draw / lasso
  const handleContainerMouseMove = (e) => {
    if (dragging) {
      const { x, y } = toImageCoords(e)
      const dx = x - dragging.startMouseX
      const dy = y - dragging.startMouseY

      // Batch-update all selected blocks in one onBlocksChange call so every
      // block moves together (sequential calls would each overwrite the others).
      const updated = layoutBlocks.map(b => {
        if (!selectedIds.has(b.id) || !dragging.startBboxes[b.id]) return b
        const [x1, y1, x2, y2] = dragging.startBboxes[b.id]
        return {
          ...b,
          bbox: [
            Math.max(0, x1 + dx),
            Math.max(0, y1 + dy),
            Math.min(maxX, x2 + dx),
            Math.min(maxY, y2 + dy),
          ],
        }
      })
      onBlocksChange(updated)
    }

    if (resizing) {
      const { x, y } = toImageCoords(e)
      const dx = x - resizing.startMouseX
      const dy = y - resizing.startMouseY
      let [x1, y1, x2, y2] = resizing.startBbox
      const minSize = 10

      if (resizing.handle === 'nw') {
        x1 = Math.max(0, x1 + dx)
        y1 = Math.max(0, y1 + dy)
      } else if (resizing.handle === 'ne') {
        x2 = Math.min(maxX, x2 + dx)
        y1 = Math.max(0, y1 + dy)
      } else if (resizing.handle === 'sw') {
        x1 = Math.max(0, x1 + dx)
        y2 = Math.min(maxY, y2 + dy)
      } else if (resizing.handle === 'se') {
        x2 = Math.min(maxX, x2 + dx)
        y2 = Math.min(maxY, y2 + dy)
      } else if (resizing.handle === 'n') {
        y1 = Math.max(0, y1 + dy)
      } else if (resizing.handle === 's') {
        y2 = Math.min(maxY, y2 + dy)
      } else if (resizing.handle === 'e') {
        x2 = Math.min(maxX, x2 + dx)
      } else if (resizing.handle === 'w') {
        x1 = Math.max(0, x1 + dx)
      }

      if (x2 - x1 >= minSize && y2 - y1 >= minSize) {
        const updated = layoutBlocks.map(b =>
          b.id === resizing.blockId ? { ...b, bbox: [x1, y1, x2, y2] } : b
        )
        onBlocksChange(updated)
      }
    }

    if (drawing) {
      const { x, y } = toImageCoords(e)
      setDrawing(prev => ({ ...prev, currentX: x, currentY: y }))
    }

    if (lasso) {
      const { x, y } = toImageCoords(e)
      setLasso(prev => ({ ...prev, currentX: x, currentY: y }))
    }
  }

  // Container mouse up — finalize drag / resize / draw / lasso
  const handleContainerMouseUp = () => {
    if (dragging || resizing) {
      setDragging(null)
      setResizing(null)
    }

    if (drawing) {
      const { startX, startY, currentX, currentY } = drawing
      const minSize = 10
      const w = Math.abs(currentX - startX)
      const h = Math.abs(currentY - startY)

      if (w >= minSize && h >= minSize) {
        const newBlock = {
          id: uuid(),
          label: TOOL_TO_LABEL[activeTool] || 'plain_text',
          bbox: [
            Math.min(startX, currentX),
            Math.min(startY, currentY),
            Math.max(startX, currentX),
            Math.max(startY, currentY),
          ],
          confidence: 1.0,
          reading_order: layoutBlocks.length,
          column_idx: 0,
        }
        onBlocksChange([...layoutBlocks, newBlock])
        setSelectedIds(new Set([newBlock.id]))
        onSelectBlock(newBlock.id)
      }
      setDrawing(null)
    }

    if (lasso) {
      const { startX, startY, currentX, currentY } = lasso
      const w = Math.abs(currentX - startX)
      const h = Math.abs(currentY - startY)

      if (w >= 5 || h >= 5) {
        // Rubber-band: select all blocks whose bbox intersects the lasso rect
        const lx1 = Math.min(startX, currentX)
        const ly1 = Math.min(startY, currentY)
        const lx2 = Math.max(startX, currentX)
        const ly2 = Math.max(startY, currentY)

        const intersecting = layoutBlocks.filter(b => {
          const [bx1, by1, bx2, by2] = b.bbox
          return bx1 < lx2 && bx2 > lx1 && by1 < ly2 && by2 > ly1
        })

        const newSelected = new Set(intersecting.map(b => b.id))
        setSelectedIds(newSelected)
        const ids = Array.from(newSelected)
        onSelectBlock(ids.length > 0 ? ids[0] : null)
        onSelectBlocks?.(ids)
      } else {
        // Click on empty space — deselect all
        setSelectedIds(new Set())
        onSelectBlock(null)
        onSelectBlocks?.([])
      }
      setLasso(null)
    }
  }

  // Block mouse down — select and start drag
  const handleBlockMouseDown = (e, blockId) => {
    e.stopPropagation()
    const multiSelect = e.ctrlKey || e.metaKey
    handleSelectBlock(blockId, multiSelect)

    if (activeTool === 'select') {
      const { x, y } = toImageCoords(e)

      // Compute the next selection synchronously (mirrors handleSelectBlock logic)
      // so startBboxes matches the new selection state, not the stale pre-click state.
      let nextIds
      if (multiSelect) {
        nextIds = new Set(selectedIds)
        if (nextIds.has(blockId)) nextIds.delete(blockId)
        else nextIds.add(blockId)
      } else {
        nextIds = new Set([blockId])
      }

      const startBboxes = {}
      nextIds.forEach((id) => {
        const block = layoutBlocks.find(b => b.id === id)
        if (block) startBboxes[id] = [...block.bbox]
      })

      setDragging({
        blockId,
        startMouseX: x,
        startMouseY: y,
        startBboxes,
      })
    }
  }

  // Resize handle mouse down
  const handleResizeMouseDown = (e, blockId, handle) => {
    e.stopPropagation()
    const { x, y } = toImageCoords(e)
    const block = layoutBlocks.find(b => b.id === blockId)
    if (block) {
      setResizing({
        blockId,
        handle,
        startMouseX: x,
        startMouseY: y,
        startBbox: [...block.bbox],
      })
    }
  }

  // Resize handle component (properly positioned relative to block)
  const ResizeHandle = ({ handle, color, blockId }) => {
    const positions = {
      nw: { top: '-5px', left: '-5px', cursor: 'nwse-resize' },
      ne: { top: '-5px', right: '-5px', cursor: 'nesw-resize' },
      sw: { bottom: '-5px', left: '-5px', cursor: 'nesw-resize' },
      se: { bottom: '-5px', right: '-5px', cursor: 'nwse-resize' },
      n: { top: '-5px', left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' },
      s: { bottom: '-5px', left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' },
      e: { top: '50%', right: '-5px', transform: 'translateY(-50%)', cursor: 'ew-resize' },
      w: { top: '50%', left: '-5px', transform: 'translateY(-50%)', cursor: 'ew-resize' },
    }

    return (
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, blockId, handle)}
        style={{
          position: 'absolute',
          width: '10px',
          height: '10px',
          background: 'white',
          border: `2px solid ${color}`,
          borderRadius: '2px',
          ...positions[handle],
        }}
      />
    )
  }

  const cursor = lasso ? 'crosshair' : activeTool === 'select' ? 'default' : 'crosshair'

  return (
    <div
      ref={containerRef}
      onMouseDown={handleContainerMouseDown}
      onMouseMove={handleContainerMouseMove}
      onMouseUp={handleContainerMouseUp}
      onMouseLeave={() => {
        setDragging(null)
        setResizing(null)
        setLasso(null)
      }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        cursor,
      }}
    >
      {/* Render layout blocks */}
      {layoutBlocks.map((block) => {
        const [x1, y1, x2, y2] = block.bbox
        const scale = blockScale * zoom
        const w = (x2 - x1) * scale
        const h = (y2 - y1) * scale
        const color = COLORS[block.label] || COLORS.plain_text
        const isSelected = selectedIds.has(block.id)

        return (
          <div
            key={block.id}
            style={{
              position: 'absolute',
              left: `${x1 * scale}px`,
              top: `${y1 * scale}px`,
              width: `${w}px`,
              height: `${h}px`,
            }}
          >
            {/* Block box */}
            <div
              onMouseDown={(e) => handleBlockMouseDown(e, block.id)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: isSelected ? `2px solid ${color.border}` : `1px dashed ${color.border}`,
                background: color.bg,
                cursor: activeTool === 'select' ? 'grab' : 'default',
                transition: 'border 0.1s',
                boxSizing: 'border-box',
              }}
            >
              {/* Reading order badge */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '2px',
                  right: '2px',
                  fontSize: '9px',
                  background: color.border,
                  color: 'white',
                  padding: '1px 3px',
                  borderRadius: '2px',
                  pointerEvents: 'none',
                }}
              >
                {block.reading_order}
              </div>

              {/* Resize handles — shown only when selected */}
              {isSelected && (
                <>
                  <ResizeHandle handle="nw" color={color.border} blockId={block.id} />
                  <ResizeHandle handle="ne" color={color.border} blockId={block.id} />
                  <ResizeHandle handle="sw" color={color.border} blockId={block.id} />
                  <ResizeHandle handle="se" color={color.border} blockId={block.id} />
                  <ResizeHandle handle="n" color={color.border} blockId={block.id} />
                  <ResizeHandle handle="s" color={color.border} blockId={block.id} />
                  <ResizeHandle handle="e" color={color.border} blockId={block.id} />
                  <ResizeHandle handle="w" color={color.border} blockId={block.id} />
                </>
              )}
            </div>
          </div>
        )
      })}

      {/* Draw preview rect (draw tools) */}
      {drawing && (
        <div
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            border: '1px dashed #3b82f6',
            background: 'rgba(59,130,246,0.05)',
            left: `${Math.min(drawing.startX, drawing.currentX) * blockScale * zoom}px`,
            top: `${Math.min(drawing.startY, drawing.currentY) * blockScale * zoom}px`,
            width: `${Math.abs(drawing.currentX - drawing.startX) * blockScale * zoom}px`,
            height: `${Math.abs(drawing.currentY - drawing.startY) * blockScale * zoom}px`,
          }}
        />
      )}

      {/* Lasso selection rect (select tool drag) */}
      {lasso && (
        <div
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            border: '1px dashed #6366f1',
            background: 'rgba(99,102,241,0.08)',
            left: `${Math.min(lasso.startX, lasso.currentX) * blockScale * zoom}px`,
            top: `${Math.min(lasso.startY, lasso.currentY) * blockScale * zoom}px`,
            width: `${Math.abs(lasso.currentX - lasso.startX) * blockScale * zoom}px`,
            height: `${Math.abs(lasso.currentY - lasso.startY) * blockScale * zoom}px`,
          }}
        />
      )}
    </div>
  )
}
