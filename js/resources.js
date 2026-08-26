class ResourcesApp {
  constructor(database) {
    this.database = database;
    
    // --- NEW: Dynamic Routing Logic ---
    const urlParams = new URLSearchParams(window.location.search);
    this.quizKey = urlParams.get("quiz_key");
    this.type = urlParams.get("type") === 'notebook' ? 'notebook' : 'standard';
    
    this.dbPath = this.type === 'notebook' ? 'configs/resources_notebooks' : 'configs/resources';
    this.quizKeyField = this.type === 'notebook' ? 'notebooks_keys' : 'resources_keys';
    this.pageTitleName = this.type === 'notebook' ? 'Practice Notebooks' : 'Study Resources';
    
    this.requestedKeys = null; 
    this.quizTitle = null;     
    this.container = document.getElementById("resources-container");
    this.resourceDataRaw = {};
    
    document.getElementById('save-res-btn')?.addEventListener('click', () => this.saveResourceGroup());
  }

  init() {
    // Dynamically update Tracking Paths
    const viewsPath = this.type === 'notebook' ? "portal_views/notebooks" : "portal_views/resources";
    const dlPath = this.type === 'notebook' ? "portal_downloads/notebooks/total" : "portal_downloads/resources/total";
    const viewsKey = this.type === 'notebook' ? "visited_notebooks_page" : "visited_resources_page";

    new ViewCounter(this.database, viewsPath, viewsKey, "visitor-count").track();
    this.database.ref(dlPath).on("value", (snap) => {
      const el = document.getElementById("download-count");
      if (el) el.innerText = snap.val() || 0;
    });

    const dlBtn = document.getElementById("download-btn");
    if (dlBtn) dlBtn.addEventListener("click", () => this.downloadResources());

    // Dynamically update DOM Text
    document.title = this.pageTitleName;
    const h1 = document.querySelector('.header-card h1');
    if (h1) h1.innerText = this.pageTitleName;

    const descParams = this.type === 'notebook' 
        ? "Access interactive Jupyter Notebooks in Google Colab." 
        : "Review the materials below to assist with your learning.";
    const pList = document.querySelectorAll('.header-card p');
    pList.forEach(p => {
        if (p.innerText.includes("Review the materials")) p.innerText = descParams;
    });

    // Change "Practice Quizzes" redirect based on context
    if (dlBtn && dlBtn.parentElement && !document.getElementById('practice-quizzes-btn')) {
        const practiceBtn = document.createElement("a");
        practiceBtn.id = "practice-quizzes-btn";
        practiceBtn.href = "index.html";
        practiceBtn.className = "btn btn-secondary";
        practiceBtn.innerText = "Practice Quizzes";
        dlBtn.parentElement.insertBefore(practiceBtn, dlBtn.parentElement.firstChild);
    }

    this.dataLoaded = false;

    document.addEventListener('auth-resolved', () => {
        if (!this.dataLoaded) {
            this.loadResources();
            this.dataLoaded = true;
        } else {
            this.renderResources(this.resourceDataRaw);
        }
    });
  }

  async loadResources() {
    const settings = await window.authManager.fetchSettings();
    const access = settings.RESOURCES_ACCESS_LEVEL || 'unrestricted';
    const user = window.authManager.userProfile;
    const verified = window.authManager.auth.currentUser?.emailVerified;

    window.authManager.injectDiscordPromo(settings);

    if (access !== 'unrestricted' && (!user || user.role !== 'admin')) {
        const dlBtn = document.getElementById("download-btn");
        if (dlBtn) dlBtn.style.display = "none";

        if (!user) {
            this.container.innerHTML = window.authManager.generateRestrictedHTML(this.pageTitleName, "login");
            document.getElementById("status-msg").style.display = "none";
            return;
        }
        if (access === 'enforce_verify_email' && !verified) {
            this.container.innerHTML = window.authManager.generateRestrictedHTML(this.pageTitleName, "verify");
            document.getElementById("status-msg").style.display = "none";
            return;
        }
    }

    try {
      if (this.quizKey) {
        const quizSnap = await this.database.ref(`configs/index/${this.quizKey}`).once("value");
        if (quizSnap.exists()) {
          this.quizTitle = quizSnap.val().title; 
          const keyArray = quizSnap.val()[this.quizKeyField];
          this.requestedKeys = keyArray ? keyArray.map(String) : [];
        }
      }

      const snapshot = await this.database.ref(this.dbPath).once("value");
      if (!snapshot.exists()) throw new Error(`${this.pageTitleName} config not found in database.`);
      document.getElementById("status-msg").style.display = "none";
      
      const dlBtn = document.getElementById("download-btn");
      if (dlBtn) dlBtn.style.display = "flex";

      this.renderResources(snapshot.val());
    } catch (error) {
      this.showError(error.message);
    }
  }

  renderResources(data) {
    this.resourceDataRaw = data;
    this.container.innerHTML = "";
    const keysToRender = this.requestedKeys || Object.keys(data).filter(k => k !== 'null');

    const isAdmin = window.authManager && window.authManager.userProfile && window.authManager.userProfile.role === 'admin';

    if (isAdmin) {
        this.container.appendChild(this.buildInsertButton("0"));
    }

    if (keysToRender.length === 0) {
      this.container.innerHTML += `<p class="resource-empty-message">No ${this.pageTitleName.toLowerCase()} currently available.</p>`;
      return;
    }

    keysToRender.forEach((key) => {
      if (data[key]) {
          this.container.appendChild(this.buildResourceCard(key, data[key]));
          if (isAdmin) {
              this.container.appendChild(this.buildInsertButton(key));
          }
      }
    });
  }

  buildResourceCard(key, group) {
    const card = document.createElement("div");
    card.className = "resource-card";
    const listItems = group.resources.map((res) => this.buildListItem(res)).filter(Boolean).join("");

    card.innerHTML = `
      <div class="card-header-flex">
        <h2>${key}. ${group.title}</h2>
        <button class="btn btn-secondary btn-small admin-only" onclick="window.resourcesApp.openResourceModal('${key}')">Edit</button>
      </div>
      <ul class="resource-list">${listItems}</ul>
    `;
    return card;
  }

  buildInsertButton(afterKey) {
    const wrapper = document.createElement("div");
    wrapper.className = "insert-btn-wrapper admin-only";
    
    wrapper.innerHTML = `
      <button class="btn btn-secondary btn-icon btn-circle" onclick="window.resourcesApp.openResourceModal(null, '${afterKey}')" title="Insert New Entry Here">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    `;
    return wrapper;
  }

  buildListItem(res) {
    let linkArea = "";
    if (res.desc && res.link) linkArea = `<a href="${res.link}" target="_blank">${res.desc}</a>`;
    else if (res.link) linkArea = `<a href="${res.link}" target="_blank">${res.link}</a>`;
    else if (res.desc) linkArea = `<span>${res.desc}</span>`;
    
    if (res.title && linkArea) return `<li><strong>${res.title}</strong> : ${linkArea}</li>`;
    if (res.title) return `<li><strong>${res.title}</strong></li>`;
    if (linkArea) return `<li>${linkArea}</li>`;
    return "";
  }

  showError(message) {
    document.getElementById("status-msg").style.display = "none";
    document.getElementById("error-container").style.display = "block";
    document.getElementById("error-container").innerHTML = `<strong>Error:</strong><br>${message}`;
  }

  openResourceModal(editKey = null, insertAfterKey = null) {
    const modal = document.getElementById('resource-modal');
    document.getElementById('res-modal-title').innerText = editKey ? `Edit ${this.pageTitleName}` : (insertAfterKey ? `Insert ${this.pageTitleName}` : `Add ${this.pageTitleName}`);
    document.getElementById('res-edit-key').value = editKey || "";
    
    let insertNode = document.getElementById('res-insert-key');
    if (!insertNode) {
        insertNode = document.createElement('input');
        insertNode.type = 'hidden';
        insertNode.id = 'res-insert-key';
        document.getElementById('resource-modal').appendChild(insertNode);
    }
    insertNode.value = insertAfterKey || "";

    const subContainer = document.getElementById('sub-resources-container');
    subContainer.innerHTML = "";

    if (editKey && this.resourceDataRaw[editKey]) {
      document.getElementById('cms-res-title').value = this.resourceDataRaw[editKey].title;
      this.resourceDataRaw[editKey].resources.forEach(res => this.addSubResourceRow(res));
    } else {
      document.getElementById('cms-res-title').value = "";
      this.addSubResourceRow(); 
    }
    
    modal.style.display = 'flex';
  }

  addSubResourceRow(data = {title: "", desc: "", link: ""}) {
    const container = document.getElementById('sub-resources-container');
    const row = document.createElement('div');
    row.className = "cms-row";
    row.innerHTML = `
      <button type="button" class="btn-close-row" onclick="this.parentElement.remove()">X</button>
      <div class="form-group form-group-sm"><label>Bullet Title</label><input type="text" class="sub-title" value="${data.title || ''}"></div>
      <div class="form-group form-group-sm"><label>Link Text (Description)</label><input type="text" class="sub-desc" value="${data.desc || ''}"></div>
      <div class="form-group"><label>URL Link</label><input type="text" class="sub-link" value="${data.link || ''}"></div>
    `;
    container.appendChild(row);
  }

  async saveResourceGroup() {
    const editKey = document.getElementById('res-edit-key').value;
    const insertAfterKey = document.getElementById('res-insert-key')?.value;
    const groupTitle = document.getElementById('cms-res-title').value;
    if (!groupTitle) return alert("Group Title is required.");

    const resourcesList = Array.from(document.getElementById('sub-resources-container').children)
      .map(row => ({
          title: row.querySelector('.sub-title').value.trim(),
          desc: row.querySelector('.sub-desc').value.trim(),
          link: row.querySelector('.sub-link').value.trim()
      }))
      .filter(res => res.title || res.desc || res.link);

    if (resourcesList.length === 0) return alert("Please add at least one link/entry.");

    const updates = {};
    const groupPayload = { title: groupTitle, resources: resourcesList };

    try {
      if (editKey) {
        updates[`${this.dbPath}/${editKey}`] = groupPayload;
      } else if (insertAfterKey) {
        const insertPos = parseInt(insertAfterKey, 10);
        const newKey = insertPos + 1;

        const resSnap = await this.database.ref(this.dbPath).once('value');
        const allRes = resSnap.val() || {};
        const keys = Object.keys(allRes).filter(k => k !== 'null').map(Number).sort((a,b) => b - a);
        
        keys.forEach(k => {
            if (k >= newKey) {
                updates[`${this.dbPath}/${k + 1}`] = allRes[k];
                updates[`${this.dbPath}/${k}`] = null; 
            }
        });
        updates[`${this.dbPath}/${newKey}`] = groupPayload;

        const quizSnap = await this.database.ref('configs/index').once('value');
        const allQuizzes = quizSnap.val() || {};
        
        for (const qk of Object.keys(allQuizzes)) {
            if (allQuizzes[qk][this.quizKeyField]) {
                let updatedArray = allQuizzes[qk][this.quizKeyField].map(oldRef => {
                    const refNum = parseInt(oldRef, 10);
                    return refNum >= newKey ? String(refNum + 1) : oldRef;
                });
                
                if (this.quizKey && qk === this.quizKey) {
                    const idx = updatedArray.indexOf(String(insertAfterKey));
                    if (idx !== -1) {
                        updatedArray.splice(idx + 1, 0, String(newKey));
                    } else if (insertAfterKey === "0") {
                        updatedArray.unshift(String(newKey));
                    }
                }
                updates[`configs/index/${qk}/${this.quizKeyField}`] = updatedArray;
            } else if (this.quizKey && qk === this.quizKey) {
                updates[`configs/index/${qk}/${this.quizKeyField}`] = [String(newKey)];
            }
        }
      } else {
        const targetKey = window.generateNewDatabaseKey(this.resourceDataRaw);
        updates[`${this.dbPath}/${targetKey}`] = groupPayload;

        if (this.quizKey) {
            const quizSnap = await this.database.ref(`configs/index/${this.quizKey}`).once('value');
            const quizData = quizSnap.val() || {};
            const arr = quizData[this.quizKeyField] || [];
            arr.push(targetKey);
            updates[`configs/index/${this.quizKey}/${this.quizKeyField}`] = arr;
        }
      }

      await this.database.ref().update(updates);
      alert("Saved successfully!");
      document.getElementById('resource-modal').style.display = 'none';
      this.loadResources();
    } catch (e) {
      alert("Error saving data: " + e.message);
    }
  }

  downloadResources() {
    if (!this.resourceDataRaw) return;
    const btn = document.getElementById("download-btn");
    const originalHtml = btn.innerHTML;
    btn.innerText = "Saving..."; btn.disabled = true;
    try {
      const htmlString = this.generateOfflineResourcesHtml(this.resourceDataRaw);
      const blob = new Blob([htmlString], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      const filePrefix = this.type === 'notebook' ? 'notebooks_' : 'resources_';
      if (this.quizTitle) {
        a.download = `${filePrefix}${this.quizTitle.replace(/[^a-z0-9]+/gi, ' ').trim().replace(/\s+/g, '_').toLowerCase()}_offline.html`;
      } else {
        a.download = `${filePrefix}full_offline.html`;
      }
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      
      const dlPath = this.type === 'notebook' ? "portal_downloads/notebooks/total" : "portal_downloads/resources/total";
      this.database.ref(dlPath).set(firebase.database.ServerValue.increment(1));
    } catch (e) { alert("Failed to download."); } finally { btn.innerHTML = originalHtml; btn.disabled = false; }
  }

  generateOfflineResourcesHtml(data) {
    const keysToRender = this.requestedKeys || Object.keys(data).filter(k=>k!=='null');
    const contentHtml = keysToRender.map(key => {
      const group = data[key];
      if (!group) return "";
      const listItems = group.resources.map(res => this.buildListItem(res)).filter(Boolean).join("");
      return `<div class="card"><h2>${key}. ${group.title}</h2><ul>${listItems}</ul></div>`;
    }).join("");
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${this.pageTitleName} - Offline</title><style>body { font-family: 'Arial', sans-serif; background-color: #000; color: #cbd5e1; margin: 0; padding: 40px 20px; display: flex; justify-content: center; line-height: 1.6; }.container { max-width: 640px; width: 100%; }.header { background: #0b1517; padding: 30px; border-radius: 16px; border: 1px solid #1a2f33; margin-bottom: 24px; text-align: center; border-top: 5px solid #4a7c7b; }h1 { margin: 0 0 10px 0; font-size: 24px; color: #e2e8f0; }.card { background: #0b1517; padding: 24px; border-radius: 16px; border: 1px solid #1a2f33; border-left: 4px solid #4a7c7b; margin-bottom: 20px; }h2 { margin: 0 0 16px 0; font-size: 18px; color: #e2e8f0; }ul { margin: 0; padding-left: 22px; }li { margin-bottom: 12px; }a { color: #6da4a3; text-decoration: underline; text-underline-offset: 3px; }a:hover { color: #e2e8f0; text-decoration-color: #6da4a3; }</style></head><body><div class="container"><div class="header"><h1>${this.pageTitleName}</h1><p style="margin: 0; color: #94a3b8;">Offline Reference Copy</p></div>${contentHtml}</div></body></html>`;
  }
}

bootstrapApp(ResourcesApp, (app) => { window.resourcesApp = app; });