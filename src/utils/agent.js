import { normalizeText } from './courseware.js'

export const COACH_MODES = {
  启发式: {
    id: '启发式',
    label: '启发式',
    description: '少一点直接给答案，多一点追问与引导。',
  },
  讲解式: {
    id: '讲解式',
    label: '讲解式',
    description: '用更清晰、直接的语言把知识讲明白。',
  },
  挑战式: {
    id: '挑战式',
    label: '挑战式',
    description: '把当前内容转成小任务、小闯关与限时挑战。',
  },
  复盘式: {
    id: '复盘式',
    label: '复盘式',
    description: '帮助学生总结、纠错并判断下一步。',
  },
}

export function createChatMessage(role, content) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: new Date().toISOString(),
  }
}

export function createOpeningMessages(course, learnerName) {
  const firstModule = course.modules[0]
  return [
    createChatMessage(
      'agent',
      `你好，${learnerName}。我是 ${course.agentProfile.name}，你的 ${course.agentProfile.role}。${course.agentProfile.opening}`,
    ),
    createChatMessage(
      'agent',
      `我已经把《${course.title}》拆成 ${course.modules.length} 个关卡。第一关是“${firstModule.title}”。你可以随时问我：解释一下、举个例子、给我提示、出一道题、总结一下。`,
    ),
  ]
}

export function createModuleArrivalMessage(module) {
  return createChatMessage(
    'agent',
    `${module.story}。先读概要，再完成测验与应用任务。本关重点是：${module.keyPoints.slice(0, 2).join('；')}。`,
  )
}

export function createQuizFeedback(module, isCorrect) {
  const content = isCorrect
    ? `回答正确。你已经抓住“${module.title}”的主线了。接下来建议把它带入一个真实情境，再写下你的应用思路。`
    : `这次没有命中，但方向已经接近。请回看“${module.keyPoints[0]}”，再想一想：本关强调的不是死记硬背，而是把知识带入情境。`

  return createChatMessage('agent', `${content} ${module.quiz.rationale}`)
}

export function createReflectionFeedback(module, reflectionText, firstSave) {
  const length = reflectionText.trim().length
  let content = '我已经收到你的应用反思。'

  if (length < 30) {
    content += '可以再多写一点，最好补上“对象是谁、情境是什么、你会怎么做”这三点。'
  } else {
    content += `你的反思已经开始把知识带回真实场景。接下来可以再补充 ${module.socialWorkFocus.theory} 的视角，让解释更完整。`
  }

  if (firstSave) {
    content += ' 这次保存会计入本关成长进度。'
  }

  return createChatMessage('agent', content)
}

export function createCompletionMessage(module, isLastModule) {
  const content = isLastModule
    ? `太好了，你已经完成“${module.title}”，并通关全部主线。现在可以进入终局任务，把整门课整合成一个真实可用的小方案。`
    : `恭喜你完成“${module.title}”。新的关卡已经解锁，继续前往下一关，保持节奏。`

  return createChatMessage('agent', content)
}

export function createFinalBossFeedback(course, text) {
  const message = normalizeText(text)
  const matchedKeywords = course.keywords.filter((keyword) => message.includes(keyword)).length
  let content = '我已收到你的终局方案。'

  if (message.length < 60) {
    content += '建议再写具体一点，至少说明：对象、情境、目标、行动步骤。'
  } else if (matchedKeywords >= 2) {
    content += `你已经把多个核心概念整合起来了。下一步可以再强化 ${course.theoryBridge.socialWork.split('：')[0]} 的价值线索，让方案更有辨识度。`
  } else {
    content += '方案有雏形了，但还可以更像“课程整合方案”，建议至少点出两个核心概念再落到行动。'
  }

  return createChatMessage('agent', content)
}

export function createModeSwitchMessage(modeId) {
  const mode = COACH_MODES[modeId] || COACH_MODES.启发式
  return createChatMessage('agent', `已切换到${mode.label}。${mode.description}`)
}

