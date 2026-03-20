import { normalizeText } from './courseware.js'

export const AI_PROVIDER_PRESETS = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    note: '默认走 OpenAI 兼容接口。若浏览器出现跨域报错，可改用自定义中转接口。',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    note: '适合快速接入多模型。浏览器端会自动附带站点标识头。',
  },
  qwen: {
    label: '通义千问兼容模式',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
    note: '使用阿里云 DashScope 的 OpenAI 兼容地址。',
  },
  kimi: {
    label: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    note: '适合中文长文理解。',
  },
  siliconflow: {
    label: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    note: '支持较多开源模型的兼容调用。',
  },
  custom: {
    label: '自定义 OpenAI 兼容接口',
    baseUrl: '',
    model: '',
    note: '适合接入自建代理、学校网关或本地中转服务。',
  },
}

export const DEFAULT_AI_CONFIG = {
  enabled: false,
  provider: 'deepseek',
  baseUrl: AI_PROVIDER_PRESETS.deepseek.baseUrl,
  model: AI_PROVIDER_PRESETS.deepseek.model,
  apiKey: '',
  useForCourseGeneration: true,
  useForTutorChat: true,
  courseTemperature: 0.7,
  chatTemperature: 0.6,
}

export function applyProviderPreset(provider, currentConfig = DEFAULT_AI_CONFIG) {
  const preset = AI_PROVIDER_PRESETS[provider] || AI_PROVIDER_PRESETS.custom
  return {
    ...currentConfig,
    provider,
    baseUrl: preset.baseUrl,
    model: preset.model,
  }
}

export function canUseRealAI(config) {
  return Boolean(
    config?.enabled &&
    config?.apiKey?.trim() &&
    config?.baseUrl?.trim() &&
    config?.model?.trim(),
  )
}

export function getProviderNote(provider) {
  return (AI_PROVIDER_PRESETS[provider] || AI_PROVIDER_PRESETS.custom).note
}

export async function enrichCourseWithAI({ aiConfig, sourceText, baseCourse, options }) {
  const clippedText = clipTextForModel(sourceText, 14000)
  const moduleBlueprint = baseCourse.modules.map((module, index) => {
    const questText = Array.isArray(module.missions)
      ? module.missions.map((item) => `${item.title}：${item.detail}`).join('；')
      : ''

    return [
      `模块 ${index + 1} 标题：${module.title}`,
      `摘要：${module.summary}`,
      `关键词：${module.keywords.join('、')}`,
      `关键点：${module.keyPoints.join('；')}`,
      `当前任务：${questText}`,
    ].join('\n')
  }).join('\n\n')

  const systemPrompt = `你是一名“课件游戏化设计专家 + AI 学习陪练设计师 + 社会工作教育专家”。
你的任务是：把教师上传的课件，重构为学生可直接使用的闯关式自主学习工具。
要求：
1. 输出必须是严格 JSON，不要出现 markdown 代码块，不要写解释。
2. 语言全部使用简体中文。
3. 模块数量必须与给定目标一致。
4. 每个模块都必须适合学生自学，要有互动感、任务感、情境感。
5. 必须融入社工理论透镜，但不要写得空泛，要落到真实学习与应用场景。
6. quiz.options 必须正好 4 个；correctIndex 必须是 0-3 的整数。
7. 每个模块的 missions 必须正好 3 个。
8. 输出字段必须完整，不要丢字段。`

  const userPrompt = `请基于以下信息生成 JSON：

【课程设定】
课程名称：${baseCourse.title}
适用对象：${options?.targetLearners || '学生'}
社工理论透镜：${baseCourse.settings?.socialLens || ''}
游戏化风格：${baseCourse.settings?.gameStyle || ''}
目标模块数：${baseCourse.modules.length}
智能体名称：${baseCourse.agentProfile.name}

【课件原文节选】
${clippedText}

【当前初版蓝图】
${moduleBlueprint}

请输出 JSON，结构如下：
{
  "title": "课程标题",
  "description": "课程总体描述",
  "keywords": ["关键词1", "关键词2"],
  "learningObjectives": ["目标1", "目标2"],
  "agentProfile": {
    "name": "智能体名称",
    "opening": "开场白"
  },
  "modules": [
    {
      "title": "模块标题",
      "summary": "模块摘要",
      "keyPoints": ["点1", "点2", "点3"],
      "scene": "情境描述",
      "challenge": "挑战说明",
      "missions": [
        { "title": "任务1", "detail": "内容", "reward": "+20 经验值" },
        { "title": "任务2", "detail": "内容", "reward": "+20 经验值" },
        { "title": "任务3", "detail": "内容", "reward": "+40 经验值" }
      ],
      "socialWorkFocus": {
        "mission": "社工任务",
        "reflectionPrompt": "反思提示",
        "bridgePrompt": "迁移提示"
      },
      "aiCoach": {
        "opening": "AI 开场提醒",
        "hint": "AI 提示",
        "nextStep": "下一步建议"
      },
      "quiz": {
        "question": "题干",
        "options": ["A", "B", "C", "D"],
        "correctIndex": 0,
        "rationale": "解析",
        "stretchTask": "延伸任务"
      },
      "bossPrompt": "本关终极问答"
    }
  ],
  "finalBoss": {
    "title": "终局任务标题",
    "prompt": "终局任务要求",
    "rubric": ["评分点1", "评分点2", "评分点3"]
  }
}`

  const text = await requestChatCompletion(aiConfig, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: Number(aiConfig.courseTemperature) || 0.7,
    maxTokens: 2200,
  })

  const parsed = parseJsonFromModelText(text)
  return mergeCourseFromAI(baseCourse, parsed)
}

