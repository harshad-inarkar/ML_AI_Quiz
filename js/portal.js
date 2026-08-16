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
      <div class="action-links">
        <a href="quiz_template.html?quiz_key=${encodeURIComponent(key)}" class="btn btn-primary">Attempt Quiz</a>
        ${this.buildResourceButtonHtml(quizData)}
      </div>
    `;
    return card;
  }

  /**
   * @param {{resources_keys?: string[]}} quizData
   * @returns {string}
   */
  buildResourceButtonHtml(quizData) {
    if (!quizData.resources_keys || quizData.resources_keys.length === 0) {
      return "";
    }
    const keysQuery = quizData.resources_keys.join(",");
    return `<a href="resources_template.html?keys=${encodeURIComponent(keysQuery)}" class="btn btn-secondary">Study Resources</a>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  firebase.initializeApp(FIREBASE_CONFIG);
  new PortalApp(firebase.database()).init();
});