export function createHintMessage(module, level = '轻提示') {
  if (level === '关键提示') {
    return createChatMessage(
      'agent',
      `关键提示来了：这一关不要只背概念。请按“概念是什么—适用情境是什么—你准备怎么做”三步组织回答，并至少带上 ${module.keywords.slice(0, 2).join('、') || '两个关键词'}。`,
    )
  }

  if (level === '中提示') {
    return createChatMessage(
      'agent',
      `中提示：先回看这两个抓手——${module.keyPoints.slice(0, 2).join('；')}。然后问自己：如果把它放进课堂、社区或服务情境里，我会先识别谁、什么处境、可用什么资源？`,
    )
  }

  return createChatMessage(
    'agent',
    `轻提示：先不要急着写完整答案，只要先说清“${module.title}”最核心的一个关键词是什么，以及它在哪种真实情境里会被用到。`,
  )
}

export function getQuickPrompts(module, modeId = '启发式') {
  const prompts = [
    `解释一下“${module.title}”`,
    `给“${module.title}”举个例子`,
    `给我一个轻提示`,
    `围绕“${module.title}”出一道题`,
    `总结一下这一关`,
    '下一步做什么',
  ]

  if (modeId === '挑战式') {
    return [`给我一个限时挑战`, ...prompts.slice(1)]
  }

  if (modeId === '复盘式') {
    return ['帮我复盘这一关', ...prompts.slice(1)]
  }

  if (modeId === '讲解式') {
    return ['请直接讲明白这一关', ...prompts.slice(1)]
  }

  return prompts
}

export function buildLearningDiagnosis(module, session) {
  const answer = session?.answers?.[module.id]
  const reflection = session?.reflections?.[module.id]?.trim() || ''
  const cleared = session?.clearedModules?.includes(module.id)

  if (cleared) {
    return {
      phase: '已通关',
      status: '这一关已经完成，可以选择复盘，或进入下一关继续推进。',
      nextStep: '如果想加深理解，可以让智能体用复盘式模式帮你总结这关。',
      focus: `可回顾的高频抓手：${module.keyPoints.slice(0, 2).join('；')}`,
    }
  }

  if (!answer) {
    return {
      phase: '待测验',
      status: '你已经阅读了关卡内容，但还没有完成挑战题。',
      nextStep: '先完成“统一挑战题”，判断自己是否真正抓住了主线。',
      focus: `建议优先盯住：${module.keywords.slice(0, 3).join('、') || '核心概念'}`,
    }
  }

  if (answer && !answer.isCorrect) {
    return {
      phase: '待校正',
      status: '你已经作答，但当前理解还有偏差。',
      nextStep: '先让智能体解释或给提示，再回看关卡内容中的关键点。',
      focus: `优先复看：${module.keyPoints[0] || module.summary}`,
    }
  }

  if (!reflection) {
    return {
      phase: '待迁移',
      status: '挑战题已完成，但还没有把知识迁移到真实情境。',
      nextStep: '现在最重要的是写“应用迁移任务”，把知识落到对象、情境和行动。',
      focus: module.socialWorkFocus.bridgePrompt,
    }
  }

  return {
    phase: '可通关',
    status: '你已经完成了本关的关键步骤。',
    nextStep: '点击“完成本关并解锁下一关”，进入新的主线任务。',
    focus: `如果想再稳一点，可以检查你的反思中是否体现了 ${module.socialWorkFocus.theory}。`,
  }
}

