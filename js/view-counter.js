/**
 * Tracks and displays a view counter backed by Firebase Realtime Database,
 * guarding against duplicate counts from the same browser via localStorage.
 */
class ViewCounter {
  /**
   * @param {firebase.database.Database} database Initialized Firebase database instance.
   * @param {string} refPath Database path to the counter node (e.g. "portal_views/main").
   * @param {string} storageKey localStorage key used to dedupe visits from this browser.
   * @param {string} displayElementId DOM id of the element that should show the count.
   */
  constructor(database, refPath, storageKey, displayElementId) {
    this.ref = database.ref(refPath);
    this.storageKey = storageKey;
    this.displayElementId = displayElementId;
  }

  /** Registers a single visit per browser, then keeps the display in sync. */
  track() {
    if (!localStorage.getItem(this.storageKey)) {
      this.ref.set(firebase.database.ServerValue.increment(1));
      localStorage.setItem(this.storageKey, "true");
    }

    this.ref.on("value", (snapshot) => {
      const el = document.getElementById(this.displayElementId);
      if (el) {
        el.innerText = snapshot.val() || 0;
      }
    });
  }
}
