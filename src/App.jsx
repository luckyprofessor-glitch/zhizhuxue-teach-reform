import { useEffect, useMemo, useState } from 'react'
import './App.css'
import heroImg from './assets/game/hero.svg'
import bossImg from './assets/game/boss.svg'
import coinImg from './assets/game/coin.svg'
import gemImg from './assets/game/gem.svg'
import scrollImg from './assets/game/scroll.svg'
import portalImg from './assets/game/portal.svg'
import { extractTextFromFile } from './utils/courseware.js'
import {
  buildCourseFromText,
  GAME_STYLES,
  SOCIAL_WORK_LENSES,
} from './utils/gamification.js'
import {
  AI_PROVIDER_PRESETS,
  DEFAULT_AI_CONFIG,
  applyProviderPreset,
  canUseRealAI,
  enrichCourseWithAI,
  getProviderNote,
} from './utils/llm.js'
import {
  STORAGE_KEYS,
  clearStoredItem,
  loadStoredJson,
  saveStoredJson,
} from './utils/study.js'
import {
  buildShareUrl,
  clearShareParamFromLocation,
  copyText,
  estimateShareUrlLength,
  loadSharedCourseFromLocation,
} from './utils/share.js'

const DEMO_TEXT = `
游戏化学习与社会工作课程融合示例

本课程介绍如何把传统课件改造为面向大学生的互动学习任务。教学设计应从单向讲授转向任务驱动、即时反馈与反思迁移。学生不仅需要掌握概念，还需要在真实情境中说明知识如何被应用。

社会工作教育强调人在情境中、优势视角与赋能逻辑。教师在设计学习活动时，应帮助学生看到自己的已有资源，理解个体与环境的互动，并通过支持性反馈增强持续参与。将社工理念嵌入课程，可以提升同理心、行动感与社会责任。

人工智能可以自动抽取课件文本、识别高频概念、生成测验题和学习建议。AI 还可以把课件转化成关卡、卡牌、剧情任务和终局挑战，帮助学生在自学时保持参与感。

游戏化机制包括关卡任务、经验值、成就徽章、剧情叙事与情境挑战。有效的游戏化不是简单加分，而是把目标、反馈、成长路径与行为激励组织成一套结构化学习体验，使学生愿意持续投入。

理想的自学平台应允许教师上传 PPT、PDF 或讲义，系统自动生成关卡、情境任务、即时测验和终局任务。学生不需要填写信息，打开页面就能开始游戏式学习。
`

const DEFAULT_FORM = {
  courseTitle: '智助学｜游戏化课件自学网页',
  targetLearners: '本科生',
  socialLens: '优势视角',
  gameStyle: '闯关式',
  moduleCount: 5,
  agentName: '引导精灵',
}

