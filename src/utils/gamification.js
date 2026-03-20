import { normalizeText } from './courseware.js'

export const SOCIAL_WORK_LENSES = {
  优势视角: {
    name: '优势视角',
    tagline: '从“我不会”转向“我已具备什么资源”，让学生在学习中建立能力感。',
    value: '尊重、赋能、助人自助',
    prompts: {
      mission: '请找出本节中你最容易立刻用起来的一个知识点。',
      reflection: '围绕这一关，你已经具备哪些资源、经验或支持？',
      bridge: '把知识改写成“我已有的资源—还需要的支持—下一步行动”。',
    },
  },
  赋能理论: {
    name: '赋能理论',
    tagline: '帮助学习者形成掌控感、参与感与行动感，让知识能够转化为行动。',
    value: '参与、主体性、能力提升',
    prompts: {
      mission: '请把本节内容转化为一个你今天就能尝试的小行动。',
      reflection: '完成这一关后，你在哪一点上更有掌控感？',
      bridge: '说明这个知识点如何帮助个体、群体或社区增强行动能力。',
    },
  },
  生态系统理论: {
    name: '生态系统理论',
    tagline: '帮助学生同时看见个体、关系、组织与制度环境之间的联动。',
    value: '情境理解、系统联动、环境适配',
    prompts: {
      mission: '请从个体、同伴、组织、社会环境四层梳理本节内容。',
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
      reflection: '若对象所处情境不同，这个知识点需要如何调整？',
      bridge: '指出本节知识的适用条件与边界。',
    },
  },
  社会支持网络: {
    name: '社会支持网络',
    tagline: '把学习过程与支持系统建设结合起来，强调协作与互助。',
    value: '资源连接、关系修复、协同支持',
    prompts: {
      mission: '请找出本节中最需要他人协作的一步。',
      reflection: '围绕这一关，你可以向谁求助，又能为谁提供支持？',
      bridge: '把本节内容改写成“支持来源—支持方式—预期效果”框架。',
    },
  },
}

export const GAME_STYLES = {
  闯关式: '每个模块是一关，按“探索—挑战—迁移”三步推进。',
  剧情式: '把知识点嵌入连续故事线，学生以角色身份推进主线任务。',
  积分徽章式: '通过经验值、等级与成就徽章维持持续投入。',
}

