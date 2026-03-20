export const STORAGE_KEYS = {
  course: 'zhizhuxue-self-study-course',
  session: 'zhizhuxue-self-study-session',
  aiConfig: 'zhizhuxue-self-study-ai-config',
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

export function createStudySession(course, learnerName) {
  return {
    courseId: course.id,
    learnerName,
    currentModuleIndex: 0,
    coachMode: '启发式',
    answers: {},
    reflections: {},
    clearedModules: [],
    badges: [],
    xp: 0,
    level: 1,
    chatHistory: [],
    finalReflection: '',
    finalBossDone: false,
    startedAt: new Date().toISOString(),
  }
}

export function calculateLevel(xp) {
  return Math.max(1, Math.floor((xp || 0) / 100) + 1)
}

export function ensureBadge(list, badge) {
  return list.includes(badge) ? list : [...list, badge]
}
