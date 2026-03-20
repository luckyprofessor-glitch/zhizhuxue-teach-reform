import { normalizeText } from './courseware.js'

export const SOCIAL_WORK_LENSES = {
  优势视角: {
    name: '优势视角',
    tagline: '从缺陷识别转向资源发现，让学生在学习中看到自己的能力与可动员支持。',
    value: '尊重、赋能、助人自助',
    prompts: {
      mission: '请找出本节内容中你最容易转化为“可用资源”的一个知识点。',
      reflection: '如果把自己当作服务对象，你已经具备哪些优势来完成本节学习任务？',
      bridge: '把抽象知识改写成“学生已有资源—可获得支持—下一步行动”三步。',
    },
  },
  赋能理论: {
    name: '赋能理论',
    tagline: '帮助学习者形成掌控感、参与感与行动感，让学习结果可迁移到真实实践。',
    value: '参与、能力提升、主体性',
    prompts: {
      mission: '请把本节知识点转化为一个你可以立即尝试的小行动。',
      reflection: '学习完成后，你在哪一点上更有掌控感？',
      bridge: '说明这个知识点如何增强个体、群体或社区层面的行动能力。',
    },
  },
  生态系统理论: {
    name: '生态系统理论',
    tagline: '强调人在情境中，帮助学生同时看见个体、关系、组织与制度环境。',
    value: '情境理解、系统联动、环境适配',
    prompts: {
      mission: '请从个体、同伴、学校与社会环境四个层次梳理本节内容。',
      reflection: '这个知识点会受到哪些情境因素影响？',
      bridge: '用“微观—中观—宏观”结构重述本节要点。',
    },
  },
  人在情境中: {
    name: '人在情境中',
    tagline: '把知识学习与真实生活处境相连，强化情境判断与同理理解。',
    value: '情境敏感、关系导向、个别化',
    prompts: {
      mission: '请把本节知识带入一个具体课堂、家庭或社区情境。',
      reflection: '如果对象所处情境不同，这个知识点需要如何调整？',
      bridge: '指出本节知识在不同情境中的边界与适用条件。',
    },
  },
  社会支持网络: {
    name: '社会支持网络',
    tagline: '鼓励学生把知识学习与支持系统建设联系起来，形成互助与协同。',
    value: '连接资源、关系修复、协作支持',
    prompts: {
      mission: '请找出本节内容中最需要他人协作才能完成的一步。',
      reflection: '围绕本节内容，你可以向谁寻求支持，又能为谁提供支持？',
      bridge: '把本节知识改写成“支持来源—支持方式—预期效果”框架。',
    },
  },
}

export const GAME_STYLES = {
  闯关式: '每个知识模块对应一关，完成后获得经验值、徽章与下一关权限。',
  剧情式: '将知识点嵌入连续故事线，学生以角色身份完成任务与抉择。',
  积分徽章式: '以答题积分、成长等级与成就墙强化持续参与。',
}

const BADGE_POOL = [
  '共情侦察员',
  '赋能设计师',
  '资源连接者',
  'AI领航员',
  '社区建构师',
  '证据实践者',
  '情境分析师',
]

const DIFFICULTY_LABELS = ['基础', '进阶', '挑战']

const STOPWORDS = new Set([
  '我们',
  '你们',
  '他们',
  '以及',
  '这个',
  '那个',
  '这些',
  '那些',
  '通过',
  '进行',
  '可以',
  '需要',
  '如果',
  '因为',
  '所以',
  '就是',
  '主要',
  '同时',
  '为了',
  '对于',
  '关于',
  '一个',
  '一种',
  '其中',
  '具有',
  '相关',
  '课程',
  '学生',
  '学习',
  '内容',
  '课件',
  '模块',
  '知识',
  '本节',
  '本章',
  'and',
  'the',
  'that',
  'with',
  'from',
  'this',
  'into',
  'for',
  'are',
  'was',
  'were',
  'have',
  'has',
  'had',
])

