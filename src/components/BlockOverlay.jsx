import { useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'

const COLORS = {
  plain_text:      { border: '#22c55e', bg: 'rgba(34,197,94,0.1)',  label: 'TEXT' },
  title:           { border: '#a855f7', bg: 'rgba(168,85,247,0.1)', label: 'TITLE' },
  isolate_formula: { border: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'FORMULA' },
  table:           { border: '#3b82f6', bg: 'rgba(59,130,246,0.07)', label: 'TABLE' },
  figure:          { border: '#ef4444', bg: 'rgba(239,68,68,0.1)',  label: 'FIGURE' },
}

// Cell type vocab = OCR label vocab (ADR-0003). No separate cell-only names.
const CELL_LABELS = ['plain_text', 'title', 'isolate_formula', 'figure']
const CELL_COLORS = {
  plain_text:      { border: '#22c55e', bg: 'rgba(34,197,94,0.10)',  label: 'TEXT' },
  title:           { border: '#a855f7', bg: 'rgba(168,85,247,0.10)', label: 'TITLE' },
  isolate_formula: { border: '#f59e0b', bg: 'rgba(245,158,11,0.10)', label: 'FML' },
  figure:          { border: '#ef4444', bg: 'rgba(239,68,68,0.10)',  label: 'FIG' },
}

const GRID_LINE_COLOR    = 'rgba(71,85,105,0.55)'
const OUTER_BORDER_COLOR = 'rgba(51,65,85,0.88)'

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
  tatrRunningBlockIds,
  finalizingBlockIds,
  onFinalizeBlock,
  onCellSelect,
}) {
  const maxX = bboxW || imageW / blockScale
  const maxY = bboxH || imageH / blockScale
  const containerRef = useRef(null)
  const [selectedIds, setSelectedIds] = useState(new Set(selectedBlockId ? [selectedBlockId] : []))
  const [dragging, setDragging] = useState(null)
  const [resizing, setResizing] = useState(null)
  const [drawing, setDrawing] = useState(null)
  const [lasso, setLasso] = useState(null)
  const [draggingDivider, setDraggingDivider] = useState(null)
  const [draggingCorner, setDraggingCorner] = useState(null)
  // { blockId, row, col } — selected cell within a finalized table
  const [selectedCell, setSelectedCell] = useState(null)

  useEffect(() => {
    setSelectedIds(prev => {
      if (selectedBlockId && prev.has(selectedBlockId) && prev.size > 1) return prev
      return new Set(selectedBlockId ? [selectedBlockId] : [])
    })
  }, [selectedBlockId])

  // Clear cell selection when the parent block is deselected
  useEffect(() => {
    if (!selectedBlockId) {
      setSelectedCell(null)
      onCellSelect?.(null)
    }
  }, [selectedBlockId, onCellSelect])

  const toImageCoords = (e) => {
    if (!containerRef.current) return { x: 0, y: 0 }
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / zoom / blockScale,
      y: (e.clientY - rect.top) / zoom / blockScale,
    }
  }

  const handleSelectBlock = (blockId, multiSelect = false) => {
    // Selecting a different block clears any cell selection
    setSelectedCell(null)
    onCellSelect?.(null)

    if (multiSelect) {
      const newSelected = new Set(selectedIds)
      if (newSelected.has(blockId)) newSelected.delete(blockId)
      else newSelected.add(blockId)
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

  // ── Cell click — select a cell within a finalized table ───────────────────

  const handleCellClick = (e, block, row, col) => {
    e.stopPropagation()
    // Ensure the parent block is selected
    if (!selectedIds.has(block.id)) {
      setSelectedIds(new Set([block.id]))
      onSelectBlock(block.id)
      onSelectBlocks?.([block.id])
    }
    const ts = block.table_structure
    const cellType = ts?.cell_types?.[row]?.[col] ?? 'plain_text'
    setSelectedCell({ blockId: block.id, row, col })
    onCellSelect?.({ blockId: block.id, row, col, cellType })
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (document.activeElement?.isContentEditable) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault()
        const updated = layoutBlocks.filter(b => !selectedIds.has(b.id))
        onBlocksChange(updated)
        setSelectedIds(new Set())
        setSelectedCell(null)
        onCellSelect?.(null)
        onSelectBlock(null)
        onSelectBlocks?.([])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIds, layoutBlocks, onBlocksChange, onCellSelect])

  // ── Divider interaction (only when NOT finalized) ─────────────────────────

  const handleDividerMouseDown = (e, blockId, axis, dividerIdx) => {
    e.stopPropagation()
    setDraggingDivider({ blockId, axis, dividerIdx })
  }

  const handleDividerDoubleClick = (e, blockId, axis, dividerIdx) => {
    e.stopPropagation()
    const block = layoutBlocks.find(b => b.id === blockId)
    if (!block?.table_structure) return
    const ts = block.table_structure
    const key = axis === 'row' ? 'row_dividers' : 'col_dividers'
    const newDividers = ts[key].filter((_, i) => i !== dividerIdx)
    onBlocksChange(layoutBlocks.map(b =>
      b.id === blockId
        ? { ...b, table_structure: { ...ts, [key]: newDividers, source: 'edited' } }
        : b
    ))
  }

  const handleBlockDoubleClick = (e, block) => {
    if (block.label !== 'table' || !block.table_structure) return
    if (block.table_structure.finalized) return   // no divider editing after finalization
    e.stopPropagation()
    const { x, y } = toImageCoords(e)
    const [bx1, by1, bx2, by2] = block.bbox
    const ts = block.table_structure

    if (!e.shiftKey) {
      const frac = Math.max(0.01, Math.min(0.99, (y - by1) / (by2 - by1)))
      const roundedFrac = Math.round(frac * 10000) / 10000
      const newDividers = [...ts.row_dividers, roundedFrac].sort((a, b) => a - b)
      onBlocksChange(layoutBlocks.map(b =>
        b.id === block.id
          ? { ...b, table_structure: { ...ts, row_dividers: newDividers, source: 'edited' } }
          : b
      ))
    } else {
      const frac = Math.max(0.01, Math.min(0.99, (x - bx1) / (bx2 - bx1)))
      const roundedFrac = Math.round(frac * 10000) / 10000
      const newDividers = [...ts.col_dividers, roundedFrac].sort((a, b) => a - b)
      onBlocksChange(layoutBlocks.map(b =>
        b.id === block.id
          ? { ...b, table_structure: { ...ts, col_dividers: newDividers, source: 'edited' } }
          : b
      ))
    }
  }

  // ── Corner skew drag ──────────────────────────────────────────────────────

  const handleCornerMouseDown = (e, blockId, cornerIdx) => {
    e.stopPropagation()
    const block = layoutBlocks.find(b => b.id === blockId)
    if (!block) return
    const { x, y } = toImageCoords(e)
    const [bx1, by1, bx2, by2] = block.bbox
    const initCorners = block.corners || [[bx1,by1],[bx2,by1],[bx2,by2],[bx1,by2]]
    setDraggingCorner({ blockId, cornerIdx, startMouseX: x, startMouseY: y, startCornerPos: initCorners[cornerIdx], startCorners: initCorners })
  }

  // ── Container mouse handlers ──────────────────────────────────────────────

  const handleContainerMouseDown = (e) => {
    if (e.target !== containerRef.current) return
    const { x, y } = toImageCoords(e)
    if (activeTool === 'select') {
      setLasso({ startX: x, startY: y, currentX: x, currentY: y })
      return
    }
    setDrawing({ startX: x, startY: y, currentX: x, currentY: y })
  }

  const handleContainerMouseMove = (e) => {
    if (draggingCorner) {
      const { x, y } = toImageCoords(e)
      const dx = x - draggingCorner.startMouseX
      const dy = y - draggingCorner.startMouseY
      const newCorners = draggingCorner.startCorners.map((c, i) =>
        i === draggingCorner.cornerIdx
          ? [Math.max(0, Math.min(maxX, draggingCorner.startCornerPos[0] + dx)), Math.max(0, Math.min(maxY, draggingCorner.startCornerPos[1] + dy))]
          : c
      )
      const xs = newCorners.map(c => c[0])
      const ys = newCorners.map(c => c[1])
      const newBbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
      onBlocksChange(layoutBlocks.map(b =>
        b.id === draggingCorner.blockId ? { ...b, bbox: newBbox, corners: newCorners } : b
      ))
      return
    }

    if (draggingDivider) {
      const { x, y } = toImageCoords(e)
      const block = layoutBlocks.find(b => b.id === draggingDivider.blockId)
      if (block?.table_structure && !block.table_structure.finalized) {
        const [bx1, by1, bx2, by2] = block.bbox
        const ts = block.table_structure
        if (draggingDivider.axis === 'row') {
          const frac = Math.max(0.01, Math.min(0.99, (y - by1) / (by2 - by1)))
          const newDividers = [...ts.row_dividers]
          newDividers[draggingDivider.dividerIdx] = Math.round(frac * 10000) / 10000
          onBlocksChange(layoutBlocks.map(b =>
            b.id === draggingDivider.blockId ? { ...b, table_structure: { ...ts, row_dividers: newDividers, source: 'edited' } } : b
          ))
        } else {
          const frac = Math.max(0.01, Math.min(0.99, (x - bx1) / (bx2 - bx1)))
          const newDividers = [...ts.col_dividers]
          newDividers[draggingDivider.dividerIdx] = Math.round(frac * 10000) / 10000
          onBlocksChange(layoutBlocks.map(b =>
            b.id === draggingDivider.blockId ? { ...b, table_structure: { ...ts, col_dividers: newDividers, source: 'edited' } } : b
          ))
        }
      }
      return
    }

    if (dragging) {
      const { x, y } = toImageCoords(e)
      const dx = x - dragging.startMouseX
      const dy = y - dragging.startMouseY
      const updated = layoutBlocks.map(b => {
        if (!selectedIds.has(b.id) || !dragging.startBboxes[b.id]) return b
        const [x1, y1, x2, y2] = dragging.startBboxes[b.id]
        return { ...b, bbox: [Math.max(0, x1 + dx), Math.max(0, y1 + dy), Math.min(maxX, x2 + dx), Math.min(maxY, y2 + dy)] }
      })
      onBlocksChange(updated)
    }

    if (resizing) {
      const { x, y } = toImageCoords(e)
      const dx = x - resizing.startMouseX
      const dy = y - resizing.startMouseY
      let [x1, y1, x2, y2] = resizing.startBbox
      const minSize = 10
      if (resizing.handle === 'nw') { x1 = Math.max(0, x1 + dx); y1 = Math.max(0, y1 + dy) }
      else if (resizing.handle === 'ne') { x2 = Math.min(maxX, x2 + dx); y1 = Math.max(0, y1 + dy) }
      else if (resizing.handle === 'sw') { x1 = Math.max(0, x1 + dx); y2 = Math.min(maxY, y2 + dy) }
      else if (resizing.handle === 'se') { x2 = Math.min(maxX, x2 + dx); y2 = Math.min(maxY, y2 + dy) }
      else if (resizing.handle === 'n') { y1 = Math.max(0, y1 + dy) }
      else if (resizing.handle === 's') { y2 = Math.min(maxY, y2 + dy) }
      else if (resizing.handle === 'e') { x2 = Math.min(maxX, x2 + dx) }
      else if (resizing.handle === 'w') { x1 = Math.max(0, x1 + dx) }
      if (x2 - x1 >= minSize && y2 - y1 >= minSize) {
        onBlocksChange(layoutBlocks.map(b => b.id === resizing.blockId ? { ...b, bbox: [x1, y1, x2, y2] } : b))
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

  const handleContainerMouseUp = () => {
    if (draggingCorner) { setDraggingCorner(null); return }

    if (draggingDivider) {
      const block = layoutBlocks.find(b => b.id === draggingDivider.blockId)
      if (block?.table_structure && !block.table_structure.finalized) {
        const ts = block.table_structure
        onBlocksChange(layoutBlocks.map(b =>
          b.id === draggingDivider.blockId
            ? { ...b, table_structure: { ...ts, row_dividers: [...ts.row_dividers].sort((a, b) => a - b), col_dividers: [...ts.col_dividers].sort((a, b) => a - b) } }
            : b
        ))
      }
      setDraggingDivider(null)
      return
    }

    if (dragging || resizing) { setDragging(null); setResizing(null) }

    if (drawing) {
      const { startX, startY, currentX, currentY } = drawing
      const w = Math.abs(currentX - startX)
      const h = Math.abs(currentY - startY)
      if (w >= 10 && h >= 10) {
        const newBlock = {
          id: uuid(),
          label: TOOL_TO_LABEL[activeTool] || 'plain_text',
          bbox: [Math.min(startX, currentX), Math.min(startY, currentY), Math.max(startX, currentX), Math.max(startY, currentY)],
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
        const lx1 = Math.min(startX, currentX), ly1 = Math.min(startY, currentY)
        const lx2 = Math.max(startX, currentX), ly2 = Math.max(startY, currentY)
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
        setSelectedIds(new Set())
        onSelectBlock(null)
        onSelectBlocks?.([])
      }
      setLasso(null)
    }
  }

  const handleBlockMouseDown = (e, blockId) => {
    e.stopPropagation()
    const multiSelect = e.ctrlKey || e.metaKey
    handleSelectBlock(blockId, multiSelect)
    if (activeTool === 'select') {
      const { x, y } = toImageCoords(e)
      let nextIds
      if (multiSelect) {
        nextIds = new Set(selectedIds)
        if (nextIds.has(blockId)) nextIds.delete(blockId)
        else nextIds.add(blockId)
      } else {
        nextIds = new Set([blockId])
      }
      const startBboxes = {}
      nextIds.forEach(id => {
        const block = layoutBlocks.find(b => b.id === id)
        if (block) startBboxes[id] = [...block.bbox]
      })
      setDragging({ blockId, startMouseX: x, startMouseY: y, startBboxes })
    }
  }

  const handleResizeMouseDown = (e, blockId, handle) => {
    e.stopPropagation()
    const { x, y } = toImageCoords(e)
    const block = layoutBlocks.find(b => b.id === blockId)
    if (block) setResizing({ blockId, handle, startMouseX: x, startMouseY: y, startBbox: [...block.bbox] })
  }

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
        style={{ position: 'absolute', width: '10px', height: '10px', background: 'white', border: `2px solid ${color}`, borderRadius: '2px', ...positions[handle] }}
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
        setDragging(null); setResizing(null); setLasso(null)
        setDraggingDivider(null); setDraggingCorner(null)
      }}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor }}
    >
      {layoutBlocks.map((block) => {
        const [x1, y1, x2, y2] = block.bbox
        const scale = blockScale * zoom
        const w = (x2 - x1) * scale
        const h = (y2 - y1) * scale
        const color = COLORS[block.label] || COLORS.plain_text
        const isSelected = selectedIds.has(block.id)
        const ts = block.table_structure
        const hasGrid = block.label === 'table' && !!ts
        const finalized = hasGrid && ts.finalized === true
        const isBeingFinalized = finalizingBlockIds?.has(block.id)

        return (
          <div
            key={block.id}
            style={{ position: 'absolute', left: `${x1 * scale}px`, top: `${y1 * scale}px`, width: `${w}px`, height: `${h}px` }}
          >
            {/* Block box */}
            <div
              onMouseDown={(e) => handleBlockMouseDown(e, block.id)}
              onDoubleClick={hasGrid && !finalized ? (e) => handleBlockDoubleClick(e, block) : undefined}
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                border: isSelected ? `2px solid ${color.border}` : hasGrid ? `1px solid rgba(51,65,85,0.65)` : `1px dashed ${color.border}`,
                background: hasGrid ? 'rgba(219,234,254,0.04)' : color.bg,
                cursor: activeTool === 'select' ? 'grab' : 'default',
                transition: 'border 0.1s',
                boxSizing: 'border-box',
                overflow: 'hidden',
                borderRadius: hasGrid ? '2px' : '0',
              }}
            >
              {/* Reading order badge */}
              <div style={{ position: 'absolute', bottom: '2px', right: '2px', fontSize: '9px', background: color.border, color: 'white', padding: '1px 3px', borderRadius: '2px', pointerEvents: 'none', zIndex: 1 }}>
                {block.reading_order}
              </div>

              {/* TATR / Finalize loading spinner */}
              {(tatrRunningBlockIds?.has(block.id) || isBeingFinalized) && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, pointerEvents: 'none' }}>
                  <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                </div>
              )}

              {/* ── Finalized table: div-per-cell rendering ──────────────────── */}
              {finalized && (() => {
                const rowFracs = [0, ...(ts.row_dividers || []), 1]
                const colFracs = [0, ...(ts.col_dividers || []), 1]
                return rowFracs.slice(0, -1).map((rf1, r) =>
                  colFracs.slice(0, -1).map((cf1, c) => {
                    const rf2 = rowFracs[r + 1]
                    const cf2 = colFracs[c + 1]
                    const cellType = ts.cell_types?.[r]?.[c] ?? 'plain_text'
                    const cc = CELL_COLORS[cellType] ?? CELL_COLORS.plain_text
                    const isCellSelected = selectedCell?.blockId === block.id && selectedCell?.row === r && selectedCell?.col === c
                    return (
                      <div
                        key={`cell-${r}-${c}`}
                        onClick={(e) => handleCellClick(e, block, r, c)}
                        style={{
                          position: 'absolute',
                          left: `${cf1 * 100}%`,
                          top: `${rf1 * 100}%`,
                          width: `${(cf2 - cf1) * 100}%`,
                          height: `${(rf2 - rf1) * 100}%`,
                          boxSizing: 'border-box',
                          border: isCellSelected ? `2px solid ${cc.border}` : `1px solid ${cc.border}`,
                          background: cc.bg,
                          cursor: 'pointer',
                          zIndex: isCellSelected ? 2 : 1,
                        }}
                      >
                        {/* Cell type label */}
                        <div style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 7, color: cc.border, fontFamily: 'system-ui,sans-serif', fontWeight: 700, letterSpacing: '0.2px', pointerEvents: 'none', lineHeight: 1 }}>
                          {cc.label}
                        </div>
                      </div>
                    )
                  })
                )
              })()}

              {/* ── Non-finalized table: SVG divider lines ────────────────────── */}
              {hasGrid && !finalized && (() => {
                const rowFracs = [0, ...(ts.row_dividers || []), 1]
                const colFracs = [0, ...(ts.col_dividers || []), 1]
                const blockCorners = block.corners || null
                const [bx1, by1, bx2, by2] = block.bbox
                const bw = bx2 - bx1, bh = by2 - by1
                const cPct = blockCorners
                  ? blockCorners.map(([cx, cy]) => [(cx - bx1) / bw * 100, (cy - by1) / bh * 100])
                  : [[0, 0], [100, 0], [100, 100], [0, 100]]
                const [TL, TR, BR, BL] = cPct
                const lp = ([ax, ay], [bx, by], f) => [ax + (bx - ax) * f, ay + (by - ay) * f]
                const bi = (rf, cf) => lp(lp(TL, BL, rf), lp(TR, BR, rf), cf)

                return (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible' }}>
                    {/* Neutral cell fills — no type color yet */}
                    {rowFracs.slice(0, -1).map((rf1, r) =>
                      colFracs.slice(0, -1).map((cf1, c) => {
                        const rf2 = rowFracs[r + 1], cf2 = colFracs[c + 1]
                        const pts = [bi(rf1, cf1), bi(rf1, cf2), bi(rf2, cf2), bi(rf2, cf1)]
                        return (
                          <polygon key={`cell-${r}-${c}`} points={pts.map(p => p.join(',')).join(' ')} fill="rgba(219,234,254,0.18)" stroke="rgba(71,85,105,0.4)" strokeWidth="0.5" />
                        )
                      })
                    )}
                    <rect x="0" y="0" width="100" height="100" fill="none" stroke={OUTER_BORDER_COLOR} strokeWidth="1.0" pointerEvents="none" />
                    {blockCorners && (
                      <polygon points={cPct.map(c => c.join(',')).join(' ')} fill="none" stroke={OUTER_BORDER_COLOR} strokeWidth="0.6" strokeDasharray="3 2" pointerEvents="none" />
                    )}
                    {/* Row dividers */}
                    {ts.row_dividers.map((frac, i) => {
                      const [lx1, ly1] = lp(TL, BL, frac)
                      const [lx2, ly2] = lp(TR, BR, frac)
                      return <line key={`rl-${i}`} x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke={GRID_LINE_COLOR} strokeWidth="0.7" pointerEvents="none" />
                    })}
                    {/* Col dividers */}
                    {ts.col_dividers.map((frac, i) => {
                      const [lx1, ly1] = lp(TL, TR, frac)
                      const [lx2, ly2] = lp(BL, BR, frac)
                      return <line key={`cl-${i}`} x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke={GRID_LINE_COLOR} strokeWidth="0.7" pointerEvents="none" />
                    })}
                    {/* Interactive hit areas — only when selected */}
                    {isSelected && (
                      <>
                        {ts.row_dividers.map((frac, i) => {
                          const [lx1, ly1] = lp(TL, BL, frac)
                          const [lx2, ly2] = lp(TR, BR, frac)
                          return <line key={`rh-${i}`} x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="transparent" strokeWidth="6" style={{ cursor: 'ns-resize' }} onMouseDown={(e) => handleDividerMouseDown(e, block.id, 'row', i)} onDoubleClick={(e) => handleDividerDoubleClick(e, block.id, 'row', i)} />
                        })}
                        {ts.col_dividers.map((frac, i) => {
                          const [lx1, ly1] = lp(TL, TR, frac)
                          const [lx2, ly2] = lp(BL, BR, frac)
                          return <line key={`ch-${i}`} x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="transparent" strokeWidth="6" style={{ cursor: 'ew-resize' }} onMouseDown={(e) => handleDividerMouseDown(e, block.id, 'col', i)} onDoubleClick={(e) => handleDividerDoubleClick(e, block.id, 'col', i)} />
                        })}
                        <foreignObject x="1" y="1" width="72" height="7" pointerEvents="none">
                          <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontSize: 5, background: 'rgba(255,255,255,0.88)', color: '#475569', padding: '1px 4px', borderRadius: 2, whiteSpace: 'nowrap', display: 'inline-block', border: '0.5px solid rgba(100,116,139,0.2)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
                            dbl: +row · ⇧dbl: +col · dbl divider: remove
                          </div>
                        </foreignObject>
                      </>
                    )}
                  </svg>
                )
              })()}

              {/* Resize handles */}
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

            {/* ── Finalize button — shown below selected non-finalized table block ── */}
            {isSelected && hasGrid && !finalized && !isBeingFinalized && onFinalizeBlock && (
              <div
                onClick={(e) => { e.stopPropagation(); onFinalizeBlock(block.id) }}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 2,
                  padding: '3px 10px',
                  background: '#1d4ed8',
                  color: 'white',
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: 'system-ui,-apple-system,sans-serif',
                  borderRadius: '0 0 4px 4px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  letterSpacing: '0.3px',
                  zIndex: 10,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                }}
              >
                Finalize
              </div>
            )}

            {/* ── Cell type legend — shown below selected finalized table ── */}
            {isSelected && finalized && (() => {
              const types = [...new Set((ts.cell_types ?? []).flat())].filter(t => CELL_COLORS[t])
              if (types.length === 0) return null
              return (
                <div style={{ position: 'absolute', top: '100%', left: 0, display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '3px 6px', background: 'rgba(255,255,255,0.96)', borderRadius: '0 0 5px 5px', border: '1px solid rgba(100,116,139,0.18)', borderTop: 'none', pointerEvents: 'none', zIndex: 10, boxShadow: '0 2px 6px rgba(0,0,0,0.07)' }}>
                  {types.map(t => (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '9px', color: CELL_COLORS[t].border, fontFamily: 'system-ui,-apple-system,sans-serif', fontWeight: 600, letterSpacing: '0.3px' }}>
                      <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: CELL_COLORS[t].bg, border: `1px solid ${CELL_COLORS[t].border}55`, flexShrink: 0 }} />
                      {CELL_COLORS[t].label}
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )
      })}

      {/* Draw preview */}
      {drawing && (
        <div style={{ position: 'absolute', pointerEvents: 'none', border: '1px dashed #3b82f6', background: 'rgba(59,130,246,0.05)', left: `${Math.min(drawing.startX, drawing.currentX) * blockScale * zoom}px`, top: `${Math.min(drawing.startY, drawing.currentY) * blockScale * zoom}px`, width: `${Math.abs(drawing.currentX - drawing.startX) * blockScale * zoom}px`, height: `${Math.abs(drawing.currentY - drawing.startY) * blockScale * zoom}px` }} />
      )}

      {/* Lasso selection */}
      {lasso && (
        <div style={{ position: 'absolute', pointerEvents: 'none', border: '1px dashed #6366f1', background: 'rgba(99,102,241,0.08)', left: `${Math.min(lasso.startX, lasso.currentX) * blockScale * zoom}px`, top: `${Math.min(lasso.startY, lasso.currentY) * blockScale * zoom}px`, width: `${Math.abs(lasso.currentX - lasso.startX) * blockScale * zoom}px`, height: `${Math.abs(lasso.currentY - lasso.startY) * blockScale * zoom}px` }} />
      )}
    </div>
  )
}
