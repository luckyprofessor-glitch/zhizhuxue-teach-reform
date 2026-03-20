export const STORAGE_KEYS = {
  course: 'teach-reform-course',
  logs: 'teach-reform-logs',
}

export function loadStoredJson(key, fallback) {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch (error) {
    console.error(`读取本地存储失败：${key}`, error)
    return fallback
  }
}

export function saveStoredJson(key, value) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`写入本地存储失败：${key}`, error)
  }
}

export function clearStoredItem(key) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(key)
}

export function getProgressStorageKey(courseId, participantId) {
  return `teach-reform-progress:${courseId}:${participantId}`
}

export function hashString(text) {
  let hash = 0
  const input = String(text || '')
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function assignParticipant(participantId, experiment) {
  const arms = experiment?.arms || []
  if (!participantId || arms.length === 0) {
    return null
  }

  const seed = experiment?.seed || 'teach-reform-2026'
  const index = hashString(`${seed}:${participantId}`) % arms.length
  return arms[index]
}

export function createEmptySession(course, participantId, arm) {
  return {
    courseId: course.id,
    participantId,
    armId: arm.id,
    arm,
    currentIndex: 0,
    xp: 0,
    level: 1,
    badges: [],
    answers: {},
    reflections: {},
    pretest: null,
    posttest: null,
    finished: false,
    startedAt: new Date().toISOString(),
    completedAt: null,
  }
}

export function buildLogEntry(payload) {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...payload,
  }
}

export function calculateLevel(xp) {
  return Math.max(1, Math.floor((xp || 0) / 80) + 1)
}

export function ensureBadge(list, badge) {
  return list.includes(badge) ? list : [...list, badge]
}

export function downloadJson(filename, data) {
  const content = JSON.stringify(data, null, 2)
  downloadFile(filename, content, 'application/json;charset=utf-8')
}

export function downloadCsv(filename, rows) {
  const content = rowsToCsv(rows)
  downloadFile(filename, content, 'text/csv;charset=utf-8')
}

export function rowsToCsv(rows) {
  if (!rows || rows.length === 0) {
    return 'id\n'
  }

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const lines = [columns.join(',')]

  rows.forEach((row) => {
    lines.push(columns.map((column) => escapeCsvValue(row[column])).join(','))
  })

  return lines.join('\n')
}

export function calculateStudyStats(logs, experiment) {
  const arms = experiment?.arms || []
  const participantMap = new Map()

  logs.forEach((log) => {
    if (!log.participantId) {
      return
    }
    if (!participantMap.has(log.participantId)) {
      participantMap.set(log.participantId, {
        participantId: log.participantId,
        armId: log.armId || '',
        enteredAt: log.timestamp,
        finishedAt: null,
        quizCount: 0,
        correctCount: 0,
        reflectionCount: 0,
      })
    }

    const record = participantMap.get(log.participantId)
    if (log.armId && !record.armId) {
      record.armId = log.armId
    }
    if (log.eventType === 'quiz_submitted') {
      record.quizCount += 1
      if (log.isCorrect) {
        record.correctCount += 1
      }
    }
    if (log.eventType === 'reflection_saved') {
      record.reflectionCount += 1
    }
    if (log.eventType === 'study_completed') {
      record.finishedAt = log.timestamp
    }
  })

  const participants = [...participantMap.values()]
  const summaries = arms.map((arm) => {
    const armParticipants = participants.filter((item) => item.armId === arm.id)
    const quizCount = armParticipants.reduce((sum, item) => sum + item.quizCount, 0)
    const correctCount = armParticipants.reduce((sum, item) => sum + item.correctCount, 0)
    const completedCount = armParticipants.filter((item) => item.finishedAt).length
    return {
      armId: arm.id,
      armName: arm.name,
      participants: armParticipants.length,
      completionRate: armParticipants.length > 0 ? Number((completedCount / armParticipants.length).toFixed(2)) : 0,
      accuracy: quizCount > 0 ? Number((correctCount / quizCount).toFixed(2)) : 0,
      reflectionCount: armParticipants.reduce((sum, item) => sum + item.reflectionCount, 0),
    }
  })

  return {
    totalParticipants: participants.length,
    totalLogs: logs.length,
    armSummaries: summaries,
    participantRows: participants.map((item) => ({
      participantId: item.participantId,
      armId: item.armId,
      accuracy: item.quizCount > 0 ? Number((item.correctCount / item.quizCount).toFixed(2)) : 0,
      quizCount: item.quizCount,
      reflectionCount: item.reflectionCount,
      enteredAt: item.enteredAt,
      finishedAt: item.finishedAt || '',
    })),
  }
}

function escapeCsvValue(value) {
  const text = value == null ? '' : String(value)
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadFile(filename, content, mime) {
  if (typeof window === 'undefined') {
    return
  }

  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
