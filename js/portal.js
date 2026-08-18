/**
 * Controller for the portal (index) page. Loads the quiz index from
 * Firebase and renders one card per quiz, each linking to the quiz
 * itself and, when available, its associated study resources.
 */
class PortalApp {
  /** @param {firebase.database.Database} database Initialized Firebase database instance. */
  constructor(database) {
    this.database = database;
    this.listContainer = document.getElementById("quiz-list");
  }

  /** Boots the view counter and kicks off the quiz list load. */
  init() {
    new ViewCounter(
      this.database,
      "portal_views/main",
      "visited_portal_main",
      "portal-visitor-count"
    ).track();

    // Listen to real-time download counts
    this.database.ref("portal_downloads/main/total").on("value", (snap) => {
      const el = document.getElementById("portal-download-count");
      if (el) el.innerText = snap.val() || 0;
    });

    this.loadQuizzes();
  }

  /** Fetches the quiz index config and renders it, or shows an error. */
  async loadQuizzes() {
    try {
      const snapshot = await this.database.ref("configs/index").once("value");
      if (!snapshot.exists()) {
        throw new Error("Config not found in Firebase");
      }
      this.renderQuizzes(snapshot.val());
    } catch (error) {
      const loading = document.getElementById("loading");
      if (loading) {
        loading.innerText = "Error loading quizzes from database.";
      }
      console.error("Error:", error);
    }
  }

