/**
 * Controller for the quiz-taking page. Loads the requested quiz's config
 * and questions from Firebase, renders the question form, and grades the
 * user's answers on submit.
 */
class QuizApp {
  /** @param {firebase.database.Database} database Initialized Firebase database instance. */
  constructor(database) {
    this.database = database;
    this.quizData = [];
    this.quizKey = new URLSearchParams(window.location.search).get("quiz_key") || "1";
  }

  /** Kicks off loading of the quiz config and its questions. */
  init() {
    this.dataLoaded = false;
    
    document.addEventListener('auth-resolved', () => {
        // Prevent the quiz from reloading if the user logs in/out while reading it
        if (!this.dataLoaded) {
            this.loadQuiz();
            this.dataLoaded = true;
        }
    });
  }

  /** Fetches quiz metadata, then its questions, and renders the form. */
  async loadQuiz() {
    try {
      const infoSnap = await this.database.ref(`configs/index/${this.quizKey}`).once("value");

      if (!infoSnap.exists()) {
        this.showNotFound();
        return;
      }

      const quizInfo = infoSnap.val();
      document.getElementById("quiz-title").innerText = quizInfo.title;
      this.setStatus("Fetching quiz data...");

      new ViewCounter(this.database, `quiz_views/quiz_${this.quizKey}`, `visited_quiz_${this.quizKey}`, "visitor-count").track();

      const databaseKey = quizInfo.input_file.replace(".json", "");
      const dataSnap = await this.database.ref(`quizzes/${databaseKey}`).once("value");

      if (!dataSnap.exists()) {
        throw new Error("Quiz data not found in database");
      }

      this.quizData = dataSnap.val();
      this.setStatus(null);
      document.getElementById("total-qs").innerText = this.quizData.length;
      this.buildQuiz();
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
    
    if (message === null) {
      statusEl.style.display = "none";
    } else {
      statusEl.innerText = message;
    }
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

  /** Grades the current selections, reveals explanations, and locks the form. */
  submit() {
    let score = 0;

    this.quizData.forEach((question, index) => {
      const selectedValue = this.getSelectedValue(index);
      const expBox = document.getElementById(`exp-${index}`);
      expBox.style.display = "block";

      if (selectedValue === question.answer) {
        score += 1;
        expBox.classList.add("correct");
        expBox.innerHTML = `<strong>Correct!</strong> ${question.explanation}`;
      } else {
        expBox.classList.remove("correct");
        const answerText = question.options[question.answer];
        expBox.innerHTML = `<strong>Incorrect or Unanswered.</strong> The correct answer is: <em>${answerText}</em>.<br><br><strong>Explanation:</strong> ${question.explanation}`;
      }
    });

    document.getElementById("score").innerText = String(score);

    // Save the score if logged in, otherwise show the registration promo
    if (window.authManager && window.authManager.userProfile) {
        window.authManager.saveTopScore(this.quizKey, score, this.quizData.length);
    } else {
        const promo = document.getElementById("guest-score-promo");
        if (promo) promo.style.display = "block";
    }

    document.getElementById("results").style.display = "block";
    document.getElementById("questions-container").classList.add("disabled-form");
    document.getElementById("submitBtn").style.display = "none";

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * OPTIMIZATION: Replaced the slow for-loop with a native DOM query.
   * @param {number} index
   * @returns {number} The selected option index, or -1 if unanswered.
   */
  getSelectedValue(index) {
    const selectedOption = document.querySelector(`input[name="question_${index}"]:checked`);
    return selectedOption ? parseInt(selectedOption.value, 10) : -1;
  }
}

let quizApp;

/** Global bridge for the inline onclick="submitQuiz()" handler in the HTML. */
function submitQuiz() {
  if (quizApp) quizApp.submit();
}

bootstrapApp(QuizApp, (app) => {
  quizApp = app;
});