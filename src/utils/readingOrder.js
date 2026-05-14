export function computeReadingOrder(blocks, imageW) {
  if (!blocks?.length) return blocks || []
  const w = imageW || 0
  const enriched = blocks.map(b => {
    const bbox = Array.isArray(b.bbox) && b.bbox.length >= 4 ? b.bbox : null
    if (!bbox) return { ...b, column_idx: 0 }
    const blockW = bbox[2] - bbox[0]
    const centerX = (bbox[0] + bbox[2]) / 2
    const isFullWidth = w > 0 && blockW > w * 0.7
    const column_idx = isFullWidth || w === 0 ? 0 : (centerX > w / 2 ? 1 : 0)
    return { ...b, column_idx }
  })
  enriched.sort((a, b) => {
    if (a.column_idx !== b.column_idx) return a.column_idx - b.column_idx
    const ay = Array.isArray(a.bbox) ? a.bbox[1] : 0
    const by = Array.isArray(b.bbox) ? b.bbox[1] : 0
    return ay - by
  })
  return enriched.map((b, i) => ({ ...b, reading_order: i }))
}