const BADGE_POOL = [
  '概念侦察员',
  '情境连接者',
  '优势发现者',
  'AI协作员',
  '任务破译者',
  '迁移设计师',
  '社工实践者',
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
  '以及',
  '这样',
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
    const summary = shorten(sentences.slice(0, 2).join(' '), 110) || shorten(chunk, 110)
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

    const missionKeyword = localKeywords[0] || fullKeywords[0] || '核心概念'
    const sceneKeyword = localKeywords[1] || fullKeywords[1] || '真实情境'
    const actionKeyword = localKeywords[2] || fullKeywords[2] || '行动策略'

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
      xp: 80,
      story: createStoryTitle(title, index, style),
      challenge: createChallenge(title, localKeywords, lens, difficulty),
      scene: createScene(title, sceneKeyword, lens),
      missions: [
        {
          id: `module-${index + 1}-scan`,
          title: '任务 1｜侦察核心概念',
          detail: `抓住“${missionKeyword}”并用自己的话说清它是什么。`,
          reward: '+20 经验值',
        },
        {
          id: `module-${index + 1}-quiz`,
          title: '任务 2｜破解关卡谜题',
          detail: `完成统一挑战题，并区分正确理解与常见误区。`,
          reward: '+20 经验值',
        },
        {
          id: `module-${index + 1}-apply`,
          title: '任务 3｜带回真实情境',
          detail: `把“${actionKeyword}”带入真实课堂、社区或服务情境中。`,
          reward: '+40 经验值',
        },
      ],
      socialWorkFocus: {
        theory: lens.name,
        value: lens.value,
        mission: lens.prompts.mission,
        reflectionPrompt: lens.prompts.reflection,
        bridgePrompt: lens.prompts.bridge,
      },
      aiCoach: {
        opening: `我已经识别出本关高频概念：${[missionKeyword, sceneKeyword, actionKeyword].join('、')}。`,
        hint: `先抓住“${missionKeyword}是什么”，再理解“${sceneKeyword}里怎么用”，最后思考“${actionKeyword}如何落地”。`,
        nextStep: `完成后尝试用 ${lens.name} 重新解释“${title}”，把知识转成可以行动的语言。`,
      },
      quiz,
      bossPrompt: `请用不超过 120 字说明：在一个具体情境中，你会如何运用“${title}”，并体现 ${lens.name} 的思路？`,
    }
  })

  const title = (options.courseTitle || '').trim() || inferCourseTitle(normalized, filesMeta, fullKeywords)
  const estimatedMinutes = modules.reduce((sum, item) => sum + item.readingEstimateMinutes, 0)

  return {
    id: `course-${Date.now()}`,
    title,
    subtitle: `${options.targetLearners || '学生'}自学模式｜${style}｜${lens.name}`,
    description: `系统已把上传课件重构为 ${modules.length} 个可互动的游戏化关卡，学生可以与智能体边学边问边闯关。`,
    keywords: fullKeywords,
    learningObjectives: modules.slice(0, 4).map((module, index) => `目标 ${index + 1}：掌握“${module.title}”，并能结合 ${lens.name} 说清其真实应用情境。`),
    modules,
    worldMap: modules.map((module, index) => ({
      id: module.id,
      label: `第 ${index + 1} 关`,
      title: module.title,
      badge: module.badge,
      difficulty: module.difficulty,
    })),
    agentProfile: {
      name: (options.agentName || '智助灵').trim() || '智助灵',
      role: 'AI社工学习陪练',
      opening: `我会把你的课件变成闯关地图、即时问答与应用任务，陪你把知识真正学会。`,
      quickActions: ['解释一下', '举个例子', '给我提示', '出一道题', '总结一下', '下一步做什么'],
    },
    theoryBridge: {
      socialWork: `${lens.name}：${lens.tagline}`,
      ai: 'AI 模块负责自动拆分课件、提炼重点、生成任务、即时回答问题，并根据学生进度给出下一步建议。',
      pedagogy: `${style}：${GAME_STYLES[style] || GAME_STYLES.闯关式}`,
    },
    finalBoss: {
      title: '终局任务｜把整门课带回真实世界',
      prompt: `请结合整门课的核心概念，设计一个可落地的小方案，说明你会如何在真实教学、社区或服务情境中应用这些知识，并体现 ${lens.name}。`,
      rubric: [
        '是否点明至少两个核心概念',
        '是否体现真实情境与对象',
        `是否体现 ${lens.name} 的价值逻辑`,
        '是否提出具体可执行的行动步骤',
      ],
    },
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
    if (current.join('').length > 180) {
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
  return `关卡 ${index + 1}｜完成“${title}”三段式任务`
}

function createChallenge(title, localKeywords, lens, difficulty) {
  return `限时挑战：围绕“${title}”写出一个 60 秒解释，并至少纳入 ${localKeywords[0] || '一个关键词'}、${localKeywords[1] || '一个应用情境'} 与 ${lens.name} 视角。当前难度：${difficulty}。`
}

function createScene(title, sceneKeyword, lens) {
  return `情境引导：假设你正在一个与“${sceneKeyword}”相关的课堂、社区或服务场景中，需要向他人解释“${title}”，并体现 ${lens.name}。`
}

function buildKeyPoints(sentences, keywords) {
  const sentencePoints = sentences.slice(0, 3).map((item) => shorten(item, 64))
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
  distractors.push('本节认为学习只需要背诵，不需要理解情境、支持或行动步骤。')
  distractors.push('本节的唯一目标是打卡完成，并不关注知识迁移。')

  const correctOption = shorten(summary, 62)
  const options = shuffleDeterministically(
    [correctOption, ...distractors.map((item) => shorten(item, 62))].slice(0, 4),
    `${title}-${index}`,
  )

  return {
    question: `关于“${title}”，哪一项最符合本关核心内容？`,
    options,
    correctIndex: options.indexOf(correctOption),
    rationale: `正确答案应同时体现“${title}”的核心知识与应用导向，而不是停留在机械记忆。`,
    stretchTask: `如果把本关知识带到真实场景，请尝试围绕 ${localKeywords[0] || '一个关键词'} 再举一个应用例子。`,
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

  return `AI游戏化课件：${keywords[0] || '课程主题'}`
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
