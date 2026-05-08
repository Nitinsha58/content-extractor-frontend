import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Enhanced rendering options for better compatibility
pdfjsLib.GlobalWorkerOptions.useWorkerFetch = true

export default pdfjsLib