export async function getTutorReplyWithAI({ aiConfig, course, module, session, message }) {
  const history = (session?.chatHistory || [])
    .slice(-8)
    .map((item) => ({
      role: item.role === 'agent' ? 'assistant' : 'user',
      content: item.content,
    }))

  const systemPrompt = `你是“${course.agentProfile.name}”，一名面向学生的 AI 学习陪练。
你的职责：
1. 围绕当前关卡内容进行解释、举例、提示、提问、总结与纠错。
2. 语气鼓励、具体、像陪练，不要空泛说教。
3. 默认优先引导学生思考，不是一上来直接给标准答案；但如果学生明确要求，也可以给清晰答案。
4. 要体现 ${module.socialWorkFocus.theory} 的视角，把知识和真实情境、资源、支持、行动联系起来。
5. 只根据给定课程与关卡上下文回答；如果超出上下文，要诚实说明并给出学习建议。
6. 回复用简体中文，尽量控制在 120-220 字，除非学生明确要求详细展开。`

  const contextPrompt = `【课程】${course.title}
【课程描述】${course.description}
【当前关卡】${module.title}
【关卡摘要】${module.summary}
【关键点】${module.keyPoints.join('；')}
【关键词】${module.keywords.join('、')}
【关卡正文】${clipTextForModel(module.content, 3600)}
【社工透镜】${module.socialWorkFocus.theory}
【社工任务】${module.socialWorkFocus.bridgePrompt}
【学生当前进度】已完成 ${session?.clearedModules?.length || 0}/${course.modules.length} 关
【已提交测验】${session?.answers?.[module.id] ? '是' : '否'}
【已写应用反思】${session?.reflections?.[module.id]?.trim() ? '是' : '否'}`

  return requestChatCompletion(aiConfig, {
    messages: [
      { role: 'system', content: `${systemPrompt}\n\n${contextPrompt}` },
      ...history,
      { role: 'user', content: message },
    ],
    temperature: Number(aiConfig.chatTemperature) || 0.6,
    maxTokens: 900,
  })
}

