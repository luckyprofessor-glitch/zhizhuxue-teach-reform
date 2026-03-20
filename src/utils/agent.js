import { normalizeText } from './courseware.js'

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
  let content = `我已经收到你的应用反思。`

  if (length < 30) {
    content += `可以再多写一点，最好补上“对象是谁、情境是什么、你会怎么做”这三点。`
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

export function getQuickPrompts(module) {
  return [
    `解释一下“${module.title}”`,
    `给“${module.title}”举个例子`,
    `给我一个关于“${module.title}”的提示`,
    `围绕“${module.title}”出一道题`,
    `总结一下这一关`,
    '下一步做什么',
  ]
}

export function generateAgentReply({ course, module, session, message }) {
  const text = normalizeText(message)
  const lower = text.toLowerCase()

  if (matches(lower, ['解释', '什么意思', '不懂', '看不懂', '怎么理解'])) {
    return createChatMessage(
      'agent',
      `可以把“${module.title}”拆成三步来理解：第一，知道它在讲什么；第二，知道它为什么重要；第三，知道它在什么情境里能用。你先记住这三个抓手：${module.keyPoints.join('；')}。`,
    )
  }

  if (matches(lower, ['举例', '案例', '情境', '怎么用', '应用'])) {
    return createChatMessage(
      'agent',
      `给你一个例子：假设你正在一个具体课堂、社区或服务场景中，需要处理“${module.title}”相关问题。你可以先识别对象处境，再判断可用资源，最后设计行动步骤。这样就把抽象概念转成了可操作方案。`,
    )
  }

  if (matches(lower, ['提示', '不会', '卡住', 'help', '帮帮我'])) {
    return createChatMessage(
      'agent',
      `${module.aiCoach.opening}${module.aiCoach.hint} 如果还卡住，就先回答一个最小问题：这一关最重要的关键词是什么？`,
    )
  }

  if (matches(lower, ['总结', '概括', '回顾', '复盘'])) {
    const completedCount = session?.clearedModules?.length || 0
    return createChatMessage(
      'agent',
      `本关可以压缩成“三句话”：1）${module.summary} 2）要抓住 ${module.keywords.slice(0, 3).join('、') || '核心概念'} 3）最后一定要把它带回真实情境。你目前已完成 ${completedCount} 个关卡。`,
    )
  }

  if (matches(lower, ['下一步', '接下来', '怎么学', '继续'])) {
    const hasQuiz = Boolean(session?.answers?.[module.id])
    const hasReflection = Boolean(session?.reflections?.[module.id]?.trim())

    if (!hasQuiz) {
      return createChatMessage('agent', '你现在最该做的是完成本关测验。先判断自己是否真正抓住了关键信息，再进入应用任务。')
    }
    if (!hasReflection) {
      return createChatMessage('agent', `测验已经完成。下一步请写一段应用反思：${module.socialWorkFocus.bridgePrompt}`)
    }
    return createChatMessage('agent', '你已经具备通关条件，点击“完成本关并解锁下一关”即可继续。')
  }

  if (matches(lower, ['出题', '题目', '测试', 'quiz', '考考我'])) {
    return createChatMessage(
      'agent',
      `临时挑战：如果把“${module.title}”放进一个真实情境，你最先要识别的是什么？参考作答方向：先判断对象与处境，再找关键概念与支持资源，最后说明行动步骤。`,
    )
  }

  if (matches(lower, ['社工', '优势', '赋能', '生态', '情境', '支持'])) {
    return createChatMessage(
      'agent',
      `从 ${module.socialWorkFocus.theory} 来看，这一关不只是“学会一个知识点”，更是把知识放进人和环境的关系里理解。你可以围绕这句任务提示继续想：${module.socialWorkFocus.bridgePrompt}`,
    )
  }

  if (looksLikeLearnerAnswer(text)) {
    return evaluateLearnerAnswer(module, text)
  }

  return createChatMessage(
    'agent',
    `我理解你的意思了。围绕《${course.title}》当前这一关“${module.title}”，我建议你先抓住 ${module.keywords.slice(0, 2).join('、') || '核心概念'}，再把它带入一个真实场景。如果你愿意，可以直接对我说“解释一下”“举个例子”或“给我出一道题”。`,
  )
}

function evaluateLearnerAnswer(module, text) {
  const matchedKeywords = module.keywords.filter((keyword) => text.includes(keyword)).length

  if (text.length < 24) {
    return createChatMessage(
      'agent',
      `你的回答已经有方向了，但还可以展开一点。建议至少补上三个部分：概念是什么、适用情境是什么、你会怎么做。`,
    )
  }

  if (matchedKeywords >= 2) {
    return createChatMessage(
      'agent',
      `你的理解已经抓住了本关的关键概念。下一步可以再补一句 ${module.socialWorkFocus.theory} 的视角，让回答从“知道”升级为“会用”。`,
    )
  }

  return createChatMessage(
    'agent',
    `你的回答有自己的理解，这是很好的开始。现在再把它和本关的关键词连接起来：${module.keywords.slice(0, 3).join('、') || '核心概念'}，这样会更稳。`,
  )
}

function looksLikeLearnerAnswer(text) {
  return /我认为|我的理解|我觉得|我的回答|我学到|我会/.test(text)
}

function matches(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword))
}
