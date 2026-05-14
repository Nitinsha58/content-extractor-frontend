import {
  detectLayout,
  analyzeCellTypes as _analyzeCellTypes,
  analyzeTableStructure as _analyzeTableStructure,
  runOcr as _runOcr,
  exportDocument as _exportDocument,
  figureCropUrl as _figureCropUrl,
  sessionImageUrl as _sessionImageUrl,
  createDocument as _createDocument,
  getDocument as _getDocument,
  updateDocument as _updateDocument,
  deleteDocument as _deleteDocument,
  savePage,
  getPage as _getPage,
  getPageStructure as _getPageStructure,
} from './extractorApi'

function normalise(operation, cause) {
  const err = new Error(cause.message)
  err.operation = operation
  err.cause = cause
  return err
}

export async function runLayoutDetection(imageBlob, filename) {
  try {
    return await detectLayout(imageBlob, filename)
  } catch (cause) {
    throw normalise('runLayoutDetection', cause)
  }
}

export async function runTableCellTypeDetection(sessionId, blockId, bbox, tableStructure) {
  try {
    return await _analyzeCellTypes(sessionId, blockId, bbox, tableStructure)
  } catch (cause) {
    throw normalise('runTableCellTypeDetection', cause)
  }
}

export async function runTableStructureAnalysis(sessionId, blockId, bbox) {
  try {
    return await _analyzeTableStructure(sessionId, blockId, bbox)
  } catch (cause) {
    throw normalise('runTableStructureAnalysis', cause)
  }
}

export async function runOcr(sessionId, layoutBlocks) {
  try {
    return await _runOcr(sessionId, layoutBlocks)
  } catch (cause) {
    throw normalise('runOcr', cause)
  }
}

export async function exportDocument(sessionId, format, ocrBlocks) {
  try {
    return await _exportDocument(sessionId, format, ocrBlocks)
  } catch (cause) {
    throw normalise('exportDocument', cause)
  }
}

export async function createDocument(pdfFile, pageCount, folderId) {
  try {
    return await _createDocument(pdfFile, pageCount, folderId)
  } catch (cause) {
    throw normalise('createDocument', cause)
  }
}

export async function getDocument(docId) {
  try {
    return await _getDocument(docId)
  } catch (cause) {
    throw normalise('getDocument', cause)
  }
}

export async function updateDocument(docId, payload) {
  try {
    return await _updateDocument(docId, payload)
  } catch (cause) {
    throw normalise('updateDocument', cause)
  }
}

export async function deleteDocument(docId) {
  try {
    return await _deleteDocument(docId)
  } catch (cause) {
    throw normalise('deleteDocument', cause)
  }
}

export async function savePageContent(docId, pageNo, payload) {
  try {
    return await savePage(docId, pageNo, payload)
  } catch (cause) {
    throw normalise('savePageContent', cause)
  }
}

export async function getPage(docId, pageNo) {
  try {
    return await _getPage(docId, pageNo)
  } catch (cause) {
    throw normalise('getPage', cause)
  }
}

export async function getPageStructure(docId, pageNo) {
  try {
    return await _getPageStructure(docId, pageNo)
  } catch (cause) {
    throw normalise('getPageStructure', cause)
  }
}

export const figureCropUrl = _figureCropUrl
export const sessionImageUrl = _sessionImageUrl