export function buildCourseFromText(text, options = {}, filesMeta = [], inheritedWarnings = []) {
  const normalized = normalizeText(text)
  const paragraphs = extractParagraphs(normalized)
  const targetModules = clamp(Number(options.moduleCount) || 5, 3, 6)
  const groupedParagraphs = groupParagraphs(paragraphs, targetModules)
  const lens = SOCIAL_WORK_LENSES[options.socialLens] || SOCIAL_WORK_LENSES.优势视角
  const style = options.gameStyle || '闯关式'
  const fullKeywords = extractKeywords(normalized).slice(0, 12)

  const modules = groupedParagraphs.map((chunk, index, allChunks) => {
    const localKeywords = extractKeywords(chunk).slice(0, 5)
    const sentences = splitSentences(chunk)
    const summary = shorten(sentences.slice(0, 2).join(' '), 90) || shorten(chunk, 90)
    const keyPoints = buildKeyPoints(sentences, localKeywords)
    const title = createModuleTitle(chunk, index, localKeywords, options)
    const difficulty = inferDifficulty(chunk, index)
    const quiz = createQuiz({
      title,
      summary,
      localKeywords,
      index,
      allChunks,
      lens,
    })

    return {
      id: `module-${index + 1}`,
      order: index + 1,
      title,
      summary,
      content: chunk,
      keyPoints,
      keywords: localKeywords,
      readingEstimateMinutes: Math.max(2, Math.ceil(chunk.length / 260)),
      difficulty,
      badge: BADGE_POOL[index % BADGE_POOL.length],
      xp: 40,
      story: createStoryTitle(title, index, style),
      challenge: createChallenge(title, localKeywords, lens, difficulty),
      socialWorkFocus: {
        theory: lens.name,
        value: lens.value,
        mission: lens.prompts.mission,
        reflectionPrompt: lens.prompts.reflection,
        bridgePrompt: lens.prompts.bridge,
      },
      aiCoach: {
        diagnosis: `AI 已识别本节高频概念：${(localKeywords.length > 0 ? localKeywords : fullKeywords).slice(0, 3).join('、') || '核心概念'}。`,
        hint: `优先抓住“${localKeywords[0] || fullKeywords[0] || '核心概念'}—${localKeywords[1] || fullKeywords[1] || '应用情境'}—${localKeywords[2] || fullKeywords[2] || '行动方案'}”的链条。`,
        nextStep: `完成后尝试用 ${lens.name} 重新解释“${title}”，把知识转成可实践的行动语言。`,
      },
      quiz,
    }
  })

  const title = (options.courseTitle || '').trim() || inferCourseTitle(normalized, filesMeta, fullKeywords)
  const estimatedMinutes = modules.reduce((sum, item) => sum + item.readingEstimateMinutes, 0)

  return {
    id: `course-${Date.now()}`,
    title,
    subtitle: `${options.targetLearners || '学生'}专用｜${style}｜${lens.name}`,
    description: `系统已将上传课件重构为 ${modules.length} 个游戏化学习关卡，并注入 ${lens.name}、AI 反馈与实验追踪机制。`,
    keywords: fullKeywords,
    learningObjectives: modules.slice(0, 4).map((module, index) => `目标 ${index + 1}：理解“${module.title}”，并能结合 ${lens.name} 说明其应用情境。`),
    modules,
    theoryBridge: {
      socialWork: `${lens.name}：${lens.tagline}`,
      ai: 'AI 模块负责自动拆分课件、提炼重点、生成测验、给出个性化反馈，并为随机对照实验记录学习过程数据。',
      pedagogy: `${style}：${GAME_STYLES[style] || GAME_STYLES.闯关式}`,
    },
    experiment: buildExperimentConfig(title, options, lens),
    sourceFiles: filesMeta,
    estimatedMinutes,
    totalCharacters: normalized.length,
    generatedAt: new Date().toISOString(),
    warnings: inheritedWarnings,
    settings: {
      ...options,
      socialLens: lens.name,
      gameStyle: style,
      moduleCount: modules.length,
    },
  }
}

