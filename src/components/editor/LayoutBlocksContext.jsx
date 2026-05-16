import { createContext, useContext } from 'react'

export const LayoutBlocksContext = createContext(null)

export function useBlockMeta(sourceBlockIdsStr) {
  const ctx = useContext(LayoutBlocksContext)
  const map = ctx?.map
  if (!map || !sourceBlockIdsStr) return null
  const ids = sourceBlockIdsStr.split(',').filter(Boolean)
  if (!ids.length) return null

  const first = map[ids[0]]
  if (!first) return null

  let minConf = first.confidence
  for (const id of ids) {
    const b = map[id]
    if (b !== undefined && b.confidence < minConf) minConf = b.confidence
  }

  return { blockNumber: first.readingOrder, confidence: minConf }
}

export function BlockAnnotation({ sourceBlockIdsStr }) {
  const ctx = useContext(LayoutBlocksContext)
  const meta = useBlockMeta(sourceBlockIdsStr)
  if (!meta || !ctx?.showAnnotations) return null

  const pct = Math.round(meta.confidence * 100)
  const isLow = pct < 70

  return (
    <div className="absolute right-0 top-0.5 flex items-center gap-1 select-none pointer-events-none z-10">
      <span className="text-[9px] font-mono text-gray-300 leading-none">
        #{meta.blockNumber}
      </span>
      <span className={`text-[9px] font-mono leading-none ${isLow ? 'text-red-300' : 'text-gray-300'}`}>
        {pct}%
      </span>
    </div>
  )
}
