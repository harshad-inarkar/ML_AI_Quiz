/**
 * Handles Firebase Email/Password Authentication and Session Management.
 */
class AuthManager {
  constructor(database) {
    this.database = database;
    this.auth = firebase.auth();
    this.userProfile = null;
    
    this.auth.onAuthStateChanged(this.handleAuthStateChange.bind(this));
  }

  async login(email, password) {
    if (!email || !password) {
      alert("Please enter both email and password.");
      return;
    }

    // --- ADMIN ONLY RESTRICTION ---
    // Add your exact email address here. (Keep it lowercase)
    const allowedEmails = ["harshad.inarkar@gmail.com"]; 
    
    if (!allowedEmails.includes(email.trim().toLowerCase())) {
      alert("Access Denied: Registration and login are currently restricted to administrators only.");
      return;
    }
    // ------------------------------

    try {
      // Logs the user in using their password
      await this.auth.signInWithEmailAndPassword(email, password);
      document.getElementById('auth-modal').style.display = 'none';
    } catch (error) {
      alert("Login Error: " + error.message);
    }
  }

  async handleAuthStateChange(user) {
    const authStatus = document.getElementById('auth-status');
    const authActions = document.getElementById('auth-actions');

    if (user) {
      const profileSnap = await this.database.ref(`users/${user.uid}`).once('value');
      this.userProfile = profileSnap.val();
      
      let badge = this.userProfile.role === 'admin' ? '<span class="admin-badge">Admin</span>' : '';
      
      authStatus.innerHTML = `Hi, <strong style="color: var(--text-primary);">${this.userProfile.username}</strong> ${badge}`;
      authActions.innerHTML = `<a href="javascript:void(0)" class="nav-link" onclick="window.authManager.logout()">Logout</a>`;
      
      if (this.userProfile.role === 'admin') {
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