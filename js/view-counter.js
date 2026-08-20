/**
 * Tracks and displays a view counter backed by Firebase Realtime Database,
 * guarding against duplicate counts from the same browser via localStorage.
 */
class ViewCounter {
  constructor(database, refPath, storageKey, displayElementId) {
    this.database = database;
    this.baseRef = database.ref(refPath);
    this.totalRef = this.baseRef.child("total");
    this.uniqueRef = this.baseRef.child("unique");
    this.storageKey = storageKey;
    this.displayElementId = displayElementId;
  }

  async track() {
    // 1. Always increment total views on every page load
    this.totalRef.set(firebase.database.ServerValue.increment(1));

    // 2. Increment unique views ONLY if this browser hasn't visited before
    if (!localStorage.getItem(this.storageKey)) {
      this.uniqueRef.set(firebase.database.ServerValue.increment(1));
      localStorage.setItem(this.storageKey, "true");
    }

    // 3. Fetch the configuration flag dynamically from the database
    let showTotal = true; // Fallback default
    try {
      const snap = await this.database.ref('settings/SHOW_TOTAL_VIEWS').once('value');
      if (snap.exists()) {
        showTotal = snap.val();
      }
    } catch (e) {
      console.error("Failed to fetch view settings:", e);
    }

    // 4. Listen to the appropriate reference
    const displayRef = showTotal ? this.totalRef : this.uniqueRef;

    displayRef.on("value", (snapshot) => {
      const el = document.getElementById(this.displayElementId);
      if (el) {
        el.innerText = snapshot.val() || 0;
      }
    });
  }
}