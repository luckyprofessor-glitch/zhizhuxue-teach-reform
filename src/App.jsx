import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { extractTextFromFile } from './utils/courseware.js'
import {
  buildCourseFromText,
  GAME_STYLES,
  SOCIAL_WORK_LENSES,
} from './utils/gamification.js'
import {
  COACH_MODES,
  buildAbilityRadar,
  buildLearningDiagnosis,
  createChatMessage,
  createCompletionMessage,
  createFinalBossFeedback,
  createModeSwitchMessage,
  createModuleArrivalMessage,
  createOpeningMessages,
  createQuizFeedback,
  createReflectionFeedback,
  generateAgentReply,
  getQuickPrompts,
  getTeacherActionPrompts,
} from './utils/agent.js'
import {
  AI_PROVIDER_PRESETS,
  DEFAULT_AI_CONFIG,
  applyProviderPreset,
  canUseRealAI,
  enrichCourseWithAI,
  getProviderNote,
  getTutorReplyWithAI,
} from './utils/llm.js'
import {
  STORAGE_KEYS,
  buildJourneyRecord,
  calculateLevel,
  clearStoredItem,
  createStudySession,
  ensureBadge,
  loadStoredJson,
  saveStoredJson,
  upsertJourneyHistory,
} from './utils/study.js'

const DEMO_TEXT = `
游戏化学习与社会工作课程融合示例

本课程介绍如何把传统课件改造为面向大学生的互动学习任务。教学设计应从单向讲授转向任务驱动、即时反馈与反思迁移。学生不仅需要掌握概念，还需要在真实情境中说明知识如何被应用。

社会工作教育强调人在情境中、优势视角与赋能逻辑。教师在设计学习活动时，应帮助学生看到自己的已有资源，理解个体与环境的互动，并通过支持性反馈增强持续参与。将社工理念嵌入课程，可以提升同理心、行动感与社会责任。

人工智能可以自动抽取课件文本、识别高频概念、生成测验题和学习建议。AI 还可以根据学生提问即时给出解释、案例、提示与复盘建议，帮助学生在自学时保持方向感。

游戏化机制包括关卡任务、经验值、成就徽章、剧情叙事与情境挑战。有效的游戏化不是简单加分，而是把目标、反馈、成长路径与行为激励组织成一套结构化学习体验，使学生愿意持续投入。

理想的自学平台应允许教师上传 PPT、PDF 或讲义，系统自动生成关卡、情境任务、即时测验与 AI 对话式陪练。学生可以边学边问，边闯关边迁移，从而形成更主动的学习过程。
`

const DEFAULT_FORM = {
  courseTitle: '智助学｜AI游戏化课件自学工具',
  targetLearners: '本科生',
  className: '社会工作导论',
  teacherName: '',
  entryCode: '',
  socialLens: '优势视角',
  gameStyle: '闯关式',
  moduleCount: 5,
  agentName: '智助灵',
}

