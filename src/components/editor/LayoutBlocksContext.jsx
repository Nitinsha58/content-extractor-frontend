import { createContext, useContext } from 'react'

export const LayoutBlocksContext = createContext(null)

export function useBlockMeta(sourceBlockIdsStr) {
  const map = useContext(LayoutBlocksContext)
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
  const meta = useBlockMeta(sourceBlockIdsStr)
  if (!meta) return null

  const pct = Math.round(meta.confidence * 100)
  const isLow = pct < 70

  return (
    <div className="flex items-center gap-1 mb-0.5 select-none pointer-events-none">
      <span className="text-[10px] font-mono text-gray-400 leading-none">
        Block {meta.blockNumber}
      </span>
      <span className={`text-[10px] font-mono leading-none ${isLow ? 'text-red-400 font-medium' : 'text-gray-400'}`}>
        · {pct}%
      </span>
    </div>
  )
}
