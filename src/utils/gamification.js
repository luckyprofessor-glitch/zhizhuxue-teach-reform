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

export function buildCourseFromText(text, options = {}, filesMeta = [], sourceUnits = [], inheritedWarnings = []) {
  const normalized = normalizeText(text)
  const targetModules = clamp(Number(options.moduleCount) || 5, 3, 6)
  const moduleSeeds = buildModuleSeeds(normalized, sourceUnits, targetModules)
  const lens = SOCIAL_WORK_LENSES[options.socialLens] || SOCIAL_WORK_LENSES.优势视角
  const style = options.gameStyle || '闯关式'
  const fullKeywords = extractKeywords(normalized).slice(0, 12)
  const allChunks = moduleSeeds.map((seed) => seed.text)
  const sourceStructure = inferSourceStructure(sourceUnits)

  const modules = moduleSeeds.map((seed, index) => {
    const chunk = seed.text
    const localKeywords = extractKeywords(chunk).slice(0, 5)
    const sentences = splitSentences(chunk)
    const summary = shorten(sentences.slice(0, 2).join(' '), 110) || shorten(chunk, 110)
    const keyPoints = buildKeyPoints(sentences, localKeywords)
    const title = createModuleTitle(chunk, index, localKeywords, options, seed.shortLabel)
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
      story: createStoryTitle(title, index, style, seed.shortLabel),
      challenge: createChallenge(title, localKeywords, lens, difficulty),
      scene: createScene(title, sceneKeyword, lens, seed.label),
      realmName: createRealmName(title, index),
      sourceLabel: seed.label,
      sourceKind: seed.kind,
      sourceUnits: seed.units,
      collectibles: createCollectibles(localKeywords, fullKeywords, index, summary, keyPoints),
      scenario: createScenario(title, sceneKeyword, lens, localKeywords, fullKeywords),
      boss: createBoss(title, index, difficulty),
      bossBattle: createBossBattle({
        title,
        summary,
        localKeywords,
        fullKeywords,
        lens,
        quiz,
        difficulty,
      }),
      rewards: {
        coins: 30 + index * 5,
        gems: index % 2 === 0 ? 1 : 2,
      },
      missions: [
        {
          id: `module-${index + 1}-scan`,
          title: sourceStructure === 'slide-based' ? '任务 1｜扫描本段幻灯片主线' : '任务 1｜侦察核心概念',
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
  const structureDescription = getStructureDescription(sourceStructure, moduleSeeds)

  return {
    id: `course-${Date.now()}`,
    title,
    subtitle: `${options.targetLearners || '学生'}自学模式｜${style}｜${lens.name}`,
    description: `系统已把上传课件重构为 ${modules.length} 个可互动的游戏化关卡，学生可以直接进行翻牌侦察、情境抉择、Boss 战与终局挑战。${structureDescription}`,
    keywords: fullKeywords,
    learningObjectives: modules.slice(0, 4).map((module, index) => `目标 ${index + 1}：掌握“${module.title}”，并能结合 ${lens.name} 说清其真实应用情境。`),
    modules,
    worldMap: modules.map((module, index) => ({
      id: module.id,
      label: module.sourceLabel || `第 ${index + 1} 关`,
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
    classroom: {
      className: (options.className || '').trim(),
      teacherName: (options.teacherName || '').trim(),
      entryCode: (options.entryCode || '').trim(),
    },
    theoryBridge: {
      socialWork: `${lens.name}：${lens.tagline}`,
      ai: 'AI 模块负责自动拆分课件、提炼重点、生成任务、即时回答问题，并根据学生进度给出下一步建议。',
      pedagogy: `${style}：${GAME_STYLES[style] || GAME_STYLES.闯关式}`,
    },
    gameMeta: {
      worldName: createWorldName(title, lens.name),
      heroTitle: '学习探索者',
      startNarrative: `你的任务是穿越 ${modules.length} 个知识关卡，收集概念碎片、完成情境抉择，并在终局挑战中把整门课转化为可执行方案。`,
    },
    finalBoss: {
      title: '终局任务｜把整门课带回真实世界',
      bossName: '知识终幕之门',
      prompt: `请结合整门课的核心概念，设计一个可落地的小方案，说明你会如何在真实教学、社区或服务情境中应用这些知识，并体现 ${lens.name}。`,
      rubric: [
        '是否点明至少两个核心概念',
        '是否体现真实情境与对象',
        `是否体现 ${lens.name} 的价值逻辑`,
        '是否提出具体可执行的行动步骤',
      ],
    },
    sourceFiles: filesMeta,
    sourceStructure,
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

function buildModuleSeeds(normalizedText, sourceUnits, targetModules) {
  const normalizedUnits = normalizeSourceUnits(sourceUnits)
  if (normalizedUnits.length > 0) {
    return groupSourceUnits(normalizedUnits, targetModules)
  }

  const paragraphs = extractParagraphs(normalizedText)
  return groupParagraphs(paragraphs, targetModules).map((chunk, index) => ({
    text: chunk,
    label: `第 ${index + 1} 关`,
    shortLabel: `关卡 ${index + 1}`,
    kind: 'text-block',
    units: [],
  }))
}

function normalizeSourceUnits(sourceUnits) {
  return (sourceUnits || [])
    .filter((unit) => normalizeText(unit?.text || '').length > 10)
    .map((unit, index) => ({
      id: unit.id || `unit-${index + 1}`,
      title: normalizeText(unit.title || `片段 ${index + 1}`),
      order: Number(unit.order) || index + 1,
      kind: unit.kind || 'text-block',
      text: normalizeText(unit.text || ''),
    }))
    .sort((a, b) => a.order - b.order)
}

function groupSourceUnits(units, targetModules) {
  if (units.length === 0) {
    return []
  }

  if (units.length <= targetModules) {
    return units.map((unit) => ({
      text: unit.text,
      label: formatUnitRange([unit]),
      shortLabel: unit.title,
      kind: unit.kind,
      units: [unit],
    }))
  }

  const groups = []
  const size = Math.ceil(units.length / targetModules)
  for (let i = 0; i < units.length; i += size) {
    const slice = units.slice(i, i + size)
    groups.push({
      text: slice.map((unit) => `${unit.title}\n${unit.text}`).join('\n\n'),
      label: formatUnitRange(slice),
      shortLabel: formatShortRange(slice),
      kind: slice[0].kind,
      units: slice,
    })
  }
  return groups.slice(0, targetModules)
}

function formatUnitRange(units) {
  if (units.length === 0) {
    return '未命名单元'
  }

  const first = units[0]
  const last = units[units.length - 1]
  const prefix = getUnitPrefix(first.kind)

  if (units.length === 1) {
    return `${prefix}${first.title}`
  }
  return `${prefix}${first.title}—${last.title}`
}

function formatShortRange(units) {
  if (units.length === 0) {
    return ''
  }
  if (units.length === 1) {
    return units[0].title
  }
  return `${units[0].title}—${units[units.length - 1].title}`
}

function getUnitPrefix(kind) {
  if (kind === 'ppt-slide') return 'PPT '
  if (kind === 'pdf-page') return 'PDF '
  return ''
}

function inferSourceStructure(sourceUnits) {
  const kinds = new Set((sourceUnits || []).map((unit) => unit.kind))
  if (kinds.has('ppt-slide')) return 'slide-based'
  if (kinds.has('pdf-page')) return 'page-based'
  return 'text-based'
}

function getStructureDescription(sourceStructure, moduleSeeds) {
  if (sourceStructure === 'slide-based') {
    return ` 当前已按幻灯片结构重组，共识别 ${moduleSeeds.reduce((sum, seed) => sum + seed.units.length, 0)} 页内容。`
  }
  if (sourceStructure === 'page-based') {
    return ` 当前已按页码结构重组，共识别 ${moduleSeeds.reduce((sum, seed) => sum + seed.units.length, 0)} 页内容。`
  }
  return ''
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

function createModuleTitle(chunk, index, localKeywords, options, sourceLabel = '') {
  const heading = (chunk.split('\n')[0] || '').trim()
  if (heading && heading.length <= 24 && !isGenericHeading(heading)) {
    return heading
  }

  if (sourceLabel) {
    return `${sourceLabel}｜${localKeywords[0] || `核心概念${index + 1}`}`
  }

  const prefix = options.gameStyle === '剧情式' ? '剧情节点' : '任务'
  return `${prefix}${index + 1}：${localKeywords[0] || `核心概念${index + 1}`}`
}

function createStoryTitle(title, index, style, sourceLabel = '') {
  const labelPrefix = sourceLabel ? `${sourceLabel}｜` : `关卡 ${index + 1}｜`
  if (style === '剧情式') {
    return `${labelPrefix}你需要在情境推进中破解“${title}”`
  }
  if (style === '积分徽章式') {
    return `${labelPrefix}累计积分，点亮“${title}”徽章`
  }
  return `${labelPrefix}完成“${title}”三段式任务`
}

function createChallenge(title, localKeywords, lens, difficulty) {
  return `限时挑战：围绕“${title}”写出一个 60 秒解释，并至少纳入 ${localKeywords[0] || '一个关键词'}、${localKeywords[1] || '一个应用情境'} 与 ${lens.name} 视角。当前难度：${difficulty}。`
}

function createScene(title, sceneKeyword, lens, sourceLabel = '') {
  const sourceHint = sourceLabel ? `请先回到 ${sourceLabel} 对应的课件内容，` : ''
  return `情境引导：${sourceHint}假设你正在一个与“${sceneKeyword}”相关的课堂、社区或服务场景中，需要向他人解释“${title}”，并体现 ${lens.name}。`
}

function createRealmName(title, index) {
  const suffixes = ['认知之境', '理解回廊', '情境驿站', '行动工坊', '迁移之门', '任务原野']
  return `${title}${suffixes[index % suffixes.length]}`
}

function createCollectibles(localKeywords, fullKeywords, index, summary = '', keyPoints = []) {
  const seeds = [...localKeywords, ...fullKeywords].filter(Boolean)
  return seeds.slice(0, 3).map((keyword, itemIndex) => ({
    id: `collectible-${index + 1}-${itemIndex + 1}`,
    label: keyword,
    type: itemIndex === 0 ? '知识卡' : itemIndex === 1 ? '情境卡' : '策略卡',
    rewardCoins: 6 + itemIndex * 2,
    clue: createCollectibleClue(keyword, itemIndex, summary, keyPoints),
  }))
}

function createCollectibleClue(keyword, itemIndex, summary = '', keyPoints = []) {
  const anchor = keyPoints[itemIndex] || keyPoints[0] || summary || keyword
  if (itemIndex === 1) {
    return `把“${keyword}”带回情境：${shorten(anchor, 30)}`
  }
  if (itemIndex === 2) {
    return `把“${keyword}”变成行动：${shorten(anchor, 30)}`
  }
  return `抓住“${keyword}”的核心含义：${shorten(anchor, 30)}`
}

function createScenario(title, sceneKeyword, lens, localKeywords, fullKeywords) {
  const anchor = localKeywords[0] || fullKeywords[0] || '核心概念'
  const support = localKeywords[1] || fullKeywords[1] || '情境因素'
  return {
    prompt: `你进入了“${title}”对应的场景。面对与“${sceneKeyword}”相关的问题时，哪种行动最符合本关目标？`,
    options: [
      `先机械背诵 ${anchor} 的定义，不考虑对象情境。`,
      `先识别对象与处境，再结合 ${anchor} 和 ${support} 设计行动。`,
      `把问题完全交给他人处理，自己只记录现象。`,
    ],
    bestIndex: 1,
    rationale: `更优策略应同时考虑知识点、情境与行动步骤，并体现 ${lens.name}。`,
  }
}

function createBoss(title, index, difficulty) {
  const names = ['误解守门者', '情境迷雾兽', '记忆偏差体', '迁移试炼官', '行动边界兽']
  return {
    name: names[index % names.length],
    intro: `击败 ${names[index % names.length]}，证明你真正理解了“${title}”。`,
    hp: difficulty === '挑战' ? 4 : difficulty === '进阶' ? 3 : 2,
  }
}

function createBossBattle({ title, summary, localKeywords, fullKeywords, lens, quiz, difficulty }) {
  const totalRounds = difficulty === '挑战' ? 4 : difficulty === '进阶' ? 3 : 2
  const anchor = localKeywords[0] || fullKeywords[0] || '核心概念'
  const support = localKeywords[1] || fullKeywords[1] || '真实情境'
  const action = localKeywords[2] || fullKeywords[2] || '行动策略'
  const recallAnswer = quiz.options[quiz.correctIndex] || shorten(summary, 42)

  const rounds = [
    createBattleRound({
      question: quiz.question,
      correct: recallAnswer,
      distractors: [
        `只背诵 ${anchor} 的定义，不需要理解情境。`,
        `重点偏向 ${support} 之外的其他主题，与本关主线不大相关。`,
        '本关只要求完成打卡，不需要解释和应用。',
      ],
      rationale: quiz.rationale,
      hint: `先回到本关摘要：${shorten(summary, 34)}`,
      flavor: '第一回合先确认你是否抓住了主线。',
      seed: `${title}-boss-round-1`,
    }),
    createBattleRound({
      question: `若把“${title}”带入真实情境，哪种做法更合理？`,
      correct: `先识别对象与处境，再把 ${anchor} 和 ${support} 组织成行动。`,
      distractors: [
        `先机械背诵 ${anchor} 的定义，不分析场景。`,
        '把问题完全交给别人处理，自己不做判断。',
        '只追求立刻完成，不说明为什么这样做。',
      ],
      rationale: '这一步考查的不是记忆，而是把知识带入情境的能力。',
      hint: '先想清楚“对象是谁、处境如何、为什么要这样做”。',
      flavor: '第二回合开始考查真实应用。',
      seed: `${title}-boss-round-2`,
    }),
    createBattleRound({
      question: `哪种回答最能体现 ${lens.name} 视角？`,
      correct: `把 ${anchor}、${support} 与学习者已有资源连接起来，再推进 ${action}。`,
      distractors: [
        '只强调不足，不考虑已有资源与支持。',
        '只给结论，不说明行动步骤。',
        `把 ${action} 看成孤立动作，不考虑关系与情境。`,
      ],
      rationale: `真正体现 ${lens.name}，必须把知识、情境、资源与行动一起考虑。`,
      hint: `回忆 ${lens.name} 最重视的价值逻辑，再判断选项。`,
      flavor: '第三回合考查理论透镜是否真正落地。',
      seed: `${title}-boss-round-3`,
    }),
    createBattleRound({
      question: '面对 Boss 的最终追问，哪种回答最完整？',
      correct: `说明核心概念、对象情境、可动员资源与下一步行动，形成完整方案。`,
      distractors: [
        '只说一个定义，不解释适用条件。',
        '只给口号，不提出可执行步骤。',
        '只描述困难，不说明支持资源和行动路径。',
      ],
      rationale: '终局答案要形成概念—情境—资源—行动的闭环。',
      hint: '把答案组织成“四步走”：概念、情境、资源、行动。',
      flavor: '最终回合要求你把整关知识整合起来。',
      seed: `${title}-boss-round-4`,
    }),
  ]

  return {
    rounds: rounds.slice(0, totalRounds),
  }
}

function createBattleRound({ question, correct, distractors, rationale, hint, flavor, seed }) {
  const options = shuffleDeterministically([correct, ...distractors].slice(0, 4), seed)
  return {
    question,
    options,
    correctIndex: options.indexOf(correct),
    rationale,
    hint,
    flavor,
  }
}

function createWorldName(courseTitle, lensName) {
  return `${courseTitle} · ${lensName}冒险地图`
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

function isGenericHeading(heading) {
  return /^第\d+页$/.test(heading) || /^片段\s*\d+$/.test(heading) || /^第\s*\d+\s*关$/.test(heading)
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
