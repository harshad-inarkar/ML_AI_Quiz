/**
 * Global configuration flag.
 * Set to true to display Total Views.
 * Set to false to display Unique Views.
 */
const SHOW_TOTAL_VIEWS = true;

/**
 * Tracks and displays a view counter backed by Firebase Realtime Database,
 * guarding against duplicate counts from the same browser via localStorage.
 * Now supports tracking both total (every load) and unique (first load) visits.
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
    
    // Create sub-nodes for total and unique tracking under the main path
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
        
        // Dynamically update the text label to reflect what is being shown
        const parent = el.parentElement;
        if (parent) {
          const textNode = Array.from(parent.childNodes).find(
            n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().toLowerCase().includes("views")
          );
          if (textNode) {
            textNode.textContent = SHOW_TOTAL_VIEWS ? "Total Views: " : "Unique Views: ";
          }
        }
      }
    });
  }
}