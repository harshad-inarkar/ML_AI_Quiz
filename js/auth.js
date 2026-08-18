/**
 * Handles Firebase Email/Password Authentication, Registration, and Session Management.
 */
class AuthManager {
  constructor(database) {
    this.database = database;
    this.auth = firebase.auth();
    this.userProfile = null;
    
    this.auth.onAuthStateChanged(this.handleAuthStateChange.bind(this));
  }

  /**
   * Helper function to check if the email exists in the Firebase database whitelist.
   */
  async isEmailAllowed(email) {
    try {
      const snap = await this.database.ref('allowed_admins').once('value');
      if (!snap.exists()) return false;
      
      const allowedData = snap.val();
      let allowedList = [];
      
      // Handle Firebase returning an array or an object map
      if (Array.isArray(allowedData)) {
        allowedList = allowedData;
      } else {
        allowedList = Object.values(allowedData);
      }
      
      const cleanEmail = email.trim().toLowerCase();
      return allowedList.some(e => e.toLowerCase().trim() === cleanEmail);
    } catch (error) {
      console.error("Error checking whitelist:", error);
      return false;
    }
  }

  async login(email, password) {
    if (!email || !password) return alert("Please enter both email and password.");

    const allowed = await this.isEmailAllowed(email);
    if (!allowed) return alert("Access Denied: This email is not authorized as an administrator.");

    try {
      await this.auth.signInWithEmailAndPassword(email, password);
      document.getElementById('auth-modal').style.display = 'none';
    } catch (error) {
      alert("Login Error: " + error.message);
    }
  }

  async register(email, password, rawName) {
    if (!email || !password) return alert("Please enter an email and password.");
    if (!rawName || rawName.trim() === "") return alert("Please provide a desired username for registration.");

    const allowed = await this.isEmailAllowed(email);
    if (!allowed) return alert("Access Denied: This email is not authorized to register as an administrator.");

    try {
      // 1. Create the user in Firebase Auth
      const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;

      // 2. Format and verify unique username
      let baseName = rawName.replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "_") || "Admin";
      let finalName = baseName;
      let counter = 1;
      let isUnique = false;

      while (!isUnique) {
        const snap = await this.database.ref(`usernames/${finalName}`).once('value');
        if (!snap.exists()) {
          isUnique = true;
        } else {
          finalName = `${baseName}_${counter}`;
          counter++;
        }
      }

      // 3. Save profile data to the Realtime Database with forced 'admin' role
      await this.database.ref(`users/${user.uid}`).set({
        username: finalName,
        email: user.email,
        role: "admin"
      });
      await this.database.ref(`usernames/${finalName}`).set(user.uid);

      alert("Registration successful! You are now logged in.");
      document.getElementById('auth-modal').style.display = 'none';
    } catch (error) {
      alert("Registration Error: " + error.message);
    }
  }

  async handleAuthStateChange(user) {
    const authStatus = document.getElementById('auth-status');
    const authActions = document.getElementById('auth-actions');

    if (user) {
      const profileSnap = await this.database.ref(`users/${user.uid}`).once('value');
      this.userProfile = profileSnap.val();
      
      let badge = this.userProfile?.role === 'admin' ? '<span class="admin-badge">Admin</span>' : '';
      
      authStatus.innerHTML = `Hi, <strong style="color: var(--text-primary);">${this.userProfile?.username || 'Admin'}</strong> ${badge}`;
      authActions.innerHTML = `<a href="javascript:void(0)" class="nav-link" onclick="window.authManager.logout()">Logout</a>`;
      
      if (this.userProfile?.role === 'admin') {
        document.body.classList.add('admin-mode');
      }
      
      document.dispatchEvent(new CustomEvent('auth-resolved'));
    } else {
      this.userProfile = null;
      document.body.classList.remove('admin-mode');
      
      authStatus.innerHTML = ``;
      authActions.innerHTML = `<a href="javascript:void(0)" class="nav-link" onclick="document.getElementById('auth-modal').style.display='flex'">Admin Login</a>`;
      
      document.dispatchEvent(new CustomEvent('auth-resolved'));
    }
  }

  logout() {
    this.auth.signOut().then(() => window.location.reload());
  }
}