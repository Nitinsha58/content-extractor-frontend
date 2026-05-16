export function buildClipboardEnvelope(type, content) {
  return {
    source: 'content-extractor',
    version: 1,
    type,
    content,
  }
}
