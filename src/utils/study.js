export const STORAGE_KEYS = {
  course: 'zhizhuxue-self-study-course',
  session: 'zhizhuxue-self-study-session',
  aiConfig: 'zhizhuxue-self-study-ai-config',
  history: 'zhizhuxue-self-study-history',
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

export function createStudySession(course, learnerProfile) {
  const profile = typeof learnerProfile === 'string'
    ? { learnerName: learnerProfile, learnerClass: '', learningGoal: '' }
    : {
        learnerName: learnerProfile?.learnerName || '同学',
        learnerClass: learnerProfile?.learnerClass || '',
        learningGoal: learnerProfile?.learningGoal || '',
      }

  return {
    courseId: course.id,
    ...profile,
    avatarText: getAvatarText(profile.learnerName),
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
    updatedAt: new Date().toISOString(),
  }
}

export function calculateLevel(xp) {
  return Math.max(1, Math.floor((xp || 0) / 100) + 1)
}

export function ensureBadge(list, badge) {
  return list.includes(badge) ? list : [...list, badge]
}

export function buildJourneyRecord(course, session) {
  if (!course || !session) {
    return null
  }

  return {
    id: `${course.id}:${session.startedAt}`,
    courseId: course.id,
    courseTitle: course.title,
    learnerName: session.learnerName,
    learnerClass: session.learnerClass || '',
    learningGoal: session.learningGoal || '',
    avatarText: session.avatarText || getAvatarText(session.learnerName),
    progressPercent: Math.round(((session.clearedModules?.length || 0) / Math.max(1, course.modules.length)) * 100),
    completedModules: session.clearedModules?.length || 0,
    totalModules: course.modules.length,
    finalBossDone: Boolean(session.finalBossDone),
    level: session.level || 1,
    xp: session.xp || 0,
    badges: session.badges || [],
    updatedAt: new Date().toISOString(),
    startedAt: session.startedAt,
  }
}

export function upsertJourneyHistory(history, record) {
  if (!record) {
    return history || []
  }

  const list = Array.isArray(history) ? [...history] : []
  const index = list.findIndex((item) => item.id === record.id)
  if (index >= 0) {
    list[index] = { ...list[index], ...record }
  } else {
    list.unshift(record)
  }

  return list
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 24)
}

export function getAvatarText(name) {
  const cleaned = String(name || '同学').trim()
  if (!cleaned) {
    return '同学'
  }
  return cleaned.length <= 2 ? cleaned : cleaned.slice(-2)
}
