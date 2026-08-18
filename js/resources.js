/**
 * Controller for the study-resources page. Loads the resources config from
 * Firebase and renders either all resource groups or, when a `quiz_key` query
 * parameter is present, only the requested groups associated with that quiz.
 */
class ResourcesApp {
  /** @param {firebase.database.Database} database Initialized Firebase database instance. */
  constructor(database) {
    this.database = database;
    this.quizKey = new URLSearchParams(window.location.search).get("quiz_key");
    this.requestedKeys = null; // Will dynamically resolve if quizKey is present
    this.container = document.getElementById("resources-container");
    this.resourceDataRaw = null;
  }

  /** Boots the view counter and kicks off the resources load. */
  init() {
    new ViewCounter(
      this.database,
      "portal_views/resources",
      "visited_resources_page",
      "visitor-count"
    ).track();

    // Listen to real-time download counts
    this.database.ref("portal_downloads/resources/total").on("value", (snap) => {
      const el = document.getElementById("download-count");
      if (el) el.innerText = snap.val() || 0;
    });

    const dlBtn = document.getElementById("download-btn");
    if (dlBtn) {
      dlBtn.addEventListener("click", () => this.downloadResources());
    }

    this.loadResources();
  }

  /** Fetches the resources config and renders it, or shows an error. */
  async loadResources() {
    try {
      // 1. If we arrived via a specific quiz, find out which resources it utilizes
      if (this.quizKey) {
        const quizSnap = await this.database.ref(`configs/index/${this.quizKey}`).once("value");
        if (quizSnap.exists() && quizSnap.val().resources_keys) {
          this.requestedKeys = quizSnap.val().resources_keys.map(String);
        } else {
          this.requestedKeys = []; // Quiz exists but has no mapped resources
        }
      }

      // 2. Fetch the entire resource configuration map
      const snapshot = await this.database.ref("configs/resources").once("value");
      if (!snapshot.exists()) {
        throw new Error("Resources config not found in Firebase.");
      }

      document.getElementById("status-msg").style.display = "none";
      this.renderResources(snapshot.val());
    } catch (error) {
      this.showError(error.message);
      console.error(error);
    }
  }

  /** @param {Object<string, {title: string, resources: Array<Object>}>} data */
  renderResources(data) {
    this.resourceDataRaw = data;
    const keysToRender = this.requestedKeys || Object.keys(data);

    if (keysToRender.length === 0) {
      this.container.innerHTML =
        '<p class="resource-empty-message">No resources currently available for this quiz.</p>';
      return;
    }

    keysToRender.forEach((key) => {
      const group = data[key];
      if (!group) {
        return;
      }
      this.container.appendChild(this.buildResourceCard(key, group));
    });

    if (this.container.innerHTML.trim() === "") {
      this.container.innerHTML =
        '<p class="resource-empty-message">Requested resources could not be found.</p>';
    }
  }

  /**
   * @param {string} key
   * @param {{title: string, resources: Array<Object>}} group
   * @returns {HTMLDivElement}
   */
  buildResourceCard(key, group) {
    const card = document.createElement("div");
    card.className = "resource-card";

    const listItems = group.resources
      .map((res) => this.buildListItem(res))
      .filter(Boolean)
      .join("");

    card.innerHTML = `
      <h2>${key}. ${group.title}</h2>
      <ul class="resource-list">${listItems}</ul>
    `;
    return card;
  }

  /**
   * @param {{title?: string, desc?: string, link?: string}} res
   * @returns {string}
   */
  buildListItem(res) {
    const linkArea = this.buildLinkArea(res);
    let itemHtml = "";

    if (res.title && linkArea) {
      itemHtml = `<strong>${res.title}</strong> : ${linkArea}`;
    } else if (res.title) {
      itemHtml = `<strong>${res.title}</strong>`;
    } else if (linkArea) {
      itemHtml = linkArea;
    }

    return itemHtml ? `<li>${itemHtml}</li>` : "";
  }

  /**
   * @param {{desc?: string, link?: string}} res
   * @returns {string}
   */
  buildLinkArea(res) {
    if (res.desc && res.link) {
      return `<a href="${res.link}" target="_blank" rel="noopener noreferrer">${res.desc}</a>`;
    }
    if (res.link) {
      return `<a href="${res.link}" target="_blank" rel="noopener noreferrer">${res.link}</a>`;
    }
    if (res.desc) {
      return `<span>${res.desc}</span>`;
    }
    return "";
  }

  /** @param {string} message */
  showError(message) {
    document.getElementById("status-msg").style.display = "none";
    const errorBox = document.getElementById("error-container");
    errorBox.style.display = "block";
    errorBox.innerHTML = `<strong>Error Loading Resources:</strong><br>${message}`;
  }

  /**
   * Generates a self-contained HTML page of the resources and triggers a download.
   */
  downloadResources() {
    if (!this.resourceDataRaw) return;
    
    const btn = document.getElementById("download-btn");
    const originalHtml = btn.innerHTML;
    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
      const htmlString = this.generateOfflineResourcesHtml(this.resourceDataRaw);
      const blob = new Blob([htmlString], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      
      a.href = url;
      // Assign contextual file name
      if (this.quizKey) {
        a.download = `resources_quiz_${this.quizKey}_offline.html`;
      } else {
        a.download = `study_resources_full_offline.html`;
      }

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.database.ref("portal_downloads/resources/total").set(firebase.database.ServerValue.increment(1));
    } catch (e) {
      console.error("Failed to generate download", e);
      alert("Failed to download resources.");
    } finally {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }

  generateOfflineResourcesHtml(data) {
    const keysToRender = this.requestedKeys || Object.keys(data);
    
    const contentHtml = keysToRender.map(key => {
      const group = data[key];
      if (!group) return "";
      const listItems = group.resources.map(res => this.buildListItem(res)).filter(Boolean).join("");
      return `<div class="card">
          <h2>${key}. ${group.title}</h2>
          <ul>${listItems}</ul>
      </div>`;
    }).join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Study Resources - Offline</title>
<style>
  body { font-family: 'Arial', sans-serif; background-color: #000; color: #cbd5e1; margin: 0; padding: 40px 20px; display: flex; justify-content: center; line-height: 1.6; }
  .container { max-width: 640px; width: 100%; }
  .header { background: #0b1517; padding: 30px; border-radius: 16px; border: 1px solid #1a2f33; margin-bottom: 24px; text-align: center; border-top: 5px solid #4a7c7b; }
  h1 { margin: 0 0 10px 0; font-size: 24px; color: #e2e8f0; }
  .card { background: #0b1517; padding: 24px; border-radius: 16px; border: 1px solid #1a2f33; border-left: 4px solid #4a7c7b; margin-bottom: 20px; }
  h2 { margin: 0 0 16px 0; font-size: 18px; color: #e2e8f0; }
  ul { margin: 0; padding-left: 22px; }
  li { margin-bottom: 12px; }
  a { color: #6da4a3; text-decoration: underline; text-underline-offset: 3px; }
  a:hover { color: #e2e8f0; text-decoration-color: #6da4a3; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Study Resources</h1>
    <p style="margin: 0; color: #94a3b8;">Offline Reference Copy</p>
  </div>
  ${contentHtml}
</div>
</body>
</html>`;
  }
}

bootstrapApp(ResourcesApp);