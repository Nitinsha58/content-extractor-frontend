import katex from 'katex'

export default function InlineContent({ content = [] }) {
  return (
    <>
      {content.map((block, i) => {
        const spacer = i > 0 ? ' ' : ''
        if (block.type === 'latex') {
          try {
            const html = katex.renderToString(block.value, {
              displayMode: block.display === true,
              throwOnError: false,
            })
            return block.display
              ? <div key={i} className="text-center my-2" dangerouslySetInnerHTML={{ __html: html }} />
              : <span key={i}>{spacer}<span dangerouslySetInnerHTML={{ __html: html }} /></span>
          } catch {
            return <span key={i}>{spacer}<code>${block.value}$</code></span>
          }
        }
        return <span key={i}>{spacer}{block.value ?? ''}</span>
      })}
    </>
  )
}