export function generateAgentReply({ course, module, session, message, coachMode = '启发式' }) {
  const text = normalizeText(message)
  const lower = text.toLowerCase()

  if (matches(lower, ['轻提示', '中提示', '关键提示'])) {
    if (lower.includes('关键')) return createHintMessage(module, '关键提示')
    if (lower.includes('中')) return createHintMessage(module, '中提示')
    return createHintMessage(module, '轻提示')
  }

  if (matches(lower, ['解释', '什么意思', '不懂', '看不懂', '怎么理解', '讲明白'])) {
    return replyByMode({
      modeId: coachMode,
      explain: `可以把“${module.title}”拆成三步来理解：第一，知道它在讲什么；第二，知道它为什么重要；第三，知道它在什么情境里能用。你先记住这三个抓手：${module.keyPoints.join('；')}。`,
      guide: `先别急着背定义。你先试着回答我两个问题：1）“${module.title}”最核心在处理什么问题？2）它如果放进真实情境，会影响谁、怎么影响？`,
      challenge: `来做一个 60 秒挑战：请你只用“概念—情境—行动”三个词框架，说清“${module.title}”。如果说完还卡住，我再继续给你提示。`,
      review: `复盘版解释：这一关最重要的不是记住字面定义，而是看懂“${module.title}”如何在真实情境中发挥作用。请优先抓住：${module.keyPoints.slice(0, 2).join('；')}。`,
    })
  }

  if (matches(lower, ['举例', '案例', '情境', '怎么用', '应用'])) {
    return replyByMode({
      modeId: coachMode,
      explain: `给你一个例子：假设你正在一个具体课堂、社区或服务场景中，需要处理“${module.title}”相关问题。你可以先识别对象处境，再判断可用资源，最后设计行动步骤。这样就把抽象概念转成了可操作方案。`,
      guide: `我们换成例子来想。假设现在有一个真实对象站在你面前，你觉得他最先面临的处境是什么？你会怎样把“${module.title}”带进去？`,
      challenge: `例子挑战：请你自己设计一个不超过 50 字的情境，让“${module.title}”在里面发挥作用。我来帮你检查是否贴合。`,
      review: `如果把这一关放进一个案例里，你需要至少说明三点：对象是谁、情境是什么、行动怎么展开。这三点缺一项，案例就不够完整。`,
    })
  }

  if (matches(lower, ['提示', '不会', '卡住', 'help', '帮帮我'])) {
    return replyByMode({
      modeId: coachMode,
      explain: `${module.aiCoach.opening}${module.aiCoach.hint} 如果还卡住，就先回答一个最小问题：这一关最重要的关键词是什么？`,
      guide: `我不直接给完整答案，先只问你一个最小问题：这一关最值得你先抓住的关键词是哪个？为什么不是别的词？`,
      challenge: `提示挑战：你先说一个关键词、一个情境、一个动作。我只检查你这三个点是否连得起来。`,
      review: `如果你现在卡住，通常说明你还没有把“概念”和“情境”连起来。先看 ${module.keyPoints[0]}，再补一个真实场景。`,
    })
  }

  if (matches(lower, ['总结', '概括', '回顾', '复盘'])) {
    const completedCount = session?.clearedModules?.length || 0
    return createChatMessage(
      'agent',
      `本关可以压缩成“三句话”：1）${module.summary} 2）要抓住 ${module.keywords.slice(0, 3).join('、') || '核心概念'} 3）最后一定要把它带回真实情境。你目前已完成 ${completedCount} 个关卡。`,
    )
  }

  if (matches(lower, ['下一步', '接下来', '怎么学', '继续'])) {
    const diagnosis = buildLearningDiagnosis(module, session)
    return createChatMessage('agent', `${diagnosis.status}${diagnosis.nextStep}`)
  }

  if (matches(lower, ['出题', '题目', '测试', 'quiz', '考考我'])) {
    return replyByMode({
      modeId: coachMode,
      explain: `临时挑战：如果把“${module.title}”放进一个真实情境，你最先要识别的是什么？参考作答方向：先判断对象与处境，再找关键概念与支持资源，最后说明行动步骤。`,
      guide: `我先不直接出选择题，而是给你一个引导题：如果你面对一个真实对象，你会先判断“知识点本身”，还是先判断“对象所处情境”？为什么？`,
      challenge: `限时挑战题：请你在 40 秒内回答——“${module.title}”最容易被误解成什么？真正的重点又是什么？`,
      review: `复盘题：请你说出本关最核心的一个概念、一个情境和一个行动步骤。如果这三者能连上，说明你基本过关。`,
    })
  }

  if (matches(lower, ['限时挑战', '挑战'])) {
    return createChatMessage(
      'agent',
      `挑战开始：请你用不超过 80 字回答——在一个具体课堂、社区或服务场景里，你会如何运用“${module.title}”？记得至少带上 ${module.keywords.slice(0, 2).join('、') || '两个关键词'}。`,
    )
  }

  if (matches(lower, ['社工', '优势', '赋能', '生态', '情境', '支持'])) {
    return createChatMessage(
      'agent',
      `从 ${module.socialWorkFocus.theory} 来看，这一关不只是“学会一个知识点”，更是把知识放进人和环境的关系里理解。你可以围绕这句任务提示继续想：${module.socialWorkFocus.bridgePrompt}`,
    )
  }

  if (looksLikeLearnerAnswer(text)) {
    return evaluateLearnerAnswer(module, text, coachMode)
  }

  return replyByMode({
    modeId: coachMode,
    explain: `我理解你的意思了。围绕《${course.title}》当前这一关“${module.title}”，我建议你先抓住 ${module.keywords.slice(0, 2).join('、') || '核心概念'}，再把它带入一个真实场景。如果你愿意，可以直接对我说“解释一下”“举个例子”或“给我出一道题”。`,
    guide: `我先不急着回答完整结论。你先说说：围绕“${module.title}”，你目前最确定的一点是什么？最不确定的一点又是什么？我可以顺着你的回答继续带。`,
    challenge: `那我们就把它变成任务：请你先用一句话说出“${module.title}”最关键的点，再补一个真实情境。我会根据你的答案判定你离通关还有多远。`,
    review: `如果把你刚才的问题放到复盘里看，它本质上是在问：这一关的核心概念、应用情境和行动步骤是否连起来了。你可以按这三步再组织一次。`,
  })
}