function App() {
  const initialCourse = loadStoredJson(STORAGE_KEYS.course, null)
  const initialSession = loadStoredJson(STORAGE_KEYS.session, null)
  const initialAiConfig = loadStoredJson(STORAGE_KEYS.aiConfig, DEFAULT_AI_CONFIG)
  const initialHistory = loadStoredJson(STORAGE_KEYS.history, [])

  const [builderForm, setBuilderForm] = useState({
    ...DEFAULT_FORM,
    ...(initialCourse?.settings || {}),
    courseTitle: initialCourse?.title || DEFAULT_FORM.courseTitle,
  })
  const [aiConfig, setAiConfig] = useState({
    ...DEFAULT_AI_CONFIG,
    ...initialAiConfig,
  })
  const [course, setCourse] = useState(initialCourse)
  const [session, setSession] = useState(initialSession?.courseId === initialCourse?.id ? initialSession : null)
  const [history, setHistory] = useState(initialHistory)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [learnerName, setLearnerName] = useState(initialSession?.learnerName || '')
  const [learnerClass, setLearnerClass] = useState(initialSession?.learnerClass || '')
  const [learningGoal, setLearningGoal] = useState(initialSession?.learningGoal || '')
  const [entryCodeInput, setEntryCodeInput] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (course) {
      saveStoredJson(STORAGE_KEYS.course, course)
    } else {
      clearStoredItem(STORAGE_KEYS.course)
    }
  }, [course])

  useEffect(() => {
    if (session && session.courseId === course?.id) {
      saveStoredJson(STORAGE_KEYS.session, session)
    } else {
      clearStoredItem(STORAGE_KEYS.session)
    }
  }, [session, course])

  useEffect(() => {
    saveStoredJson(STORAGE_KEYS.aiConfig, aiConfig)
  }, [aiConfig])

  useEffect(() => {
    saveStoredJson(STORAGE_KEYS.history, history)
  }, [history])

  useEffect(() => {
    if (course && session) {
      setHistory((prev) => upsertJourneyHistory(prev, buildJourneyRecord(course, session)))
    }
  }, [course, session])

  const aiReady = canUseRealAI(aiConfig)
  const aiGenerationEnabled = aiReady && aiConfig.useForCourseGeneration
  const aiChatEnabled = aiReady && aiConfig.useForTutorChat

  const currentModule = useMemo(() => {
    if (!course) return null
    if (!session) return course.modules[0] || null
    return course.modules[session.currentModuleIndex] || course.modules[0] || null
  }, [course, session])

  const currentAnswer = currentModule && session ? session.answers[currentModule.id] : null
  const currentReflection = currentModule && session ? session.reflections[currentModule.id] || '' : ''
  const allModulesCleared = course && session ? session.clearedModules.length === course.modules.length : false
  const progressPercent = course && session ? Math.round((session.clearedModules.length / course.modules.length) * 100) : 0
  const readyToClearCurrent = Boolean(
    currentAnswer &&
    currentReflection.trim() &&
    currentModule &&
    session &&
    !session.clearedModules.includes(currentModule.id),
  )
  const currentCoachMode = session?.coachMode || '启发式'
  const learningDiagnosis = currentModule && session ? buildLearningDiagnosis(currentModule, session) : null
  const abilityRadar = currentModule && session ? buildAbilityRadar(currentModule, session) : []
  const quickPrompts = currentModule ? getQuickPrompts(currentModule, currentCoachMode) : []
  const teacherActionPrompts = currentModule ? getTeacherActionPrompts(currentModule, learningDiagnosis) : []
  const generationLabel = course?.runtime?.generator === 'llm' ? '真实大模型优化' : '本地生成'
  const recentHistory = history.slice(0, 6)
  const coverKeywords = course?.keywords?.slice(0, 3) || []

  function updateForm(name, value) {
    setBuilderForm((prev) => ({ ...prev, [name]: value }))
  }

  function updateAiConfig(name, value) {
    setAiConfig((prev) => ({ ...prev, [name]: value }))
  }

  function handleProviderChange(provider) {
    setAiConfig((prev) => applyProviderPreset(provider, prev))
  }

  function handleExportCoursePackage() {
    if (!course) {
      setError('请先生成课程，再导出课程包。')
      return
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      course,
    }

    downloadJsonFile(`${slugifyFileName(course.title || '课程包')}.json`, payload)
    setNotice('课程包已导出。你可以把 JSON 文件发给学生或同事，再由对方导入。')
  }

  async function handleImportCoursePackage(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const raw = await file.text()
      const payload = JSON.parse(raw)
      const nextCourse = payload?.course
      if (!nextCourse?.modules || !Array.isArray(nextCourse.modules)) {
        throw new Error('课程包格式无效，未找到可读取的课程结构。')
      }

      setCourse(nextCourse)
      setSession(null)
      setLearnerName('')
      setLearnerClass('')
      setLearningGoal('')
      setEntryCodeInput('')
      setChatInput('')
      setBuilderForm((prev) => ({
        ...prev,
        ...(nextCourse.settings || {}),
        courseTitle: nextCourse.title || prev.courseTitle,
      }))
      setNotice(`课程包《${nextCourse.title}》已导入。现在可以直接进入学生自学模式。`)
      setError('')
    } catch (importError) {
      setError(importError.message || '导入课程包失败，请检查 JSON 文件。')
    } finally {
      event.target.value = ''
    }
  }

  async function handleGenerateCourse() {
    if (uploadedFiles.length === 0) {
      setError('请先上传至少一个课件文件。')
      return
    }

    setLoading(true)
    setError('')
    setNotice('')

    try {
      const extracted = []
      for (const file of uploadedFiles) {
        extracted.push(await extractTextFromFile(file))
      }

      const combinedText = extracted.map((item) => item.text).filter(Boolean).join('\n\n')
      if (!combinedText.trim()) {
        throw new Error('已读取文件，但没有提取到有效文本。请尝试上传可复制文字的 PDF、PPTX、DOCX 或 TXT。')
      }

      let nextCourse = {
        ...buildCourseFromText(
          combinedText,
          builderForm,
          extracted.map((item) => item.meta),
          extracted.flatMap((item) => item.units || []),
          extracted.flatMap((item) => item.warnings),
        ),
        runtime: { generator: 'local' },
      }

      let courseNotice = '课件已成功转化为可互动的游戏化自学地图。接下来只需输入学习者昵称，开始闯关。'

      if (aiGenerationEnabled) {
        try {
          nextCourse = await enrichCourseWithAI({
            aiConfig,
            sourceText: combinedText,
            baseCourse: nextCourse,
            options: builderForm,
          })
          courseNotice = '课件已生成，并已由真实大模型优化关卡、任务与智能体提示。'
        } catch (aiError) {
          nextCourse = {
            ...nextCourse,
            runtime: {
              generator: 'local',
              fallbackReason: aiError.message,
            },
          }
          courseNotice = `课件已生成，但真实大模型优化失败，已自动回退本地版本。原因：${aiError.message}`
        }
      }

      setCourse(nextCourse)
      setSession(null)
      setLearnerName('')
      setLearnerClass('')
      setLearningGoal('')
      setEntryCodeInput('')
      setChatInput('')
      setNotice(courseNotice)
    } catch (buildError) {
      setError(buildError.message || '生成失败，请重试。')
    } finally {
      setLoading(false)
    }
  }

  function handleLoadDemo() {
    const demoCourse = {
      ...buildCourseFromText(
        DEMO_TEXT,
        builderForm,
        [{ name: '游戏化自学示例课件.txt', extension: 'txt', size: DEMO_TEXT.length, type: 'text/plain' }],
        [],
        [],
      ),
      runtime: { generator: 'local' },
    }

    setCourse(demoCourse)
    setSession(null)
    setLearnerName('')
    setLearnerClass('')
    setLearningGoal('')
    setEntryCodeInput('')
    setChatInput('')
    setError('')
    setNotice('已载入示例课件。你可以直接体验“上传课件—AI 生成关卡—学生闯关—智能体陪学”的完整流程。')
  }

  function handleResetAll() {
    setCourse(null)
    setSession(null)
    setHistory([])
    setUploadedFiles([])
    setLearnerName('')
    setLearnerClass('')
    setLearningGoal('')
    setEntryCodeInput('')
    setChatInput('')
    setError('')
    setNotice('已清空当前课件、学习旅程与本地缓存。')
    clearStoredItem(STORAGE_KEYS.course)
    clearStoredItem(STORAGE_KEYS.session)
    clearStoredItem(STORAGE_KEYS.history)
  }

  function handleClearAiConfig() {
    setAiConfig(DEFAULT_AI_CONFIG)
    clearStoredItem(STORAGE_KEYS.aiConfig)
    setNotice('已清空当前浏览器中的 AI 配置。')
  }

  function handleStartJourney() {
    if (!course) {
      setError('请先上传并生成课程。')
      return
    }

    const expectedCode = course.classroom?.entryCode?.trim()
    if (expectedCode && entryCodeInput.trim() !== expectedCode) {
      setError('课程入口码不正确，请核对后再进入。')
      return
    }

    const name = learnerName.trim() || '同学'
    const nextSession = createStudySession(course, {
      learnerName: name,
      learnerClass: learnerClass.trim(),
      learningGoal: learningGoal.trim(),
    })
    nextSession.chatHistory = [
      ...createOpeningMessages(course, name),
      createChatMessage(
        'agent',
        aiChatEnabled
          ? `当前已接入真实大模型 ${aiConfig.model}。你可以更自由地提问，我会结合当前课件内容即时回应。`
          : '当前为内置陪练模式。若配置真实大模型接口，我会变得更灵活、更像真实学习伙伴。',
      ),
      createModuleArrivalMessage(course.modules[0]),
    ]

    setSession(nextSession)
    setLearnerName(name)
    setLearnerClass(learnerClass.trim())
    setLearningGoal(learningGoal.trim())
    setError('')
    setNotice(`${name} 的自学旅程已开始。现在可以一边闯关，一边和智能体对话。`)
  }

  function handleRestartJourney() {
    clearStoredItem(STORAGE_KEYS.session)
    setSession(null)
    setChatInput('')
    setNotice('已重置当前学习旅程。你可以重新开始闯关。')
  }

  function handleRestoreJourney(record) {
    if (!course || record.courseId !== course.id || !record.sessionSnapshot) {
      setError('当前课程与该学习档案不匹配，无法直接恢复。')
      return
    }

    setSession(record.sessionSnapshot)
    setLearnerName(record.sessionSnapshot.learnerName || '')
    setLearnerClass(record.sessionSnapshot.learnerClass || '')
    setLearningGoal(record.sessionSnapshot.learningGoal || '')
    setNotice(`已恢复 ${record.learnerName} 的最近学习档案。`)
    setError('')
  }

  function handleCoachModeChange(modeId) {
    if (!session || currentCoachMode === modeId) {
      return
    }

    setSession((prev) => ({
      ...prev,
      coachMode: modeId,
      chatHistory: [...prev.chatHistory, createModeSwitchMessage(modeId)],
    }))
    setNotice(`已切换到${modeId}。`)
  }

  function handleSelectModule(index) {
    if (!course || !session) {
      setError('请先开始自学旅程。')
      return
    }

    if (index > session.clearedModules.length) {
      setNotice('请先完成前一关，再解锁后续关卡。')
      return
    }

    const nextModule = course.modules[index]
    setSession((prev) => ({
      ...prev,
      currentModuleIndex: index,
      chatHistory: [...prev.chatHistory, createModuleArrivalMessage(nextModule)],
    }))
    setError('')
  }

  function handleQuizSubmit(module, selectedIndex) {
    if (!session || !course || selectedIndex < 0) {
      setError('请先选择一个答案。')
      return
    }

    if (session.answers[module.id]) {
      return
    }

    const isCorrect = selectedIndex === module.quiz.correctIndex
    const gainedXp = isCorrect ? 20 : 12
    const reply = createQuizFeedback(module, isCorrect)

    setSession((prev) => {
      const nextXp = prev.xp + gainedXp
      return {
        ...prev,
        xp: nextXp,
        level: calculateLevel(nextXp),
        answers: {
          ...prev.answers,
          [module.id]: {
            selectedIndex,
            isCorrect,
            submittedAt: new Date().toISOString(),
          },
        },
        chatHistory: [...prev.chatHistory, reply],
      }
    })

    setError('')
    setNotice(isCorrect ? '回答正确，已获得经验值。' : '答案已提交。可以参考智能体提示后继续完善理解。')
  }

  function handleReflectionSave(module, text) {
    if (!session || !course) {
      setError('请先开始自学旅程。')
      return
    }

    if (!text.trim()) {
      setError('请先写下你的应用反思，再保存。')
      return
    }

    const firstSave = !session.reflections[module.id]
    const gainedXp = firstSave ? 20 : 0
    const reply = createReflectionFeedback(module, text, firstSave)

    setSession((prev) => {
      const nextXp = prev.xp + gainedXp
      return {
        ...prev,
        xp: nextXp,
        level: calculateLevel(nextXp),
        reflections: {
          ...prev.reflections,
          [module.id]: text.trim(),
        },
        chatHistory: [...prev.chatHistory, reply],
      }
    })

    setError('')
    setNotice(firstSave ? '应用反思已保存，并计入成长进度。' : '应用反思已更新。')
  }

  function handleCompleteModule(module) {
    if (!session || !course) {
      return
    }

    const hasAnswer = Boolean(session.answers[module.id])
    const hasReflection = Boolean(session.reflections[module.id]?.trim())
    if (!hasAnswer || !hasReflection) {
      setError('请先完成本关测验和应用反思，再解锁下一关。')
      return
    }

    if (session.clearedModules.includes(module.id)) {
      setNotice('这一关已经完成。你可以继续回顾或前往下一关。')
      return
    }

    const isLastModule = session.currentModuleIndex === course.modules.length - 1
    const completionMessage = createCompletionMessage(module, isLastModule)

    setSession((prev) => {
      const nextXp = prev.xp + module.xp
      const nextIndex = isLastModule ? prev.currentModuleIndex : prev.currentModuleIndex + 1
      const nextMessages = [completionMessage]

      if (!isLastModule) {
        nextMessages.push(createModuleArrivalMessage(course.modules[nextIndex]))
      }

      return {
        ...prev,
        xp: nextXp,
        level: calculateLevel(nextXp),
        badges: ensureBadge(prev.badges, module.badge),
        clearedModules: [...prev.clearedModules, module.id],
        currentModuleIndex: nextIndex,
        chatHistory: [...prev.chatHistory, ...nextMessages],
      }
    })

    setError('')
    setNotice(isLastModule ? '全部主线关卡已通关，终局任务已开启。' : '本关完成，下一关已解锁。')
  }

  function handleSaveFinalReflection(text) {
    if (!session || !course) {
      setError('请先开始学习旅程。')
      return
    }

    if (!text.trim()) {
      setError('请先写下终局任务方案。')
      return
    }

    const firstSubmit = !session.finalBossDone
    const gainedXp = firstSubmit ? 120 : 0
    const reply = createFinalBossFeedback(course, text)

    setSession((prev) => {
      const nextXp = prev.xp + gainedXp
      return {
        ...prev,
        xp: nextXp,
        level: calculateLevel(nextXp),
        badges: firstSubmit ? ensureBadge(prev.badges, '终局设计师') : prev.badges,
        finalReflection: text.trim(),
        finalBossDone: true,
        chatHistory: [...prev.chatHistory, reply],
      }
    })

    setError('')
    setNotice(firstSubmit ? '终局任务已提交，恭喜完成整段自学旅程。' : '终局任务方案已更新。')
  }

  async function handleSendChat(presetMessage) {
    if (!course || !session || !currentModule) {
      setError('请先开始自学旅程，再与智能体互动。')
      return
    }

    const message = (presetMessage || chatInput).trim()
    if (!message || chatLoading) {
      return
    }

    const userMessage = createChatMessage('user', message)
    const sessionSnapshot = {
      ...session,
      chatHistory: [...session.chatHistory, userMessage],
    }

    setSession((prev) => ({
      ...prev,
      chatHistory: [...prev.chatHistory, userMessage],
    }))
    setChatInput('')
    setChatLoading(true)
    setError('')

    let replyMessage
    let fallbackNotice = ''

    try {
      if (aiChatEnabled) {
        const content = await getTutorReplyWithAI({
          aiConfig,
          course,
          module: currentModule,
          session: sessionSnapshot,
          message,
          coachMode: currentCoachMode,
        })
        replyMessage = createChatMessage('agent', content)
      } else {
        replyMessage = generateAgentReply({
          course,
          module: currentModule,
          session: sessionSnapshot,
          message,
          coachMode: currentCoachMode,
        })
      }
    } catch (chatError) {
      replyMessage = generateAgentReply({
        course,
        module: currentModule,
        session: sessionSnapshot,
        message,
        coachMode: currentCoachMode,
      })
      fallbackNotice = `真实大模型对话失败，已自动切回本地陪练。原因：${chatError.message}`
    }

    setSession((prev) => ({
      ...prev,
      chatHistory: [...prev.chatHistory, replyMessage],
    }))
    setChatLoading(false)

    if (fallbackNotice) {
      setNotice(fallbackNotice)
    }
  }

  return (
    <div className="app-shell">
      <header className="hero-banner">
        <div>
          <span className="hero-banner__eyebrow">AI 自学工具 · 真实大模型版</span>
          <h1>智助学：上传课件后，让智能体把它变成真正可互动的闯关式自主学习</h1>
          <p className="hero-banner__lead">
            现在这个版本已经支持接入真实大模型。教师上传 PPT、PDF 或讲义后，系统可先自动生成游戏化关卡；学生进入后，再由真实 AI 围绕当前课件内容进行解释、举例、提示、追问与陪练。
          </p>
        </div>
        <div className="hero-banner__actions">
          <button className="button button--secondary" onClick={handleLoadDemo}>载入示例</button>
          <button className="button button--ghost" onClick={handleResetAll}>清空全部</button>
        </div>
      </header>

      {(notice || error) && (
        <section className="message-strip">
          {notice && <div className="message message--success">{notice}</div>}
          {error && <div className="message message--error">{error}</div>}
        </section>
      )}

      <section className="workspace">
        <aside className="workspace__builder">
          <div className="card card--sticky">
            <div className="card__header">
              <div>
                <h2>一、上传课件并配置 AI</h2>
                <p>先上传课件，再决定是否启用真实大模型来优化关卡生成与学生陪练。</p>
              </div>
            </div>

            <label className="upload-box">
              <input
                type="file"
                accept=".pdf,.pptx,.docx,.txt,.md,.html,.htm,.csv,.json"
                multiple
                onChange={(event) => setUploadedFiles(Array.from(event.target.files || []))}
              />
              <span className="upload-box__title">点击上传课件文件</span>
              <span className="upload-box__hint">支持 PDF、PPTX、DOCX、TXT、MD、HTML。若是扫描件，后续可接 OCR。</span>
            </label>

            <div className="file-list">
              {uploadedFiles.length === 0 ? (
                <p className="muted">尚未选择文件。</p>
              ) : (
                uploadedFiles.map((file) => (
                  <div className="file-chip" key={`${file.name}-${file.size}`}>
                    <span>{file.name}</span>
                    <span className="muted">{formatFileSize(file.size)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="form-grid">
              <Field label="课程名称">
                <input value={builderForm.courseTitle} onChange={(e) => updateForm('courseTitle', e.target.value)} />
              </Field>
              <Field label="适用对象">
                <input value={builderForm.targetLearners} onChange={(e) => updateForm('targetLearners', e.target.value)} />
              </Field>
              <Field label="课程／班级名称">
                <input value={builderForm.className} onChange={(e) => updateForm('className', e.target.value)} placeholder="例如：社会工作导论 / 2026社工1班" />
              </Field>
              <Field label="教师姓名（选填）">
                <input value={builderForm.teacherName} onChange={(e) => updateForm('teacherName', e.target.value)} placeholder="例如：张老师" />
              </Field>
              <Field label="课程入口码（选填）">
                <input value={builderForm.entryCode} onChange={(e) => updateForm('entryCode', e.target.value)} placeholder="例如：SW2026" />
              </Field>
              <Field label="社工理论透镜">
                <select value={builderForm.socialLens} onChange={(e) => updateForm('socialLens', e.target.value)}>
                  {Object.keys(SOCIAL_WORK_LENSES).map((key) => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
              </Field>
              <Field label="游戏化风格">
                <select value={builderForm.gameStyle} onChange={(e) => updateForm('gameStyle', e.target.value)}>
                  {Object.keys(GAME_STYLES).map((key) => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
              </Field>
              <Field label="目标关卡数">
                <select value={builderForm.moduleCount} onChange={(e) => updateForm('moduleCount', Number(e.target.value))}>
                  <option value={3}>3 个</option>
                  <option value={4}>4 个</option>
                  <option value={5}>5 个</option>
                  <option value={6}>6 个</option>
                </select>
              </Field>
              <Field label="智能体名称">
                <input value={builderForm.agentName} onChange={(e) => updateForm('agentName', e.target.value)} />
              </Field>
            </div>

            <section className="config-panel">
              <div className="config-panel__head">
                <div>
                  <h3>真实大模型设置</h3>
                  <p>支持 OpenAI 兼容接口。API Key 只保存在当前浏览器本地，不会提交到仓库。</p>
                </div>
                <span className={`status-pill ${aiReady ? 'status-pill--success' : 'status-pill--muted'}`}>
                  {aiReady ? '已可调用真实 AI' : '当前未就绪'}
                </span>
              </div>

              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={aiConfig.enabled}
                  onChange={(e) => updateAiConfig('enabled', e.target.checked)}
                />
                <span>启用真实大模型</span>
              </label>

              <div className="form-grid">
                <Field label="提供方">
                  <select value={aiConfig.provider} onChange={(e) => handleProviderChange(e.target.value)}>
                    {Object.entries(AI_PROVIDER_PRESETS).map(([key, preset]) => (
                      <option key={key} value={key}>{preset.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="模型名称">
                  <input value={aiConfig.model} onChange={(e) => updateAiConfig('model', e.target.value)} placeholder="例如：deepseek-chat" />
                </Field>
                <Field label="Base URL">
                  <input value={aiConfig.baseUrl} onChange={(e) => updateAiConfig('baseUrl', e.target.value)} placeholder="https://api.example.com/v1" />
                </Field>
                <Field label="API Key">
                  <input type="password" value={aiConfig.apiKey} onChange={(e) => updateAiConfig('apiKey', e.target.value)} placeholder="sk-..." />
                </Field>
              </div>

              <div className="toggle-grid">
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={aiConfig.useForCourseGeneration}
                    onChange={(e) => updateAiConfig('useForCourseGeneration', e.target.checked)}
                  />
                  <span>用真实 AI 优化关卡生成</span>
                </label>
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={aiConfig.useForTutorChat}
                    onChange={(e) => updateAiConfig('useForTutorChat', e.target.checked)}
                  />
                  <span>用真实 AI 接管学生对话陪练</span>
                </label>
              </div>

              <div className="note-card">
                <strong>当前说明</strong>
                <p>{getProviderNote(aiConfig.provider)}</p>
                <p className="muted">如果浏览器端直连被目标接口拦截，可把 Base URL 改成你自己的中转服务或学校代理网关。</p>
              </div>

              <div className="button-row">
                <button className="button button--ghost" onClick={handleClearAiConfig}>清空 AI 配置</button>
              </div>
            </section>

            <button className="button" onClick={handleGenerateCourse} disabled={loading}>
              {loading ? '正在解析并生成……' : '生成自学工具'}
            </button>
          </div>
        </aside>

        <main className="workspace__main">
          <section className="card">
            <div className="card__header">
              <div>
                <h2>二、自动生成结果</h2>
                <p>这里展示上传课件后自动形成的课程地图、社工逻辑、游戏化结构以及真实 AI 接入状态。</p>
              </div>
            </div>

            {!course ? (
              <EmptyState
                title="还没有生成课程"
                description="先上传课件，或者点击“载入示例”体验已经生成好的自学版本。"
              />
            ) : (
              <>
                <div className="summary-header">
                  <div>
                    <h3>{course.title}</h3>
                    <p>{course.description}</p>
                  </div>
                  <span className="pill">{course.subtitle}</span>
                </div>

                <div className="cover-card">
                  <div>
                    <span className="eyebrow">课程封面</span>
                    <h4>{course.title}</h4>
                    <p>{course.description}</p>
                    <div className="tag-list">
                      {coverKeywords.map((item) => <span className="tag" key={item}>{item}</span>)}
                    </div>
                  </div>
                  <div className="cover-card__meta">
                    <span>{course.sourceStructure === 'slide-based' ? 'PPT页级闯关' : course.sourceStructure === 'page-based' ? 'PDF页级闯关' : '文本语义闯关'}</span>
                    <strong>{generationLabel}</strong>
                    <span>{course.agentProfile.name}</span>
                  </div>
                </div>

                <div className="stat-grid">
                  <StatCard label="关卡数" value={course.modules.length} description="自动从课件中拆解出的学习单元" />
                  <StatCard label="预计时长" value={`${course.estimatedMinutes} 分钟`} description="按文本长度估算的自学时长" />
                  <StatCard label="生成方式" value={generationLabel} description="可本地生成，也可由真实大模型优化" />
                  <StatCard label="陪练模式" value={aiChatEnabled ? '真实大模型' : '本地陪练'} description="学生对话时优先使用当前配置" />
                </div>

                <div className="info-grid">
                  <InfoBlock title="社工理论融合">
                    <p>{course.theoryBridge.socialWork}</p>
                  </InfoBlock>
                  <InfoBlock title="AI 陪学机制">
                    <p>{course.theoryBridge.ai}</p>
                  </InfoBlock>
                  <InfoBlock title="游戏化结构">
                    <p>{course.theoryBridge.pedagogy}</p>
                  </InfoBlock>
                </div>

                <div className="info-grid info-grid--two">
                  <InfoBlock title="学习目标">
                    <ul>
                      {course.learningObjectives.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </InfoBlock>
                  <InfoBlock title="课程关键词">
                    <div className="tag-list">
                      {course.keywords.slice(0, 10).map((item) => <span className="tag" key={item}>{item}</span>)}
                    </div>
                  </InfoBlock>
                </div>

                <InfoBlock title="课件结构映射">
                  <div className="source-map">
                    {course.modules.map((module) => (
                      <div className="source-map__item" key={module.id}>
                        <strong>{module.title}</strong>
                        <span>{module.sourceLabel || '按文本语义自动拆分'}</span>
                      </div>
                    ))}
                  </div>
                </InfoBlock>

                <InfoBlock title="课程分享与入口">
                  <div className="share-card">
                    <div>
                      <strong>{course.classroom?.className || builderForm.className || '未命名课程入口'}</strong>
                      <p>教师：{course.classroom?.teacherName || '未填写'} ｜ 入口码：{course.classroom?.entryCode || '未设置，学生可直接进入'}</p>
                    </div>
                    <div className="button-row">
                      <button className="button button--secondary" onClick={handleExportCoursePackage}>导出课程包</button>
                      <label className="button button--ghost button--file">
                        导入课程包
                        <input type="file" accept="application/json,.json" onChange={handleImportCoursePackage} />
                      </label>
                    </div>
                  </div>
                  <p className="muted">如果你要把课程发给学生或同事，可以导出课程包 JSON，再在另一台设备上导入。静态网页环境下，这是最稳妥的分享方式。</p>
                </InfoBlock>

                <InfoBlock title="课件来源">
                  <div className="file-list file-list--compact">
                    {course.sourceFiles.map((file) => (
                      <div className="file-chip" key={`${file.name}-${file.size}`}>
                        <span>{file.name}</span>
                        <span className="muted">{file.extension || file.type || '未知格式'}</span>
                      </div>
                    ))}
                  </div>
                  {course.warnings.length > 0 && (
                    <div className="warning-list">
                      {course.warnings.map((item) => <p key={item}>提示：{item}</p>)}
                    </div>
                  )}
                  {course.runtime?.fallbackReason && (
                    <div className="warning-list">
                      <p>大模型优化回退原因：{course.runtime.fallbackReason}</p>
                    </div>
                  )}
                </InfoBlock>
              </>
            )}
          </section>

          <section className="card">
            <div className="card__header">
              <div>
                <h2>三、学生自学界面</h2>
                <p>学生只需输入昵称，即可进入由智能体带领的闯关式学习旅程。</p>
              </div>
              {session && (
                <button className="button button--ghost" onClick={handleRestartJourney}>重新开始旅程</button>
              )}
            </div>

            {!course ? (
              <EmptyState title="请先生成课程" description="生成课程后，这里会变成学生实际使用的自学界面。" />
            ) : !session ? (
              <div className="start-panel">
                <div className="start-panel__intro">
                  <span className="eyebrow">开始自学</span>
                  <h3>输入学习者昵称，进入 AI 陪练闯关模式</h3>
                  <p>
                    开始后，学生会获得一条线性关卡地图。每一关都包含：阅读抓手、挑战题、应用迁移任务，以及可随时提问的智能体。
                  </p>
                </div>
                <div className="start-panel__form">
                  <Field label="学习者昵称">
                    <input
                      value={learnerName}
                      onChange={(e) => setLearnerName(e.target.value)}
                      placeholder="例如：小林 / 学习者A"
                    />
                  </Field>
                  <Field label="班级／课程入口（选填）">
                    <input
                      value={learnerClass}
                      onChange={(e) => setLearnerClass(e.target.value)}
                      placeholder="例如：2026社工1班 / 社会工作导论"
                    />
                  </Field>
                  <Field label="本次学习目标（选填）">
                    <input
                      value={learningGoal}
                      onChange={(e) => setLearningGoal(e.target.value)}
                      placeholder="例如：想搞懂优势视角怎么落地"
                    />
                  </Field>
                  {course.classroom?.entryCode && (
                    <Field label="课程入口码">
                      <input
                        value={entryCodeInput}
                        onChange={(e) => setEntryCodeInput(e.target.value)}
                        placeholder="请输入教师提供的入口码"
                      />
                    </Field>
                  )}
                  <button className="button" onClick={handleStartJourney}>开始闯关</button>
                </div>

                {recentHistory.length > 0 && (
                  <section className="archive-panel">
                    <div className="archive-panel__head">
                      <div>
                        <h3>最近学习档案</h3>
                        <p>当前浏览器会保留最近的自学记录，方便展示产品化形态。</p>
                      </div>
                    </div>
                    <div className="archive-list">
                      {recentHistory.map((item) => (
                        <article className="archive-item" key={item.id}>
                          <div className="archive-item__avatar">{item.avatarText}</div>
                          <div className="archive-item__content">
                            <strong>{item.learnerName} · {item.courseTitle}</strong>
                            <p>{item.learnerClass || '未填写班级'}{item.learningGoal ? `｜目标：${item.learningGoal}` : ''}</p>
                            <p>进度 {item.progressPercent}% ｜ Lv.{item.level} ｜ 徽章 {item.badges.length}</p>
                          </div>
                          {course && item.courseId === course.id && item.sessionSnapshot && (
                            <button className="button button--ghost archive-item__action" onClick={() => handleRestoreJourney(item)}>恢复</button>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <div className="study-space">
                <div className="learner-strip">
                  <div className="passport-card">
                    <div className="passport-card__avatar">{session.avatarText}</div>
                    <div className="passport-card__content">
                      <span className="eyebrow">学习中</span>
                      <h3>{session.learnerName} 的闯关地图</h3>
                      <p>已完成 {session.clearedModules.length} / {course.modules.length} 关。完成每关后会解锁下一关与成就徽章。</p>
                      <div className="passport-card__meta">
                        <span>{session.learnerClass || '未填写班级入口'}</span>
                        <span>{session.learningGoal || '尚未设置学习目标'}</span>
                        <span>当前模式：{currentCoachMode}</span>
                      </div>
                    </div>
                  </div>
                  <div className="stat-grid stat-grid--compact">
                    <StatCard label="等级" value={`Lv.${session.level}`} description="随经验值提升" />
                    <StatCard label="经验值" value={session.xp} description="来自答题、反思与通关" />
                    <StatCard label="进度" value={`${progressPercent}%`} description="按已通关关卡计算" />
                  </div>
                </div>

                <div className="progress-bar-wrap">
                  <div className="progress-bar">
                    <span style={{ width: `${Math.max(6, progressPercent)}%` }} />
                  </div>
                  <p className="muted">主线进度：{progressPercent}%</p>
                </div>

                {learningDiagnosis && (
                  <div className="diagnosis-card">
                    <div>
                      <span className="eyebrow">学习诊断</span>
                      <h4>{learningDiagnosis.phase}</h4>
                      <p>{learningDiagnosis.status}</p>
                    </div>
                    <div className="diagnosis-card__body">
                      <p><strong>下一步：</strong>{learningDiagnosis.nextStep}</p>
                      <p><strong>当前抓手：</strong>{learningDiagnosis.focus}</p>
                      {currentModule?.sourceLabel && <p><strong>对应课件：</strong>{currentModule.sourceLabel}</p>}
                    </div>
                  </div>
                )}

                {abilityRadar.length > 0 && (
                  <div className="ability-grid">
                    {abilityRadar.map((item) => (
                      <div className="ability-card" key={item.label}>
                        <div className="ability-card__top">
                          <strong>{item.label}</strong>
                          <span>{item.score}</span>
                        </div>
                        <div className="ability-bar"><span style={{ width: `${item.score}%` }} /></div>
                        <p>{item.note}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="module-path">
                  {course.worldMap.map((node, index) => {
                    const unlocked = index <= session.clearedModules.length
                    const active = index === session.currentModuleIndex
                    const cleared = session.clearedModules.includes(node.id)
                    return (
                      <button
                        key={node.id}
                        className={`module-node ${active ? 'module-node--active' : ''} ${cleared ? 'module-node--cleared' : ''}`}
                        disabled={!unlocked}
                        onClick={() => handleSelectModule(index)}
                      >
                        <span className="module-node__order">{node.label}</span>
                        <strong>{node.title}</strong>
                        <span className="module-node__meta">{cleared ? '已通关' : unlocked ? node.difficulty : '未解锁'}</span>
                      </button>
                    )
                  })}
                </div>

                {currentModule && (
                  <div className="stage-panel">
                    <div className="stage-hero">
                      <div>
                        <span className="eyebrow">{currentModule.story}</span>
                        <h3>{currentModule.title}</h3>
                        <p>{currentModule.summary}</p>
                      </div>
                      <div className="stage-hero__meta">
                        <span className="pill">预计 {currentModule.readingEstimateMinutes} 分钟</span>
                        <span className="pill">{currentModule.difficulty}</span>
                        <span className="pill pill--dark">{currentModule.badge}</span>
                      </div>
                    </div>

                    <div className="callout callout--accent">
                      <strong>本关任务提示</strong>
                      <p>{currentModule.challenge}</p>
                      <p className="muted">{currentModule.scene}</p>
                    </div>

                    <div className="quest-list">
                      <QuestItem title={currentModule.missions[0].title} detail={currentModule.missions[0].detail} done />
                      <QuestItem title={currentModule.missions[1].title} detail={currentModule.missions[1].detail} done={Boolean(currentAnswer)} />
                      <QuestItem title={currentModule.missions[2].title} detail={currentModule.missions[2].detail} done={Boolean(currentReflection.trim())} />
                    </div>

                    <div className="reader-card">
                      <div className="reader-card__head">
                        <h4>关卡内容</h4>
                        <div className="tag-list">
                          {currentModule.keywords.slice(0, 4).map((item) => <span className="tag" key={item}>{item}</span>)}
                        </div>
                      </div>
                      <div className="reader-card__content">
                        {splitContent(currentModule.content).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                      </div>
                    </div>

                    <div className="info-grid info-grid--two">
                      <InfoBlock title="本关抓手">
                        <ul>
                          {currentModule.keyPoints.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </InfoBlock>
                      <InfoBlock title="社工迁移提示">
                        <ul>
                          <li>{currentModule.socialWorkFocus.mission}</li>
                          <li>{currentModule.socialWorkFocus.reflectionPrompt}</li>
                          <li>{currentModule.socialWorkFocus.bridgePrompt}</li>
                        </ul>
                      </InfoBlock>
                    </div>

                    <QuizPanel key={currentModule.id} module={currentModule} answer={currentAnswer} onSubmit={handleQuizSubmit} />

                    <ReflectionComposer
                      key={currentModule.id}
                      module={currentModule}
                      savedText={currentReflection}
                      onSave={handleReflectionSave}
                    />

                    <div className="button-row button-row--spread">
                      <div className="tag-list">
                        {session.badges.length > 0 ? session.badges.map((badge) => <span className="tag" key={badge}>{badge}</span>) : <span className="muted">完成关卡后可解锁徽章</span>}
                      </div>
                      <button className="button" onClick={() => handleCompleteModule(currentModule)} disabled={!readyToClearCurrent}>
                        完成本关并解锁下一关
                      </button>
                    </div>
                  </div>
                )}

                {allModulesCleared && (
                  <FinalBossComposer
                    key={course.id}
                    title={course.finalBoss.title}
                    prompt={course.finalBoss.prompt}
                    rubric={course.finalBoss.rubric}
                    savedText={session.finalReflection}
                    completed={session.finalBossDone}
                    onSave={handleSaveFinalReflection}
                  />
                )}
              </div>
            )}
          </section>
        </main>

        <aside className="workspace__agent">
          <div className="card card--sticky card--chat">
            <div className="card__header">
              <div>
                <h2>四、智能体陪练</h2>
                <p>学生可以随时提问，让智能体解释、举例、提示、出题、总结与追问。</p>
              </div>
              <span className={`status-pill ${aiChatEnabled ? 'status-pill--success' : 'status-pill--muted'}`}>
                {aiChatEnabled ? `真实 AI：${aiConfig.model}` : '本地陪练'}
              </span>
            </div>

            {!course ? (
              <EmptyState title="等待课件生成" description="先生成课程后，这里会出现可互动的智能体陪练窗口。" compact />
            ) : !session ? (
              <EmptyState title="等待学习者进入" description={`课程已准备好。学生开始旅程后，就能和 ${course.agentProfile.name} 互动。`} compact />
            ) : (
              <>
                <div className="agent-meta">
                  <div>
                    <span className="eyebrow">{course.agentProfile.role}</span>
                    <h3>{course.agentProfile.name}</h3>
                    <p>{course.agentProfile.opening}</p>
                  </div>
                  <div className="pill">当前关卡：{currentModule?.title}</div>
                </div>

                <section className="coach-panel">
                  <div className="coach-panel__head">
                    <div>
                      <h3>陪练模式</h3>
                      <p>切换后，智能体会改变回应风格。</p>
                    </div>
                    <span className="status-pill status-pill--muted">当前：{currentCoachMode}</span>
                  </div>
                  <div className="mode-grid">
                    {Object.values(COACH_MODES).map((mode) => (
                      <button
                        key={mode.id}
                        className={`mode-chip ${currentCoachMode === mode.id ? 'mode-chip--active' : ''}`}
                        onClick={() => handleCoachModeChange(mode.id)}
                        disabled={chatLoading}
                      >
                        <strong>{mode.label}</strong>
                        <span>{mode.description}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="coach-panel">
                  <div className="coach-panel__head">
                    <div>
                      <h3>分层提示</h3>
                      <p>从轻提示到关键提示，逐级打开思路。</p>
                    </div>
                  </div>
                  <div className="quick-actions quick-actions--stacked">
                    <button className="quick-action" disabled={chatLoading} onClick={() => handleSendChat('给我一个轻提示')}>轻提示</button>
                    <button className="quick-action" disabled={chatLoading} onClick={() => handleSendChat('给我一个中提示')}>中提示</button>
                    <button className="quick-action" disabled={chatLoading} onClick={() => handleSendChat('给我一个关键提示')}>关键提示</button>
                  </div>
                </section>

                <div className="quick-actions">
                  {quickPrompts.map((prompt) => (
                    <button key={prompt} className="quick-action" disabled={chatLoading} onClick={() => handleSendChat(prompt)}>{prompt}</button>
                  ))}
                </div>

                <section className="coach-panel">
                  <div className="coach-panel__head">
                    <div>
                      <h3>教学代理动作</h3>
                      <p>这些按钮更像老师的即时教学动作，而不是普通聊天。</p>
                    </div>
                  </div>
                  <div className="action-grid">
                    {teacherActionPrompts.map((action) => (
                      <button key={action.id} className="action-tile" disabled={chatLoading} onClick={() => handleSendChat(action.prompt)}>
                        <strong>{action.label}</strong>
                        <span>{action.prompt}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <div className="chat-history">
                  {session.chatHistory.map((item) => (
                    <article key={item.id} className={`chat-bubble chat-bubble--${item.role}`}>
                      <span className="chat-bubble__role">{item.role === 'agent' ? course.agentProfile.name : session.learnerName}</span>
                      <p>{item.content}</p>
                    </article>
                  ))}
                  {chatLoading && (
                    <article className="chat-bubble chat-bubble--agent">
                      <span className="chat-bubble__role">{course.agentProfile.name}</span>
                      <p>正在思考中……</p>
                    </article>
                  )}
                </div>

                <div className="chat-composer">
                  <textarea
                    rows={4}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="例如：解释一下这一关 / 给我举个例子 / 我的理解是……"
                  />
                  <div className="button-row button-row--spread">
                    <p className="muted">提示：如果你输入“我的理解是……”，智能体会对你的理解进行反馈。</p>
                    <button className="button button--secondary" onClick={() => handleSendChat()} disabled={chatLoading}>发送</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      </section>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function StatCard({ label, value, description }) {
  return (
    <div className="stat-card">
      <span className="stat-card__label">{label}</span>
      <strong>{value}</strong>
      <p>{description}</p>
    </div>
  )
}

function InfoBlock({ title, children }) {
  return (
    <section className="info-block">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function EmptyState({ title, description, compact = false }) {
  return (
    <div className={`empty-state ${compact ? 'empty-state--compact' : ''}`}>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

function QuestItem({ title, detail, done = false }) {
  return (
    <div className={`quest-item ${done ? 'quest-item--done' : ''}`}>
      <span className="quest-item__status">{done ? '✓' : '○'}</span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  )
}

function QuizPanel({ module, answer, onSubmit }) {
  const [selectedIndex, setSelectedIndex] = useState(answer?.selectedIndex ?? -1)

  return (
    <section className="interactive-card">
      <div className="interactive-card__head">
        <div>
          <h3>统一挑战题</h3>
          <p>{module.quiz.question}</p>
        </div>
        <span className="pill">任务 2</span>
      </div>

      <div className="quiz-options">
        {module.quiz.options.map((option, index) => (
          <label key={option} className={`quiz-option ${answer?.selectedIndex === index ? 'quiz-option--selected' : ''}`}>
            <input
              type="radio"
              name={`quiz-${module.id}`}
              checked={selectedIndex === index}
              disabled={Boolean(answer)}
              onChange={() => setSelectedIndex(index)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>

      <div className="button-row button-row--spread">
        <button className="button button--secondary" onClick={() => onSubmit(module, selectedIndex)} disabled={Boolean(answer) || selectedIndex < 0}>
          {answer ? '已提交' : '提交答案'}
        </button>
        {answer && (
          <p className={answer.isCorrect ? 'result-text result-text--success' : 'result-text result-text--error'}>
            {answer.isCorrect ? '回答正确。' : '回答未命中。'} {module.quiz.stretchTask}
          </p>
        )}
      </div>
    </section>
  )
}

function ReflectionComposer({ module, savedText, onSave }) {
  const [text, setText] = useState(savedText)

  return (
    <section className="interactive-card">
      <div className="interactive-card__head">
        <div>
          <h3>应用迁移任务</h3>
          <p>{module.socialWorkFocus.bridgePrompt}</p>
        </div>
        <span className="pill">任务 3</span>
      </div>

      <textarea
        rows={5}
        value={text}
        placeholder="请把这一关知识带回真实场景，写下对象、情境和你的行动思路。"
        onChange={(e) => setText(e.target.value)}
      />

      <div className="button-row button-row--spread">
        <button className="button button--secondary" onClick={() => onSave(module, text)}>保存反思</button>
        {savedText && <span className="muted">已保存，可继续修改。</span>}
      </div>
    </section>
  )
}

function FinalBossComposer({ title, prompt, rubric, savedText, completed, onSave }) {
  const [text, setText] = useState(savedText)

  return (
    <section className="final-boss">
      <div className="interactive-card__head">
        <div>
          <span className="eyebrow">终局任务</span>
          <h3>{title}</h3>
          <p>{prompt}</p>
        </div>
        {completed && <span className="pill pill--dark">已完成</span>}
      </div>

      <div className="info-grid info-grid--two">
        <InfoBlock title="评分抓手">
          <ul>
            {rubric.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </InfoBlock>
        <InfoBlock title="建议写法">
          <ul>
            <li>先点出你最关键的两个核心概念。</li>
            <li>再说明你面对的是谁、处在什么情境。</li>
            <li>最后写出具体可执行的行动步骤。</li>
          </ul>
        </InfoBlock>
      </div>

      <textarea
        rows={6}
        value={text}
        placeholder="请把整门课整合成一个可落地的小方案。"
        onChange={(e) => setText(e.target.value)}
      />

      <div className="button-row button-row--spread">
        <button className="button" onClick={() => onSave(text)}>{completed ? '更新终局方案' : '提交终局方案'}</button>
        {completed && <span className="muted">已解锁“终局设计师”徽章。</span>}
      </div>
    </section>
  )
}

function splitContent(content) {
  return String(content || '')
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatFileSize(size) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function slugifyFileName(value) {
  return String(value || 'course-package')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 60)
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export default App