  /**
   * @param {Object<string, {title: string, resources_keys?: string[]}>} data
   */
  renderQuizzes(data) {
    this.listContainer.innerHTML = "";
    const sortedKeys = Object.keys(data).sort(
      (a, b) => parseInt(a, 10) - parseInt(b, 10)
    );
    
    sortedKeys.forEach((key) => {
      this.listContainer.appendChild(this.buildQuizCard(key, data[key]));
    });

    // Attach listeners for dynamic offline download buttons
    const downloadBtns = this.listContainer.querySelectorAll('.download-quiz-btn');
    downloadBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // e.currentTarget ensures we get the button even if they click the SVG inside it
        const key = e.currentTarget.getAttribute('data-key');
        this.downloadQuiz(key);
      });
    });
  }

  /**
   * @param {string} key
   * @param {{title: string, resources_keys?: string[]}} quizData
   * @returns {HTMLDivElement}
   */
  buildQuizCard(key, quizData) {
    const card = document.createElement("div");
    card.className = "quiz-card";

    card.innerHTML = `
      <h2>${quizData.title}</h2>
      <div class="action-links" style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; gap: 10px;">
          <a href="quiz_template.html?quiz_key=${encodeURIComponent(key)}" class="btn btn-primary">Attempt Quiz</a>
          ${this.buildResourceButtonHtml(quizData, key)}
        </div>
        <button class="btn btn-secondary download-quiz-btn" data-key="${key}" style="display: flex; align-items: center; gap: 6px;">
          Save 
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
      </div>
    `;
    return card;
  }

  /**
   * @param {{resources_keys?: string[]}} quizData
   * @param {string} key
   * @returns {string}
   */
  buildResourceButtonHtml(quizData, key) {
    if (!quizData.resources_keys || quizData.resources_keys.length === 0) {
      return "";
    }
    // Updated to pass quiz_key instead of explicit resource keys array
    return `<a href="resources_template.html?quiz_key=${encodeURIComponent(key)}" class="btn btn-secondary">Study Resources</a>`;
  }

  /**
   * Fetches required dependencies and triggers a self-contained HTML download
   * @param {string} quizKey 
   */
  async downloadQuiz(quizKey) {
    const btn = document.querySelector(`.download-quiz-btn[data-key="${quizKey}"]`);
    const originalHtml = btn.innerHTML;
    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
      const infoSnap = await this.database.ref(`configs/index/${quizKey}`).once("value");
      const quizInfo = infoSnap.val();
      
      const dbKey = quizInfo.input_file.replace(".json", "");
      const dataSnap = await this.database.ref(`quizzes/${dbKey}`).once("value");
      const quizData = dataSnap.val();

      const htmlString = this.generateOfflineQuizHtml(quizInfo.title, quizData);

      const blob = new Blob([htmlString], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Cleanest regex approach as requested
      a.download = `${quizInfo.title.replace(/[^a-z0-9]+/gi, ' ').trim().replace(/\s+/g, '_').toLowerCase()}_offline.html`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.database.ref("portal_downloads/main/total").set(firebase.database.ServerValue.increment(1));
    } catch (e) {
      console.error("Download failed:", e);
      alert("Failed to generate offline quiz. Please try again.");
    } finally {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }

  /**
   * Builds the standalone interactive HTML string for a quiz.
   */
  generateOfflineQuizHtml(title, data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - Offline</title>
<style>
  body { font-family: 'Arial', sans-serif; background-color: #000; color: #cbd5e1; margin: 0; padding: 40px 20px; display: flex; justify-content: center; line-height: 1.5; }
  .container { max-width: 640px; width: 100%; }
  .header { background: #0b1517; padding: 30px; border-radius: 16px; border: 1px solid #1a2f33; margin-bottom: 24px; text-align: center; border-top: 5px solid #4a7c7b; }
  h1 { margin: 0 0 10px 0; font-size: 24px; color: #e2e8f0; }
  .card { background: #0b1517; padding: 24px; border-radius: 16px; border: 1px solid #1a2f33; margin-bottom: 20px; }
  .q-text { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #e2e8f0; }
  label { display: block; padding: 10px 14px; background: #132225; border-radius: 8px; margin-bottom: 10px; cursor: pointer; border: 1px solid transparent; }
  label:hover { border-color: #1a2f33; background: #16262a; }
  .btn { display: block; width: 100%; background: #4a7c7b; color: #000; border: none; padding: 14px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 30px; margin-bottom: 50px; }
  .btn:hover { opacity: 0.9; }
  .exp { display: none; margin-top: 16px; padding: 16px; border-radius: 8px; font-size: 14px; }
  .exp.correct { background: rgba(74, 124, 123, 0.15); color: #6da4a3; border-left: 4px solid #4a7c7b; }
  .exp.incorrect { background: rgba(153, 56, 73, 0.15); color: #e28591; border-left: 4px solid #993849; }
  .score-card { display: none; background: #0b1517; padding: 30px; border-radius: 16px; border: 1px solid #1a2f33; text-align: center; margin-bottom: 24px; }
  .score-card h2 { margin: 0; color: #e2e8f0; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${title}</h1>
    <p style="margin: 0; color: #94a3b8;">Offline Interactive Version</p>
  </div>
  <div class="score-card" id="score-card">
    <h2 id="score-text"></h2>
  </div>
  <div id="quiz">
    ${data.map((q, i) => `
      <div class="card" id="card-${i}">
        <div class="q-text">${i + 1}. ${q.q}</div>
        ${q.options.map((opt, j) => `
          <label><input type="radio" name="q_${i}" value="${j}"> ${opt}</label>
        `).join('')}
        <div class="exp" id="exp-${i}"></div>
      </div>
    `).join('')}
  </div>
  <button class="btn" id="submit-btn" onclick="submitQuiz()">Submit Answers</button>
</div>
<script>
  const data = ${JSON.stringify(data)};
  function submitQuiz() {
    let score = 0;
    data.forEach((q, i) => {
      const radios = document.getElementsByName('q_' + i);
      let selected = -1;
      for (let r of radios) { if (r.checked) selected = parseInt(r.value); }
      
      const exp = document.getElementById('exp-' + i);
      exp.style.display = 'block';
      
      if (selected === q.answer) {
        score++;
        exp.className = 'exp correct';
        exp.innerHTML = '<strong>Correct!</strong> ' + q.explanation;
      } else {
        exp.className = 'exp incorrect';
        const ansText = q.options[q.answer];
        exp.innerHTML = '<strong>Incorrect or Unanswered.</strong> The correct answer is: <em>' + ansText + '</em><br><br><strong>Explanation:</strong> ' + q.explanation;
      }
    });
    
    document.getElementById('submit-btn').style.display = 'none';
    document.getElementById('quiz').style.pointerEvents = 'none';
    
    const scoreCard = document.getElementById('score-card');
    scoreCard.style.display = 'block';
    document.getElementById('score-text').innerText = 'You scored ' + score + ' out of ' + data.length;
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
</script>
</body>
</html>`;
  }
}

bootstrapApp(PortalApp);