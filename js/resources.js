/**
 * Controller for the study-resources page. Loads the resources config from
 * Firebase and renders either all resource groups or, when a `keys` query
 * parameter is present, only the requested groups.
 */
class ResourcesApp {
  /** @param {firebase.database.Database} database Initialized Firebase database instance. */
  constructor(database) {
    this.database = database;
    this.requestedKeys = this.parseRequestedKeys();
    this.container = document.getElementById("resources-container");
  }

  /** @returns {string[] | null} */
  parseRequestedKeys() {
    const keysParam = new URLSearchParams(window.location.search).get("keys");
    return keysParam ? keysParam.split(",").map((k) => k.trim()) : null;
  }

  /** Boots the view counter and kicks off the resources load. */
  init() {
    new ViewCounter(
      this.database,
      "portal_views/resources",
      "visited_resources_page",
      "visitor-count"
    ).track();

    this.loadResources();
  }

  /** Fetches the resources config and renders it, or shows an error. */
  async loadResources() {
    try {
      const snapshot = await this.database
        .ref("configs/resources")
        .once("value");

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
    const keysToRender = this.requestedKeys || Object.keys(data);

    if (keysToRender.length === 0) {
      this.container.innerHTML =
        '<p class="resource-empty-message">No resources found.</p>';
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
}

document.addEventListener("DOMContentLoaded", () => {
  firebase.initializeApp(FIREBASE_CONFIG);
  new ResourcesApp(firebase.database()).init();
});
