import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

const SHARE_PARAM = 'course'

export function buildPublicCoursePayload(course) {
  return {
    ...course,
    classroom: {
      ...(course.classroom || {}),
      entryCode: '',
    },
    runtime: {
      ...(course.runtime || {}),
      sharedByUrl: true,
    },
  }
}

export function encodeCourseForUrl(course) {
  return compressToEncodedURIComponent(JSON.stringify(buildPublicCoursePayload(course)))
}

export function decodeCourseFromCode(code) {
  if (!code) {
    return null
  }

  const raw = decompressFromEncodedURIComponent(code)
  if (!raw) {
    throw new Error('无法解析分享链接，可能是链接不完整或已损坏。')
  }

  const payload = JSON.parse(raw)
  if (!payload?.modules || !Array.isArray(payload.modules)) {
    throw new Error('分享链接中未找到有效课程结构。')
  }
  return payload
}

export function buildShareUrl(course) {
  if (typeof window === 'undefined') {
    return ''
  }

  const url = new URL(window.location.href)
  url.searchParams.set(SHARE_PARAM, encodeCourseForUrl(course))
  url.hash = ''
  return url.toString()
}

export function loadSharedCourseFromLocation() {
  if (typeof window === 'undefined') {
    return null
  }

  const url = new URL(window.location.href)
  const code = url.searchParams.get(SHARE_PARAM)
  if (!code) {
    return null
  }

  return decodeCourseFromCode(code)
}

export function clearShareParamFromLocation() {
  if (typeof window === 'undefined') {
    return
  }

  const url = new URL(window.location.href)
  if (!url.searchParams.has(SHARE_PARAM)) {
    return
  }

  url.searchParams.delete(SHARE_PARAM)
  window.history.replaceState({}, '', url.toString())
}

export function estimateShareUrlLength(course) {
  if (typeof window === 'undefined') {
    return encodeCourseForUrl(course).length
  }

  return buildShareUrl(course).length
}

export async function copyText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}
