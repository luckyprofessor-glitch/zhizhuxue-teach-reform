import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { extractTextFromFile } from './utils/courseware.js'
import {
  buildCourseFromText,
  GAME_STYLES,
  SOCIAL_WORK_LENSES,
} from './utils/gamification.js'
import {
  STORAGE_KEYS,
  assignParticipant,
  buildLogEntry,
  calculateLevel,
  calculateStudyStats,
  clearStoredItem,
  createEmptySession,
  downloadCsv,
  downloadJson,
  ensureBadge,
  getProgressStorageKey,
  loadStoredJson,
  saveStoredJson,
} from './utils/experiment.js'

const DEMO_TEXT = `
游戏化学习与社会工作课程融合示例

本课程介绍如何把传统课件改造为面向大学生的互动学习任务。教学设计应从单向讲授转向任务驱动、即时反馈与反思迁移。学生不仅需要掌握概念，还需要在真实情境中说明知识如何被应用。

社会工作教育强调人在情境中、优势视角与赋能逻辑。教师在设计学习活动时，应帮助学生看到自己的已有资源，理解个体与环境的互动，并通过支持性反馈增强持续参与。将社工理念嵌入课程，可以提升同理心、行动感与社会责任。

人工智能可以自动抽取课件文本、识别高频概念、生成测验题和学习建议。AI 还可以根据学生答题表现给出差异化提示，帮助教师识别高风险知识点，优化课件结构与教学流程。

游戏化机制包括关卡任务、经验值、成就徽章、剧情叙事与协作挑战。有效的游戏化不是简单加分，而是把目标、反馈、成长路径与行为激励组织成一套结构化学习体验，使学生愿意持续投入。

在教改实验中，可以采用随机对照实验。学生输入被试编号后自动分入实验组或对照组。实验组体验 AI 社工游戏化页面，对照组使用常规数字课件。研究者比较两组在知识测验、学习投入、满意度与社工价值认同上的差异。

为了保证数据质量，平台应记录前测、答题过程、反思文本、完成时间与后测结果，并支持导出 JSON、CSV。正式实施前，还应补充知情同意、匿名化与退出机制。
`

const PRETEST_FIELDS = [
  { name: 'priorKnowledge', label: '我对该主题的先验了解程度', type: 'scale' },
  { name: 'digitalInterest', label: '我对数字化学习方式的兴趣', type: 'scale' },
  { name: 'aiAcceptance', label: '我对 AI 辅助学习的接受度', type: 'scale' },
  { name: 'expectation', label: '请用一句话写下你本次学习的期待', type: 'textarea' },
]

const POSTTEST_FIELDS = [
  { name: 'perceivedLearning', label: '我认为本次学习提升了我的理解', type: 'scale' },
  { name: 'engagement', label: '我在学习过程中保持了投入', type: 'scale' },
  { name: 'continueUse', label: '我愿意继续使用这种学习方式', type: 'scale' },
  { name: 'socialWorkIdentity', label: '我能感受到社工理念对学习的帮助', type: 'scale' },
  { name: 'takeaway', label: '请概括你最大的收获', type: 'textarea' },
]

const DEFAULT_FORM = {
  courseTitle: 'AI × 社工理念 × 游戏化课件平台',
  studyTitle: 'AI社工游戏化学习效果随机对照实验',
  targetLearners: '本科生',
  socialLens: '优势视角',
  gameStyle: '闯关式',
  armCount: 2,
  moduleCount: 5,
  studySeed: 'teach-reform-2026',
}

