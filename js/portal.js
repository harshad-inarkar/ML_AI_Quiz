class PortalApp {
  constructor(database) {
    this.database = database;
    this.listContainer = document.getElementById("quiz-list");
    this.quizConfigData = {};
    
    // Bind CMS events
    document.getElementById('save-quiz-btn').addEventListener('click', () => this.saveQuiz());
  }

  init() {
    new ViewCounter(this.database, "portal_views/main", "visited_portal_main", "portal-visitor-count").track();
    this.database.ref("portal_downloads/main/total").on("value", (snap) => {
      const el = document.getElementById("portal-download-count");
      if (el) el.innerText = snap.val() || 0;
    });

    // Wait for auth to resolve before rendering so Admin buttons show up correctly
    document.addEventListener('auth-resolved', () => this.loadQuizzes());
  }

  async loadQuizzes() {
    try {
      const snapshot = await this.database.ref("configs/index").once("value");
      if (!snapshot.exists()) throw new Error("Config not found");
      this.quizConfigData = snapshot.val();
      this.renderQuizzes();
    } catch (error) {
      console.error(error);
    }
  }

  renderQuizzes() {
    this.listContainer.innerHTML = "";
    const sortedKeys = Object.keys(this.quizConfigData).filter(k => k !== 'null').sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    
    sortedKeys.forEach((key) => {
      this.listContainer.appendChild(this.buildQuizCard(key, this.quizConfigData[key]));
    });

    // Attach download listeners
    document.querySelectorAll('.download-quiz-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.downloadQuiz(e.currentTarget.getAttribute('data-key')));
    });
  }

