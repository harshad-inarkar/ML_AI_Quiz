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
    const settings = await window.authManager.fetchSettings();
    const access = settings.RESOURCES_ACCESS_LEVEL || 'unrestricted';
    const user = window.authManager.userProfile;
    const verified = window.authManager.auth.currentUser?.emailVerified;

    // --- NEW: Render Discord Promo Strip ---
    this._renderDiscordPromo(settings);

    if (access !== 'unrestricted' && (!user || user.role !== 'admin')) {
        const dlBtn = document.getElementById("download-btn");
        if (dlBtn) dlBtn.style.display = "none";

        if (!user) {
            this.container.innerHTML = `<div style="text-align:center; padding:40px; background:var(--surface); border-radius:16px; border:1px solid var(--surface-border); margin-top:20px;"><h2 style="margin-top:0; color:var(--text-heading);">Unlock Study Resources</h2><p>To keep our learning community secure, please <a href="javascript:void(0)" onclick="document.getElementById('auth-modal').style.display='flex'" style="color:var(--primary-accent); text-decoration:underline;">Log in or Register</a> to view and save these materials.</p></div>`;
            document.getElementById("status-msg").style.display = "none";
            return;
        }
        if (access === 'enforce_verify_email' && !verified) {
            this.container.innerHTML = `<div style="text-align:center; padding:40px; background:var(--surface); border-radius:16px; border:1px solid var(--surface-border); margin-top:20px;"><h2 style="margin-top:0; color:var(--text-heading);">Verification Required</h2><p>For your security, please verify your email address to access study resources. <a href="javascript:void(0)" onclick="window.authManager.resendVerification()" style="color:var(--primary-accent); text-decoration:underline;">Resend Link</a></p></div>`;
            document.getElementById("status-msg").style.display = "none";
            return;
        }
    }

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
      
      const dlBtn = document.getElementById("download-btn");
      if (dlBtn) dlBtn.style.display = "flex";

      this.renderResources(snapshot.val());
    } catch (error) {
      this.showError(error.message);
    }
  }

  // --- Dynamic Discord Promo Injector ---
  _renderDiscordPromo(settings) {
    if (!settings.show_discord_promo || !window.authManager?.userProfile) return;
    if (document.getElementById('discord-promo-strip')) return;

    const headerCard = document.querySelector('.header-card');
    const h1 = headerCard?.querySelector('h1');
    if (!h1) return;

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
                <a href="${link2}" target="_blank" class="btn btn-discord-outline">Explore</a>
            </div>
        </div>
    `;
    h1.insertAdjacentHTML('beforebegin', promoHTML);
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
      this.container.innerHTML += '<p class="resource-empty-message">No resources currently available.</p>';
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
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <h2>${key}. ${group.title}</h2>
        <button class="btn btn-secondary admin-only" onclick="window.resourcesApp.openResourceModal('${key}')" style="padding: 4px 10px; font-size:12px;">Edit</button>
      </div>
      <ul class="resource-list">${listItems}</ul>
    `;
    return card;
  }

  buildInsertButton(afterKey) {
    const wrapper = document.createElement("div");
    wrapper.className = "admin-only";
    wrapper.style.cssText = "display: flex; justify-content: center; margin-top: -10px; margin-bottom: 8px; position: relative; z-index: 10;";
    
    wrapper.innerHTML = `
      <button class="btn btn-secondary btn-icon" style="border-radius: 50%; width: 28px; height: 28px; padding: 0; background: var(--surface); border: 2px solid var(--primary-accent); color: var(--primary-accent);" onclick="window.resourcesApp.openResourceModal(null, '${afterKey}')" title="Insert New Resource Here">
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
    document.getElementById('res-modal-title').innerText = editKey ? "Edit Resource Group" : (insertAfterKey ? "Insert Resource Group" : "Add Resource Group");
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

    if (resourcesList.length === 0) return alert("Please add at least one link/sub-resource.");

    const updates = {};
    const groupPayload = { title: groupTitle, resources: resourcesList };

    try {
      if (editKey) {
        updates[`configs/resources/${editKey}`] = groupPayload;
      } else if (insertAfterKey) {
        const insertPos = parseInt(insertAfterKey, 10);
        const newKey = insertPos + 1;

        const resSnap = await this.database.ref('configs/resources').once('value');
        const allRes = resSnap.val() || {};
        const keys = Object.keys(allRes).filter(k => k !== 'null').map(Number).sort((a,b) => b - a);
        
        keys.forEach(k => {
            if (k >= newKey) {
                updates[`configs/resources/${k + 1}`] = allRes[k];
                updates[`configs/resources/${k}`] = null; 
            }
        });
        updates[`configs/resources/${newKey}`] = groupPayload;

        const quizSnap = await this.database.ref('configs/index').once('value');
        const allQuizzes = quizSnap.val() || {};
        
        for (const qk of Object.keys(allQuizzes)) {
            if (allQuizzes[qk].resources_keys) {
                let updatedArray = allQuizzes[qk].resources_keys.map(oldRef => {
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
                updates[`configs/index/${qk}/resources_keys`] = updatedArray;
            } else if (this.quizKey && qk === this.quizKey) {
                updates[`configs/index/${qk}/resources_keys`] = [String(newKey)];
            }
        }
      } else {
        const targetKey = this._generateNewKey(this.resourceDataRaw);
        updates[`configs/resources/${targetKey}`] = groupPayload;

        if (this.quizKey) {
            const quizSnap = await this.database.ref(`configs/index/${this.quizKey}`).once('value');
            const quizData = quizSnap.val() || {};
            const arr = quizData.resources_keys || [];
            arr.push(targetKey);
            updates[`configs/index/${this.quizKey}/resources_keys`] = arr;
        }
      }

      await this.database.ref().update(updates);
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