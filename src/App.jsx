import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { extractTextFromFile } from './utils/courseware.js'
import {
  buildCourseFromText,
  GAME_STYLES,
  SOCIAL_WORK_LENSES,
} from './utils/gamification.js'
import {
  createChatMessage,
  createCompletionMessage,
  createFinalBossFeedback,
  createModuleArrivalMessage,
  createOpeningMessages,
  createQuizFeedback,
  createReflectionFeedback,
  generateAgentReply,
  getQuickPrompts,
} from './utils/agent.js'
import {
  STORAGE_KEYS,
  calculateLevel,
  clearStoredItem,
  createStudySession,
  ensureBadge,
  loadStoredJson,
  saveStoredJson,
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
  socialLens: '优势视角',
  gameStyle: '闯关式',
  moduleCount: 5,
  agentName: '智助灵',
}

function App() {
  const initialCourse = loadStoredJson(STORAGE_KEYS.course, null)
  const initialSession = loadStoredJson(STORAGE_KEYS.session, null)

  const [builderForm, setBuilderForm] = useState({
    ...DEFAULT_FORM,
    ...(initialCourse?.settings || {}),
    courseTitle: initialCourse?.title || DEFAULT_FORM.courseTitle,
  })
  const [course, setCourse] = useState(initialCourse)
  const [session, setSession] = useState(initialSession?.courseId === initialCourse?.id ? initialSession : null)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [learnerName, setLearnerName] = useState(initialSession?.learnerName || '')
  const [chatInput, setChatInput] = useState('')
  const [loading, setLoading] = useState(false)
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

  const currentModule = useMemo(() => {
    if (!course) return null
    if (!session) return course.modules[0] || null
    return course.modules[session.currentModuleIndex] || course.modules[0] || null
  }, [course, session])

  const currentAnswer = currentModule && session ? session.answers[currentModule.id] : null
  const currentReflection = currentModule && session ? session.reflections[currentModule.id] || '' : ''
  const allModulesCleared = course && session ? session.clearedModules.length === course.modules.length : false
  const progressPercent = course && session ? Math.round((session.clearedModules.length / course.modules.length) * 100) : 0
  const readyToClearCurrent = Boolean(currentAnswer && currentReflection.trim() && currentModule && session && !session.clearedModules.includes(currentModule.id))
  const quickPrompts = currentModule ? getQuickPrompts(currentModule) : []

  function updateForm(name, value) {
    setBuilderForm((prev) => ({ ...prev, [name]: value }))
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

      const nextCourse = buildCourseFromText(
        combinedText,
        builderForm,
        extracted.map((item) => item.meta),
        extracted.flatMap((item) => item.warnings),
      )

      setCourse(nextCourse)
      setSession(null)
      setLearnerName('')
      setChatInput('')
      setError('')
      setNotice('课件已成功转化为可互动的游戏化自学地图。接下来只需输入学习者昵称，开始闯关。')
    } catch (buildError) {
      setError(buildError.message || '生成失败，请重试。')
    } finally {
      setLoading(false)
    }
  }

  function handleLoadDemo() {
    const demoCourse = buildCourseFromText(
      DEMO_TEXT,
      builderForm,
      [{ name: '游戏化自学示例课件.txt', extension: 'txt', size: DEMO_TEXT.length, type: 'text/plain' }],
      [],
    )

    setCourse(demoCourse)
    setSession(null)
    setLearnerName('')
    setChatInput('')
    setError('')
    setNotice('已载入示例课件。你可以直接开始体验“上传课件—智能体陪学—闯关自学”的完整流程。')
  }

  function handleResetAll() {
    setCourse(null)
    setSession(null)
    setUploadedFiles([])
    setLearnerName('')
    setChatInput('')
    setError('')
    setNotice('已清空当前课件、学习旅程与本地缓存。')
    clearStoredItem(STORAGE_KEYS.course)
    clearStoredItem(STORAGE_KEYS.session)
  }

  function handleStartJourney() {
    if (!course) {
      setError('请先上传并生成课程。')
      return
    }

    const name = learnerName.trim() || '同学'
    const nextSession = createStudySession(course, name)
    nextSession.chatHistory = [
      ...createOpeningMessages(course, name),
      createModuleArrivalMessage(course.modules[0]),
    ]

    setSession(nextSession)
    setLearnerName(name)
    setError('')
    setNotice(`${name} 的自学旅程已开始。现在可以一边闯关，一边和智能体对话。`)
  }

  function handleRestartJourney() {
    clearStoredItem(STORAGE_KEYS.session)
    setSession(null)
    setChatInput('')
    setNotice('已重置当前学习旅程。你可以重新开始闯关。')
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
    if (!session || !course || !currentModule) {
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

  function handleSendChat(presetMessage) {
    if (!course || !session || !currentModule) {
      setError('请先开始自学旅程，再与智能体互动。')
      return
    }

    const message = (presetMessage || chatInput).trim()
    if (!message) {
      return
    }

    const reply = generateAgentReply({
      course,
      module: currentModule,
      session,
      message,
    })

    setSession((prev) => ({
      ...prev,
      chatHistory: [...prev.chatHistory, createChatMessage('user', message), reply],
    }))
    setChatInput('')
    setError('')
  }

  return (
    <div className="app-shell">
      <header className="hero-banner">
        <div>
          <span className="hero-banner__eyebrow">AI 自学工具原型</span>
          <h1>智助学：上传课件后，让智能体把它变成闯关式自主学习</h1>
          <p className="hero-banner__lead">
            这个版本不再做分组、测量或实验入口，而是专注做一个学生可直接使用的自学工具：上传 PPT、PDF 或讲义后，系统自动拆成关卡，学生可与智能体边学边问边闯关。
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
                <h2>一、上传课件并生成自学地图</h2>
                <p>教师只需要上传课件，系统会自动重组为关卡、任务、测验和智能体陪练内容。</p>
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
                <p>这里展示上传课件后自动形成的课程地图、社工逻辑与 AI 陪学能力。</p>
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

                <div className="stat-grid">
                  <StatCard label="关卡数" value={course.modules.length} description="自动从课件中拆解出的学习单元" />
                  <StatCard label="预计时长" value={`${course.estimatedMinutes} 分钟`} description="按文本长度估算的自学时长" />
                  <StatCard label="关键词" value={course.keywords.length} description="智能体用于问答与提示的概念抓手" />
                  <StatCard label="智能体" value={course.agentProfile.name} description="学生可边学边问的陪练伙伴" />
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
                    开始后，学生会获得一条线性关卡地图。每一关都包含：阅读抓手、统一挑战题、情境迁移任务，以及可随时提问的智能体。
                  </p>
                </div>
                <div className="start-panel__form">
                  <Field label="学习者昵称">
                    <input
                      value={learnerName}
                      onChange={(e) => setLearnerName(e.target.value)}
                      placeholder="例如：小林 / 2026社工1班 / 学习者A"
                    />
                  </Field>
                  <button className="button" onClick={handleStartJourney}>开始闯关</button>
                </div>
              </div>
            ) : (
              <div className="study-space">
                <div className="learner-strip">
                  <div>
                    <span className="eyebrow">学习中</span>
                    <h3>{session.learnerName} 的闯关地图</h3>
                    <p>已完成 {session.clearedModules.length} / {course.modules.length} 关。完成每关后会解锁下一关与成就徽章。</p>
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

                    <QuizPanel
                      key={currentModule.id}
                      module={currentModule}
                      answer={currentAnswer}
                      onSubmit={handleQuizSubmit}
                    />

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
                <p>学生可以随时提问，让智能体解释、举例、提示、出题与复盘。</p>
              </div>
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

                <div className="quick-actions">
                  {quickPrompts.map((prompt) => (
                    <button key={prompt} className="quick-action" onClick={() => handleSendChat(prompt)}>{prompt}</button>
                  ))}
                </div>

                <div className="chat-history">
                  {session.chatHistory.map((item) => (
                    <article key={item.id} className={`chat-bubble chat-bubble--${item.role}`}>
                      <span className="chat-bubble__role">{item.role === 'agent' ? course.agentProfile.name : session.learnerName}</span>
                      <p>{item.content}</p>
                    </article>
                  ))}
                </div>

                <div className="chat-composer">
                  <textarea
                    rows={4}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="例如：解释一下这一关 / 给我举个例子 / 我的理解是……"
                  />
                  <div className="button-row button-row--spread">
                    <p className="muted">提示：如果你输入“我的理解是……”，智能体会给你反馈。</p>
                    <button className="button button--secondary" onClick={() => handleSendChat()}>发送</button>
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

export default App
