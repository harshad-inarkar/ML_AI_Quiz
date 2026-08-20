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
    this.quizKey =
      new URLSearchParams(window.location.search).get("quiz_key") || "1";
  }

  /** Kicks off loading of the quiz config and its questions. */
  init() {
    // Wait for auth to resolve (whether logged in or as a guest) before loading
    document.addEventListener('auth-resolved', () => this.loadQuiz());
  }

  /** Fetches quiz metadata, then its questions, and renders the form. */
  async loadQuiz() {
    try {
      const infoSnap = await this.database
        .ref(`configs/index/${this.quizKey}`)
        .once("value");

      if (!infoSnap.exists()) {
        this.showNotFound();
        return;
      }

      const quizInfo = infoSnap.val();
      document.getElementById("quiz-title").innerText = quizInfo.title;
      this.setStatus("Fetching quiz data...");

      new ViewCounter(
        this.database,
        `quiz_views/quiz_${this.quizKey}`,
        `visited_quiz_${this.quizKey}`,
        "visitor-count"
      ).track();

      const databaseKey = quizInfo.input_file.replace(".json", "");
      const dataSnap = await this.database
        .ref(`quizzes/${databaseKey}`)
        .once("value");

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

  /** Displays the "quiz not found" state for an invalid quiz key. */
  showNotFound() {
    document.getElementById("quiz-title").innerText = "Quiz Not Found";
    this.setStatus("Quiz Key does not exist.");
  }

  /**
   * Shows a status message, or hides the status element entirely.
   * @param {string | null} message
   */
  setStatus(message) {
    const statusEl = document.getElementById("status-msg");
    if (!statusEl) {
      return;
    }
    if (message === null) {
      statusEl.style.display = "none";
    } else {
      statusEl.innerText = message;
    }
  }

  /** Renders one question card per item in `this.quizData`. */
  buildQuiz() {
    const container = document.getElementById("questions-container");
    this.quizData.forEach((question, index) => {
      container.appendChild(this.buildQuestionCard(question, index));
    });
    document.getElementById("submitBtn").style.display = "block";
  }

  /**
   * @param {{q: string, options: string[], explanation: string}} question
   * @param {number} index
   * @returns {HTMLDivElement}
   */
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

  /**
   * @param {string} optionText
   * @param {number} optIndex
   * @param {number} questionIndex
   * @returns {HTMLLabelElement}
   */
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

    // NEW LOGIC: Pass both the score and the total number of questions
    if (window.authManager) {
        window.authManager.saveTopScore(this.quizKey, score, this.quizData.length);
    }

    document.getElementById("results").style.display = "block";
    document
      .getElementById("questions-container")
      .classList.add("disabled-form");
    document.getElementById("submitBtn").style.display = "none";

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * @param {number} index
   * @returns {number} The selected option index, or -1 if unanswered.
   */
  getSelectedValue(index) {
    const radios = document.getElementsByName(`question_${index}`);
    for (const radio of radios) {
      if (radio.checked) {
        return parseInt(radio.value, 10);
      }
    }
    return -1;
  }
}


let quizApp;

/** Global bridge for the inline onclick="submitQuiz()" handler in the HTML. */
function submitQuiz() {
  if (quizApp) quizApp.submit();
}

// Utilize the bootstrapApp helper and assign the instance to our global variable
bootstrapApp(QuizApp, (app) => {
  quizApp = app;
});