import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders a dropdown menu via React portal at document.body using position:fixed,
 * so it is never clipped by overflow:hidden/auto ancestors (scroll containers).
 *
 * Props:
 *   triggerRef  — ref attached to the button that opens this menu
 *   open        — boolean
 *   onClose     — callback to close
 *   children    — menu items
 *   width       — menu width in px (default 160)
 *   estimatedH  — used for flip-up calculation (default 240)
 */
export default function PortalMenu({ triggerRef, open, onClose, children, width = 160, estimatedH = 240 }) {
  const [style, setStyle] = useState({})

  useEffect(() => {
    if (!open || !triggerRef?.current) return

    const r = triggerRef.current.getBoundingClientRect()

    // Vertical: prefer below trigger, flip above if near viewport bottom
    let top = r.bottom + 4
    if (top + estimatedH > window.innerHeight) {
      top = Math.max(8, r.top - estimatedH - 4)
    }

    // Horizontal: right-align to trigger, clamp within viewport
    let left = r.right - width
    left = Math.min(left, window.innerWidth - width - 8)
    left = Math.max(8, left)

    setStyle({ top, left, width })
  }, [open, triggerRef, width, estimatedH])

  if (!open) return null

  return createPortal(
    <>
      {/* Invisible backdrop for click-outside */}
      <div className="fixed inset-0 z-[998]" onClick={onClose} />
      {/* Menu panel */}
      <div
        className="fixed z-[999] bg-gray-800 border border-gray-700 rounded-xl shadow-2xl py-1.5 overflow-hidden"
        style={style}
      >
        {children}
      </div>
    </>,
    document.body
  )
}
