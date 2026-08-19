/**
 * Handles Firebase Email/Password Authentication, Registration, Session Management,
 * Password Resets, and dynamically injects the Auth UI Modal.
 */
class AuthManager {
  constructor(database) {
    this.database = database;
    this.auth = firebase.auth();
    this.userProfile = null;
    
    // Inject the Modal HTML directly into the page
    this.injectAuthModal();
    
    this.auth.onAuthStateChanged(this.handleAuthStateChange.bind(this));
  }

  /**
   * Injects the Auth Modal UI into the DOM.
   */
  injectAuthModal() {
    if (document.getElementById('auth-modal')) return;

    const modalHTML = `
      <div id="auth-modal" class="modal-overlay">
          <div class="modal-content">
              
              <div class="auth-tabs" id="auth-tabs-header">
                  <div class="auth-tab active" id="tab-btn-login" onclick="window.authManager.switchTab('login')">Login</div>
                  <div class="auth-tab" id="tab-btn-register" onclick="window.authManager.switchTab('register')">Register</div>
              </div>

              <!-- LOGIN TAB -->
              <div id="tab-login" class="auth-form-section active">
                  <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">Restricted to authorized administrators only.</p>
                  <div class="form-group"><label>Email Address</label><input type="email" id="login-email" placeholder="admin@email.com"></div>
                  <div class="form-group">
                      <div style="display: flex; justify-content: space-between;">
                          <label>Password</label>
                          <a href="javascript:void(0)" onclick="window.authManager.switchTab('reset')" style="font-size: 12px; color: var(--primary-accent); text-decoration: none;">Forgot Password?</a>
                      </div>
                      <input type="password" id="login-password" placeholder="********">
                  </div>
                  <div class="form-actions">
                      <button class="btn btn-secondary" onclick="document.getElementById('auth-modal').style.display='none'">Cancel</button>
                      <button class="btn btn-primary" onclick="window.authManager.login(document.getElementById('login-email').value, document.getElementById('login-password').value)">Login</button>
                  </div>
              </div>

              <!-- REGISTER TAB -->
              <div id="tab-register" class="auth-form-section">
                  <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">Your email must be whitelisted in the database to register.</p>
                  <div class="form-group"><label>Desired Username</label><input type="text" id="reg-username" placeholder="e.g. JohnDoe"></div>
                  <div class="form-group"><label>Email Address</label><input type="email" id="reg-email" placeholder="admin@email.com"></div>
                  <div class="form-group"><label>Password</label><input type="password" id="reg-password" placeholder="********"></div>
                  <div class="form-actions">
                      <button class="btn btn-secondary" onclick="document.getElementById('auth-modal').style.display='none'">Cancel</button>
                      <button class="btn btn-primary" onclick="window.authManager.register(document.getElementById('reg-email').value, document.getElementById('reg-password').value, document.getElementById('reg-username').value)">Register Admin</button>
                  </div>
              </div>

              <!-- RESET PASSWORD TAB (Hidden by default) -->
              <div id="tab-reset" class="auth-form-section">
                  <h3 style="margin-top: 0; margin-bottom: 10px;">Reset Password</h3>
                  <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">Enter your registered email address to receive a secure password reset link.</p>
                  <div class="form-group"><label>Email Address</label><input type="email" id="reset-email" placeholder="admin@email.com"></div>
                  <div class="form-actions">
                      <button class="btn btn-secondary" onclick="window.authManager.switchTab('login')">Back to Login</button>
                      <button class="btn btn-primary" onclick="window.authManager.resetPassword(document.getElementById('reset-email').value)">Send Reset Link</button>
                  </div>
              </div>

          </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  /**
   * Switches the UI between Login, Register, and Reset tabs.
   */
  switchTab(tabName) {
    // Hide all sections
    ['login', 'register', 'reset'].forEach(name => {
      const el = document.getElementById(`tab-${name}`);
      if(el) el.classList.remove('active');
    });

    // Reset Top Tabs
    document.getElementById('tab-btn-login').classList.remove('active');
    document.getElementById('tab-btn-register').classList.remove('active');

    // If it's Login or Register, highlight the top tab button and show the tabs header
    if (tabName === 'login' || tabName === 'register') {
      document.getElementById(`tab-btn-${tabName}`).classList.add('active');
      document.getElementById('auth-tabs-header').style.display = 'flex';
    } else {
      // Hide the top tabs header when viewing the Reset Password screen
      document.getElementById('auth-tabs-header').style.display = 'none';
    }

    // Activate the requested section
    document.getElementById(`tab-${tabName}`).classList.add('active');
  }

  async isEmailAllowed(email) {
    try {
      const snap = await this.database.ref('allowed_admins').once('value');
      if (!snap.exists()) return false;
      
      const allowedData = snap.val();
      let allowedList = Array.isArray(allowedData) ? allowedData : Object.values(allowedData);
      
      const cleanEmail = email.trim().toLowerCase();
      return allowedList.some(e => e.toLowerCase().trim() === cleanEmail);
    } catch (error) {
      console.error("Error checking whitelist:", error);
      return false;
    }
  }

  async login(email, password) {
    if (!email || !password) return alert("Please enter both email and password.");

    try {
      const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
      
      if (!userCredential.user.emailVerified) {
        await this.auth.signOut();
        return alert("Access Denied: You must verify your email address first. Please check your inbox for the verification link.");
      }

      document.getElementById('auth-modal').style.display = 'none';
      document.getElementById('login-email').value = '';
      document.getElementById('login-password').value = '';
    } catch (error) {
      alert("Login Error: " + error.message);
    }
  }

  async register(email, password, rawName) {
    if (!email || !password) return alert("Please enter an email and password.");
    if (!rawName || rawName.trim() === "") return alert("Please provide a desired username.");

    const allowed = await this.isEmailAllowed(email);
    if (!allowed) return alert("Access Denied: This email is not authorized to register as an administrator.");

    try {
      const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;

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

      await this.database.ref(`users/${user.uid}`).set({
        username: finalName,
        email: user.email,
        role: "admin"
      });
      await this.database.ref(`usernames/${finalName}`).set(user.uid);

      await user.sendEmailVerification();
      await this.auth.signOut();

      alert("Registration successful! A verification link has been sent to your email. You MUST click it to verify your account before logging in.");
      
      document.getElementById('auth-modal').style.display = 'none';
      document.getElementById('reg-email').value = '';
      document.getElementById('reg-password').value = '';
      document.getElementById('reg-username').value = '';
      this.switchTab('login');

    } catch (error) {
      alert("Registration Error: " + error.message);
    }
  }

  /**
   * Sends a password reset email to the requested address.
   */
  async resetPassword(email) {
    if (!email) return alert("Please enter your email address.");

    try {
      await this.auth.sendPasswordResetEmail(email);
      alert("If an account exists with that email, a password reset link has been sent.");
      
      // Clear input and go back to login
      document.getElementById('reset-email').value = '';
      this.switchTab('login');
    } catch (error) {
      // Even on error, it's a best practice not to explicitly confirm if the email exists or not to prevent snooping,
      // but Firebase returns specific errors we can surface.
      alert("Error: " + error.message);
    }
  }

  async handleAuthStateChange(user) {
    const authStatus = document.getElementById('auth-status');
    const authActions = document.getElementById('auth-actions');

    if (user) {
      const profileSnap = await this.database.ref(`users/${user.uid}`).once('value');
      this.userProfile = profileSnap.val();
      
      let badge = this.userProfile?.role === 'admin' ? '<span class="admin-badge">Admin</span>' : '';
      
      if (authStatus) authStatus.innerHTML = `Hi, <strong style="color: var(--text-primary);">${this.userProfile?.username || 'Admin'}</strong> ${badge}`;
      if (authActions) authActions.innerHTML = `<a href="javascript:void(0)" class="nav-link" onclick="window.authManager.logout()">Logout</a>`;
      
      if (this.userProfile?.role === 'admin') {
        document.body.classList.add('admin-mode');
      }
      
      document.dispatchEvent(new CustomEvent('auth-resolved'));
    } else {
      this.userProfile = null;
      document.body.classList.remove('admin-mode');
      
      if (authStatus) authStatus.innerHTML = ``;
      if (authActions) authActions.innerHTML = `<a href="javascript:void(0)" class="nav-link" onclick="document.getElementById('auth-modal').style.display='flex'">Admin Login</a>`;
      
      document.dispatchEvent(new CustomEvent('auth-resolved'));
    }
  }

  logout() {
    this.auth.signOut().then(() => window.location.reload());
  }
}