function App() {
  const storedCourse = loadStoredJson(STORAGE_KEYS.course, null)
  const [builderForm, setBuilderForm] = useState({
    ...DEFAULT_FORM,
    ...(storedCourse?.settings || {}),
    courseTitle: storedCourse?.title || DEFAULT_FORM.courseTitle,
    studyTitle: storedCourse?.experiment?.studyTitle || DEFAULT_FORM.studyTitle,
  })
  const [course, setCourse] = useState(storedCourse)
  const [logs, setLogs] = useState(loadStoredJson(STORAGE_KEYS.logs, []))
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [participantId, setParticipantId] = useState('')
  const [studentSession, setStudentSession] = useState(null)
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
    saveStoredJson(STORAGE_KEYS.logs, logs)
  }, [logs])

  useEffect(() => {
    if (studentSession?.courseId && studentSession?.participantId) {
      saveStoredJson(getProgressStorageKey(studentSession.courseId, studentSession.participantId), studentSession)
    }
  }, [studentSession])

  const stats = useMemo(() => calculateStudyStats(logs, course?.experiment), [logs, course])
  const currentModule = course && studentSession ? course.modules[studentSession.currentIndex] : null
  const currentAnswer = currentModule && studentSession ? studentSession.answers[currentModule.id] : null
  const completionRatio = course && studentSession ? Object.keys(studentSession.answers).length / course.modules.length : 0

  function updateForm(name, value) {
    setBuilderForm((prev) => ({ ...prev, [name]: value }))
  }

  function appendLog(payload) {
    setLogs((prev) => [buildLogEntry(payload), ...prev].slice(0, 5000))
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
        throw new Error('已读取文件，但没有提取到有效文本。请尝试上传可复制文本的 PDF、PPTX、DOCX 或 TXT。')
      }

      const nextCourse = buildCourseFromText(
        combinedText,
        builderForm,
        extracted.map((item) => item.meta),
        extracted.flatMap((item) => item.warnings),
      )

      setCourse(nextCourse)
      setParticipantId('')
      setStudentSession(null)
      setNotice('课件已成功游戏化。你现在可以直接让学生进入实验。')
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
      [{ name: '教改项目示例课件.txt', extension: 'txt', size: DEMO_TEXT.length, type: 'text/plain' }],
      [],
    )

    setCourse(demoCourse)
    setParticipantId('')
    setStudentSession(null)
    setError('')
    setNotice('已载入示例课件。你可以直接体验完整流程。')
  }

  function clearAllProgressKeys() {
    if (typeof window === 'undefined') {
      return
    }

    const keys = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith('teach-reform-progress:')) {
        keys.push(key)
      }
    }
    keys.forEach((key) => window.localStorage.removeItem(key))
  }

  function handleResetAll() {
    setCourse(null)
    setLogs([])
    setUploadedFiles([])
    setParticipantId('')
    setStudentSession(null)
    setError('')
    setNotice('已清空课程、日志与本地进度。')
    clearStoredItem(STORAGE_KEYS.course)
    clearStoredItem(STORAGE_KEYS.logs)
    clearAllProgressKeys()
  }

  function handleEnterStudy() {
    if (!course) {
      setError('请先在上方生成课程。')
      return
    }

    const cleanId = participantId.trim()
    if (!cleanId) {
      setError('请输入被试编号。')
      return
    }

    const arm = assignParticipant(cleanId, course.experiment)
    const progressKey = getProgressStorageKey(course.id, cleanId)
    const existingSession = loadStoredJson(progressKey, null)
    const nextSession = existingSession?.courseId === course.id
      ? { ...existingSession, arm }
      : createEmptySession(course, cleanId, arm)

    setStudentSession(nextSession)
    setError('')
    setNotice(`被试 ${cleanId} 已进入 ${arm.name}。`)

    if (!existingSession) {
      appendLog({
        courseId: course.id,
        participantId: cleanId,
        armId: arm.id,
        armName: arm.name,
        eventType: 'study_entered',
      })
    }
  }

  function handleRestartParticipant() {
    if (!course || !participantId.trim()) {
      return
    }

    clearStoredItem(getProgressStorageKey(course.id, participantId.trim()))
    setStudentSession(null)
    setNotice('该被试的本地进度已清空。可重新进入实验。')
  }

  function handlePretestSubmit(values) {
    if (!studentSession || !course) {
      return
    }

    setStudentSession((prev) => ({ ...prev, pretest: values }))
    appendLog({
      courseId: course.id,
      participantId: studentSession.participantId,
      armId: studentSession.armId,
      eventType: 'pretest_submitted',
      ...values,
    })
    setNotice('前测已保存，开始学习吧。')
  }

  function handleQuizSubmit(module, selectedIndex) {
    if (!studentSession || currentAnswer) {
      return
    }

    const isCorrect = selectedIndex === module.quiz.correctIndex
    const gainedXp = studentSession.arm.gamified ? (isCorrect ? module.xp : Math.round(module.xp / 2)) : 0
    const nextXp = studentSession.xp + gainedXp
    const nextBadges = studentSession.arm.gamified && isCorrect
      ? ensureBadge(studentSession.badges, module.badge)
      : studentSession.badges

    setStudentSession((prev) => ({
      ...prev,
      xp: nextXp,
      level: calculateLevel(nextXp),
      badges: nextBadges,
      answers: {
        ...prev.answers,
        [module.id]: {
          selectedIndex,
          isCorrect,
          score: isCorrect ? 1 : 0,
          submittedAt: new Date().toISOString(),
        },
      },
    }))

    appendLog({
      courseId: course.id,
      participantId: studentSession.participantId,
      armId: studentSession.armId,
      eventType: 'quiz_submitted',
      moduleId: module.id,
      moduleTitle: module.title,
      selectedIndex,
      correctIndex: module.quiz.correctIndex,
      isCorrect,
      score: isCorrect ? 1 : 0,
      xpAfter: nextXp,
    })
  }

  function handleReflectionSave(module, text) {
    if (!studentSession || !text.trim()) {
      return
    }

    const isFirstSave = !studentSession.reflections[module.id]
    const gainedXp = studentSession.arm.gamified && isFirstSave ? 10 : 0
    const nextXp = studentSession.xp + gainedXp

    setStudentSession((prev) => ({
      ...prev,
      xp: nextXp,
      level: calculateLevel(nextXp),
      reflections: {
        ...prev.reflections,
        [module.id]: text.trim(),
      },
    }))

    appendLog({
      courseId: course.id,
      participantId: studentSession.participantId,
      armId: studentSession.armId,
      eventType: 'reflection_saved',
      moduleId: module.id,
      moduleTitle: module.title,
      textLength: text.trim().length,
    })

    setNotice('反思已保存。')
  }

  function moveModule(step) {
    if (!studentSession || !course) {
      return
    }

    setStudentSession((prev) => ({
      ...prev,
      currentIndex: clamp(prev.currentIndex + step, 0, course.modules.length - 1),
    }))
  }

  function handleFinishStudy() {
    if (!studentSession || !course) {
      return
    }

    const answeredCount = Object.keys(studentSession.answers).length
    if (answeredCount < course.modules.length) {
      setError(`请先完成全部 ${course.modules.length} 个关卡的测验。`)
      return
    }

    const accuracy = calculateAccuracy(studentSession.answers)
    const completedAt = new Date().toISOString()

    setStudentSession((prev) => ({
      ...prev,
      finished: true,
      completedAt,
    }))

    appendLog({
      courseId: course.id,
      participantId: studentSession.participantId,
      armId: studentSession.armId,
      eventType: 'study_completed',
      accuracy,
      xp: studentSession.xp,
    })

    setError('')
    setNotice('学习任务已完成，请继续完成后测。')
  }

  function handlePosttestSubmit(values) {
    if (!studentSession || !course) {
      return
    }

    setStudentSession((prev) => ({ ...prev, posttest: values }))
    appendLog({
      courseId: course.id,
      participantId: studentSession.participantId,
      armId: studentSession.armId,
      eventType: 'posttest_submitted',
      ...values,
    })
    setNotice('后测已保存，实验数据已记录。')
  }

  function handleExportJson() {
    downloadJson(`教改实验日志_${formatDateStamp()}.json`, logs)
  }

  function handleExportCsv() {
    downloadCsv(`教改实验日志_${formatDateStamp()}.csv`, logs)
  }

  const aiCoachMessage = currentModule && studentSession
    ? buildCoachMessage(currentModule, studentSession)
    : ''

  return (
    <div className="app-shell">
      <header className="hero-banner">
        <div>
          <span className="hero-banner__eyebrow">教改项目网页原型</span>
          <h1>智助学：AI × 社工理念 × 游戏化课件平台</h1>
          <p className="hero-banner__lead">
            上传课件后，系统会自动抽取文本、生成闯关任务、嵌入社工理论透镜，并支持随机对照实验与过程数据导出。
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

      <section className="panel-grid panel-grid--builder">
        <div className="card card--sticky">
          <div className="card__header">
            <div>
              <h2>一、教师设计台</h2>
              <p>上传任意常见课件，然后配置社工透镜、游戏方式与实验分组。</p>
            </div>
          </div>

          <label className="upload-box">
            <input
              type="file"
              accept=".pdf,.pptx,.docx,.txt,.md,.html,.htm,.csv,.json"
              multiple
              onChange={(event) => setUploadedFiles(Array.from(event.target.files || []))}
            />
            <span className="upload-box__title">点击上传或替换课件文件</span>
            <span className="upload-box__hint">支持 PDF、PPTX、DOCX、TXT、MD、HTML。扫描件可在后续接入 OCR。</span>
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
            <Field label="研究标题">
              <input value={builderForm.studyTitle} onChange={(e) => updateForm('studyTitle', e.target.value)} />
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
            <Field label="实验组数量">
              <select value={builderForm.armCount} onChange={(e) => updateForm('armCount', Number(e.target.value))}>
                <option value={2}>2 组</option>
                <option value={3}>3 组</option>
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
            <Field label="随机种子">
              <input value={builderForm.studySeed} onChange={(e) => updateForm('studySeed', e.target.value)} />
            </Field>
          </div>

          <button className="button" onClick={handleGenerateCourse} disabled={loading}>
            {loading ? '正在解析并生成……' : '生成游戏化课程'}
          </button>
        </div>

        <div className="card">
          <div className="card__header">
            <div>
              <h2>二、课程总览</h2>
              <p>这里会展示自动生成的课程摘要、AI 功能与研究设计。</p>
            </div>
          </div>

          {!course ? (
            <EmptyState
              title="还没有生成课程"
              description="先上传课件，或点击“载入示例”直接体验整套流程。"
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

              <div className="metric-grid">
                <MetricCard label="关卡数" value={course.modules.length} description="自动从课件中拆解出来的学习单元" />
                <MetricCard label="预计时长" value={`${course.estimatedMinutes} 分钟`} description="按文本长度估算的学习时长" />
                <MetricCard label="实验分组" value={`${course.experiment.arms.length} 组`} description="支持随机对照实验" />
                <MetricCard label="文本规模" value={`${course.totalCharacters} 字`} description="用于 AI 抽取与测验生成" />
              </div>

              <div className="info-grid">
                <InfoBlock title="社工理论注入">
                  <p>{course.theoryBridge.socialWork}</p>
                </InfoBlock>
                <InfoBlock title="AI 机制">
                  <p>{course.theoryBridge.ai}</p>
                </InfoBlock>
                <InfoBlock title="教学法结构">
                  <p>{course.theoryBridge.pedagogy}</p>
                </InfoBlock>
              </div>

              <div className="two-column-list">
                <InfoBlock title="学习目标">
                  <ul>
                    {course.learningObjectives.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </InfoBlock>
                <InfoBlock title="关键词">
                  <div className="tag-list">
                    {course.keywords.slice(0, 10).map((item) => <span key={item} className="tag">{item}</span>)}
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
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <h2>三、关卡与实验组预览</h2>
            <p>教师可以先检查每个关卡生成结果，再让学生进入学习。</p>
          </div>
        </div>

        {!course ? (
          <EmptyState title="暂无关卡" description="生成课程后，这里会展示每个模块的游戏化设计。" />
        ) : (
          <>
            <div className="arm-grid">
              {course.experiment.arms.map((arm) => (
                <div className="arm-card" key={arm.id}>
                  <div className="arm-card__title">
                    <h3>{arm.name}</h3>
                    <span className="pill">{arm.id}</span>
                  </div>
                  <ul>
                    {arm.features.map((feature) => <li key={feature}>{feature}</li>)}
                  </ul>
                </div>
              ))}
            </div>

            <div className="module-list">
              {course.modules.map((module) => (
                <article className="module-card" key={module.id}>
                  <div className="module-card__header">
                    <div>
                      <span className="eyebrow">{module.story}</span>
                      <h3>{module.title}</h3>
                    </div>
                    <div className="module-meta">
                      <span className="pill">{module.difficulty}</span>
                      <span className="pill pill--dark">{module.badge}</span>
                    </div>
                  </div>
                  <p className="module-summary">{module.summary}</p>
                  <div className="module-columns">
                    <InfoBlock title="关键点">
                      <ul>
                        {module.keyPoints.map((point) => <li key={point}>{point}</li>)}
                      </ul>
                    </InfoBlock>
                    <InfoBlock title="社工任务">
                      <ul>
                        <li>{module.socialWorkFocus.mission}</li>
                        <li>{module.socialWorkFocus.reflectionPrompt}</li>
                        <li>{module.socialWorkFocus.bridgePrompt}</li>
                      </ul>
                    </InfoBlock>
                    <InfoBlock title="AI 支持">
                      <ul>
                        <li>{module.aiCoach.diagnosis}</li>
                        <li>{module.aiCoach.hint}</li>
                        <li>{module.aiCoach.nextStep}</li>
                      </ul>
                    </InfoBlock>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="panel-grid panel-grid--student">
        <div className="card card--sticky">
          <div className="card__header">
            <div>
              <h2>四、学生实验入口</h2>
              <p>输入被试编号后，系统会自动完成随机分组并加载对应界面。</p>
            </div>
          </div>

          <Field label="被试编号">
            <input value={participantId} onChange={(e) => setParticipantId(e.target.value)} placeholder="例如：S001" />
          </Field>

          <div className="button-row">
            <button className="button" onClick={handleEnterStudy} disabled={!course}>进入实验</button>
            <button className="button button--ghost" onClick={handleRestartParticipant} disabled={!studentSession}>重置该被试</button>
          </div>

          {course && (
            <InfoBlock title="随机分组说明">
              <ul>
                <li>研究标题：{course.experiment.studyTitle}</li>
                <li>随机单位：{course.experiment.randomizationUnit}</li>
                <li>随机种子：{course.experiment.seed}</li>
                <li>主要结局：{course.experiment.primaryOutcome}</li>
              </ul>
            </InfoBlock>
          )}

          {studentSession && (
            <div className="session-card">
              <h3>{studentSession.participantId}</h3>
              <p>当前组别：{studentSession.arm.name}</p>
              <div className="metric-grid metric-grid--compact">
                <MetricCard label="经验值" value={studentSession.xp} description="仅游戏化组累计" />
                <MetricCard label="等级" value={`Lv.${studentSession.level}`} description="随经验值提升" />
                <MetricCard label="进度" value={`${Math.round(completionRatio * 100)}%`} description="按测验完成度计算" />
              </div>
              <div className="tag-list">
                {studentSession.badges.length > 0 ? studentSession.badges.map((badge) => <span key={badge} className="tag">{badge}</span>) : <span className="muted">尚未解锁徽章</span>}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card__header">
            <div>
              <h2>五、学生学习界面</h2>
              <p>不同实验组会看到不同强度的游戏化与 AI 支持，但都保留统一测验便于比较。</p>
            </div>
          </div>

          {!course ? (
            <EmptyState title="请先生成课程" description="生成课程后，这里会显示学生实际看到的学习页面。" />
          ) : !studentSession ? (
            <EmptyState title="尚未进入实验" description="输入被试编号并点击“进入实验”，即可查看随机分组后的界面。" />
          ) : !studentSession.pretest ? (
            <SurveyForm title="前测问卷" fields={PRETEST_FIELDS} onSubmit={handlePretestSubmit} submitLabel="保存前测并开始学习" />
          ) : studentSession.finished && !studentSession.posttest ? (
            <SurveyForm title="后测问卷" fields={POSTTEST_FIELDS} onSubmit={handlePosttestSubmit} submitLabel="保存后测" />
          ) : studentSession.finished && studentSession.posttest ? (
            <CompletionCard session={studentSession} course={course} />
          ) : (
            currentModule && (
              <div className={`student-stage ${studentSession.arm.gamified ? 'student-stage--gamified' : 'student-stage--plain'}`}>
                <div className="student-stage__top">
                  <div>
                    <span className="eyebrow">第 {studentSession.currentIndex + 1} 关 ／ 共 {course.modules.length} 关</span>
                    <h3>{currentModule.title}</h3>
                    <p>{currentModule.summary}</p>
                  </div>
                  <div className="progress-card">
                    <div className="progress-bar">
                      <span style={{ width: `${Math.max(6, completionRatio * 100)}%` }} />
                    </div>
                    <p>完成进度：{Math.round(completionRatio * 100)}%</p>
                  </div>
                </div>

                {studentSession.arm.gamified && (
                  <div className="callout callout--accent">
                    <strong>{currentModule.story}</strong>
                    <p>{currentModule.challenge}</p>
                  </div>
                )}

                <div className="module-reader">
                  <div className="module-reader__meta">
                    <span className="pill">预计 {currentModule.readingEstimateMinutes} 分钟</span>
                    <span className="pill">难度：{currentModule.difficulty}</span>
                    <span className="pill">社工透镜：{currentModule.socialWorkFocus.theory}</span>
                  </div>
                  <div className="module-content">
                    {splitContent(currentModule.content).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                </div>

                <div className="module-columns module-columns--student">
                  <InfoBlock title="关键点">
                    <ul>
                      {currentModule.keyPoints.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </InfoBlock>
                  <InfoBlock title="社工反思任务">
                    <ul>
                      <li>{currentModule.socialWorkFocus.mission}</li>
                      <li>{currentModule.socialWorkFocus.reflectionPrompt}</li>
                    </ul>
                  </InfoBlock>
                </div>

                <QuizPanel key={currentModule.id} module={currentModule} answer={currentAnswer} onSubmit={handleQuizSubmit} />

                <InfoBlock title={studentSession.arm.aiCoach ? 'AI 导师反馈' : '学习提示'}>
                  <p>{aiCoachMessage}</p>
                  <p className="muted">{currentModule.quiz.stretchTask}</p>
                </InfoBlock>

                {(studentSession.arm.socialWork || studentSession.arm.gamified) && (
                  <ReflectionPanel
                    key={currentModule.id}
                    module={currentModule}
                    savedText={studentSession.reflections[currentModule.id] || ''}
                    onSave={handleReflectionSave}
                  />
                )}

                <div className="button-row button-row--spread">
                  <button className="button button--ghost" onClick={() => moveModule(-1)} disabled={studentSession.currentIndex === 0}>上一关</button>
                  {studentSession.currentIndex < course.modules.length - 1 ? (
                    <button className="button" onClick={() => moveModule(1)}>下一关</button>
                  ) : (
                    <button className="button" onClick={handleFinishStudy}>完成全部学习</button>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <h2>六、随机对照实验仪表板</h2>
            <p>支持导出日志，便于后续做描述统计、t 检验、回归或混合模型分析。</p>
          </div>
          <div className="button-row">
            <button className="button button--secondary" onClick={handleExportJson}>导出 JSON</button>
            <button className="button button--secondary" onClick={handleExportCsv}>导出 CSV</button>
          </div>
        </div>

        {!course ? (
          <EmptyState title="暂无实验设计" description="生成课程后，这里会显示实验假设、过程和实时数据。" />
        ) : (
          <>
            <div className="metric-grid">
              <MetricCard label="总被试数" value={stats.totalParticipants} description="按日志中的唯一被试编号统计" />
              <MetricCard label="总日志数" value={stats.totalLogs} description="包含进入实验、答题、反思、完成等事件" />
              <MetricCard label="主要结局" value={course.experiment.primaryOutcome} description="用于检验核心效果" />
              <MetricCard label="伦理提醒" value="已内置" description="正式实验前仍需补充知情同意与匿名化方案" />
            </div>

            <div className="info-grid">
              <InfoBlock title="研究假设">
                <ul>
                  {course.experiment.hypotheses.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </InfoBlock>
              <InfoBlock title="建议测量指标">
                <ul>
                  {course.experiment.suggestedMeasures.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </InfoBlock>
              <InfoBlock title="实施步骤">
                <ul>
                  {course.experiment.procedure.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <p className="muted">{course.experiment.ethicsNotice}</p>
              </InfoBlock>
            </div>

            <div className="arm-grid">
              {stats.armSummaries.map((arm) => (
                <div className="arm-card" key={arm.armId}>
                  <div className="arm-card__title">
                    <h3>{arm.armName}</h3>
                    <span className="pill">{arm.armId}</span>
                  </div>
                  <ul>
                    <li>被试数：{arm.participants}</li>
                    <li>完成率：{arm.completionRate}</li>
                    <li>测验正确率：{arm.accuracy}</li>
                    <li>反思提交数：{arm.reflectionCount}</li>
                  </ul>
                </div>
              ))}
            </div>

            <InfoBlock title="被试记录概览">
              {stats.participantRows.length === 0 ? (
                <p className="muted">还没有被试数据。</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>被试编号</th>
                        <th>组别</th>
                        <th>正确率</th>
                        <th>测验数</th>
                        <th>反思数</th>
                        <th>开始时间</th>
                        <th>完成时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.participantRows.slice(0, 12).map((row) => (
                        <tr key={row.participantId}>
                          <td>{row.participantId}</td>
                          <td>{row.armId}</td>
                          <td>{row.accuracy}</td>
                          <td>{row.quizCount}</td>
                          <td>{row.reflectionCount}</td>
                          <td>{formatDateTime(row.enteredAt)}</td>
                          <td>{row.finishedAt ? formatDateTime(row.finishedAt) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </InfoBlock>
          </>
        )}
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

function InfoBlock({ title, children }) {
  return (
    <section className="info-block">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function MetricCard({ label, value, description }) {
  return (
    <div className="metric-card">
      <span className="metric-card__label">{label}</span>
      <strong>{value}</strong>
      <p>{description}</p>
    </div>
  )
}

function EmptyState({ title, description }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

function SurveyForm({ title, fields, onSubmit, submitLabel }) {
  const [values, setValues] = useState(() => createSurveyDefaults(fields))

  function updateValue(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  return (
    <form
      className="survey-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(values)
      }}
    >
      <div className="card__header">
        <div>
          <h3>{title}</h3>
          <p>请先完成问卷，再继续下一步。</p>
        </div>
      </div>
      <div className="form-grid">
        {fields.map((field) => (
          <Field key={field.name} label={field.label}>
            {field.type === 'scale' ? (
              <select value={values[field.name]} onChange={(e) => updateValue(field.name, Number(e.target.value))}>
                <option value={1}>1 分</option>
                <option value={2}>2 分</option>
                <option value={3}>3 分</option>
                <option value={4}>4 分</option>
                <option value={5}>5 分</option>
              </select>
            ) : (
              <textarea value={values[field.name]} onChange={(e) => updateValue(field.name, e.target.value)} rows={4} />
            )}
          </Field>
        ))}
      </div>
      <button className="button" type="submit">{submitLabel}</button>
    </form>
  )
}

function QuizPanel({ module, answer, onSubmit }) {
  const [selectedIndex, setSelectedIndex] = useState(answer?.selectedIndex ?? -1)

  return (
    <section className="quiz-panel">
      <div className="quiz-panel__head">
        <h3>统一测验</h3>
        <p>{module.quiz.question}</p>
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
      <div className="button-row">
        <button className="button" onClick={() => onSubmit(module, selectedIndex)} disabled={selectedIndex < 0 || Boolean(answer)}>
          {answer ? '已提交' : '提交答案'}
        </button>
        {answer && (
          <p className={answer.isCorrect ? 'result-text result-text--success' : 'result-text result-text--error'}>
            {answer.isCorrect ? '回答正确。' : '回答未命中。'} {module.quiz.rationale}
          </p>
        )}
      </div>
    </section>
  )
}

function ReflectionPanel({ module, savedText, onSave }) {
  const [text, setText] = useState(savedText)

  return (
    <section className="reflection-panel">
      <div className="card__header">
        <div>
          <h3>社工反思记录</h3>
          <p>{module.socialWorkFocus.bridgePrompt}</p>
        </div>
      </div>
      <textarea
        rows={5}
        value={text}
        placeholder="请写下你的情境分析、资源发现或赋能思考。"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="button-row">
        <button className="button button--secondary" onClick={() => onSave(module, text)}>保存反思</button>
        {savedText && <span className="muted">已保存，后续仍可修改。</span>}
      </div>
    </section>
  )
}

function CompletionCard({ session, course }) {
  return (
    <div className="completion-card">
      <span className="eyebrow">实验完成</span>
      <h3>恭喜完成《{course.title}》</h3>
      <p>你的学习过程、测验结果与反思文本已经记录在本地日志中，可由教师统一导出。</p>
      <div className="metric-grid">
        <MetricCard label="被试编号" value={session.participantId} description="用于实验分组与日志匹配" />
        <MetricCard label="组别" value={session.arm.name} description="由随机种子自动分配" />
        <MetricCard label="等级" value={`Lv.${session.level}`} description="仅游戏化组累计经验值" />
        <MetricCard label="正确率" value={calculateAccuracy(session.answers)} description="基于全部统一测验" />
      </div>
      <div className="tag-list">
        {session.badges.length > 0 ? session.badges.map((badge) => <span key={badge} className="tag">{badge}</span>) : <span className="muted">本组不展示游戏化徽章。</span>}
      </div>
    </div>
  )
}

function createSurveyDefaults(fields) {
  return fields.reduce((accumulator, field) => {
    accumulator[field.name] = field.type === 'scale' ? 3 : ''
    return accumulator
  }, {})
}

function buildCoachMessage(module, session) {
  const answer = session.answers[module.id]
  const reflection = session.reflections[module.id]

  if (session.arm.aiCoach) {
    if (!answer) {
      return `${module.aiCoach.diagnosis}${module.aiCoach.hint}`
    }
    if (answer.isCorrect) {
      return `AI 导师判断你已经抓住本节重点。${module.aiCoach.nextStep}${reflection ? ' 你的社工反思也已保存，说明你已经开始把知识迁移到情境中。' : ' 建议再补写一段社工反思，巩固迁移效果。'}`
    }
    return `AI 导师建议你回看“${module.keyPoints[0]}”，并围绕 ${module.socialWorkFocus.theory} 思考：这个知识点在真实课堂、社区或服务情境中如何使用？`
  }

  if (session.arm.socialWork) {
    return `学习提示：请完成统一测验后，再用 ${module.socialWorkFocus.theory} 重新解释本节内容，把抽象知识转化为情境化语言。`
  }

  return '学习提示：请按顺序阅读、答题并完成后测，系统将用于比较不同教学设计的学习效果。'
}

function splitContent(content) {
  return String(content || '')
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function calculateAccuracy(answerMap) {
  const values = Object.values(answerMap || {})
  if (values.length === 0) {
    return 0
  }
  const correct = values.filter((item) => item.isCorrect).length
  return Number((correct / values.length).toFixed(2))
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function formatFileSize(size) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatDateStamp() {
  return new Date().toISOString().slice(0, 10)
}

export default App
