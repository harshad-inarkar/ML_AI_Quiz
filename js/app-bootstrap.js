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
    const app = new AppClass(firebase.database());
    app.init();
    if (onReady) {
      onReady(app);
    }
  });
}