function buildExperimentConfig(title, options, lens) {
  const armCount = Number(options.armCount) || 2
  const seed = (options.studySeed || '').trim() || 'teach-reform-2026'
  const arms = [
    {
      id: 'A',
      name: 'AI社工游戏化组',
      mode: 'gamified',
      gamified: true,
      aiCoach: true,
      socialWork: true,
      features: ['闯关任务', '即时积分', 'AI导师反馈', `${lens.name}反思`, '过程数据记录'],
    },
    {
      id: 'B',
      name: '常规数字学习组',
      mode: 'plain',
      gamified: false,
      aiCoach: false,
      socialWork: false,
      features: ['线性阅读', '统一测验', '基础过程记录'],
    },
  ]

  if (armCount === 3) {
    arms.push({
      id: 'C',
      name: '社工融合游戏化组',
      mode: 'hybrid',
      gamified: true,
      aiCoach: false,
      socialWork: true,
      features: ['闯关任务', '即时积分', `${lens.name}反思`, '无 AI 提示'],
    })
  }

  return {
    studyTitle: options.studyTitle || `${title}学习效果随机对照实验`,
    seed,
    randomizationUnit: '个体层面随机分组',
    arms,
    hypotheses: [
      'H1：AI社工游戏化组在知识测验正确率上高于常规数字学习组。',
      `H2：嵌入 ${lens.name} 的实验组在学习投入与价值认同上高于对照组。`,
      'H3：AI 导师反馈将提升学生对继续使用该系统的意愿。',
    ],
    primaryOutcome: '知识测验正确率',
    secondaryOutcomes: ['学习投入感', '继续使用意愿', '社工价值认同', '任务完成率'],
    suggestedMeasures: [
      '过程指标：页面停留时间、关卡完成数、反思文本长度、AI提示查看次数。',
      '结果指标：前测—后测得分变化、单元测验正确率、满意度量表、课程评价。',
      '分层变量：年级、专业背景、既有数字学习经验、AI使用经验。',
    ],
    procedure: [
      '步骤 1：学生输入被试编号后，系统根据研究种子自动随机分组。',
      '步骤 2：先完成三项前测，再进入各自学习界面。',
      '步骤 3：平台记录答题、反思与完成情况，并在学习结束后收集后测。',
      '步骤 4：导出 JSON 或 CSV，用于后续统计分析与教改项目结题。',
    ],
    ethicsNotice: '建议收集最少必要信息，并在正式实验前补充知情同意、退出机制与数据匿名化方案。',
  }
}

function extractParagraphs(text) {
  const raw = (text || '')
    .split(/\n{2,}/)
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 18)

  if (raw.length >= 3) {
    return raw
  }

  const sentences = splitSentences(text)
  const chunks = []
  let current = []

  sentences.forEach((sentence) => {
    current.push(sentence)
    if (current.join('').length > 160) {
      chunks.push(normalizeText(current.join(' ')))
      current = []
    }
  })

  if (current.length > 0) {
    chunks.push(normalizeText(current.join(' ')))
  }

  return chunks.filter(Boolean)
}

function groupParagraphs(paragraphs, target) {
  if (paragraphs.length === 0) {
    return ['请上传包含可复制文字的课件，系统会自动生成游戏化学习内容。']
  }

  if (paragraphs.length <= target) {
    return paragraphs
  }

  const result = []
  const size = Math.ceil(paragraphs.length / target)
  for (let i = 0; i < paragraphs.length; i += size) {
    result.push(normalizeText(paragraphs.slice(i, i + size).join('\n\n')))
  }
  return result.slice(0, target)
}

function splitSentences(text) {
  return (text || '')
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 8)
}

