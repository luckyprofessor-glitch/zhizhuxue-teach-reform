const HTML_TAG_RE = /<[^>]+>/g

export async function extractTextFromFile(file) {
  const name = file.name || '未命名文件'
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  const warnings = []

  if (extension === 'ppt') {
    throw new Error('暂不支持旧版 .ppt，请先在 PowerPoint 中另存为 .pptx 后上传。')
  }

  let text = ''
  let units = []

  switch (extension) {
    case 'txt':
    case 'md':
    case 'csv':
    case 'json':
      text = await file.text()
      units = buildTextUnits(text)
      break
    case 'html':
    case 'htm':
      text = stripHtml(await file.text())
      units = buildTextUnits(text)
      break
    case 'pdf': {
      const result = await extractPdfText(file)
      text = result.text
      units = result.units
      break
    }
    case 'docx': {
      const result = await extractDocxText(file)
      text = result.text
      units = result.units
      break
    }
    case 'pptx': {
      const result = await extractPptxText(file)
      text = result.text
      units = result.units
      break
    }
    default:
      if (file.type.startsWith('text/')) {
        text = await file.text()
        units = buildTextUnits(text)
      } else {
        throw new Error(`暂不支持解析 ${extension || file.type || '该格式'}。建议上传 pdf、docx、pptx、txt 或 md。`)
      }
  }

  const cleaned = normalizeText(text)
  if (!cleaned) {
    warnings.push('已读取文件，但未提取到可用文本。请检查课件是否为图片扫描件，或先转为可复制文本。')
  }

  return {
    text: cleaned,
    units,
    meta: {
      name,
      extension,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
    },
    warnings,
  }
}

async function extractPdfText(file) {
  const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])

  GlobalWorkerOptions.workerSrc = workerModule.default

  const buffer = await file.arrayBuffer()
  const loadingTask = getDocument({ data: buffer, useWorkerFetch: false })
  const pdf = await loadingTask.promise
  const pages = []

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = normalizeText(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' '),
    )

    if (pageText) {
      pages.push({
        id: `pdf-page-${i}`,
        title: `第${i}页`,
        order: i,
        kind: 'pdf-page',
        text: pageText,
      })
    }
  }

  return {
    text: pages.map((page) => `${page.title}\n${page.text}`).join('\n\n'),
    units: pages,
  }
}

async function extractDocxText(file) {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  const text = result.value || ''
  return {
    text,
    units: buildTextUnits(text),
  }
}

async function extractPptxText(file) {
  const JSZip = (await import('jszip')).default
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => getSlideNumber(a) - getSlideNumber(b))

  const slides = []

  for (const slideFile of slideFiles) {
    const xml = await zip.files[slideFile].async('string')
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'application/xml')
    const nodes = Array.from(doc.getElementsByTagName('a:t'))
    const texts = nodes.map((node) => node.textContent?.trim()).filter(Boolean)
    if (texts.length > 0) {
      const slideNo = getSlideNumber(slideFile)
      const slideText = normalizeText(texts.join('；'))
      slides.push({
        id: `ppt-slide-${slideNo}`,
        title: `第${slideNo}页`,
        order: slideNo,
        kind: 'ppt-slide',
        text: slideText,
      })
    }
  }

  return {
    text: slides.map((slide) => `${slide.title}\n${slide.text}`).join('\n\n'),
    units: slides,
  }
}

function buildTextUnits(text) {
  return normalizeText(text)
    .split(/\n{2,}/)
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 20)
    .slice(0, 24)
    .map((item, index) => ({
      id: `text-unit-${index + 1}`,
      title: `片段 ${index + 1}`,
      order: index + 1,
      kind: 'text-block',
      text: item,
    }))
}

function getSlideNumber(path) {
  const match = path.match(/slide(\d+)\.xml$/)
  return match ? Number(match[1]) : 0
}

export function normalizeText(value) {
  return (value || '')
    .replace(/\r/g, '\n')
    .replaceAll('\u0000', ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim()
}

export function stripHtml(html) {
  return normalizeText((html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(HTML_TAG_RE, ' '))
}
