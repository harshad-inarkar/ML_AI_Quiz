/**
 * Utility to generate the next highest numerical key for Firebase records.
 */
function generateNewDatabaseKey(dataset) {
    const existingKeys = Object.keys(dataset).filter(k => k !== 'null').map(Number);
    return existingKeys.length > 0 ? String(Math.max(...existingKeys) + 1) : "1";
}

/**
 * Boots the given page-controller class once the DOM is ready. Firebase and
 * App Check are already initialized by firebase-config.js / app-check.js,
 * loaded earlier in the page.
 *
 * @param {new (database: firebase.database.Database) => {init: () => void}} AppClass
 * @param {(app: object) => void} [onReady] Optional callback receiving the
 *   constructed instance, for pages that need a module-level reference
 *   (e.g. an inline `onclick` handler calling back into the app).
 */
function bootstrapApp(AppClass, onReady) {
  document.addEventListener("DOMContentLoaded", () => {
    // Initialize Auth globally
    window.authManager = new AuthManager(firebase.database());
    
    const app = new AppClass(firebase.database());
    app.init();
    if (onReady) {
      onReady(app);
    }
  });
}