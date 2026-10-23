(function () {
  "use strict";

  const DATA = window.CET6_DATA;
  const STORAGE_KEY = "cet6-600-lab-v1";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const APP_VERSION = 1;
  const TODAY = localDateKey();

  const TITLES = {
    dashboard: "今日学习",
    vocabulary: "高频词汇",
    practice: "专项训练",
    mock: "模考与估分",
    plan: "提分计划"
  };

  const EYEBROWS = {
    dashboard: "TODAY · DAILY QUEST",
    vocabulary: "VOCABULARY · ACTIVE RECALL",
    practice: "PRACTICE · DELIBERATE TRAINING",
    mock: "MOCK · MEASURE AND ADJUST",
    plan: "PLAN · EIGHT-WEEK ROADMAP"
  };

  const TASK_DEFS = {
    vocab: {
      id: "vocab",
      title: "高频词 30 个",
      subtitle: "先主动回忆，再翻面确认",
      duration: 15,
      tag: "词汇",
      target: "vocabulary"
    },
    listening: {
      id: "listening",
      title: "精听 1 段材料",
      subtitle: "先抓主旨，再用原文补细节",
      duration: 20,
      tag: "听力",
      target: "practice-listening"
    },
    reading: {
      id: "reading",
      title: "限时阅读 1 篇",
      subtitle: "每道题回到原文找证据",
      duration: 25,
      tag: "阅读",
      target: "practice-reading"
    },
    writing: {
      id: "writing",
      title: "限时写作 1 篇",
      subtitle: "立场—理由—例证—回扣",
      duration: 25,
      tag: "写作",
      target: "practice-writing"
    },
    translation: {
      id: "translation",
      title: "翻译 1 段并复盘",
      subtitle: "主干、时态、逻辑，逐项检查",
      duration: 25,
      tag: "翻译",
      target: "practice-translation"
    },
    review: {
      id: "review",
      title: "错题回看 10 分钟",
      subtitle: "说清楚错误原因和正确证据",
      duration: 10,
      tag: "复盘",
      target: "mistakes"
    }
  };

  const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const WEEKDAY_SHORT = ["日", "一", "二", "三", "四", "五", "六"];

  let currentView = "dashboard";
  let currentPracticeTab = "listening";
  let vocabFilter = "due";
  let vocabSearch = "";
  let vocabSession = {
    queue: [],
    index: 0,
    revealed: false
  };
  let quizSession = null;
  let activeCountdown = null;
  let draftSaveTimer = null;
  let storageWarningShown = false;
  let miniMockSession = null;
  let state = loadState();

  function defaultState() {
    return {
      version: APP_VERSION,
      settings: {
        target: 600,
        examDate: "2026-12-12",
        dailyMinutes: 90,
        ttsRate: 0.9
      },
      completed: {},
      vocab: {},
      activity: [],
      mistakes: [],
      mockScores: [],
      miniMocks: [],
      drafts: {
        translation: {},
        writing: {}
      },
      stats: {
        dailyWords: {}
      }
    };
  }

  function loadState() {
    const fallback = defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const saved = JSON.parse(raw);
      return {
        ...fallback,
        ...saved,
        settings: { ...fallback.settings, ...(saved.settings || {}) },
        completed: saved.completed && typeof saved.completed === "object" ? saved.completed : {},
        vocab: saved.vocab && typeof saved.vocab === "object" ? saved.vocab : {},
        activity: Array.isArray(saved.activity) ? saved.activity : [],
        mistakes: Array.isArray(saved.mistakes) ? saved.mistakes : [],
        mockScores: Array.isArray(saved.mockScores) ? saved.mockScores : [],
        miniMocks: Array.isArray(saved.miniMocks) ? saved.miniMocks : [],
        drafts: {
          translation:
            saved.drafts && saved.drafts.translation && typeof saved.drafts.translation === "object"
              ? saved.drafts.translation
              : {},
          writing:
            saved.drafts && saved.drafts.writing && typeof saved.drafts.writing === "object"
              ? saved.drafts.writing
              : {}
        },
        stats: {
          ...fallback.stats,
          ...(saved.stats || {}),
          dailyWords:
            saved.stats && saved.stats.dailyWords && typeof saved.stats.dailyWords === "object"
              ? saved.stats.dailyWords
              : {}
        }
      };
    } catch (error) {
      console.warn("无法读取本地学习记录：", error);
      return fallback;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      if (!storageWarningShown) {
        storageWarningShown = true;
        toast("浏览器未能保存记录，请检查隐私模式或存储设置。");
      }
      console.warn("无法保存本地学习记录：", error);
    }
  }

  function init() {
    bindNavigation();
    bindSettings();
    bindDashboard();
    bindVocabulary();
    bindPractice();
    bindMock();
    bindModal();
    renderAll();
    initializeForms();
    const requestedView = window.location.hash.replace(/^#/, "");
    activateView(TITLES[requestedView] ? requestedView : "dashboard", false);
  }

  function bindNavigation() {
    document.addEventListener("click", (event) => {
      const viewButton = event.target.closest("[data-view]");
      if (viewButton) {
        const view = viewButton.dataset.view;
        const practiceTarget = viewButton.dataset.practiceTarget;
        activateView(view, true);
        if (practiceTarget) {
          setTimeout(() => activatePracticeTab(practiceTarget.replace("practice-", ""), true), 30);
        }
      }
    });
  }

  function activateView(view, shouldScroll) {
    if (!TITLES[view]) return;
    currentView = view;
    stopCountdown();
    document.querySelectorAll(".view").forEach((section) => {
      section.classList.toggle("active", section.id === `view-${view}`);
    });
    document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
    document.getElementById("pageTitle").textContent = TITLES[view];
    document.getElementById("todayEyebrow").textContent =
      view === "dashboard" ? `TODAY · ${formatChineseDate(new Date())}` : EYEBROWS[view];
    if (window.location.hash !== `#${view}`) {
      try {
        history.replaceState(null, "", `#${view}`);
      } catch (error) {
        // Some browsers restrict URL history updates for local files.
      }
    }
    if (shouldScroll) window.scrollTo({ top: 0, behavior: "smooth" });
    if (view === "dashboard") renderDashboard();
    if (view === "vocabulary") renderVocabulary();
    if (view === "mock") renderMockPage();
    if (view === "plan") renderPlan();
  }

  function bindSettings() {
    document.getElementById("settingsBtn").addEventListener("click", openSettings);
    document.getElementById("topSettingsBtn").addEventListener("click", openSettings);
    document.getElementById("editPlanBtn").addEventListener("click", openSettings);
  }

  function bindDashboard() {
    document.getElementById("dailyTaskList").addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-task-toggle]");
      if (toggle) {
        toggleTask(toggle.dataset.taskToggle);
        return;
      }
      const go = event.target.closest("[data-task-target]");
      if (!go) return;
      const target = go.dataset.taskTarget;
      if (target === "mistakes") {
        openMistakes();
        return;
      }
      if (target.startsWith("practice-")) {
        activateView("practice", true);
        activatePracticeTab(target.replace("practice-", ""));
        return;
      }
      activateView(target, true);
    });

    document.getElementById("reviewMistakesBtn").addEventListener("click", openMistakes);
  }

  function bindVocabulary() {
    document.querySelectorAll("[data-vocab-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        vocabFilter = button.dataset.vocabFilter;
        document.querySelectorAll("[data-vocab-filter]").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
        rebuildVocabQueue();
      });
    });

    document.getElementById("vocabSearch").addEventListener("input", (event) => {
      vocabSearch = event.target.value.trim().toLowerCase();
      rebuildVocabQueue();
    });

    document.getElementById("vocabQuizBtn").addEventListener("click", startVocabQuiz);

    document.addEventListener("click", (event) => {
      if (event.target.closest("#pronounceWordBtn")) {
        const word = vocabSession.queue[vocabSession.index];
        if (word) speakText(word.word);
      }
      if (event.target.closest("#revealWordBtn")) {
        vocabSession.revealed = true;
        renderVocabulary();
      }
      const rateButton = event.target.closest("[data-vocab-rate]");
      if (rateButton) {
        rateCurrentWord(rateButton.dataset.vocabRate);
      }
      if (event.target.closest("#restartVocabQueue")) {
        rebuildVocabQueue();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (currentView !== "vocabulary" || !document.getElementById("modalBackdrop").hidden) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      const word = vocabSession.queue[vocabSession.index];
      if (!word) return;
      if (event.code === "Space") {
        event.preventDefault();
        vocabSession.revealed = true;
        renderVocabulary();
      } else if (event.key === "1") {
        rateCurrentWord("again");
      } else if (event.key === "2") {
        rateCurrentWord("fuzzy");
      } else if (event.key === "3") {
        rateCurrentWord("known");
      } else if (event.key.toLowerCase() === "p") {
        speakText(word.word);
      }
    });
  }

  function bindPractice() {
    document.querySelectorAll("[data-practice-tab]").forEach((button) => {
      button.addEventListener("click", () => activatePracticeTab(button.dataset.practiceTab));
    });

    document.getElementById("listeningCatalog").addEventListener("click", (event) => {
      const button = event.target.closest("[data-start-listening]");
      if (button) openListeningSet(button.dataset.startListening);
    });

    document.getElementById("readingCatalog").addEventListener("click", (event) => {
      const button = event.target.closest("[data-start-reading]");
      if (button) openReadingSet(button.dataset.startReading);
    });

    document.getElementById("translationSelector").addEventListener("click", (event) => {
      const button = event.target.closest("[data-translation-id]");
      if (button) openTranslation(button.dataset.translationId);
    });

    document.getElementById("writingSelector").addEventListener("click", (event) => {
      const button = event.target.closest("[data-writing-id]");
      if (button) openWriting(button.dataset.writingId);
    });

    document.getElementById("listeningWorkspace").addEventListener("click", handlePracticeWorkspaceClick);
    document.getElementById("readingWorkspace").addEventListener("click", handlePracticeWorkspaceClick);
    document.getElementById("translationWorkspace").addEventListener("click", handlePracticeWorkspaceClick);
    document.getElementById("writingWorkspace").addEventListener("click", handlePracticeWorkspaceClick);

    document.getElementById("translationWorkspace").addEventListener("input", handleDraftInput);
    document.getElementById("writingWorkspace").addEventListener("input", handleDraftInput);
  }

  function bindMock() {
    document.getElementById("startMiniMockBtn").addEventListener("click", startMiniMock);
    document.getElementById("miniMockInlineBtn").addEventListener("click", startMiniMock);

    const form = document.getElementById("scoreForm");
    form.addEventListener("input", updateLiveTotal);
    form.addEventListener("submit", saveMockScore);

    document.getElementById("miniMockWorkspace").addEventListener("click", (event) => {
      const speak = event.target.closest("[data-mock-speak]");
      if (speak) {
        const set = DATA.listening.find((item) => item.id === speak.dataset.mockSpeak);
        if (set) speakText(set.transcript);
        return;
      }
      if (event.target.closest("[data-stop-speech]")) {
        stopSpeech();
        return;
      }
      if (event.target.closest("[data-submit-mini-mock]")) {
        submitMiniMock();
      }
    });
  }

  function bindModal() {
    document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
    document.getElementById("modalBackdrop").addEventListener("click", (event) => {
      if (event.target.id === "modalBackdrop") closeModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !document.getElementById("modalBackdrop").hidden) {
        closeModal();
      }
    });
  }

  function initializeForms() {
    document.getElementById("scoreDate").value = TODAY;
    populateTranslationSelectors();
    populateWritingSelectors();
    renderListeningCatalog();
    renderReadingCatalog();
    openTranslation(DATA.translation[0].id, false);
    openWriting(DATA.writing[0].id, false);
    updateLiveTotal();
    renderPlan();
  }

  function renderAll() {
    renderDashboard();
    renderVocabulary();
    renderMockPage();
    renderPlan();
  }

  function renderDashboard() {
    const settings = state.settings;
    const days = daysUntil(settings.examDate);
    const tasks = getDailyTasks();
    const completed = getDailyCompleted();
    const doneCount = tasks.filter((task) => completed.includes(task.id)).length;
    const vocabDue = getDueWords().length;
    const known = getKnownWordCount();
    const dailyWordCount = state.stats.dailyWords[TODAY] || 0;
    const readiness = calculateReadiness(tasks, doneCount);
    const streak = calculateStreak();
    const missed = state.mistakes.length;

    document.getElementById("daysLeft").textContent = days;
    document.getElementById("examDateLabel").textContent = settings.examDate
      ? `${formatDateKey(settings.examDate)} · 可按准考证修改`
      : "请设置考试日期";
    document.getElementById("targetScore").textContent = settings.target;
    document.getElementById("sidebarTarget").textContent = settings.target;
    document.getElementById("knownWords").textContent = known;
    document.getElementById("totalWords").textContent = DATA.vocab.length;
    document.getElementById("vocabDueLabel").textContent = `今日待复习 ${vocabDue} 个`;
    document.getElementById("streakCount").textContent = streak;
    document.getElementById("sidebarCountdown").textContent =
      days > 0 ? `距离默认考试日还有 ${days} 天` : "考试日期已到，保持手感";
    document.getElementById("readinessValue").textContent = `${readiness}%`;
    document.getElementById("readinessRing").style.setProperty("--progress", readiness);
    document.getElementById("readinessLabel").textContent = readinessLabel(readiness);
    document.getElementById("sidebarGoalBar").style.width = `${Math.min(100, readiness)}%`;
    document.getElementById("taskDoneCount").textContent = doneCount;
    document.getElementById("taskTotalCount").textContent = tasks.length;
    document.getElementById("taskProgressBar").style.width = tasks.length
      ? `${(doneCount / tasks.length) * 100}%`
      : "0%";
    document.getElementById("vocabGoalBar").style.width = `${Math.min(100, (dailyWordCount / 30) * 100)}%`;

    document.getElementById("dailyTaskList").innerHTML = tasks
      .map((task) => {
        const isDone = completed.includes(task.id);
        return `
          <div class="task-row ${isDone ? "completed" : ""}">
            <button class="task-check" type="button" aria-label="${isDone ? "取消完成" : "标记完成"}：${escapeHtml(
              task.title
            )}" data-task-toggle="${task.id}">✓</button>
            <div class="task-main">
              <b>${escapeHtml(task.title)} <em class="task-tag">${task.duration} MIN</em></b>
              <small>${escapeHtml(task.subtitle)}</small>
            </div>
            <button class="task-go" type="button" data-task-target="${task.target}">去完成 →</button>
          </div>
        `;
      })
      .join("");

    document.getElementById("mistakeSummary").textContent = missed
      ? `错题本已有 ${missed} 道待复盘题目。回到证据句，解释为什么错。`
      : "完成专项练习后，答错的题会自动进入错题本。";

    renderWeekBars();
  }

  function calculateReadiness(tasks, doneCount) {
    const vocabulary = (getKnownWordCount() / DATA.vocab.length) * 100;
    const listening = getAverageRate("listening");
    const reading = getAverageRate("reading");
    const outputDrafts = Object.values(state.drafts.translation).filter((text) => String(text).trim().length > 15).length +
      Object.values(state.drafts.writing).filter((text) => countWords(String(text)) > 40).length;
    const output = Math.min(100, (outputDrafts / 6) * 100);
    const taskRatio = tasks.length ? (doneCount / tasks.length) * 100 : 0;
    return Math.round(
      Math.min(
        100,
        vocabulary * 0.3 +
          (listening || 0) * 0.25 +
          (reading || 0) * 0.25 +
          output * 0.1 +
          taskRatio * 0.1
      )
    );
  }

  function readinessLabel(value) {
    if (value < 20) return "从今天开始积累";
    if (value < 50) return "正在进入提速阶段";
    if (value < 75) return "已进入冲刺区间";
    if (value < 90) return "接近 600+ 准备线";
    return "保持节奏与手感";
  }

  function renderWeekBars() {
    const bars = [];
    let weekMinutes = 0;
    const points = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = addDays(new Date(), -offset);
      const key = localDateKey(date);
      const taskCount = (state.completed[key] || []).length;
      const practiceCount = state.activity.filter((item) => item.date === key).length;
      const score = taskCount * 3 + practiceCount;
      points.push({ date, key, score });
      weekMinutes += (state.completed[key] || []).reduce((sum, id) => sum + (TASK_DEFS[id]?.duration || 0), 0);
    }
    const max = Math.max(5, ...points.map((point) => point.score));
    points.forEach((point) => {
      const height = Math.max(4, Math.round((point.score / max) * 100));
      const isToday = point.key === TODAY;
      bars.push(`
        <div class="day-bar ${isToday ? "today" : ""}">
          <div class="bar-track"><span class="bar-fill" style="height:${height}%"></span></div>
          <span class="day-name">${WEEKDAY_SHORT[point.date.getDay()]}</span>
        </div>
      `);
    });
    document.getElementById("weekBars").innerHTML = bars.join("");
    document.getElementById("weeklyMinutes").textContent = `${weekMinutes} 分钟`;
  }

  function getDailyTasks() {
    const minutes = Number(state.settings.dailyMinutes) || 90;
    const core = [TASK_DEFS.vocab, TASK_DEFS.listening, TASK_DEFS.reading];
    if (minutes <= 60) return core;
    const dayNumber = Math.floor(new Date(`${TODAY}T12:00:00`).getTime() / DAY_MS);
    const outputTask = dayNumber % 2 === 0 ? TASK_DEFS.writing : TASK_DEFS.translation;
    if (minutes <= 90) return [...core, outputTask];
    return [...core, TASK_DEFS.writing, TASK_DEFS.translation, TASK_DEFS.review];
  }

  function getDailyCompleted() {
    return Array.isArray(state.completed[TODAY]) ? state.completed[TODAY] : [];
  }

  function toggleTask(id) {
    const completed = [...getDailyCompleted()];
    const index = completed.indexOf(id);
    if (index >= 0) {
      completed.splice(index, 1);
      toast("已取消完成标记");
    } else {
      completed.push(id);
      toast("任务完成，继续保持节奏");
    }
    state.completed[TODAY] = [...new Set(completed)];
    saveState();
    renderDashboard();
  }

  function markTask(id) {
    const completed = getDailyCompleted();
    if (!completed.includes(id)) {
      state.completed[TODAY] = [...completed, id];
      saveState();
    }
  }

  function calculateStreak() {
    let cursor = new Date();
    if (!(state.completed[localDateKey(cursor)] || []).length) {
      cursor = addDays(cursor, -1);
    }
    let count = 0;
    while (count < 3650) {
      const key = localDateKey(cursor);
      if (!(state.completed[key] || []).length) break;
      count += 1;
      cursor = addDays(cursor, -1);
    }
    return count;
  }

  function getAverageRate(type) {
    const records = state.activity.filter((item) => item.type === type && item.total > 0).slice(-3);
    if (!records.length) return 0;
    return Math.round(
      (records.reduce((sum, item) => sum + item.correct / item.total, 0) / records.length) * 100
    );
  }

  function renderVocabulary() {
    if (!vocabSession.queue.length && vocabFilter === "due") {
      vocabSession.queue = getDueWords();
    }
    const known = getKnownWordCount();
    const due = getDueWords().length;
    const percentage = Math.round((known / DATA.vocab.length) * 100);
    const dailyWords = state.stats.dailyWords[TODAY] || 0;

    document.getElementById("vocabTotal").textContent = DATA.vocab.length;
    document.getElementById("vocabDue").textContent = due;
    document.getElementById("vocabMastered").textContent = known;
    document.getElementById("vocabProgressText").textContent = `${percentage}%`;
    document.getElementById("vocabProgressBar").style.width = `${percentage}%`;
    document.getElementById("vocabGoalBar").style.width = `${Math.min(100, (dailyWords / 30) * 100)}%`;

    if (vocabSession.queue.length && vocabSession.index >= vocabSession.queue.length) {
      renderVocabComplete();
      return;
    }

    const word = vocabSession.queue[vocabSession.index];
    if (!word) {
      document.getElementById("flashcard").innerHTML = `
        <div class="flashcard-empty">
          <strong>${vocabFilter === "due" && !vocabSearch ? "今日复习已清空" : "没有找到匹配词汇"}</strong>
          <p>${vocabFilter === "due" && !vocabSearch ? "新词会在明天或按间隔再次出现。" : "换一个关键词，或切换到词库全部。"}</p>
        </div>
      `;
      document.getElementById("vocabActions").innerHTML = "";
      return;
    }

    const record = state.vocab[word.word];
    const status = record
      ? record.status === "known"
        ? "MASTERED"
        : "LEARNING"
      : "NEW WORD";
    const position = `${vocabSession.index + 1} / ${vocabSession.queue.length}`;

    document.getElementById("flashcard").innerHTML = `
      <div class="flashcard-top">
        <span>${status}</span>
        <span>${position}</span>
      </div>
      <div class="word-area">
        <p class="word-display">${escapeHtml(word.word)}</p>
        <p class="word-phonetic">${escapeHtml(word.phonetic)}</p>
        ${
          vocabSession.revealed
            ? `
              <div class="word-answer">
                <p class="word-meaning"><span>${escapeHtml(word.pos)}</span>${escapeHtml(word.meaning)}</p>
                <p class="word-example">“${escapeHtml(word.example)}”</p>
                <p class="word-example-zh">${escapeHtml(word.exampleZh)}</p>
                <span class="word-collocation">${escapeHtml(word.collocation)}</span>
              </div>
            `
            : `
              <button class="pronounce-btn" id="pronounceWordBtn" type="button">▷ 听发音 <small>P</small></button>
              <button class="reveal-prompt" id="revealWordBtn" type="button">
                <span>↻</span>
                先在脑中说出释义与搭配，再点击翻面
              </button>
            `
        }
      </div>
    `;

    document.getElementById("vocabActions").innerHTML = vocabSession.revealed
      ? `
        <button class="vocab-rate-btn again" type="button" data-vocab-rate="again"><b>不认识</b><small>明天再见 · 1</small></button>
        <button class="vocab-rate-btn fuzzy" type="button" data-vocab-rate="fuzzy"><b>有点模糊</b><small>3 天后 · 2</small></button>
        <button class="vocab-rate-btn known" type="button" data-vocab-rate="known"><b>已经掌握</b><small>延长间隔 · 3</small></button>
      `
      : `
        <button class="vocab-rate-btn again" type="button" data-vocab-rate="again"><b>不认识</b><small>直接标记 · 1</small></button>
        <button class="vocab-rate-btn fuzzy" type="button" data-vocab-rate="fuzzy"><b>有点模糊</b><small>直接标记 · 2</small></button>
        <button class="vocab-rate-btn known" type="button" data-vocab-rate="known"><b>已经掌握</b><small>直接标记 · 3</small></button>
      `;
  }

  function renderVocabComplete() {
    document.getElementById("flashcard").innerHTML = `
      <div class="flashcard-empty">
        <strong>这一组完成了。</strong>
        <p>短时间重复不会带来更多收益。稍后回来，让记忆经历一次间隔。</p>
        <button class="button button-lime" id="restartVocabQueue" type="button">再复习一组</button>
      </div>
    `;
    document.getElementById("vocabActions").innerHTML = "";
  }

  function rebuildVocabQueue() {
    vocabSession = {
      queue: buildVocabQueue(vocabFilter, vocabSearch),
      index: 0,
      revealed: false
    };
    renderVocabulary();
  }

  function buildVocabQueue(filter, search) {
    const query = (search || "").toLowerCase();
    return DATA.vocab.filter((word) => {
      const record = state.vocab[word.word];
      const matchesSearch =
        !query ||
        word.word.toLowerCase().includes(query) ||
        word.meaning.toLowerCase().includes(query) ||
        word.collocation.toLowerCase().includes(query);
      const isDue = !record || !record.due || record.due <= TODAY;
      const matchesFilter =
        filter === "all" ||
        (filter === "due" && isDue) ||
        (filter === "mastered" && record && record.status === "known");
      return matchesSearch && matchesFilter;
    });
  }

  function rateCurrentWord(rating) {
    const word = vocabSession.queue[vocabSession.index];
    if (!word) return;
    const previous = state.vocab[word.word] || { level: 0, reviews: 0 };
    let status = "learning";
    let level = previous.level || 0;
    let dueDays = 2;

    if (rating === "known") {
      status = "known";
      level = Math.min(5, (previous.level || 0) + 1);
      dueDays = [1, 3, 7, 14, 30][Math.min(level, 4)];
    } else if (rating === "fuzzy") {
      status = "learning";
      level = Math.max(0, (previous.level || 0) - 1);
      dueDays = 3;
    } else {
      status = "learning";
      level = 0;
      dueDays = 1;
    }

    state.vocab[word.word] = {
      status,
      level,
      due: localDateKey(addDays(new Date(), dueDays)),
      reviews: (previous.reviews || 0) + 1,
      lastReviewed: TODAY
    };
    state.stats.dailyWords[TODAY] = (state.stats.dailyWords[TODAY] || 0) + 1;
    vocabSession.index += 1;
    vocabSession.revealed = false;
    saveState();
    renderVocabulary();
    renderDashboard();
  }

  function getDueWords() {
    return DATA.vocab.filter((word) => {
      const record = state.vocab[word.word];
      return !record || !record.due || record.due <= TODAY;
    });
  }

  function getKnownWordCount() {
    return DATA.vocab.filter((word) => state.vocab[word.word]?.status === "known").length;
  }

  function startVocabQuiz() {
    const due = getDueWords();
    const unique = [...due, ...shuffle(DATA.vocab).filter((word) => !due.includes(word))];
    const selected = unique.slice(0, 5);
    quizSession = {
      index: 0,
      score: 0,
      answered: false,
      items: selected.map((word) => {
        const distractors = shuffle(DATA.vocab.filter((item) => item.meaning !== word.meaning)).slice(0, 3);
        return {
          word,
          options: shuffle([
            { text: word.meaning, correct: true },
            ...distractors.map((item) => ({ text: item.meaning, correct: false }))
          ])
        };
      })
    };

    showModal({
      title: "5 词快测",
      kicker: "QUICK VOCABULARY CHECK",
      body: "",
      footer: `<button class="button button-outline" type="button" id="closeQuizBtn">结束快测</button>`
    });
    document.getElementById("closeQuizBtn").addEventListener("click", closeModal);
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    if (!quizSession) return;
    if (quizSession.index >= quizSession.items.length) {
      const percentage = Math.round((quizSession.score / quizSession.items.length) * 100);
      document.getElementById("modalBody").innerHTML = `
        <div class="quiz-result">
          <strong>${quizSession.score} / ${quizSession.items.length}</strong>
          <p>${percentage >= 80 ? "识别很稳定。下一轮尝试主动回忆搭配。" : "把错词加入下一轮复习，3 天后再测一次。"}</p>
          <button class="button button-dark" type="button" id="quizAgainBtn">再来一组</button>
        </div>
      `;
      document.getElementById("modalFooter").innerHTML =
        `<button class="button button-outline" type="button" id="closeQuizBtn">完成</button>`;
      document.getElementById("closeQuizBtn").addEventListener("click", closeModal);
      document.getElementById("quizAgainBtn").addEventListener("click", startVocabQuiz);
      renderVocabulary();
      renderDashboard();
      return;
    }

    const item = quizSession.items[quizSession.index];
    const progress = (quizSession.index / quizSession.items.length) * 100;
    document.getElementById("modalBody").innerHTML = `
      <div class="quiz-progress">
        <span>QUESTION ${quizSession.index + 1} OF ${quizSession.items.length}</span>
        <span>SCORE ${quizSession.score}</span>
      </div>
      <div class="quiz-track"><span style="width:${progress}%"></span></div>
      <p class="quiz-word">${escapeHtml(item.word.word)}</p>
      <p class="quiz-phonetic">${escapeHtml(item.word.phonetic)}</p>
      <div class="quiz-options">
        ${item.options
          .map(
            (option, index) => `
              <button class="quiz-option" type="button" data-quiz-option="${index}">
                <span>${String.fromCharCode(65 + index)}</span>${escapeHtml(option.text)}
              </button>
            `
          )
          .join("")}
      </div>
      <div id="quizFeedback"></div>
    `;
    quizSession.answered = false;
    document.querySelectorAll("[data-quiz-option]").forEach((button) => {
      button.addEventListener("click", () => answerQuizOption(Number(button.dataset.quizOption)));
    });
  }

  function answerQuizOption(selectedIndex) {
    if (!quizSession || quizSession.answered) return;
    quizSession.answered = true;
    const item = quizSession.items[quizSession.index];
    const correctIndex = item.options.findIndex((option) => option.correct);
    const selected = item.options[selectedIndex];
    document.querySelectorAll("[data-quiz-option]").forEach((button, index) => {
      if (index === correctIndex) button.classList.add("correct");
      if (index === selectedIndex && !selected.correct) button.classList.add("wrong");
    });
    if (selected.correct) quizSession.score += 1;

    const previous = state.vocab[item.word.word] || { level: 0, reviews: 0 };
    state.vocab[item.word.word] = {
      status: selected.correct ? "known" : "learning",
      level: selected.correct ? Math.min(5, (previous.level || 0) + 1) : 0,
      due: localDateKey(addDays(new Date(), selected.correct ? 7 : 1)),
      reviews: (previous.reviews || 0) + 1,
      lastReviewed: TODAY
    };
    saveState();

    document.getElementById("quizFeedback").innerHTML = `
      <div class="answer-feedback">
        <strong>${selected.correct ? "回答正确" : "正确答案：" + escapeHtml(item.word.meaning)}</strong><br>
        ${escapeHtml(item.word.example)}
      </div>
      <div class="editor-actions">
        <span></span>
        <button class="button button-dark" type="button" id="nextQuizBtn">${quizSession.index === quizSession.items.length - 1 ? "查看结果" : "下一词"} →</button>
      </div>
    `;
    document.getElementById("nextQuizBtn").addEventListener("click", () => {
      quizSession.index += 1;
      renderQuizQuestion();
    });
  }

  function activatePracticeTab(tab, shouldScroll) {
    if (!["listening", "reading", "translation", "writing"].includes(tab)) return;
    currentPracticeTab = tab;
    document.querySelectorAll(".practice-tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.practiceTab === tab);
    });
    document.querySelectorAll(".practice-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `practice-${tab}`);
    });
    const labels = {
      listening: "听力精练",
      reading: "阅读定位",
      translation: "写译稳定输出",
      writing: "写作成稿"
    };
    document.getElementById("practiceFocus").textContent = labels[tab];
    if (shouldScroll) {
      document.getElementById("practice-listening").closest(".view").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderListeningCatalog() {
    document.getElementById("listeningCatalog").innerHTML = DATA.listening
      .map(
        (item, index) => `
          <article class="catalog-card">
            <div class="catalog-head">
              <span class="catalog-icon">L${index + 1}</span>
              <span class="catalog-type">${escapeHtml(item.type)}</span>
            </div>
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.summary)}</p>
            <div class="catalog-meta">
              <span>${item.questions.length} Q · ${item.minutes} MIN</span>
              <button class="catalog-start" type="button" data-start-listening="${item.id}">开始精听 →</button>
            </div>
          </article>
        `
      )
      .join("");
  }

  function renderReadingCatalog() {
    document.getElementById("readingCatalog").innerHTML = DATA.reading
      .map(
        (item, index) => `
          <article class="catalog-card">
            <div class="catalog-head">
              <span class="catalog-icon">R${index + 1}</span>
              <span class="catalog-type">${escapeHtml(item.type)}</span>
            </div>
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.summary)}</p>
            <div class="catalog-meta">
              <span>${item.questions.length} Q · ${item.minutes} MIN</span>
              <button class="catalog-start" type="button" data-start-reading="${item.id}">限时阅读 →</button>
            </div>
          </article>
        `
      )
      .join("");
  }

  function openListeningSet(id) {
    const set = DATA.listening.find((item) => item.id === id);
    if (!set) return;
    stopCountdown();
    document.querySelectorAll("[data-start-listening]").forEach((button) => {
      button.closest(".catalog-card")?.classList.toggle("selected", button.dataset.startListening === id);
    });
    document.getElementById("listeningWorkspace").className = "practice-workspace";
    document.getElementById("listeningWorkspace").innerHTML = `
      <div class="workspace-head">
        <div>
          <p class="section-kicker">LISTENING · ${escapeHtml(set.type).toUpperCase()}</p>
          <h3>${escapeHtml(set.title)}</h3>
        </div>
        <div class="timer" id="listeningTimer">--:--</div>
      </div>
      <div class="audio-box">
        <div class="audio-copy">
          <button class="audio-play" type="button" data-speak-set="${set.id}" aria-label="播放听力材料">▶</button>
          <div>
            <strong>系统英文语音 · 约 ${estimateSpeechMinutes(set.transcript)} 分钟</strong>
            <small>第一遍闭眼听主旨；第二遍可查看原文跟读</small>
          </div>
        </div>
        <button class="audio-stop" type="button" data-stop-speech>停止播放</button>
      </div>
      <div class="question-list">
        ${set.questions
          .map((question, index) => renderQuestion(question, index, `listen-${set.id}`))
          .join("")}
      </div>
      <details class="transcript-details">
        <summary>做完题后再展开原文</summary>
        <p>${escapeHtml(set.transcript)}</p>
      </details>
      <div id="listeningResult"></div>
      <div class="workspace-actions">
        <span class="workspace-note">建议正确率达到 80% 后，再进入下一段材料。</span>
        <button class="button button-dark" type="button" data-submit-practice="listening" data-set-id="${set.id}">提交答案</button>
      </div>
    `;
    startCountdown("listeningTimer", set.minutes);
    document.getElementById("listeningWorkspace").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openReadingSet(id) {
    const set = DATA.reading.find((item) => item.id === id);
    if (!set) return;
    stopCountdown();
    document.querySelectorAll("[data-start-reading]").forEach((button) => {
      button.closest(".catalog-card")?.classList.toggle("selected", button.dataset.startReading === id);
    });
    document.getElementById("readingWorkspace").className = "practice-workspace";
    document.getElementById("readingWorkspace").innerHTML = `
      <div class="workspace-head">
        <div>
          <p class="section-kicker">READING · ${escapeHtml(set.type).toUpperCase()}</p>
          <h3>${escapeHtml(set.title)}</h3>
        </div>
        <div class="timer" id="readingTimer">--:--</div>
      </div>
      <div class="reading-layout">
        <article class="reading-passage">
          <h3>${escapeHtml(set.title)}</h3>
          ${set.passage.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
        </article>
        <div class="reading-questions">
          ${set.questions
            .map((question, index) => renderQuestion(question, index, `read-${set.id}`))
            .join("")}
        </div>
      </div>
      <div id="readingResult"></div>
      <div class="workspace-actions">
        <span class="workspace-note">提交后，把每道错题的正确证据句写进自己的复盘笔记。</span>
        <button class="button button-dark" type="button" data-submit-practice="reading" data-set-id="${set.id}">提交答案</button>
      </div>
    `;
    startCountdown("readingTimer", set.minutes);
    document.getElementById("readingWorkspace").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderQuestion(question, index, prefix) {
    return `
      <article class="question" data-question-index="${index}">
        <span class="question-number">QUESTION ${String(index + 1).padStart(2, "0")}</span>
        <h4>${escapeHtml(question.question)}</h4>
        <div class="option-list">
          ${question.options
            .map(
              (option, optionIndex) => `
                <label class="option-label">
                  <input type="radio" name="${prefix}-q${index}" value="${optionIndex}">
                  <span><b>${String.fromCharCode(65 + optionIndex)}.</b> ${escapeHtml(option)}</span>
                </label>
              `
            )
            .join("")}
        </div>
      </article>
    `;
  }

  function handlePracticeWorkspaceClick(event) {
    const speak = event.target.closest("[data-speak-set]");
    if (speak) {
      const set = DATA.listening.find((item) => item.id === speak.dataset.speakSet);
      if (set) speakText(set.transcript);
      return;
    }
    if (event.target.closest("[data-stop-speech]")) {
      stopSpeech();
      return;
    }
    const submit = event.target.closest("[data-submit-practice]");
    if (submit) {
      gradePractice(submit.dataset.submitPractice, submit.dataset.setId);
      return;
    }
    const complete = event.target.closest("[data-complete-output]");
    if (complete) {
      completeOutput(complete.dataset.completeOutput);
    }
  }

  function gradePractice(type, setId) {
    const collection = type === "listening" ? DATA.listening : DATA.reading;
    const set = collection.find((item) => item.id === setId);
    if (!set) return;
    const workspace = document.getElementById(`${type}Workspace`);
    const prefix = `${type === "listening" ? "listen" : "read"}-${setId}`;
    let correct = 0;
    const wrongItems = [];

    set.questions.forEach((question, index) => {
      const chosen = workspace.querySelector(`input[name="${prefix}-q${index}"]:checked`);
      const selectedIndex = chosen ? Number(chosen.value) : -1;
      const questionNode = workspace.querySelector(`[data-question-index="${index}"]`);
      const labels = questionNode.querySelectorAll(".option-label");
      labels[question.answer]?.classList.add("correct");
      if (selectedIndex === question.answer) {
        correct += 1;
      } else {
        if (selectedIndex >= 0) labels[selectedIndex]?.classList.add("wrong");
        wrongItems.push({ question, selectedIndex, index });
      }
      workspace.querySelectorAll(`input[name="${prefix}-q${index}"]`).forEach((input) => {
        input.disabled = true;
      });
      if (!questionNode.querySelector(".answer-feedback")) {
        const feedback = document.createElement("p");
        feedback.className = "answer-feedback";
        feedback.innerHTML = `<strong>${selectedIndex === question.answer ? "判断正确。" : "正确答案为 " + String.fromCharCode(65 + question.answer) + "。"}</strong> ${escapeHtml(question.explanation)}`;
        questionNode.appendChild(feedback);
      }
    });

    const resultSlot = document.getElementById(`${type}Result`);
    const percentage = Math.round((correct / set.questions.length) * 100);
    resultSlot.innerHTML = `
      <div class="result-banner">
        <div>
          <p>本次正确率</p>
          <strong>${percentage}%</strong>
        </div>
        <div class="result-copy">
          答对 ${correct} / ${set.questions.length} 题<br>
          ${percentage >= 80 ? "达到本项 600+ 参考线，记录错误原因即可。" : "把错题证据句写清楚，比立刻重刷更有效。"}
        </div>
      </div>
    `;
    workspace.querySelector(`[data-submit-practice="${type}"]`).disabled = true;
    workspace.querySelector(`[data-submit-practice="${type}"]`).textContent = "已完成";

    recordActivity(type, correct, set.questions.length);
    wrongItems.forEach(({ question, selectedIndex, index }) => {
      addMistake({
        source: `${type === "listening" ? "听力" : "阅读"} · ${set.title}`,
        question: question.question,
        selected: selectedIndex >= 0 ? question.options[selectedIndex] : "未作答",
        answer: question.options[question.answer],
        explanation: question.explanation,
        index: index + 1
      });
    });
    markTask(type);
    stopCountdown();
    saveState();
    renderDashboard();
    toast(wrongItems.length ? `已记录 ${wrongItems.length} 道错题` : "全部答对，节奏很好");
  }

  function recordActivity(type, correct, total) {
    state.activity.push({
      type,
      correct,
      total,
      date: TODAY,
      at: new Date().toISOString()
    });
    state.activity = state.activity.slice(-300);
  }

  function addMistake(item) {
    state.mistakes.unshift({
      id: `mistake-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      date: TODAY,
      ...item
    });
    state.mistakes = state.mistakes.slice(0, 150);
  }

  function populateTranslationSelectors() {
    document.getElementById("translationSelector").innerHTML = DATA.translation
      .map(
        (item) => `
          <button class="topic-chip" type="button" data-translation-id="${item.id}">
            <b>${escapeHtml(item.title)}</b>${escapeHtml(item.label)} · 15–20 分钟
          </button>
        `
      )
      .join("");
  }

  function openTranslation(id, startTimer = true) {
    const prompt = DATA.translation.find((item) => item.id === id);
    if (!prompt) return;
    stopCountdown();
    document.querySelectorAll("[data-translation-id]").forEach((button) => {
      button.classList.toggle("active", button.dataset.translationId === id);
    });
    const saved = state.drafts.translation[id] || "";
    document.getElementById("translationWorkspace").innerHTML = `
      <div class="practice-workspace">
        <div class="workspace-head">
          <div>
            <p class="section-kicker">TRANSLATION · ${escapeHtml(prompt.label).toUpperCase()}</p>
            <h3>${escapeHtml(prompt.title)} · 汉译英</h3>
          </div>
          <div class="timer" id="translationTimer">20:00</div>
        </div>
        <div class="translation-source">
          <p class="section-kicker">SOURCE TEXT</p>
          <h3>${escapeHtml(prompt.title)}</h3>
          <p>${escapeHtml(prompt.source)}</p>
        </div>
        <div class="translation-grid">
          <div class="editor-card">
            <div class="editor-head">
              <span>你的译文</span>
              <b id="translationDraftMeta">自动保存</b>
            </div>
            <textarea class="draft-editor" id="translationInput" data-draft-kind="translation" data-draft-id="${id}" placeholder="先确定句子主干，再补充修饰与逻辑关系……">${escapeHtml(saved)}</textarea>
            <div class="editor-actions">
              <span class="word-count" id="translationWordCount">${countWords(saved)} words</span>
              <button class="button button-dark" type="button" data-complete-output="translation" data-output-id="${id}">完成本轮</button>
            </div>
          </div>
          <div class="side-stack">
            <div class="tip-card">
              <h4>推荐表达</h4>
              <div class="expression-list">
                ${prompt.keyExpressions.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
              </div>
            </div>
            <div class="tip-card">
              <h4>提交前自检</h4>
              <div class="self-check-list">
                <label class="self-check"><input type="checkbox"> 信息点是否有遗漏？</label>
                <label class="self-check"><input type="checkbox"> 主谓一致与时态是否正确？</label>
                <label class="self-check"><input type="checkbox"> 每个修饰语是否放对位置？</label>
                <label class="self-check"><input type="checkbox"> 句间逻辑是否自然？</label>
              </div>
            </div>
            <details class="answer-details">
              <summary>先自己修改，再看参考译文</summary>
              <div class="reference-answer">${escapeHtml(prompt.reference)}</div>
            </details>
          </div>
        </div>
      </div>
    `;
    if (startTimer) startCountdown("translationTimer", 20);
  }

  function populateWritingSelectors() {
    document.getElementById("writingSelector").innerHTML = DATA.writing
      .map(
        (item) => `
          <button class="topic-chip" type="button" data-writing-id="${item.id}">
            <b>${escapeHtml(item.title)}</b>${escapeHtml(item.label)} · 30 分钟
          </button>
        `
      )
      .join("");
  }

  function openWriting(id, startTimer = true) {
    const prompt = DATA.writing.find((item) => item.id === id);
    if (!prompt) return;
    stopCountdown();
    document.querySelectorAll("[data-writing-id]").forEach((button) => {
      button.classList.toggle("active", button.dataset.writingId === id);
    });
    const saved = state.drafts.writing[id] || "";
    document.getElementById("writingWorkspace").innerHTML = `
      <div class="practice-workspace">
        <div class="workspace-head">
          <div>
            <p class="section-kicker">WRITING · ${escapeHtml(prompt.label).toUpperCase()}</p>
            <h3>${escapeHtml(prompt.title)}</h3>
          </div>
          <div class="timer" id="writingTimer">30:00</div>
        </div>
        <div class="writing-grid">
          <div>
            <div class="prompt-card">
              <p class="section-kicker">PROMPT</p>
              <h3>${escapeHtml(prompt.title)}</h3>
              <p class="prompt-cn">${escapeHtml(prompt.task)}</p>
              <ul class="outline-list">
                ${prompt.outline.map((item, index) => `<li><span>0${index + 1}</span>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </div>
            <div class="editor-card" style="margin-top:12px">
              <div class="editor-head">
                <span>限时成稿</span>
                <b id="writingDraftMeta">自动保存</b>
              </div>
              <textarea class="draft-editor" id="writingInput" data-draft-kind="writing" data-draft-id="${id}" placeholder="State your position clearly, develop it with one or two specific examples, and finish by echoing your position…">${escapeHtml(saved)}</textarea>
              <div class="editor-actions">
                <span class="word-count" id="writingWordCount">${countWords(saved)} / 150–200 words</span>
                <button class="button button-dark" type="button" data-complete-output="writing" data-output-id="${id}">完成本轮</button>
              </div>
            </div>
          </div>
          <div class="side-stack">
            <div class="tip-card">
              <h4>可迁移表达</h4>
              <div class="expression-list">
                ${prompt.usefulExpressions.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
              </div>
            </div>
            <div class="tip-card">
              <h4>成稿自评清单</h4>
              <div class="self-check-list">
                <label class="self-check"><input type="checkbox"> 第一段 2 句内亮明立场</label>
                <label class="self-check"><input type="checkbox"> 主体段有具体理由或例子</label>
                <label class="self-check"><input type="checkbox"> 主语、谓语、时态没有硬伤</label>
                <label class="self-check"><input type="checkbox"> 连接词不是机械堆砌</label>
                <label class="self-check"><input type="checkbox"> 结尾回扣题目，不引入新观点</label>
              </div>
            </div>
            <details class="answer-details">
              <summary>完成初稿后再看参考范文</summary>
              <div class="reference-answer">${escapeHtml(prompt.sample)}</div>
            </details>
          </div>
        </div>
      </div>
    `;
    if (startTimer) startCountdown("writingTimer", 30);
  }

  function handleDraftInput(event) {
    const target = event.target;
    if (!target.matches("[data-draft-kind]")) return;
    const kind = target.dataset.draftKind;
    const id = target.dataset.draftId;
    state.drafts[kind][id] = target.value;
    if (kind === "writing") {
      document.getElementById("writingWordCount").textContent = `${countWords(target.value)} / 150–200 words`;
    } else {
      document.getElementById("translationWordCount").textContent = `${countWords(target.value)} words`;
    }
    const meta = document.getElementById(`${kind}DraftMeta`);
    if (meta) meta.textContent = "正在保存…";
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
      saveState();
      if (meta && document.body.contains(meta)) meta.textContent = "已保存到本机";
    }, 280);
  }

  function completeOutput(kind) {
    const input = document.getElementById(`${kind}Input`);
    if (!input || input.value.trim().length < 20) {
      toast(kind === "writing" ? "先写出至少一个完整段落，再完成本轮。" : "译文太短，先补全主要信息。");
      input?.focus();
      return;
    }
    state.drafts[kind][input.dataset.draftId] = input.value;
    recordActivity(kind, 1, 1);
    markTask(kind);
    saveState();
    renderDashboard();
    stopCountdown();
    toast(kind === "writing" ? "写作已记录。对照范文，标记一处可改进表达。" : "翻译已记录。先自查，再查看参考译文。");
  }

  function openMistakes() {
    const body = state.mistakes.length
      ? `
        <div class="mistake-list">
          ${state.mistakes
            .slice(0, 30)
            .map(
              (item) => `
                <article class="mistake-item">
                  <div class="mistake-meta"><span>${escapeHtml(item.source)}</span><span>${formatDateKey(item.date)}</span></div>
                  <h4>${escapeHtml(item.question)}</h4>
                  <p><b>你的答案：</b>${escapeHtml(item.selected)}</p>
                  <p><b>正确答案：</b>${escapeHtml(item.answer)}</p>
                  <p><b>复盘：</b>${escapeHtml(item.explanation)}</p>
                </article>
              `
            )
            .join("")}
        </div>
      `
      : `
        <div class="empty-modal">
          <strong>错题本还是空的。</strong>
          完成听力或阅读训练后，系统会自动收好答错的题。
        </div>
      `;
    showModal({
      title: `错题本 · ${state.mistakes.length}`,
      kicker: "ERROR NOTEBOOK",
      body,
      footer: `<button class="button button-dark" type="button" id="closeMistakesBtn">知道了</button>`
    });
    document.getElementById("closeMistakesBtn").addEventListener("click", closeModal);
    markTask("review");
    renderDashboard();
  }

  function saveMockScore(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const score = {
      date: values.date,
      listening: Number(values.listening),
      reading: Number(values.reading),
      writing: Number(values.writing),
      translation: Number(values.translation)
    };
    score.total =
      score.listening + score.reading + score.writing + score.translation;
    if (
      !score.date ||
      [score.listening, score.reading, score.writing, score.translation].some(
        (value) => !Number.isFinite(value) || value < 0
      )
    ) {
      toast("请填写完整且有效的四项分数。");
      return;
    }
    state.mockScores.push(score);
    state.mockScores.sort((a, b) => b.date.localeCompare(a.date));
    saveState();
    renderMockPage();
    form.reset();
    document.getElementById("scoreDate").value = TODAY;
    updateLiveTotal();
    toast(
      score.total >= state.settings.target
        ? `记录成功：${score.total} 分，已达到目标线。`
        : `已记录 ${score.total} 分，优先复盘失分最多的专项。`
    );
  }

  function updateLiveTotal() {
    const form = document.getElementById("scoreForm");
    if (!form) return;
    const values = Object.fromEntries(new FormData(form).entries());
    const total = ["listening", "reading", "writing", "translation"].reduce(
      (sum, key) => sum + (Number(values[key]) || 0),
      0
    );
    const totalEl = document.getElementById("liveTotal");
    const gapEl = document.getElementById("scoreGap");
    if (!totalEl || !gapEl) return;
    totalEl.textContent = Number.isInteger(total) ? total : total.toFixed(1);
    const gap = state.settings.target - total;
    gapEl.textContent =
      gap > 0
        ? `距离目标 ${gap.toFixed(Number.isInteger(gap) ? 0 : 1)} 分`
        : `已高于目标 ${Math.abs(gap).toFixed(Number.isInteger(gap) ? 0 : 1)} 分`;
  }

  function renderMockPage() {
    const history = document.getElementById("mockHistory");
    if (!history) return;
    document.getElementById("mockCount").textContent = `${state.mockScores.length} 次`;
    if (!state.mockScores.length) {
      history.innerHTML = `
        <div class="history-empty">
          <span>↗</span>
          <p>完成第一套完整模考后，<br>在这里观察总分与专项波动。</p>
        </div>
      `;
    } else {
      history.innerHTML = `
        <div class="history-list">
          ${state.mockScores
            .slice(0, 5)
            .map(
              (score) => `
                <div class="history-row">
                  <span>${formatDateKey(score.date)}</span>
                  <b>L ${formatScore(score.listening)} · R ${formatScore(score.reading)}</b>
                  <strong class="${score.total >= state.settings.target ? "above" : "below"}">${formatScore(score.total)}</strong>
                </div>
              `
            )
            .join("")}
        </div>
      `;
    }
    updateLiveTotal();
  }

  function startMiniMock() {
    if (miniMockSession && !miniMockSession.submitted) {
      document.getElementById("miniMockWorkspace").scrollIntoView({ behavior: "smooth", block: "start" });
      toast("迷你模考正在进行，先完成当前测试。");
      return;
    }
    miniMockSession = { submitted: false, startedAt: Date.now() };
    document.getElementById("miniMockWorkspace").innerHTML = buildMiniMockHtml();
    startCountdown("miniMockTimer", 20);
    document.getElementById("miniMockWorkspace").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function buildMiniMockHtml() {
    const listeningHtml = DATA.miniMock.listening
      .map((config) => {
        const set = DATA.listening.find((item) => item.id === config.setId);
        return `
          <article class="mini-section">
            <div class="mini-section-head">
              <div>
                <p class="section-kicker">${escapeHtml(set.type)}</p>
                <h3>${escapeHtml(set.title)}</h3>
              </div>
              <span class="tiny-tag">先听后答</span>
            </div>
            <div class="mini-audio-stack">
              <div class="audio-box">
                <div class="audio-copy">
                  <button class="audio-play" type="button" data-mock-speak="${set.id}" aria-label="播放材料">▶</button>
                  <div><strong>播放系统英文语音</strong><small>第一遍集中听主旨、转折与结论</small></div>
                </div>
                <button class="audio-stop" type="button" data-stop-speech>停止</button>
              </div>
            </div>
            <div class="question-list">
              ${config.indexes
                .map((questionIndex) => {
                  const question = set.questions[questionIndex];
                  return renderQuestion(question, questionIndex, `mock-${set.id}`);
                })
                .join("")}
            </div>
          </article>
        `;
      })
      .join("");

    const readingHtml = DATA.miniMock.reading
      .map((config) => {
        const set = DATA.reading.find((item) => item.id === config.setId);
        return `
          <article class="mini-section">
            <div class="mini-section-head">
              <div>
                <p class="section-kicker">READING PASSAGE</p>
                <h3>${escapeHtml(set.title)}</h3>
              </div>
              <span class="tiny-tag">限时阅读</span>
            </div>
            <div class="mini-passage">
              <h4>${escapeHtml(set.title)}</h4>
              <p>${escapeHtml(set.passage.join(" "))}</p>
            </div>
            <div class="question-list">
              ${config.indexes
                .map((questionIndex) => {
                  const question = set.questions[questionIndex];
                  return renderQuestion(question, questionIndex, `mock-${set.id}`);
                })
                .join("")}
            </div>
          </article>
        `;
      })
      .join("");

    return `
      <div class="mini-mock-test">
        <div class="mock-timer-bar">
          <div><span>20 分钟节奏测试</span><br><strong id="miniMockTimer">20:00</strong></div>
          <span>先听力，后阅读 · 共 8 题</span>
        </div>
        <div class="mini-mock-sections">
          ${listeningHtml}
          ${readingHtml}
        </div>
        <div id="miniMockResult"></div>
        <div class="workspace-actions">
          <span class="workspace-note">目标参考：8 题至少答对 7 题，才接近 600+ 的稳定性要求。</span>
          <button class="button button-dark" type="button" data-submit-mini-mock>提交迷你模考</button>
        </div>
      </div>
    `;
  }

  function submitMiniMock() {
    if (!miniMockSession || miniMockSession.submitted) return;
    const workspace = document.getElementById("miniMockWorkspace");
    let correct = 0;
    let total = 0;
    let mistakeCount = 0;

    DATA.miniMock.listening.forEach((config) => {
      const set = DATA.listening.find((item) => item.id === config.setId);
      config.indexes.forEach((questionIndex) => {
        const question = set.questions[questionIndex];
        const name = `mock-${set.id}-q${questionIndex}`;
        const chosen = workspace.querySelector(`input[name="${name}"]:checked`);
        const selectedIndex = chosen ? Number(chosen.value) : -1;
        const questionNodes = workspace.querySelectorAll(
          `input[name="${name}"]`
        );
        const questionNode = questionNodes[0]?.closest(".question");
        const labels = questionNode?.querySelectorAll(".option-label") || [];
        labels[question.answer]?.classList.add("correct");
        if (selectedIndex === question.answer) {
          correct += 1;
        } else {
          if (selectedIndex >= 0) labels[selectedIndex]?.classList.add("wrong");
          mistakeCount += 1;
          addMistake({
            source: `迷你模考 · 听力 · ${set.title}`,
            question: question.question,
            selected: selectedIndex >= 0 ? question.options[selectedIndex] : "未作答",
            answer: question.options[question.answer],
            explanation: question.explanation,
            index: questionIndex + 1
          });
        }
        questionNodes.forEach((input) => {
          input.disabled = true;
        });
        if (questionNode && !questionNode.querySelector(".answer-feedback")) {
          const feedback = document.createElement("p");
          feedback.className = "answer-feedback";
          feedback.innerHTML = `<strong>正确答案为 ${String.fromCharCode(65 + question.answer)}。</strong> ${escapeHtml(question.explanation)}`;
          questionNode.appendChild(feedback);
        }
        total += 1;
      });
    });

    DATA.miniMock.reading.forEach((config) => {
      const set = DATA.reading.find((item) => item.id === config.setId);
      config.indexes.forEach((questionIndex) => {
        const question = set.questions[questionIndex];
        const name = `mock-${set.id}-q${questionIndex}`;
        const chosen = workspace.querySelector(`input[name="${name}"]:checked`);
        const selectedIndex = chosen ? Number(chosen.value) : -1;
        const questionNodes = workspace.querySelectorAll(
          `input[name="${name}"]`
        );
        const questionNode = questionNodes[0]?.closest(".question");
        const labels = questionNode?.querySelectorAll(".option-label") || [];
        labels[question.answer]?.classList.add("correct");
        if (selectedIndex === question.answer) {
          correct += 1;
        } else {
          if (selectedIndex >= 0) labels[selectedIndex]?.classList.add("wrong");
          mistakeCount += 1;
          addMistake({
            source: `迷你模考 · 阅读 · ${set.title}`,
            question: question.question,
            selected: selectedIndex >= 0 ? question.options[selectedIndex] : "未作答",
            answer: question.options[question.answer],
            explanation: question.explanation,
            index: questionIndex + 1
          });
        }
        questionNodes.forEach((input) => {
          input.disabled = true;
        });
        if (questionNode && !questionNode.querySelector(".answer-feedback")) {
          const feedback = document.createElement("p");
          feedback.className = "answer-feedback";
          feedback.innerHTML = `<strong>正确答案为 ${String.fromCharCode(65 + question.answer)}。</strong> ${escapeHtml(question.explanation)}`;
          questionNode.appendChild(feedback);
        }
        total += 1;
      });
    });

    miniMockSession.submitted = true;
    const percentage = Math.round((correct / total) * 100);
    state.miniMocks.push({
      date: TODAY,
      correct,
      total,
      percentage,
      at: new Date().toISOString()
    });
    recordActivity("listening", Math.min(4, correct), 4);
    recordActivity("reading", Math.max(0, correct - 4), 4);
    markTask("listening");
    markTask("reading");
    saveState();
    stopCountdown();
    document.querySelector("[data-submit-mini-mock]").disabled = true;
    document.querySelector("[data-submit-mini-mock]").textContent = "已完成";
    document.getElementById("miniMockResult").innerHTML = `
      <div class="result-banner">
        <div>
          <p>8 题迷你模考正确率</p>
          <strong>${percentage}%</strong>
        </div>
        <div class="result-copy">
          答对 ${correct} / ${total} 题<br>
          ${correct >= 7 ? "节奏稳定，下次检查剩余时间。" : `记录 ${mistakeCount} 道错题，优先复盘定位与注意力断点。`}
        </div>
      </div>
    `;
    renderDashboard();
    toast(`迷你模考完成：${correct} / ${total}`);
  }

  function renderPlan() {
    const days = daysUntil(state.settings.examDate);
    const minutes = Number(state.settings.dailyMinutes) || 90;
    const phase = getPlanPhase(days);
    document.getElementById("planDays").textContent = days;
    document.getElementById("planDateRange").textContent = state.settings.examDate
      ? `${formatDateKey(TODAY)} → ${formatDateKey(state.settings.examDate)}（默认日期可修改）`
      : "请先设置考试日期";
    document.getElementById("planMinutes").textContent = minutes;
    document.getElementById("planMinuteAdvice").textContent =
      minutes <= 60 ? "短时高效，优先保基本盘" : minutes <= 90 ? "适合稳步提升强度" : "冲刺强度，注意复盘质量";
    document.getElementById("planPhase").textContent = phase.title;
    document.getElementById("planPhaseAdvice").textContent = phase.advice;

    const phases = [
      {
        weeks: "W1–W2",
        title: "基础重建",
        text: "建立词汇识别、精听和长难句拆解的基本动作。",
        items: ["高频词主动回忆", "对话精听与跟读", "阅读证据句定位"]
      },
      {
        weeks: "W3–W4",
        title: "专项提速",
        text: "把每道题的做题动作固定下来，减少犹豫与回读。",
        items: ["同义替换训练", "段落匹配与仔细阅读", "写作三段式成稿"]
      },
      {
        weeks: "W5–W6",
        title: "全真仿真",
        text: "按考试时间完成套题，记录每一类失分原因。",
        items: ["完整模考 2 次", "翻译限时输出", "错题归因复盘"]
      },
      {
        weeks: "W7–W8",
        title: "稳定手感",
        text: "不再追求新难题，把会做的题稳定拿分。",
        items: ["回看高频错误", "保持每天精听", "固定写作与翻译模板"]
      }
    ];

    document.getElementById("phaseRoadmap").innerHTML = phases
      .map(
        (item, index) => `
          <article class="roadmap-card ${index === phase.index ? "current" : index < phase.index ? "done" : ""}">
            <span class="roadmap-week">${item.weeks}</span>
            <h3>${item.title}</h3>
            <p>${item.text}</p>
            <ul class="roadmap-list">
              ${item.items.map((entry) => `<li>${entry}</li>`).join("")}
            </ul>
            <span class="roadmap-status">${index < phase.index ? "已完成阶段" : index === phase.index ? "当前阶段" : "即将进入"}</span>
          </article>
        `
      )
      .join("");

    const rhythm = [
      ["周一", "听力", "精听 + 跟读，复盘 3 道错题"],
      ["周二", "阅读", "仔细阅读 1 篇，定位每道证据句"],
      ["周三", "写作", "30 分钟成稿，按清单修改"],
      ["周四", "听力", "短篇新闻或讲座，练信号词"],
      ["周五", "翻译", "1 段限时翻译，对照参考译文"],
      ["周六", "模考", "完整套题或 20 分钟节奏测试"],
      ["周日", "复盘", "只回看错题与词汇，不追新题"]
    ];
    document.getElementById("weeklyRhythm").innerHTML = rhythm
      .map(
        ([day, focus, detail]) => `
          <div class="rhythm-row">
            <span class="rhythm-day">${day}</span>
            <span class="rhythm-focus">${focus}</span>
            <span class="rhythm-detail">${detail}</span>
          </div>
        `
      )
      .join("");
  }

  function getPlanPhase(days) {
    if (days > 42) {
      return { index: 0, title: "基础重建", advice: "先扩大识别词汇与精听熟练度" };
    }
    if (days > 28) {
      return { index: 1, title: "专项提速", advice: "固定做题动作，减少犹豫与回读" };
    }
    if (days > 14) {
      return { index: 2, title: "全真仿真", advice: "按考试时间训练，复盘失分原因" };
    }
    return { index: 3, title: "稳定手感", advice: "复盘高频错误，确保会做的题拿稳" };
  }

  function openSettings() {
    const settings = state.settings;
    showModal({
      title: "学习设置",
      kicker: "PERSONAL SETUP",
      body: `
        <p class="settings-note">考试日期请以准考证为准。所有学习记录只保存在当前浏览器，不会上传到任何服务器。</p>
        <form class="settings-form" id="settingsForm">
          <label class="field">
            <span>目标分数</span>
            <input type="number" name="target" id="settingTarget" min="600" max="710" step="1" value="${settings.target}">
          </label>
          <label class="field">
            <span>考试日期</span>
            <input type="date" name="examDate" id="settingExamDate" value="${escapeHtml(settings.examDate)}">
          </label>
          <label class="field">
            <span>每日可用时间</span>
            <select name="dailyMinutes" id="settingMinutes">
              <option value="60" ${Number(settings.dailyMinutes) === 60 ? "selected" : ""}>60 分钟 · 基本盘</option>
              <option value="90" ${Number(settings.dailyMinutes) === 90 ? "selected" : ""}>90 分钟 · 稳步提升</option>
              <option value="120" ${Number(settings.dailyMinutes) === 120 ? "selected" : ""}>120 分钟 · 冲刺强度</option>
            </select>
          </label>
          <label class="field">
            <span>听力语音速度</span>
            <select name="ttsRate" id="settingTtsRate">
              <option value="0.75" ${Number(settings.ttsRate) === 0.75 ? "selected" : ""}>0.75× · 慢速精听</option>
              <option value="0.9" ${Number(settings.ttsRate) === 0.9 ? "selected" : ""}>0.90× · 推荐</option>
              <option value="1" ${Number(settings.ttsRate) === 1 ? "selected" : ""}>1.00× · 接近常速</option>
              <option value="1.15" ${Number(settings.ttsRate) === 1.15 ? "selected" : ""}>1.15× · 提速挑战</option>
            </select>
          </label>
        </form>
        <div class="data-actions">
          <button class="button button-outline" type="button" id="exportDataBtn">导出学习记录</button>
          <button class="button danger-button" type="button" id="resetDataBtn">清空所有数据</button>
        </div>
      `,
      footer: `
        <button class="button button-outline" type="button" id="cancelSettingsBtn">取消</button>
        <button class="button button-dark" type="button" id="saveSettingsBtn">保存设置</button>
      `
    });

    document.getElementById("cancelSettingsBtn").addEventListener("click", closeModal);
    document.getElementById("saveSettingsBtn").addEventListener("click", saveSettings);
    document.getElementById("exportDataBtn").addEventListener("click", exportLearningData);
    document.getElementById("resetDataBtn").addEventListener("click", openResetConfirm);
  }

  function saveSettings() {
    const target = Number(document.getElementById("settingTarget").value);
    const examDate = document.getElementById("settingExamDate").value;
    const dailyMinutes = Number(document.getElementById("settingMinutes").value);
    const ttsRate = Number(document.getElementById("settingTtsRate").value);
    if (!Number.isFinite(target) || target < 600 || target > 710) {
      toast("目标分数请设置在 600–710 之间。");
      return;
    }
    if (!examDate) {
      toast("请先选择考试日期。");
      return;
    }
    state.settings = { target, examDate, dailyMinutes, ttsRate };
    saveState();
    closeModal();
    renderAll();
    toast("学习设置已更新");
  }

  function exportLearningData() {
    const payload = {
      app: "CET6 Summit",
      exportedAt: new Date().toISOString(),
      data: state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `CET6学习记录-${TODAY}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast("学习记录已导出");
  }

  function openResetConfirm() {
    showModal({
      title: "清空所有学习记录？",
      kicker: "DESTRUCTIVE ACTION",
      body: `
        <div class="empty-modal">
          <strong>这一步无法撤销。</strong>
          词汇进度、任务完成、草稿、错题与模考记录都会被删除。<br>
          建议先导出备份，再决定是否清空。
        </div>
      `,
      footer: `
        <button class="button button-outline" type="button" id="cancelResetBtn">保留记录</button>
        <button class="button danger-button" type="button" id="confirmResetBtn">确认清空</button>
      `
    });
    document.getElementById("cancelResetBtn").addEventListener("click", closeModal);
    document.getElementById("confirmResetBtn").addEventListener("click", () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.warn(error);
      }
      state = defaultState();
      vocabSession = { queue: [], index: 0, revealed: false };
      miniMockSession = null;
      closeModal();
      document.getElementById("miniMockWorkspace").innerHTML = "";
      renderAll();
      initializeForms();
      toast("学习记录已清空");
    });
  }

  function showModal({ title, kicker, body, footer }) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalKicker").textContent = kicker || "DETAILS";
    document.getElementById("modalBody").innerHTML = body || "";
    document.getElementById("modalFooter").innerHTML = footer || "";
    const backdrop = document.getElementById("modalBackdrop");
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => document.getElementById("modalCloseBtn").focus(), 20);
  }

  function closeModal() {
    document.getElementById("modalBackdrop").hidden = true;
    document.body.style.overflow = "";
    quizSession = null;
    if (currentView === "vocabulary") {
      renderVocabulary();
      renderDashboard();
    }
  }

  function startCountdown(elementId, minutes) {
    stopCountdown();
    const element = document.getElementById(elementId);
    if (!element) return;
    let remaining = minutes * 60;
    const update = () => {
      const current = document.getElementById(elementId);
      if (!current) return;
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      current.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      if (remaining <= 0) {
        clearInterval(activeCountdown);
        activeCountdown = null;
        toast("时间到。先停笔，记录本轮的节奏问题。");
        return;
      }
      remaining -= 1;
    };
    update();
    activeCountdown = window.setInterval(update, 1000);
  }

  function stopCountdown() {
    if (activeCountdown) {
      clearInterval(activeCountdown);
      activeCountdown = null;
    }
  }

  function speakText(text) {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      toast("当前浏览器不支持系统英文语音，请展开原文进行精读。");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((voice) => /^en-GB/i.test(voice.lang) && /female|natural|google|microsoft/i.test(voice.name)) ||
      voices.find((voice) => /^en-US/i.test(voice.lang) && /female|natural|google|microsoft/i.test(voice.name)) ||
      voices.find((voice) => /^en/i.test(voice.lang));
    if (preferred) utterance.voice = preferred;
    utterance.lang = preferred?.lang || "en-US";
    utterance.rate = Number(state.settings.ttsRate) || 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeech() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function estimateSpeechMinutes(text) {
    return Math.max(1, Math.round(countWords(text) / 110));
  }

  function toast(message) {
    const element = document.getElementById("toast");
    if (!element) return;
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("show"), 2600);
  }

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(key) {
    if (!key) return null;
    const date = new Date(`${key}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function addDays(date, amount) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
  }

  function daysUntil(dateKey) {
    const exam = parseDateKey(dateKey);
    if (!exam) return 0;
    const today = parseDateKey(TODAY);
    return Math.max(0, Math.ceil((exam - today) / DAY_MS));
  }

  function formatDateKey(key) {
    const date = parseDateKey(key);
    if (!date) return "未设置";
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${WEEKDAYS[date.getDay()]}`;
  }

  function formatChineseDate(date) {
    return `${date.getMonth() + 1}月${date.getDate()}日 · ${WEEKDAYS[date.getDay()]}`;
  }

  function countWords(text) {
    const normalized = String(text || "").trim();
    if (!normalized) return 0;
    return (normalized.match(/[A-Za-z]+(?:['’-][A-Za-z]+)?|[\u4e00-\u9fff]/g) || []).length;
  }

  function formatScore(value) {
    return Number(value || 0).toFixed(Number(value % 1 === 0) ? 0 : 1);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function shuffle(array) {
    const result = [...array];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }
    return result;
  }

  document.addEventListener("DOMContentLoaded", init);
})();
