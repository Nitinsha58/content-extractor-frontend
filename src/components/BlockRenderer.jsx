import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useMemo } from 'react'

function LatexInline({ value, display }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(value, {
        displayMode: display,
        throwOnError: false,
      })
    } catch (err) {
      console.error('KaTeX error:', err)
      return `<code>${value}</code>`
    }
  }, [value, display])

  if (display) {
    return (
      <div
        className="text-center my-3"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  return (
    <span
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function TableBlock({ cells }) {
  return (
    <table className="border-collapse w-full my-3 text-sm">
      <tbody>
        {(cells || []).map((row, ri) => (
          <tr
            key={ri}
            className={ri === 0 ? 'bg-gray-100 font-semibold' : ''}
          >
            {row.map((cell, ci) => (
              <td
                key={ci}
                className="border border-gray-300 px-3 py-1"
              >
                {renderBlocks(cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export const renderBlocks = (blocks) => {
  if (!blocks) return null

  return blocks.map((block, i) => {
    if (block.type === 'text') {
      return <span key={i}>{block.value} </span>
    }
    if (block.type === 'latex') {
      return (
        <LatexInline
          key={i}
          value={block.value}
          display={block.display}
        />
      )
    }
    if (block.type === 'table') {
      return <TableBlock key={i} cells={block.cells} />
    }
    if (block.type === 'image') {
      const url = block.url
      return (
        <img
          key={i}
          src={url}
          alt={block.alt || 'figure'}
          className="max-w-full my-2 mx-auto block"
        />
      )
    }
    return null
  })
}