buildQuizCard(key, quizData) {
    const card = document.createElement("div");
    card.className = "quiz-card";

    // Format the Score Badge
    let scoreDisplayHTML = '';
    if (window.authManager && window.authManager.userProfile) {
        const topData = window.authManager.userScores[key];
        
        if (topData !== undefined) {
            const score = typeof topData === 'object' ? topData.score : topData;
            const total = typeof topData === 'object' ? topData.total : null;
            
            if (total) {
                const percent = Math.round((score / total) * 100);
                scoreDisplayHTML = `<span class="quiz-score-badge">Top: ${score}/${total} (${percent}%)</span>`;
            } else {
                // Fallback for older scores saved before we tracked the total
                scoreDisplayHTML = `<span class="quiz-score-badge">Top: ${score}</span>`;
            }
        }
    }
    
    // Elegant Layout: Header (Title + Score) and Footer (Actions + Save Icon)
    card.innerHTML = `
      <div class="quiz-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <h2 style="margin: 0; padding-right: 15px;">${quizData.title}</h2>
        ${scoreDisplayHTML}
      </div>
      <div class="action-links" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; gap: 10px;">
          <a href="quiz_template.html?quiz_key=${encodeURIComponent(key)}" class="btn btn-primary">Attempt Quiz</a>
          ${quizData.resources_keys && quizData.resources_keys.length > 0 ? `<a href="resources_template.html?quiz_key=${encodeURIComponent(key)}" class="btn btn-secondary">Study Resources</a>` : ''}
          <button class="btn btn-secondary admin-only" onclick="window.portalApp.openQuizModal('${key}')">Edit Quiz</button>
        </div>
        <button class="btn btn-secondary download-quiz-btn icon-only-btn" data-key="${key}" title="Save for Offline Use">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        </button>
      </div>
    `;
    return card;
  }

  // --- CMS Admin Methods ---

  openQuizModal(editKey = null) {
    const modal = document.getElementById('quiz-modal');
    document.getElementById('quiz-modal-title').innerText = editKey ? "Edit Quiz" : "Add New Quiz";
    document.getElementById('quiz-edit-key').value = editKey || "";
    
    if (editKey && this.quizConfigData[editKey]) {
      document.getElementById('cms-quiz-title').value = this.quizConfigData[editKey].title;
      document.getElementById('cms-quiz-resources').value = this.quizConfigData[editKey].resources_keys ? this.quizConfigData[editKey].resources_keys.join(", ") : "";
      document.getElementById('cms-json-hint').innerText = "(Leave empty to keep existing questions)";
    } else {
      document.getElementById('cms-quiz-title').value = "";
      document.getElementById('cms-quiz-resources').value = "";
      document.getElementById('cms-json-hint').innerText = "* (Required)";
    }
    
    document.getElementById('cms-quiz-file').value = "";
    modal.style.display = 'flex';
  }

  async saveQuiz() {
    const key = document.getElementById('quiz-edit-key').value;
    const title = document.getElementById('cms-quiz-title').value;
    const resString = document.getElementById('cms-quiz-resources').value;
    const fileInput = document.getElementById('cms-quiz-file');
    
    if (!title) return alert("Title is required.");
    
    let resourcesKeys = resString.split(',').map(s => s.trim()).filter(s => s);
    
    let targetKey = key;
    let inputFile = key ? this.quizConfigData[key].input_file : "";

    // If new quiz, generate a new ID
    if (!key) {
      const existingKeys = Object.keys(this.quizConfigData).filter(k => k !== 'null').map(Number);
      targetKey = existingKeys.length > 0 ? String(Math.max(...existingKeys) + 1) : "1";
      inputFile = `input_quiz_${targetKey}.json`;
      if (fileInput.files.length === 0) return alert("A JSON file is required for new quizzes.");
    }

    try {
      // If a file is provided, read it and upload to the `quizzes` database node
      if (fileInput.files.length > 0) {
        const fileContent = await fileInput.files[0].text();
        const parsedJson = JSON.parse(fileContent); // Validates JSON format
        const dbKey = inputFile.replace(".json", "");
        await this.database.ref(`quizzes/${dbKey}`).set(parsedJson);
      }

      // Save index config
      const configPayload = { title: title, input_file: inputFile };
      if (resourcesKeys.length > 0) configPayload.resources_keys = resourcesKeys;
      
      await this.database.ref(`configs/index/${targetKey}`).set(configPayload);
      
      alert("Quiz saved successfully!");
      document.getElementById('quiz-modal').style.display = 'none';
      this.loadQuizzes(); // Refresh list
    } catch (e) {
      alert("Error saving quiz. Ensure JSON file is valid. Error: " + e.message);
    }
  }

  // --- Download logic (Kept identical to your previous approval) ---
  async downloadQuiz(quizKey) {
    const btn = document.querySelector(`.download-quiz-btn[data-key="${quizKey}"]`);
    const originalHtml = btn.innerHTML;
    btn.innerText = "Saving..."; btn.disabled = true;
    try {
      const infoSnap = await this.database.ref(`configs/index/${quizKey}`).once("value");
      const quizInfo = infoSnap.val();
      const dbKey = quizInfo.input_file.replace(".json", "");
      const dataSnap = await this.database.ref(`quizzes/${dbKey}`).once("value");
      const htmlString = this.generateOfflineQuizHtml(quizInfo.title, dataSnap.val());
      const blob = new Blob([htmlString], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${quizInfo.title.replace(/[^a-z0-9]+/gi, ' ').trim().replace(/\s+/g, '_').toLowerCase()}_offline.html`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      this.database.ref("portal_downloads/main/total").set(firebase.database.ServerValue.increment(1));
    } catch (e) { alert("Failed to generate offline quiz."); } finally { btn.innerHTML = originalHtml; btn.disabled = false; }
  }

  generateOfflineQuizHtml(title, data) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title} - Offline</title><style>body { font-family: 'Arial', sans-serif; background-color: #000; color: #cbd5e1; margin: 0; padding: 40px 20px; display: flex; justify-content: center; line-height: 1.5; }.container { max-width: 640px; width: 100%; }.header { background: #0b1517; padding: 30px; border-radius: 16px; border: 1px solid #1a2f33; margin-bottom: 24px; text-align: center; border-top: 5px solid #4a7c7b; }h1 { margin: 0 0 10px 0; font-size: 24px; color: #e2e8f0; }.card { background: #0b1517; padding: 24px; border-radius: 16px; border: 1px solid #1a2f33; margin-bottom: 20px; }.q-text { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #e2e8f0; }label { display: block; padding: 10px 14px; background: #132225; border-radius: 8px; margin-bottom: 10px; cursor: pointer; border: 1px solid transparent; }label:hover { border-color: #1a2f33; background: #16262a; }.btn { display: block; width: 100%; background: #4a7c7b; color: #000; border: none; padding: 14px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 30px; margin-bottom: 50px; }.btn:hover { opacity: 0.9; }.exp { display: none; margin-top: 16px; padding: 16px; border-radius: 8px; font-size: 14px; }.exp.correct { background: rgba(74, 124, 123, 0.15); color: #6da4a3; border-left: 4px solid #4a7c7b; }.exp.incorrect { background: rgba(153, 56, 73, 0.15); color: #e28591; border-left: 4px solid #993849; }.score-card { display: none; background: #0b1517; padding: 30px; border-radius: 16px; border: 1px solid #1a2f33; text-align: center; margin-bottom: 24px; }.score-card h2 { margin: 0; color: #e2e8f0; }</style></head><body><div class="container"><div class="header"><h1>${title}</h1><p style="margin: 0; color: #94a3b8;">Offline Interactive Version</p></div><div class="score-card" id="score-card"><h2 id="score-text"></h2></div><div id="quiz">${data.map((q, i) => `<div class="card" id="card-${i}"><div class="q-text">${i + 1}. ${q.q}</div>${q.options.map((opt, j) => `<label><input type="radio" name="q_${i}" value="${j}"> ${opt}</label>`).join('')}<div class="exp" id="exp-${i}"></div></div>`).join('')}</div><button class="btn" id="submit-btn" onclick="submitQuiz()">Submit Answers</button></div><script>const data = ${JSON.stringify(data)};function submitQuiz() {let score = 0;data.forEach((q, i) => {const radios = document.getElementsByName('q_' + i);let selected = -1;for (let r of radios) { if (r.checked) selected = parseInt(r.value); }const exp = document.getElementById('exp-' + i);exp.style.display = 'block';if (selected === q.answer) {score++;exp.className = 'exp correct';exp.innerHTML = '<strong>Correct!</strong> ' + q.explanation;} else {exp.className = 'exp incorrect';const ansText = q.options[q.answer];exp.innerHTML = '<strong>Incorrect or Unanswered.</strong> The correct answer is: <em>' + ansText + '</em><br><br><strong>Explanation:</strong> ' + q.explanation;}});document.getElementById('submit-btn').style.display = 'none';document.getElementById('quiz').style.pointerEvents = 'none';const scoreCard = document.getElementById('score-card');scoreCard.style.display = 'block';document.getElementById('score-text').innerText = 'You scored ' + score + ' out of ' + data.length;window.scrollTo({ top: 0, behavior: 'smooth' });}</script></body></html>`;
  }
}

bootstrapApp(PortalApp, (app) => { window.portalApp = app; });