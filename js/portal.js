class PortalApp {
  constructor(database) {
    this.database = database;
    this.listContainer = document.getElementById("quiz-list");
    this.quizConfigData = {};
    
    document.getElementById('save-quiz-btn').addEventListener('click', () => this.saveQuiz());
  }

  init() {
    new ViewCounter(this.database, "portal_views/main", "visited_portal_main", "portal-visitor-count").track();
    this.database.ref("portal_downloads/main/total").on("value", (snap) => {
      const el = document.getElementById("portal-download-count");
      if (el) el.innerText = snap.val() || 0;
    });

    this.dataLoaded = false; 

    document.addEventListener('auth-resolved', () => {
        if (!this.dataLoaded) {
            this.loadQuizzes();
            this.dataLoaded = true;
        } else {
            this.renderQuizzes(); 
        }
    });

    document.addEventListener('scores-updated', () => {
        if (this.dataLoaded) this.renderQuizzes();
    });
  }

  async loadQuizzes() {
    const settings = await window.authManager.fetchSettings();
    const access = settings.QUIZ_ACCESS_LEVEL || 'unrestricted';
    const user = window.authManager.userProfile;
    const verified = window.authManager.auth.currentUser?.emailVerified;

    // --- Call the DRY AuthManager utility to inject the promo ---
    window.authManager.injectDiscordPromo(settings);

    if (access !== 'unrestricted' && (!user || user.role !== 'admin')) {
        if (!user) {
            this.listContainer.innerHTML = `<div style="text-align:center; padding:40px; background:var(--surface); border-radius:16px; border:1px solid var(--surface-border);"><h2 style="margin-top:0; color:var(--text-heading);">Unlock Quizzes</h2><p>To keep your progress secure and track your top scores, please <a href="javascript:void(0)" onclick="document.getElementById('auth-modal').style.display='flex'" style="color:var(--primary-accent); text-decoration:underline;">Log in or Register</a>.</p></div>`;
            return;
        }
        if (access === 'enforce_verify_email' && !verified) {
            this.listContainer.innerHTML = `<div style="text-align:center; padding:40px; background:var(--surface); border-radius:16px; border:1px solid var(--surface-border);"><h2 style="margin-top:0; color:var(--text-heading);">Verification Required</h2><p>For your security, please verify your email address to access quizzes. <a href="javascript:void(0)" onclick="window.authManager.resendVerification()" style="color:var(--primary-accent); text-decoration:underline;">Resend Link</a></p></div>`;
            return;
        }
    }

    try {
      const snapshot = await this.database.ref("configs/index").once("value");
      if (!snapshot.exists()) throw new Error("Config not found");
      this.quizConfigData = snapshot.val();
      this.renderQuizzes();
    } catch (error) {
      console.error(error);
      this.listContainer.innerHTML = `<p style="text-align:center; color:var(--red-text);">Unable to load quizzes. Please check your access permissions.</p>`;
    }
  }

  renderQuizzes() {
    this.listContainer.innerHTML = "";
    const sortedKeys = Object.keys(this.quizConfigData)
      .filter(k => k !== 'null')
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    
    sortedKeys.forEach((key) => {
      this.listContainer.appendChild(this.buildQuizCard(key, this.quizConfigData[key]));
    });

    document.querySelectorAll('.download-quiz-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.downloadQuiz(e.currentTarget.getAttribute('data-key')));
    });
  }

  _generateBadgeHTML(quizKey) {
    if (!window.authManager || !window.authManager.userProfile) return '';
    
    const topData = window.authManager.userScores[quizKey];
    if (topData === undefined) return '';

    const score = typeof topData === 'object' ? topData.score : topData;
    const total = typeof topData === 'object' ? topData.total : null;
    
    if (!total) return `<div class="smart-badge fallback-badge">Top: ${score}</div>`;

    const percent = Math.round((score / total) * 100);
    let badgeColor = '#e28591'; 
    let badgeBgFill = 'rgba(226, 133, 145, 0.25)';
    let trophy = '';
    
    if (percent >= 100) {
        badgeColor = '#10b981'; 
        badgeBgFill = 'rgba(16, 185, 129, 0.25)';
        trophy = ' 🏆'; 
    } else if (percent >= 70) {
        badgeColor = '#4a7c7b'; 
        badgeBgFill = 'rgba(74, 124, 123, 0.25)';
    } else if (percent >= 40) {
        badgeColor = '#fbbf24'; 
        badgeBgFill = 'rgba(251, 191, 36, 0.25)';
    }

    return `<div class="smart-badge" style="--fill-percent: ${percent}%; --badge-color: ${badgeColor}; --badge-bg-fill: ${badgeBgFill};">Top: ${score}/${total}${trophy}</div>`;
  }

  _getAttemptText(quizKey) {
    const hasSavedState = window.authManager?.userQuizStates?.[quizKey];
    return hasSavedState ? "Resume Quiz" : "Attempt Quiz";
  }

  buildQuizCard(key, quizData) {
    const card = document.createElement("div");
    card.className = "quiz-card";

    const scoreDisplayHTML = this._generateBadgeHTML(key);
    const attemptText = this._getAttemptText(key);
    const resourcesBtnHTML = quizData.resources_keys?.length > 0 
      ? `<a href="resources_template.html?quiz_key=${encodeURIComponent(key)}" class="btn btn-secondary">Study Resources</a>` 
      : '';
    
    card.innerHTML = `
      <div class="quiz-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <h2 style="margin: 0; padding-right: 15px;">${quizData.title}</h2>
        ${scoreDisplayHTML}
      </div>
      <div class="action-links" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; gap: 10px;">
          <a href="quiz_template.html?quiz_key=${encodeURIComponent(key)}" class="btn btn-primary">${attemptText}</a>
          ${resourcesBtnHTML}
          <button class="btn btn-secondary admin-only" onclick="window.portalApp.openQuizModal('${key}')">Edit Quiz</button>
        </div>
        <button class="btn btn-secondary download-quiz-btn btn-icon" data-key="${key}" title="Save for Offline Use">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        </button>
      </div>
    `;
    return card;
  }

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
    
    const resourcesKeys = resString.split(',').map(s => s.trim()).filter(s => s);
    
    // --- Call the DRY app-bootstrap utility to generate keys ---
    const targetKey = key || window.generateNewDatabaseKey(this.quizConfigData);
    
    const inputFile = key ? this.quizConfigData[key].input_file : `input_quiz_${targetKey}.json`;

    if (!key && fileInput.files.length === 0) return alert("A JSON file is required for new quizzes.");

    try {
      if (fileInput.files.length > 0) {
        const fileContent = await fileInput.files[0].text();
        const parsedJson = JSON.parse(fileContent); 
        const dbKey = inputFile.replace(".json", "");
        await this.database.ref(`quizzes/${dbKey}`).set(parsedJson);
      }

      const configPayload = { title: title, input_file: inputFile };
      if (resourcesKeys.length > 0) configPayload.resources_keys = resourcesKeys;
      
      await this.database.ref(`configs/index/${targetKey}`).set(configPayload);
      
      alert("Quiz saved successfully!");
      document.getElementById('quiz-modal').style.display = 'none';
      this.loadQuizzes(); 
    } catch (e) {
      alert("Error saving quiz. Ensure JSON file is valid. Error: " + e.message);
    }
  }

  async openSettingsModal() {
      const modal = document.getElementById('settings-modal');
      const settings = await window.authManager.fetchSettings();
      
      document.getElementById('cms-quiz-access').value = settings.QUIZ_ACCESS_LEVEL || 'unrestricted';
      document.getElementById('cms-res-access').value = settings.RESOURCES_ACCESS_LEVEL || 'unrestricted';
      
      document.getElementById('cms-discord-show').value = settings.show_discord_promo === true ? "true" : "false";
      document.getElementById('cms-discord-link1').value = settings.discord_link1_join || 'https://discord.com';
      document.getElementById('cms-discord-link2').value = settings.discord_link2_channel || 'https://discord.com';
      
      modal.style.display = 'flex';
  }

  async saveSettings() {
      const quizAccess = document.getElementById('cms-quiz-access').value;
      const resAccess = document.getElementById('cms-res-access').value;

      const showDiscord = document.getElementById('cms-discord-show').value === "true";
      const link1 = document.getElementById('cms-discord-link1').value.trim();
      const link2 = document.getElementById('cms-discord-link2').value.trim();

      try {
          await this.database.ref('settings').update({
              QUIZ_ACCESS_LEVEL: quizAccess,
              RESOURCES_ACCESS_LEVEL: resAccess,
              show_discord_promo: showDiscord,
              discord_link1_join: link1,
              discord_link2_channel: link2
          });
          alert("Portal Settings updated successfully!");
          document.getElementById('settings-modal').style.display = 'none';
          this.loadQuizzes(); 
      } catch (e) {
          alert("Error saving settings: " + e.message);
      }
  }

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