function evaluateLearnerAnswer(module, text, coachMode) {
  const matchedKeywords = module.keywords.filter((keyword) => text.includes(keyword)).length

  if (text.length < 24) {
    return replyByMode({
      modeId: coachMode,
      explain: '你的回答已经有方向了，但还可以展开一点。建议至少补上三个部分：概念是什么、适用情境是什么、你会怎么做。',
      guide: '你的回答已经开了个头。接下来我只追问你两个点：它具体适用于什么情境？你会采取什么行动？',
      challenge: '现在把答案升级一下：在不超过 60 字里，加上一个情境和一个行动词，再发给我。',
      review: '当前回答太短，说明你的理解可能还停留在概念层。复盘时要补齐“概念—情境—行动”三段。',
    })
  }

  if (matchedKeywords >= 2) {
    return replyByMode({
      modeId: coachMode,
      explain: `你的理解已经抓住了本关的关键概念。下一步可以再补一句 ${module.socialWorkFocus.theory} 的视角，让回答从“知道”升级为“会用”。`,
      guide: `你的答案已经比较稳了。现在我追问一步：如果换一个对象或换一个情境，你的做法需要怎么调整？`,
      challenge: `升级挑战：请把你刚才的答案再压缩成一句“面向真实对象的行动建议”。`,
      review: '你的回答已经触到核心了。复盘时再检查是否明确了对象、处境和支持资源，就更完整。',
    })
  }

  return replyByMode({
    modeId: coachMode,
    explain: `你的回答有自己的理解，这是很好的开始。现在再把它和本关的关键词连接起来：${module.keywords.slice(0, 3).join('、') || '核心概念'}，这样会更稳。`,
    guide: `你已经有自己的想法了。现在请你自己判断：你的回答里有没有明确指出一个关键词、一个情境、一个行动？缺的是哪一项？`,
    challenge: `小挑战：请你保留原回答，再额外补一行“本关关键词：……；适用情境：……；行动：……”。`,
    review: '这份回答有基础，但还不够聚焦。复盘时优先看是否把关键词真正写进去了。',
  })
}

function replyByMode({ modeId, explain, guide, challenge, review }) {
  if (modeId === '讲解式') {
    return createChatMessage('agent', explain)
  }
  if (modeId === '挑战式') {
    return createChatMessage('agent', challenge)
  }
  if (modeId === '复盘式') {
    return createChatMessage('agent', review)
  }
  return createChatMessage('agent', guide)
}

function looksLikeLearnerAnswer(text) {
  return /我认为|我的理解|我觉得|我的回答|我学到|我会|我打算|我想/.test(text)
}

function matches(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword))
}
