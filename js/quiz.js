/**
 * Controller for the quiz-taking page. Loads the requested quiz's config
 * and questions from Firebase, renders the question form, and grades the
 * user's answers on submit.
 */
class QuizApp {
  constructor(database) {
    this.database = database;
    this.quizData = [];
    this.quizKey = new URLSearchParams(window.location.search).get("quiz_key") || "1";
    this.autoSaveTimer = null; 
  }

  init() {
    this.dataLoaded = false;
    
    document.addEventListener('auth-resolved', () => {
        if (!this.dataLoaded) {
            this.loadQuiz();
            this.dataLoaded = true;
        }
    });
  }

  async loadQuiz() {
    const settings = await window.authManager.fetchSettings();
    const access = settings.QUIZ_ACCESS_LEVEL || 'unrestricted';
    const user = window.authManager.userProfile;
    const verified = window.authManager.auth.currentUser?.emailVerified;

    // --- DRY Content-Level Access Gating ---
    if (access !== 'unrestricted' && (!user || user.role !== 'admin')) {
        const statusEl = document.getElementById("status-msg");
        if (statusEl) statusEl.style.display = "none";
        
        const container = document.getElementById("questions-container");
        if (!container) return;

        if (!user) {
            container.innerHTML = window.authManager.generateRestrictedHTML("Quiz", "login");
            return;
        }
        if (access === 'enforce_verify_email' && !verified) {
            container.innerHTML = window.authManager.generateRestrictedHTML("Quiz", "verify");
            return;
        }
    }

    try {
      const infoSnap = await this.database.ref(`configs/index/${this.quizKey}`).once("value");
      if (!infoSnap.exists()) return this.showNotFound();

      const quizInfo = infoSnap.val();
      document.getElementById("quiz-title").innerText = quizInfo.title;
      this.setStatus("Fetching quiz data...");

      new ViewCounter(this.database, `quiz_views/quiz_${this.quizKey}`, `visited_quiz_${this.quizKey}`, "visitor-count").track();

      const databaseKey = quizInfo.input_file.replace(".json", "");
      const dataSnap = await this.database.ref(`quizzes/${databaseKey}`).once("value");

      if (!dataSnap.exists()) throw new Error("Quiz data not found in database");

      this.quizData = dataSnap.val();
      this.setStatus(null);
      document.getElementById("total-qs").innerText = this.quizData.length;
      this.buildQuiz();

      if (window.authManager && window.authManager.userProfile) {
          const headerActions = document.getElementById("quiz-header-actions");
          if (headerActions) headerActions.style.display = "flex";

          const savedState = await window.authManager.getQuizState(this.quizKey);
          if (savedState) this.restoreState(savedState);
          this.startAutoSave();
      }
    } catch (error) {
      this.setStatus("Failed to load quiz data from database.");
      console.error(error);
    }
  }

  showNotFound() {
    document.getElementById("quiz-title").innerText = "Quiz Not Found";
    this.setStatus("Quiz Key does not exist.");
  }

  setStatus(message) {
    const statusEl = document.getElementById("status-msg");
    if (!statusEl) return;
    statusEl.style.display = message === null ? "none" : "block";
    if (message !== null) statusEl.innerText = message;
  }

  buildQuiz() {
    const container = document.getElementById("questions-container");
    this.quizData.forEach((question, index) => {
      container.appendChild(this.buildQuestionCard(question, index));
    });
    document.getElementById("submitBtn").style.display = "block";
  }

  buildQuestionCard(question, index) {
    const card = document.createElement("div");
    card.className = "question-card";
    card.id = `card-${index}`;

    const qText = document.createElement("div");
    qText.className = "question-text";
    qText.innerHTML = `${index + 1}. ${question.q}`;
    card.appendChild(qText);

    question.options.forEach((option, optIndex) => {
      card.appendChild(this.buildOptionLabel(option, optIndex, index));
    });

    const expBox = document.createElement("div");
    expBox.className = "explanation-box";
    expBox.id = `exp-${index}`;
    expBox.innerHTML = `<strong>Explanation:</strong> ${question.explanation}`;
    card.appendChild(expBox);

    return card;
  }

  buildOptionLabel(optionText, optIndex, questionIndex) {
    const label = document.createElement("label");
    label.className = "option-label";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `question_${questionIndex}`;
    radio.value = String(optIndex);

    label.appendChild(radio);
    label.appendChild(document.createTextNode(optionText));
    return label;
  }

  restoreState(state) {
    for (const [qIndex, optIndex] of Object.entries(state)) {
       const radio = document.querySelector(`input[name="question_${qIndex}"][value="${optIndex}"]`);
       if (radio) radio.checked = true;
    }
  }

  async startAutoSave() {
    const settings = await window.authManager.fetchSettings();
    const interval = settings.autosave_interval_ms || 60000; 
    this.autoSaveTimer = setInterval(() => this.saveCurrentState(), interval);
  }

  saveCurrentState() {
    const state = {};
    let hasAnswers = false;
    
    this.quizData.forEach((_, index) => {
        const val = this.getSelectedValue(index);
        if (val !== -1) {
            state[index] = val;
            hasAnswers = true;
        }
    });

    if (hasAnswers && window.authManager) {
        window.authManager.saveQuizState(this.quizKey, state);
    }
  }

  manualSave() {
    this.saveCurrentState();
    alert("Quiz progress saved successfully!");
  }

  async clearStateAndReload() {
    if (confirm("Are you sure you want to reset your progress? This will clear all your current answers.")) {
        if (window.authManager) {
            await window.authManager.clearQuizState(this.quizKey);
        }
        window.location.reload();
    }
  }

  _gradeQuestion(index, question) {
    const selectedValue = this.getSelectedValue(index);
    const expBox = document.getElementById(`exp-${index}`);
    expBox.style.display = "block";

    if (selectedValue === question.answer) {
      expBox.classList.add("correct");
      expBox.innerHTML = `<strong>Correct!</strong> ${question.explanation}`;
      return 1;
    } else {
      expBox.classList.remove("correct");
      const answerText = question.options[question.answer];
      expBox.innerHTML = `<strong>Incorrect or Unanswered.</strong> The correct answer is: <em>${answerText}</em>.<br><br><strong>Explanation:</strong> ${question.explanation}`;
      return 0;
    }
  }

  submit() {
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);

    let score = 0;
    this.quizData.forEach((question, index) => {
      score += this._gradeQuestion(index, question);
    });

    document.getElementById("score").innerText = String(score);

    if (window.authManager && window.authManager.userProfile) {
        window.authManager.saveTopScore(this.quizKey, score, this.quizData.length);
        window.authManager.clearQuizState(this.quizKey); 
    } else {
        const promo = document.getElementById("guest-score-promo");
        if (promo) promo.style.display = "block";
    }

    const headerActions = document.getElementById("quiz-header-actions");
    if (headerActions) headerActions.style.display = "none";

    document.getElementById("results").style.display = "block";
    document.getElementById("questions-container").classList.add("disabled-form");
    document.getElementById("submitBtn").style.display = "none";

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  getSelectedValue(index) {
    const selectedOption = document.querySelector(`input[name="question_${index}"]:checked`);
    return selectedOption ? parseInt(selectedOption.value, 10) : -1;
  }
}

let quizApp;

function submitQuiz() {
  if (quizApp) quizApp.submit();
}

bootstrapApp(QuizApp, (app) => {
  quizApp = app;
});