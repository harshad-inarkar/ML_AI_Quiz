class ResourcesApp {
  constructor(database) {
    this.database = database;
    this.quizKey = new URLSearchParams(window.location.search).get("quiz_key");
    this.requestedKeys = null; 
    this.quizTitle = null;     
    this.container = document.getElementById("resources-container");
    this.resourceDataRaw = {};
    
    document.getElementById('save-res-btn')?.addEventListener('click', () => this.saveResourceGroup());
  }

  init() {
    new ViewCounter(this.database, "portal_views/resources", "visited_resources_page", "visitor-count").track();
    this.database.ref("portal_downloads/resources/total").on("value", (snap) => {
      const el = document.getElementById("download-count");
      if (el) el.innerText = snap.val() || 0;
    });

    const dlBtn = document.getElementById("download-btn");
    if (dlBtn) dlBtn.addEventListener("click", () => this.downloadResources());

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
    try {
      if (this.quizKey) {
        const quizSnap = await this.database.ref(`configs/index/${this.quizKey}`).once("value");
        if (quizSnap.exists()) {
          this.quizTitle = quizSnap.val().title; 
          this.requestedKeys = quizSnap.val().resources_keys ? quizSnap.val().resources_keys.map(String) : [];
        }
      }

      const snapshot = await this.database.ref("configs/resources").once("value");
      if (!snapshot.exists()) throw new Error("Resources config not found.");
      document.getElementById("status-msg").style.display = "none";
      this.renderResources(snapshot.val());
    } catch (error) {
      this.showError(error.message);
    }
  }

  renderResources(data) {
    this.resourceDataRaw = data;
    this.container.innerHTML = "";
    const keysToRender = this.requestedKeys || Object.keys(data).filter(k => k !== 'null');

    if (keysToRender.length === 0) {
      this.container.innerHTML = '<p class="resource-empty-message">No resources currently available.</p>';
      return;
    }

    keysToRender.forEach((key) => {
      if (data[key]) this.container.appendChild(this.buildResourceCard(key, data[key]));
    });
  }

  buildResourceCard(key, group) {
    const card = document.createElement("div");
    card.className = "resource-card";
    const listItems = group.resources.map((res) => this.buildListItem(res)).filter(Boolean).join("");

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <h2>${key}. ${group.title}</h2>
        <button class="btn btn-secondary admin-only" onclick="window.resourcesApp.openResourceModal('${key}')" style="padding: 4px 10px; font-size:12px;">Edit</button>
      </div>
      <ul class="resource-list">${listItems}</ul>
    `;
    return card;
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

  // --- CMS Admin Methods ---
  openResourceModal(editKey = null) {
    const modal = document.getElementById('resource-modal');
    document.getElementById('res-modal-title').innerText = editKey ? "Edit Resource Group" : "Add Resource Group";
    document.getElementById('res-edit-key').value = editKey || "";
    const subContainer = document.getElementById('sub-resources-container');
    subContainer.innerHTML = "";

    if (editKey && this.resourceDataRaw[editKey]) {
      document.getElementById('cms-res-title').value = this.resourceDataRaw[editKey].title;
      this.resourceDataRaw[editKey].resources.forEach(res => this.addSubResourceRow(res));
    } else {
      document.getElementById('cms-res-title').value = "";
      this.addSubResourceRow(); // Add one blank row by default
    }
    
    modal.style.display = 'flex';
  }

  addSubResourceRow(data = {title: "", desc: "", link: ""}) {
    const container = document.getElementById('sub-resources-container');
    const row = document.createElement('div');
    row.style.cssText = "background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid var(--surface-border); position: relative;";
    row.innerHTML = `
      <button type="button" onclick="this.parentElement.remove()" style="position:absolute; right:10px; top:10px; background:transparent; border:none; color:var(--red-text); cursor:pointer; font-weight:bold;">X</button>
      <div class="form-group" style="margin-bottom:8px;"><label>Bullet Title</label><input type="text" class="sub-title" value="${data.title || ''}"></div>
      <div class="form-group" style="margin-bottom:8px;"><label>Link Text (Description)</label><input type="text" class="sub-desc" value="${data.desc || ''}"></div>
      <div class="form-group" style="margin-bottom:0;"><label>URL Link</label><input type="text" class="sub-link" value="${data.link || ''}"></div>
    `;
    container.appendChild(row);
  }

  _generateNewKey(dataset) {
    const existingKeys = Object.keys(dataset).filter(k => k !== 'null').map(Number);
    return existingKeys.length > 0 ? String(Math.max(...existingKeys) + 1) : "1";
  }

  async saveResourceGroup() {
    const key = document.getElementById('res-edit-key').value;
    const groupTitle = document.getElementById('cms-res-title').value;
    if (!groupTitle) return alert("Group Title is required.");

    const resourcesList = Array.from(document.getElementById('sub-resources-container').children)
      .map(row => ({
          title: row.querySelector('.sub-title').value.trim(),
          desc: row.querySelector('.sub-desc').value.trim(),
          link: row.querySelector('.sub-link').value.trim()
      }))
      .filter(res => res.title || res.desc || res.link);

    if (resourcesList.length === 0) return alert("Please add at least one link/sub-resource.");

    const targetKey = key || this._generateNewKey(this.resourceDataRaw);

    try {
      await this.database.ref(`configs/resources/${targetKey}`).set({ title: groupTitle, resources: resourcesList });
      alert("Resource Group saved successfully!");
      document.getElementById('resource-modal').style.display = 'none';
      this.loadResources();
    } catch (e) {
      alert("Error saving resource: " + e.message);
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
      if (this.quizTitle) {
        a.download = `resources_${this.quizTitle.replace(/[^a-z0-9]+/gi, ' ').trim().replace(/\s+/g, '_').toLowerCase()}_offline.html`;
      } else {
        a.download = `study_resources_full_offline.html`;
      }
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      this.database.ref("portal_downloads/resources/total").set(firebase.database.ServerValue.increment(1));
    } catch (e) { alert("Failed to download resources."); } finally { btn.innerHTML = originalHtml; btn.disabled = false; }
  }

  generateOfflineResourcesHtml(data) {
    const keysToRender = this.requestedKeys || Object.keys(data).filter(k=>k!=='null');
    const contentHtml = keysToRender.map(key => {
      const group = data[key];
      if (!group) return "";
      const listItems = group.resources.map(res => this.buildListItem(res)).filter(Boolean).join("");
      return `<div class="card"><h2>${key}. ${group.title}</h2><ul>${listItems}</ul></div>`;
    }).join("");
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Study Resources - Offline</title><style>body { font-family: 'Arial', sans-serif; background-color: #000; color: #cbd5e1; margin: 0; padding: 40px 20px; display: flex; justify-content: center; line-height: 1.6; }.container { max-width: 640px; width: 100%; }.header { background: #0b1517; padding: 30px; border-radius: 16px; border: 1px solid #1a2f33; margin-bottom: 24px; text-align: center; border-top: 5px solid #4a7c7b; }h1 { margin: 0 0 10px 0; font-size: 24px; color: #e2e8f0; }.card { background: #0b1517; padding: 24px; border-radius: 16px; border: 1px solid #1a2f33; border-left: 4px solid #4a7c7b; margin-bottom: 20px; }h2 { margin: 0 0 16px 0; font-size: 18px; color: #e2e8f0; }ul { margin: 0; padding-left: 22px; }li { margin-bottom: 12px; }a { color: #6da4a3; text-decoration: underline; text-underline-offset: 3px; }a:hover { color: #e2e8f0; text-decoration-color: #6da4a3; }</style></head><body><div class="container"><div class="header"><h1>Study Resources</h1><p style="margin: 0; color: #94a3b8;">Offline Reference Copy</p></div>${contentHtml}</div></body></html>`;
  }
}

bootstrapApp(ResourcesApp, (app) => { window.resourcesApp = app; });