async function requestChatCompletion(aiConfig, { messages, temperature = 0.7, maxTokens = 1200 }) {
  const endpoint = `${normalizeBaseUrl(aiConfig.baseUrl)}/chat/completions`
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${aiConfig.apiKey.trim()}`,
    ...buildProviderHeaders(aiConfig.provider),
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: aiConfig.model.trim(),
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`AI 接口调用失败：${response.status} ${truncate(errorText, 240)}`)
  }

  const data = await response.json()
  const content = extractCompletionText(data)
  if (!content) {
    throw new Error('AI 接口返回成功，但没有可读取的回复内容。')
  }

  return normalizeText(content)
}

function buildProviderHeaders(provider) {
  if (provider === 'openrouter' && typeof window !== 'undefined') {
    return {
      'HTTP-Referer': window.location.href,
      'X-Title': '智助学',
    }
  }
  return {}
}

function extractCompletionText(data) {
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || item?.content || '')
      .join('')
      .trim()
  }
  return ''
}

function parseJsonFromModelText(text) {
  const trimmed = text.trim()
  const direct = tryParseJson(trimmed)
  if (direct) {
    return direct
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch) {
    const fenced = tryParseJson(fencedMatch[1].trim())
    if (fenced) {
      return fenced
    }
  }

  const candidate = extractJsonCandidate(trimmed)
  const parsed = tryParseJson(candidate)
  if (parsed) {
    return parsed
  }

  throw new Error('AI 已返回内容，但无法解析为 JSON。请检查模型是否支持严格 JSON 输出。')
}

function extractJsonCandidate(text) {
  const start = text.indexOf('{')
  if (start < 0) {
    return text
  }

  let depth = 0
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) {
      return text.slice(start, i + 1)
    }
  }

  return text.slice(start)
}

function tryParseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function mergeCourseFromAI(baseCourse, aiPayload) {
  const aiModules = Array.isArray(aiPayload?.modules) ? aiPayload.modules : []
  const modules = baseCourse.modules.map((module, index) => {
    const aiModule = aiModules[index] || {}
    const mergedMissions = Array.isArray(aiModule.missions) && aiModule.missions.length >= 3
      ? module.missions.map((mission, missionIndex) => ({
          ...mission,
          title: pickText(aiModule.missions[missionIndex]?.title, mission.title),
          detail: pickText(aiModule.missions[missionIndex]?.detail, mission.detail),
          reward: pickText(aiModule.missions[missionIndex]?.reward, mission.reward),
        }))
      : module.missions

    const mergedQuizOptions = normalizeStringArray(aiModule?.quiz?.options, module.quiz.options, 4)
    const aiCorrectIndex = Number.isInteger(aiModule?.quiz?.correctIndex)
      ? clamp(aiModule.quiz.correctIndex, 0, Math.max(0, mergedQuizOptions.length - 1))
      : module.quiz.correctIndex

    return {
      ...module,
      title: pickText(aiModule.title, module.title),
      summary: pickText(aiModule.summary, module.summary),
      keyPoints: normalizeStringArray(aiModule.keyPoints, module.keyPoints, 4),
      scene: pickText(aiModule.scene, module.scene),
      challenge: pickText(aiModule.challenge, module.challenge),
      missions: mergedMissions,
      socialWorkFocus: {
        ...module.socialWorkFocus,
        mission: pickText(aiModule?.socialWorkFocus?.mission, module.socialWorkFocus.mission),
        reflectionPrompt: pickText(aiModule?.socialWorkFocus?.reflectionPrompt, module.socialWorkFocus.reflectionPrompt),
        bridgePrompt: pickText(aiModule?.socialWorkFocus?.bridgePrompt, module.socialWorkFocus.bridgePrompt),
      },
      aiCoach: {
        ...module.aiCoach,
        opening: pickText(aiModule?.aiCoach?.opening, module.aiCoach.opening),
        hint: pickText(aiModule?.aiCoach?.hint, module.aiCoach.hint),
        nextStep: pickText(aiModule?.aiCoach?.nextStep, module.aiCoach.nextStep),
      },
      quiz: {
        ...module.quiz,
        question: pickText(aiModule?.quiz?.question, module.quiz.question),
        options: mergedQuizOptions,
        correctIndex: aiCorrectIndex,
        rationale: pickText(aiModule?.quiz?.rationale, module.quiz.rationale),
        stretchTask: pickText(aiModule?.quiz?.stretchTask, module.quiz.stretchTask),
      },
      bossPrompt: pickText(aiModule.bossPrompt, module.bossPrompt),
    }
  })

  return {
    ...baseCourse,
    title: pickText(aiPayload?.title, baseCourse.title),
    description: pickText(aiPayload?.description, baseCourse.description),
    keywords: normalizeStringArray(aiPayload?.keywords, baseCourse.keywords, 12),
    learningObjectives: normalizeStringArray(aiPayload?.learningObjectives, baseCourse.learningObjectives, 6),
    modules,
    worldMap: modules.map((module, index) => ({
      id: module.id,
      label: `第 ${index + 1} 关`,
      title: module.title,
      badge: module.badge,
      difficulty: module.difficulty,
    })),
    agentProfile: {
      ...baseCourse.agentProfile,
      name: pickText(aiPayload?.agentProfile?.name, baseCourse.agentProfile.name),
      opening: pickText(aiPayload?.agentProfile?.opening, baseCourse.agentProfile.opening),
    },
    finalBoss: {
      ...baseCourse.finalBoss,
      title: pickText(aiPayload?.finalBoss?.title, baseCourse.finalBoss.title),
      prompt: pickText(aiPayload?.finalBoss?.prompt, baseCourse.finalBoss.prompt),
      rubric: normalizeStringArray(aiPayload?.finalBoss?.rubric, baseCourse.finalBoss.rubric, 6),
    },
    runtime: {
      ...(baseCourse.runtime || {}),
      generator: 'llm',
    },
  }
}

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '')
}

function pickText(value, fallback) {
  const cleaned = normalizeText(String(value || ''))
  return cleaned || fallback
}

function normalizeStringArray(value, fallback, maxLength) {
  if (!Array.isArray(value)) {
    return fallback
  }

  const cleaned = value
    .map((item) => normalizeText(String(item || '')))
    .filter(Boolean)

  if (cleaned.length === 0) {
    return fallback
  }

  return cleaned.slice(0, maxLength)
}

function clipTextForModel(text, maxLength) {
  const cleaned = normalizeText(text)
  if (cleaned.length <= maxLength) {
    return cleaned
  }
  return `${cleaned.slice(0, maxLength)}…`
}

function truncate(text, maxLength) {
  const value = String(text || '')
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