function extractKeywords(text) {
  const matches = (text || '').match(/[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9-]{1,14}/g) || []
  const counter = new Map()

  matches.forEach((token) => {
    const value = token.trim()
    if (!value || STOPWORDS.has(value) || /^\d+$/.test(value) || value.length < 2) {
      return
    }
    counter.set(value, (counter.get(value) || 0) + 1)
  })

  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)
}

function createModuleTitle(chunk, index, localKeywords, options) {
  const heading = (chunk.split('\n')[0] || '').trim()
  if (heading && heading.length <= 24) {
    return heading
  }
  const prefix = options.gameStyle === '剧情式' ? '剧情节点' : '任务'
  return `${prefix}${index + 1}：${localKeywords[0] || `核心概念${index + 1}`}`
}

function createStoryTitle(title, index, style) {
  if (style === '剧情式') {
    return `章节 ${index + 1}｜你需要在情境推进中破解“${title}”`
  }
  if (style === '积分徽章式') {
    return `关卡 ${index + 1}｜累计积分，点亮“${title}”徽章`
  }
  return `关卡 ${index + 1}｜完成“${title}”学习任务`
}

function createChallenge(title, localKeywords, lens, difficulty) {
  return `限时挑战：围绕“${title}”写出一个 60 秒解释，并至少纳入 ${localKeywords[0] || '一个关键词'}、${localKeywords[1] || '一个应用情境'} 与 ${lens.name} 视角。当前难度：${difficulty}。`
}

function buildKeyPoints(sentences, keywords) {
  const sentencePoints = sentences.slice(0, 3).map((item) => shorten(item, 56))
  const keywordPoints = keywords.slice(0, 3).map((item) => `抓住关键词：${item}`)
  return [...new Set([...sentencePoints, ...keywordPoints])].slice(0, 4)
}

function inferDifficulty(chunk, index) {
  const score = chunk.length / 220 + index * 0.2
  if (score < 1.3) return DIFFICULTY_LABELS[0]
  if (score < 2.2) return DIFFICULTY_LABELS[1]
  return DIFFICULTY_LABELS[2]
}

function createQuiz({ title, summary, localKeywords, index, allChunks, lens }) {
  const distractors = []
  const otherChunk = allChunks[(index + 1) % allChunks.length] || ''
  const otherKeywords = extractKeywords(otherChunk).slice(0, 3)

  distractors.push(`本节重点只在于机械记忆术语，并不强调${lens.name}或真实应用。`)
  distractors.push(`本节主要讨论${otherKeywords[0] || '其他主题'}，与“${title}”关系不大。`)
  distractors.push(`本节认为学习只需要个人努力，不需要考虑情境、支持或反馈。`)
  distractors.push(`本节的唯一目标是完成打卡，与知识迁移和实践无关。`)

  const options = shuffleDeterministically(
    [shorten(summary, 54), ...distractors.map((item) => shorten(item, 54))].slice(0, 4),
    `${title}-${index}`,
  )

  return {
    question: `关于“${title}”，下列哪一项最符合本节核心内容？`,
    options,
    correctIndex: options.indexOf(shorten(summary, 54)),
    rationale: `正确答案应同时体现“${title}”的核心知识与实践导向，而不是停留在机械记忆。`,
    stretchTask: `请尝试用 ${localKeywords[0] || '一个关键词'} 联系课堂、实务或社区场景，补充你对本节的理解。`,
  }
}

function inferCourseTitle(text, filesMeta, keywords) {
  if (filesMeta.length > 0 && filesMeta[0].name) {
    return filesMeta[0].name.replace(/\.[^.]+$/, '')
  }

  const firstLine = (text.split('\n')[0] || '').trim()
  if (firstLine && firstLine.length <= 28) {
    return firstLine
  }

  return `AI社工游戏化课件：${keywords[0] || '课程主题'}`
}

function shorten(text, maxLength = 80) {
  const value = normalizeText(text)
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`
}

function shuffleDeterministically(items, seed) {
  const list = [...items]
  let state = hashCode(seed)
  for (let i = list.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296
    const j = state % (i + 1)
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

function hashCode(text) {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) || 1
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