function App() {
  const sharedImport = useMemo(() => {
    try {
      return { course: loadSharedCourseFromLocation(), error: '' }
    } catch (shareError) {
      return { course: null, error: shareError.message || '分享链接解析失败。' }
    }
  }, [])

  const initialCourse = sharedImport.course || loadStoredJson(STORAGE_KEYS.course, null)
  const initialAiConfig = loadStoredJson(STORAGE_KEYS.aiConfig, DEFAULT_AI_CONFIG)
  const initialGameState = loadStoredJson(STORAGE_KEYS.session, null)

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
  const [gameState, setGameState] = useState(initialGameState?.courseId === initialCourse?.id ? initialGameState : null)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(sharedImport.course ? '已从分享链接自动载入课程。现在任何人打开这个网址，都可以直接进入学习。' : '')
  const [error, setError] = useState(sharedImport.error || '')

  useEffect(() => {
    if (course) {
      saveStoredJson(STORAGE_KEYS.course, course)
    } else {
      clearStoredItem(STORAGE_KEYS.course)
    }
  }, [course])

  useEffect(() => {
    saveStoredJson(STORAGE_KEYS.aiConfig, aiConfig)
  }, [aiConfig])

  useEffect(() => {
    if (gameState && gameState.courseId === course?.id) {
      saveStoredJson(STORAGE_KEYS.session, gameState)
    } else {
      clearStoredItem(STORAGE_KEYS.session)
    }
  }, [gameState, course])

  useEffect(() => {
    if (course && (!gameState || gameState.courseId !== course.id)) {
      setGameState(createGameState(course))
    }
  }, [course, gameState])

  const aiReady = canUseRealAI(aiConfig)
  const aiGenerationEnabled = aiReady && aiConfig.useForCourseGeneration
  const currentModule = course && gameState ? course.modules[gameState.currentStage] : null
  const progressPercent = course && gameState ? Math.round((gameState.clearedStages.length / course.modules.length) * 100) : 0
  const generationLabel = course?.runtime?.generator === 'llm' ? '真实大模型优化' : '本地生成'
  const coverKeywords = course?.keywords?.slice(0, 3) || []
  const shareUrl = course ? buildShareUrl(course) : ''
  const shareUrlLength = course ? estimateShareUrlLength(course) : 0
  const inventory = useMemo(() => flattenCollectedCards(course, gameState), [course, gameState])
  const currentProgress = currentModule && gameState ? getModuleProgress(currentModule, gameState) : null

  function updateForm(name, value) {
    setBuilderForm((prev) => ({ ...prev, [name]: value }))
  }

  function updateAiConfig(name, value) {
    setAiConfig((prev) => ({ ...prev, [name]: value }))
  }

  function handleProviderChange(provider) {
    setAiConfig((prev) => applyProviderPreset(provider, prev))
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

      let nextNotice = '课件已成功转成游戏化自学页面。现在已经可以直接学习了。'

      if (aiGenerationEnabled) {
        try {
          nextCourse = await enrichCourseWithAI({
            aiConfig,
            sourceText: combinedText,
            baseCourse: nextCourse,
            options: builderForm,
          })
          nextNotice = '课件已生成，并已由真实大模型优化为更完整的游戏化学习页面。'
        } catch (aiError) {
          nextCourse = {
            ...nextCourse,
            runtime: { generator: 'local', fallbackReason: aiError.message },
          }
          nextNotice = `课件已生成，但真实大模型优化失败，已自动回退为本地游戏版。原因：${aiError.message}`
        }
      }

      clearShareParamFromLocation()
      setCourse(nextCourse)
      setGameState(createGameState(nextCourse))
      setNotice(nextNotice)
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

    clearShareParamFromLocation()
    setCourse(demoCourse)
    setGameState(createGameState(demoCourse))
    setError('')
    setNotice('已载入示例课件。你可以直接体验完整的游戏化自学流程。')
  }

  function handleResetAll() {
    clearShareParamFromLocation()
    setCourse(null)
    setGameState(null)
    setUploadedFiles([])
    setError('')
    setNotice('已清空当前课件与学习状态。')
    clearStoredItem(STORAGE_KEYS.course)
    clearStoredItem(STORAGE_KEYS.session)
  }

  async function handleCopyShareUrl() {
    if (!course) {
      setError('请先生成课程，再复制公开学习链接。')
      return
    }

    try {
      await copyText(shareUrl)
      setNotice('公开学习链接已复制。任何人打开这个网址，都可以直接进入学习。')
      setError('')
    } catch (copyError) {
      setError(copyError.message || '复制链接失败，请手动复制浏览器地址。')
    }
  }

  function handleExitSharedView() {
    clearShareParamFromLocation()
    setNotice('已移除地址中的分享参数。当前页面回到本地模式。')
  }

  function handleExportCoursePackage() {
    if (!course) {
      setError('请先生成课程，再导出课程包。')
      return
    }

    downloadJsonFile(`${slugifyFileName(course.title || '课程包')}.json`, {
      version: 1,
      exportedAt: new Date().toISOString(),
      course,
    })
    setNotice('课程包已导出。若公开学习链接过长，可把这个 JSON 文件发给别人导入。')
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

      clearShareParamFromLocation()
      setCourse(nextCourse)
      setGameState(createGameState(nextCourse))
      setBuilderForm((prev) => ({
        ...prev,
        ...(nextCourse.settings || {}),
        courseTitle: nextCourse.title || prev.courseTitle,
      }))
      setNotice(`课程包《${nextCourse.title}》已导入，现在可以直接开始学习。`)
      setError('')
    } catch (importError) {
      setError(importError.message || '导入课程包失败，请检查 JSON 文件。')
    } finally {
      event.target.value = ''
    }
  }

  function handleSelectStage(index) {
    if (!course || !gameState) {
      return
    }
    if (index > gameState.clearedStages.length) {
      setNotice('请先完成前面的关卡，再解锁后续地图。')
      return
    }
    setGameState((prev) => ({ ...prev, currentStage: index }))
  }

  function handleCollectCard(moduleId, collectible) {
    setGameState((prev) => {
      const collected = prev.collected[moduleId] || []
      if (collected.includes(collectible.id)) {
        return prev
      }
      return {
        ...prev,
        xp: prev.xp + 8,
        coins: prev.coins + collectible.rewardCoins,
        collected: {
          ...prev.collected,
          [moduleId]: [...collected, collectible.id],
        },
      }
    })
  }

  function handleChooseDecision(moduleId, optionIndex, bestIndex) {
    setGameState((prev) => {
      const existed = prev.decisions[moduleId]
      const isBest = optionIndex === bestIndex
      return {
        ...prev,
        xp: prev.xp + (existed ? 0 : isBest ? 16 : 8),
        gems: prev.gems + (existed ? 0 : isBest ? 1 : 0),
        decisions: {
          ...prev.decisions,
          [moduleId]: { optionIndex, isBest },
        },
      }
    })
  }

  function handleSubmitQuiz(module, selectedIndex) {
    if (selectedIndex < 0) {
      setError('请先选择一个答案。')
      return
    }

    setGameState((prev) => {
      const current = prev.quiz[module.id] || { attempts: 0, correct: false }
      if (current.correct) {
        return prev
      }

      const isCorrect = selectedIndex === module.quiz.correctIndex
      return {
        ...prev,
        xp: prev.xp + (isCorrect ? 20 : 6),
        hearts: isCorrect ? prev.hearts : Math.max(0, prev.hearts - 1),
        quiz: {
          ...prev.quiz,
          [module.id]: {
            attempts: current.attempts + 1,
            selectedIndex,
            correct: isCorrect,
          },
        },
      }
    })
  }

  function handleRecoverHearts() {
    setGameState((prev) => {
      if (prev.coins < 10 || prev.hearts >= 5) {
        return prev
      }
      return {
        ...prev,
        coins: prev.coins - 10,
        hearts: Math.min(5, prev.hearts + 3),
      }
    })
  }

  function handleSaveStageNote(moduleId, text) {
    setGameState((prev) => ({
      ...prev,
      notes: {
        ...prev.notes,
        [moduleId]: text.trim(),
      },
    }))
  }

  function handleClearStage(module) {
    const progress = getModuleProgress(module, gameState)
    if (!progress.ready) {
      setError('请先完成卡牌收集、情境抉择、Boss 战和通关笔记。')
      return
    }

    if (gameState.clearedStages.includes(module.id)) {
      return
    }

    setGameState((prev) => ({
      ...prev,
      xp: prev.xp + module.xp,
      coins: prev.coins + module.rewards.coins,
      gems: prev.gems + module.rewards.gems,
      clearedStages: [...prev.clearedStages, module.id],
      badges: prev.badges.includes(module.badge) ? prev.badges : [...prev.badges, module.badge],
      currentStage: Math.min(prev.currentStage + 1, course.modules.length - 1),
    }))
    setNotice(`你已通关 ${module.realmName}。新的地图已解锁。`)
  }

  function handleFinalBossSubmit(text) {
    if (!text.trim()) {
      setError('请先完成终局方案，再提交。')
      return
    }

    setGameState((prev) => ({
      ...prev,
      xp: prev.finalBossDone ? prev.xp : prev.xp + 120,
      gems: prev.finalBossDone ? prev.gems : prev.gems + 3,
      finalBossDone: true,
      finalPlan: text.trim(),
    }))
    setNotice('终局任务已完成，整段学习冒险通关。')
  }

  return (
    <div className="game-app">
      <header className="hero-shell">
        <div className="hero-shell__copy">
          <span className="eyebrow">游戏化自学网页</span>
          <h1>上传课件后，自动变成可直接玩的自学游戏</h1>
          <p>
            现在这个网页不再要求学生填写任何信息。只要有网址，打开就能进入课件游戏。AI 主要负责把课件转成关卡、地图、卡牌、Boss 战和终局任务，而不是做聊天机器人。
          </p>
        </div>
        <div className="hero-shell__art">
          <img src={heroImg} alt="学习角色" />
          <img src={portalImg} alt="知识传送门" />
        </div>
      </header>

      {(notice || error) && (
        <section className="message-strip">
          {notice && <div className="message message--success">{notice}</div>}
          {error && <div className="message message--error">{error}</div>}
        </section>
      )}

      <section className="layout-grid">
        <aside className="panel panel--builder">
          <div className="panel__head">
            <h2>上传课件</h2>
            <p>支持 PDF、PPTX、DOCX、TXT、MD、HTML。上传后直接转成游戏化学习地图。</p>
          </div>

          <label className="upload-card">
            <input
              type="file"
              accept=".pdf,.pptx,.docx,.txt,.md,.html,.htm,.csv,.json"
              multiple
              onChange={(event) => setUploadedFiles(Array.from(event.target.files || []))}
            />
            <strong>点击上传课件文件</strong>
            <span>推荐优先上传 PPTX 或可复制文字的 PDF。</span>
          </label>

          <div className="file-stack">
            {uploadedFiles.length === 0 ? (
              <p className="muted">尚未选择文件。</p>
            ) : (
              uploadedFiles.map((file) => (
                <div className="file-item" key={`${file.name}-${file.size}`}>
                  <span>{file.name}</span>
                  <span>{formatFileSize(file.size)}</span>
                </div>
              ))
            )}
          </div>

          <div className="field-grid">
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
            <Field label="游戏风格">
              <select value={builderForm.gameStyle} onChange={(e) => updateForm('gameStyle', e.target.value)}>
                {Object.keys(GAME_STYLES).map((key) => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
            </Field>
            <Field label="目标关卡数">
              <select value={builderForm.moduleCount} onChange={(e) => updateForm('moduleCount', Number(e.target.value))}>
                <option value={3}>3 关</option>
                <option value={4}>4 关</option>
                <option value={5}>5 关</option>
                <option value={6}>6 关</option>
              </select>
            </Field>
          </div>

          <div className="panel config-card">
            <div className="panel__head panel__head--compact">
              <h3>AI 生成优化</h3>
              <span className={`status-chip ${aiReady ? 'status-chip--ok' : ''}`}>{aiReady ? '已就绪' : '未启用'}</span>
            </div>
            <label className="toggle-row">
              <input type="checkbox" checked={aiConfig.enabled} onChange={(e) => updateAiConfig('enabled', e.target.checked)} />
              <span>启用真实大模型，只用于优化游戏内容生成</span>
            </label>
            <div className="field-grid">
              <Field label="提供方">
                <select value={aiConfig.provider} onChange={(e) => handleProviderChange(e.target.value)}>
                  {Object.entries(AI_PROVIDER_PRESETS).map(([key, preset]) => (
                    <option key={key} value={key}>{preset.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="模型名称">
                <input value={aiConfig.model} onChange={(e) => updateAiConfig('model', e.target.value)} />
              </Field>
              <Field label="Base URL">
                <input value={aiConfig.baseUrl} onChange={(e) => updateAiConfig('baseUrl', e.target.value)} />
              </Field>
              <Field label="API Key">
                <input type="password" value={aiConfig.apiKey} onChange={(e) => updateAiConfig('apiKey', e.target.value)} />
              </Field>
            </div>
            <p className="muted">{getProviderNote(aiConfig.provider)}</p>
          </div>

          <div className="button-row">
            <button className="button" onClick={handleGenerateCourse} disabled={loading}>{loading ? '正在生成游戏……' : '生成自学游戏'}</button>
            <button className="button button--secondary" onClick={handleLoadDemo}>载入示例</button>
            <button className="button button--ghost" onClick={handleResetAll}>清空全部</button>
          </div>
        </aside>

        <main className="panel panel--main">
          {!course || !gameState ? (
            <EmptyState
              icon={portalImg}
              title="先上传课件，网页就会自动变成游戏"
              description="上传课件后，中间区域会立即生成世界地图、关卡、卡牌、情境抉择和 Boss 战。"
            />
          ) : (
            <>
              <section className="cover-panel">
                <div>
                  <span className="eyebrow">{course.gameMeta.worldName}</span>
                  <h2>{course.title}</h2>
                  <p>{course.description}</p>
                  <div className="tag-row">
                    {coverKeywords.map((item) => <span className="tag" key={item}>{item}</span>)}
                  </div>
                </div>
                <div className="cover-panel__meta">
                  <span>{course.sourceStructure === 'slide-based' ? '按 PPT 幻灯片生成' : course.sourceStructure === 'page-based' ? '按 PDF 页码生成' : '按文本语义生成'}</span>
                  <strong>{generationLabel}</strong>
                  <span>{course.modules.length} 个关卡</span>
                </div>
              </section>

              <section className="share-panel">
                <div>
                  <h3>公开学习链接</h3>
                  <p>任何人拿到这个网址，都可以直接打开并开始学习。</p>
                </div>
                <code>{shareUrl}</code>
                <div className="button-row">
                  <button className="button button--secondary" onClick={handleCopyShareUrl}>复制学习链接</button>
                  <button className="button button--secondary" onClick={handleExportCoursePackage}>导出课程包</button>
                  <label className="button button--ghost button--file">
                    导入课程包
                    <input type="file" accept="application/json,.json" onChange={handleImportCoursePackage} />
                  </label>
                  {sharedImport.course && <button className="button button--ghost" onClick={handleExitSharedView}>移除分享参数</button>}
                </div>
                <p className="muted">当前链接长度约 {shareUrlLength} 个字符。如果课件很大，建议改用课程包 JSON 导出／导入。</p>
              </section>

              <section className="map-panel">
                <div className="panel__head panel__head--compact">
                  <h3>知识地图</h3>
                  <p>{course.gameMeta.startNarrative}</p>
                </div>
                <div className="map-grid">
                  {course.worldMap.map((node, index) => {
                    const unlocked = index <= gameState.clearedStages.length
                    const active = index === gameState.currentStage
                    const cleared = gameState.clearedStages.includes(node.id)
                    return (
                      <button
                        key={node.id}
                        className={`map-node ${active ? 'map-node--active' : ''} ${cleared ? 'map-node--cleared' : ''}`}
                        disabled={!unlocked}
                        onClick={() => handleSelectStage(index)}
                      >
                        <span>{node.label}</span>
                        <strong>{node.title}</strong>
                        <small>{cleared ? '已通关' : unlocked ? node.difficulty : '未解锁'}</small>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="stage-shell">
                <div className="stage-top">
                  <div>
                    <span className="eyebrow">{currentModule.realmName}</span>
                    <h2>{currentModule.title}</h2>
                    <p>{currentModule.summary}</p>
                  </div>
                  <div className="stage-top__meta">
                    <span>{currentModule.sourceLabel || '自动拆分单元'}</span>
                    <span>难度：{currentModule.difficulty}</span>
                    <span>奖励：{currentModule.rewards.coins} 金币 / {currentModule.rewards.gems} 宝石</span>
                  </div>
                </div>

                <div className="scene-panel">
                  <div className="scene-panel__card">
                    <img src={heroImg} alt="学习角色" />
                    <div>
                      <h3>冒险目标</h3>
                      <p>{currentModule.challenge}</p>
                      <p className="muted">{currentModule.scene}</p>
                    </div>
                  </div>
                  <div className="scene-panel__card scene-panel__card--boss">
                    <img src={bossImg} alt="Boss" />
                    <div>
                      <h3>{currentModule.boss.name}</h3>
                      <p>{currentModule.boss.intro}</p>
                    </div>
                  </div>
                </div>

                {currentProgress && (
                  <div className="progress-strip">
                    <ProgressPill label="卡牌收集" done={currentProgress.collectDone} />
                    <ProgressPill label="情境抉择" done={currentProgress.scenarioDone} />
                    <ProgressPill label="Boss 战" done={currentProgress.quizDone} />
                    <ProgressPill label="通关笔记" done={currentProgress.noteDone} />
                  </div>
                )}

                <section className="quest-panel">
                  <div className="quest-card">
                    <div className="quest-card__head">
                      <img src={scrollImg} alt="知识卡牌" />
                      <div>
                        <h3>任务 1｜收集知识卡牌</h3>
                        <p>点击收集当前关卡的核心概念，组建你的学习卡组。</p>
                      </div>
                    </div>
                    <div className="card-grid">
                      {currentModule.collectibles.map((item) => {
                        const active = gameState.collected[currentModule.id]?.includes(item.id)
                        return (
                          <button
                            key={item.id}
                            className={`collect-card ${active ? 'collect-card--active' : ''}`}
                            onClick={() => handleCollectCard(currentModule.id, item)}
                          >
                            <strong>{item.label}</strong>
                            <span>{item.type}</span>
                            <small>+{item.rewardCoins} 金币</small>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="quest-card">
                    <div className="quest-card__head">
                      <img src={portalImg} alt="情境选择" />
                      <div>
                        <h3>任务 2｜情境抉择</h3>
                        <p>{currentModule.scenario.prompt}</p>
                      </div>
                    </div>
                    <div className="choice-grid">
                      {currentModule.scenario.options.map((option, index) => {
                        const currentChoice = gameState.decisions[currentModule.id]
                        const selected = currentChoice?.optionIndex === index
                        return (
                          <button
                            key={option}
                            className={`choice-card ${selected ? 'choice-card--selected' : ''}`}
                            onClick={() => handleChooseDecision(currentModule.id, index, currentModule.scenario.bestIndex)}
                          >
                            <span>选项 {index + 1}</span>
                            <strong>{option}</strong>
                          </button>
                        )
                      })}
                    </div>
                    {gameState.decisions[currentModule.id] && (
                      <p className="muted">{currentModule.scenario.rationale}</p>
                    )}
                  </div>
                </section>

                <section className="quest-card">
                  <div className="quest-card__head">
                    <img src={bossImg} alt="Boss 战" />
                    <div>
                      <h3>任务 3｜Boss 战</h3>
                      <p>答对问题即可击败本关 Boss；答错会消耗能量。</p>
                    </div>
                  </div>
                  <QuizBattle key={currentModule.id} module={currentModule} state={gameState.quiz[currentModule.id]} onSubmit={handleSubmitQuiz} />
                </section>

                <StageNotebook
                  key={currentModule.id}
                  module={currentModule}
                  savedText={gameState.notes[currentModule.id] || ''}
                  onSave={handleSaveStageNote}
                />

                <div className="button-row button-row--spread">
                  <div className="tag-row">
                    {gameState.badges.length > 0
                      ? gameState.badges.map((badge) => <span className="tag" key={badge}>{badge}</span>)
                      : <span className="muted">通关后可解锁徽章</span>}
                  </div>
                  <button className="button" onClick={() => handleClearStage(currentModule)} disabled={!currentProgress?.ready}>通关并解锁下一关</button>
                </div>
              </section>

              {course && gameState.finalBossDone !== undefined && gameState.clearedStages.length === course.modules.length && (
                <FinalTemple
                  key={course.id}
                  finalBoss={course.finalBoss}
                  savedText={gameState.finalPlan}
                  completed={gameState.finalBossDone}
                  onSubmit={handleFinalBossSubmit}
                />
              )}
            </>
          )}
        </main>

        <aside className="panel panel--side">
          {!course || !gameState ? (
            <EmptyState icon={heroImg} title="等待生成游戏" description="生成课程后，这里会显示英雄状态、资源与收集卡组。" compact />
          ) : (
            <>
              <section className="side-card hero-card">
                <img src={heroImg} alt="英雄角色" />
                <div>
                  <span className="eyebrow">学习状态</span>
                  <h3>{course.gameMeta.heroTitle}</h3>
                  <p>{progressPercent}% 地图已探索</p>
                </div>
              </section>

              <section className="side-card stats-card">
                <ResourceRow icon={coinImg} label="金币" value={gameState.coins} />
                <ResourceRow icon={gemImg} label="宝石" value={gameState.gems} />
                <ResourceRow icon={scrollImg} label="经验值" value={gameState.xp} />
                <ResourceRow icon={portalImg} label="能量" value={`${gameState.hearts}/5`} />
                <button className="button button--ghost" onClick={handleRecoverHearts} disabled={gameState.coins < 10 || gameState.hearts >= 5}>使用 10 金币补充能量</button>
              </section>

              <section className="side-card diagnosis-card">
                <span className="eyebrow">当前关卡诊断</span>
                <h3>{currentProgress?.ready ? '已满足通关条件' : '还未完成全部任务'}</h3>
                <p>{currentModule?.boss?.intro}</p>
                <ul>
                  {currentModule?.keyPoints?.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>

              <section className="side-card inventory-card">
                <div className="panel__head panel__head--compact">
                  <h3>已收集卡组</h3>
                  <span>{inventory.length} 张</span>
                </div>
                <div className="inventory-grid">
                  {inventory.length === 0 ? (
                    <p className="muted">还没有收集卡牌，先从当前关卡开始点击收集。</p>
                  ) : (
                    inventory.map((item) => (
                      <div className="inventory-card" key={item.id}>
                        <strong>{item.label}</strong>
                        <span>{item.type}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          )}
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

function EmptyState({ icon, title, description, compact = false }) {
  return (
    <div className={`empty-state ${compact ? 'empty-state--compact' : ''}`}>
      {icon && <img src={icon} alt="" />}
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

function ProgressPill({ label, done }) {
  return <span className={`progress-pill ${done ? 'progress-pill--done' : ''}`}>{label}</span>
}

function ResourceRow({ icon, label, value }) {
  return (
    <div className="resource-row">
      <div className="resource-row__left">
        <img src={icon} alt="" />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
    </div>
  )
}

function QuizBattle({ module, state, onSubmit }) {
  const [selectedIndex, setSelectedIndex] = useState(state?.selectedIndex ?? -1)

  return (
    <div className="quiz-battle">
      <h4>{module.quiz.question}</h4>
      <div className="choice-grid">
        {module.quiz.options.map((option, index) => (
          <label key={option} className={`choice-card ${state?.selectedIndex === index ? 'choice-card--selected' : ''}`}>
            <input
              type="radio"
              name={`quiz-${module.id}`}
              checked={selectedIndex === index}
              onChange={() => setSelectedIndex(index)}
            />
            <strong>{option}</strong>
          </label>
        ))}
      </div>
      <div className="button-row button-row--spread">
        <button className="button button--secondary" onClick={() => onSubmit(module, selectedIndex)} disabled={selectedIndex < 0}>发起攻击</button>
        {state && (
          <p className={state.correct ? 'result-text result-text--success' : 'result-text result-text--error'}>
            {state.correct ? 'Boss 已被击败。' : `这次攻击未命中，已消耗 1 点能量。`} {module.quiz.rationale}
          </p>
        )}
      </div>
    </div>
  )
}

function StageNotebook({ module, savedText, onSave }) {
  const [text, setText] = useState(savedText)

  return (
    <section className="quest-card">
      <div className="quest-card__head">
        <img src={scrollImg} alt="通关笔记" />
        <div>
          <h3>通关笔记</h3>
          <p>{module.bossPrompt}</p>
        </div>
      </div>
      <textarea
        rows={5}
        value={text}
        placeholder="用自己的话写下你会怎么运用本关知识。建议至少写 20 个字。"
        onChange={(event) => setText(event.target.value)}
      />
      <div className="button-row button-row--spread">
        <button className="button button--secondary" onClick={() => onSave(module.id, text)}>保存笔记</button>
        {savedText && <span className="muted">已保存</span>}
      </div>
    </section>
  )
}

function FinalTemple({ finalBoss, savedText, completed, onSubmit }) {
  const [text, setText] = useState(savedText)

  return (
    <section className="final-temple">
      <div className="quest-card__head">
        <img src={bossImg} alt="终局挑战" />
        <div>
          <h3>{finalBoss.bossName}</h3>
          <p>{finalBoss.prompt}</p>
        </div>
      </div>
      <div className="field-grid field-grid--two">
        <div className="sub-card">
          <h4>终局评分抓手</h4>
          <ul>
            {finalBoss.rubric.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div className="sub-card">
          <h4>通关建议</h4>
          <ul>
            <li>先点出两个最关键的核心概念。</li>
            <li>再说明你面对的是谁、处在什么场景。</li>
            <li>最后写出具体可执行的行动步骤。</li>
          </ul>
        </div>
      </div>
      <textarea rows={6} value={text} onChange={(event) => setText(event.target.value)} placeholder="请写下你的终局方案。" />
      <div className="button-row button-row--spread">
        <button className="button" onClick={() => onSubmit(text)}>{completed ? '更新终局方案' : '提交终局方案'}</button>
        {completed && <span className="tag">终局通关完成</span>}
      </div>
    </section>
  )
}

function createGameState(course) {
  return {
    courseId: course.id,
    currentStage: 0,
    xp: 0,
    coins: 20,
    gems: 0,
    hearts: 5,
    collected: {},
    decisions: {},
    quiz: {},
    notes: {},
    clearedStages: [],
    badges: [],
    finalPlan: '',
    finalBossDone: false,
  }
}

function getModuleProgress(module, gameState) {
  const collectedIds = gameState?.collected?.[module.id] || []
  const decision = gameState?.decisions?.[module.id]
  const quiz = gameState?.quiz?.[module.id]
  const note = gameState?.notes?.[module.id] || ''

  const collectDone = collectedIds.length >= module.collectibles.length
  const scenarioDone = Number.isInteger(decision?.optionIndex)
  const quizDone = Boolean(quiz?.correct)
  const noteDone = note.trim().length >= 20

  return {
    collectDone,
    scenarioDone,
    quizDone,
    noteDone,
    ready: collectDone && scenarioDone && quizDone && noteDone,
  }
}

function flattenCollectedCards(course, gameState) {
  if (!course || !gameState) {
    return []
  }

  return course.modules.flatMap((module) => {
    const ids = gameState.collected[module.id] || []
    return module.collectibles.filter((item) => ids.includes(item.id))
  })
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

function formatFileSize(size) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export default App
