/**
 * Global configuration flag.
 * Set to true to display Total Views in the HTML.
 * Set to false to display Unique Views in the HTML.
 * Both metrics will always be tracked in the database regardless of this setting.
 */
const SHOW_TOTAL_VIEWS = true;

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
    this.baseRef = database.ref(refPath);
    
    // Sub-nodes for total and unique tracking
    this.totalRef = this.baseRef.child("total");
    this.uniqueRef = this.baseRef.child("unique");
    
    this.storageKey = storageKey;
    this.displayElementId = displayElementId;
  }

  /** Registers the visits and keeps the display in sync. */
  track() {
    // 1. Always increment total views on every page load
    this.totalRef.set(firebase.database.ServerValue.increment(1));

    // 2. Increment unique views ONLY if this browser hasn't visited before
    if (!localStorage.getItem(this.storageKey)) {
      this.uniqueRef.set(firebase.database.ServerValue.increment(1));
      localStorage.setItem(this.storageKey, "true");
    }

    // 3. Listen to the appropriate reference based on the global flag
    const displayRef = SHOW_TOTAL_VIEWS ? this.totalRef : this.uniqueRef;

    displayRef.on("value", (snapshot) => {
      const el = document.getElementById(this.displayElementId);
      if (el) {
        el.innerText = snapshot.val() || 0;
      }
    });
  }
}