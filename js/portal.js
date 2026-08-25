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

    this._renderDiscordPromo(settings);

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

  _renderDiscordPromo(settings) {
    if (!settings.show_discord_promo || !window.authManager?.userProfile) return;
    if (document.getElementById('discord-promo-strip')) return; 

    const headerCard = document.querySelector('.header-card');
    if (!headerCard) return;

    const link1 = settings.discord_link1_join || "#";
    const link2 = settings.discord_link2_channel || "#";

    const promoHTML = `
        <div id="discord-promo-strip" class="discord-promo">
            <div class="discord-promo-content">
                <svg width="18" height="18" viewBox="0 0 127.14 96.36" fill="#5865F2"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a67.55,67.55,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.31,60,73.31,53s5-12.74,11.43-12.74S96.1,46,96,53,91.08,65.69,84.69,65.69Z"/></svg>
                <span>Join our Discord community for collaboration and support!</span>
            </div>
            <div class="discord-promo-actions">
                <a href="${link1}" target="_blank" class="btn btn-discord">Join Discord</a>
                <a href="${link2}" target="_blank" class="btn btn-discord-outline">Already member</a>
            </div>
        </div>
    `;
    // Inject directly above the header card
    headerCard.insertAdjacentHTML('beforebegin', promoHTML);
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

  _generateNewKey(dataset) {
    const existingKeys = Object.keys(dataset).filter(k => k !== 'null').map(Number);
    return existingKeys.length > 0 ? String(Math.max(...existingKeys) + 1) : "1";
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
    const targetKey = key || this._generateNewKey(this.quizConfigData);
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