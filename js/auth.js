/**
 * Handles Firebase Email/Password Authentication, Registration, Session Management,
 * Password Resets, Top Score Tracking, and dynamically injects the Auth UI Modal.
 */
class AuthManager {
  constructor(database) {
    this.database = database;
    this.auth = firebase.auth();
    this.userProfile = null;
    this.userScores = {}; 
    
    this.injectAuthModal();
    this.auth.onAuthStateChanged(this.handleAuthStateChange.bind(this));
  }

  // --- NEW: DRY Utility for Authentication Redirects ---
  get actionCodeSettings() {
    return { url: window.location.href.split('?')[0] };
  }

  // --- UI Helper Methods ---
  closeModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = 'none';
    this.clearForms();
  }

  clearForms() {
    ['login-email', 'login-password', 'reg-email', 'reg-password', 'reg-username', 'reset-email']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
  }

  switchTab(tabName) {
    ['login', 'register', 'reset'].forEach(name => {
      const el = document.getElementById(`tab-${name}`);
      if(el) el.classList.remove('active');
    });
    
    document.getElementById('tab-btn-login').classList.remove('active');
    document.getElementById('tab-btn-register').classList.remove('active');

    if (tabName === 'login' || tabName === 'register') {
      document.getElementById(`tab-btn-${tabName}`).classList.add('active');
      document.getElementById('auth-tabs-header').style.display = 'flex';
    } else {
      document.getElementById('auth-tabs-header').style.display = 'none';
    }
    document.getElementById(`tab-${tabName}`).classList.add('active');
  }

  // --- Authentication Methods ---
  async isEmailAllowed(email) {
    try {
      const snap = await this.database.ref('allowed_admins').once('value');
      if (!snap.exists()) return false;
      const allowedData = snap.val();
      const allowedList = Array.isArray(allowedData) ? allowedData : Object.values(allowedData);
      return allowedList.some(e => e.toLowerCase().trim() === email.trim().toLowerCase());
    } catch (error) {
      return false;
    }
  }

  async fetchSettings() {
    try {
      const snap = await this.database.ref('settings').once('value');
      if (snap.exists()) return snap.val();
    } catch (e) {
      console.error("Could not fetch settings:", e);
    }
    return { enforce_verify_email: false, SHOW_TOTAL_VIEWS: true, autosave_interval_ms: 60000 };
  }

  async login(email, password) {
    if (!email || !password) return alert("Please enter both email and password.");
    try {
      const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
      const settings = await this.fetchSettings();
      
      if (settings.enforce_verify_email === true && !userCredential.user.emailVerified) {
        const wantsLink = window.confirm("Access Denied: Your email address must be verified to log in.\n\nWould you like us to send a new verification link to your email right now?");
        if (wantsLink) {
          await userCredential.user.sendEmailVerification(this.actionCodeSettings);
          alert("Verification link sent! Please check your inbox and spam folder.");
        }
        await this.auth.signOut();
        return; 
      }
      this.closeModal();
    } catch (error) {
      alert("Login Error: " + error.message);
    }
  }

  async register(email, password, rawName) {
    if (!email || !password) return alert("Please enter an email and password.");
    if (!rawName || rawName.trim() === "") return alert("Please provide a desired username.");

    let user = null;
    try {
      const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
      user = userCredential.user;

      const baseName = rawName
        .replace(/[.$#\[\]\/!"%&'()*+,\-:;<=>?@\\^`{|}~]/g, " ") 
        .replace(/\s+/g, " ") 
        .trim() 
        .replace(/ /g, "_") || "User";
        
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

      const isWhitelisted = await this.isEmailAllowed(email);
      const assignedRole = isWhitelisted ? "admin" : "user";

      try {
        const updates = {
            [`users/${user.uid}`]: { username: finalName, email: user.email, role: assignedRole },
            [`usernames/${finalName}`]: user.uid
        };
        await this.database.ref().update(updates);
        await user.updateProfile({ displayName: finalName });
      } catch (dbError) {
        await user.delete();
        throw new Error("Failed to secure database profile: " + dbError.message);
      }

      await user.sendEmailVerification(this.actionCodeSettings);
      const settings = await this.fetchSettings();
      
      if (settings.enforce_verify_email === true) {
        await this.auth.signOut();
        alert("Registration successful! A verification link has been sent to your email (check your inbox/spam folder).\n\nYou MUST click it to verify your account before logging in.");
        this.switchTab('login');
      } else {
        alert("Registration successful! You are now logged in. A verification link has been sent to your email (check your inbox/spam folder).");
        this.closeModal();
      }

    } catch (error) {
      alert("Registration Error: " + error.message);
    }
  }

  async resetPassword(email) {
    if (!email) return alert("Please enter your email address.");
    try {
      await this.auth.sendPasswordResetEmail(email, this.actionCodeSettings);
      alert("If an account exists with that email, a password reset link has been sent.");
      this.clearForms();
      this.switchTab('login');
    } catch (error) {
      alert("Error: " + error.message);
    }
  }

  async resendVerification() {
    const user = this.auth.currentUser;
    if (user && !user.emailVerified) {
      try {
        await user.sendEmailVerification(this.actionCodeSettings);
        alert("A new verification link has been sent. Please check your inbox and spam folder.");
      } catch (error) {
        alert("Error sending verification email: " + error.message);
      }
    }
  }

  // --- Quiz State & Score Methods ---
  async saveQuizState(quizId, stateData) {
    const user = this.auth.currentUser;
    if (user) await this.database.ref(`quiz_states/${user.uid}/${quizId}`).set(stateData).catch(e => console.error(e));
  }

  async getQuizState(quizId) {
    const user = this.auth.currentUser;
    if (!user) return null;
    try {
      const snap = await this.database.ref(`quiz_states/${user.uid}/${quizId}`).once('value');
      return snap.val();
    } catch (e) { return null; }
  }

  async clearQuizState(quizId) {
    const user = this.auth.currentUser;
    if (user) await this.database.ref(`quiz_states/${user.uid}/${quizId}`).remove().catch(e => console.error(e));
  }

  async saveTopScore(quizId, newScore, totalQs) {
    const user = this.auth.currentUser;
    if (!user) return; 

    const currentData = this.userScores[quizId];
    const currentTop = typeof currentData === 'object' ? currentData.score : (currentData || 0);

    if (newScore > currentTop) {
      try {
        const scorePayload = { score: newScore, total: totalQs };
        await this.database.ref(`scores/${user.uid}/${quizId}`).set(scorePayload);
        this.userScores[quizId] = scorePayload; 
        document.dispatchEvent(new CustomEvent('scores-updated')); 
      } catch (err) {
        console.error("Failed to save score:", err);
      }
    }
  }

  // --- Session Management ---
  async handleAuthStateChange(user) {
    const authStatus = document.getElementById('auth-status');
    const authActions = document.getElementById('auth-actions');

    if (user) {
      const settings = await this.fetchSettings();
      if (settings.enforce_verify_email === true && !user.emailVerified) {
          await this.auth.signOut();
          alert("Security policy updated: You must verify your email address to continue using the portal.\n\nPlease log in again to request a new verification link.");
          return;
      }
      
      let profileSnap = await this.database.ref(`users/${user.uid}`).once('value');
      if (!profileSnap.exists()) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          profileSnap = await this.database.ref(`users/${user.uid}`).once('value');
      }
      
      this.userProfile = profileSnap.val();
      
      if (!this.userProfile) {
        try {
          await this.database.ref(`scores/${user.uid}`).remove();
          await this.database.ref(`quiz_states/${user.uid}`).remove();
          if (user.displayName) await this.database.ref(`usernames/${user.displayName}`).remove();
          await user.delete();
          alert("Your account profile has been deleted by an administrator. All associated personal data has been permanently removed.");
        } catch (e) {
          await this.auth.signOut();
          alert("Your account profile has been deactivated.");
        }
        return; 
      }

      if (!user.displayName && this.userProfile.username) {
          await user.updateProfile({ displayName: this.userProfile.username });
      }
      
      const [scoresSnap, statesSnap] = await Promise.all([
          this.database.ref(`scores/${user.uid}`).once('value'),
          this.database.ref(`quiz_states/${user.uid}`).once('value')
      ]);
      
      this.userScores = scoresSnap.val() || {};
      this.userQuizStates = statesSnap.val() || {}; 
      
      const badge = this.userProfile?.role === 'admin' ? '<span class="admin-badge">Admin</span>' : '';
      const verifyLink = !user.emailVerified ? ` <a href="javascript:void(0)" onclick="window.authManager.resendVerification()" style="font-size:12px; color:var(--secondary-accent); margin-left: 10px; text-decoration: underline;">[Verify Email]</a>` : '';
      const cleanupLink = this.userProfile?.role === 'admin' ? ` <a href="javascript:void(0)" onclick="if(window.runClientCleanup) window.runClientCleanup()" style="font-size:12px; color:var(--red-text); margin-left: 10px; text-decoration: underline;" title="Clean orphaned DB records">[Cleanup]</a>` : '';
      
      if (authStatus) authStatus.innerHTML = `Hi, <strong style="color: var(--text-primary);">${this.userProfile.username || 'User'}</strong> ${badge}${cleanupLink}${verifyLink}`;
      if (authActions) authActions.innerHTML = `<a href="javascript:void(0)" class="nav-link" onclick="window.authManager.logout()">Logout</a>`;
      if (this.userProfile.role === 'admin') document.body.classList.add('admin-mode');
      
    } else {
      this.userProfile = null;
      this.userScores = {};
      this.userQuizStates = {}; 
      document.body.classList.remove('admin-mode');
      
      if (authStatus) authStatus.innerHTML = ``;
      if (authActions) authActions.innerHTML = `<a href="javascript:void(0)" class="nav-link" onclick="document.getElementById('auth-modal').style.display='flex'">Login / Register</a>`;
    }
    
    document.dispatchEvent(new CustomEvent('auth-resolved'));
  }

  logout() {
    this.auth.signOut().then(() => window.location.reload());
  }

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
                  <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">Log in to save your top scores and track your progress.</p>
                  <div class="form-group"><label>Email Address</label><input type="email" id="login-email" placeholder="user@email.com"></div>
                  <div class="form-group">
                      <div style="display: flex; justify-content: space-between;">
                          <label>Password</label>
                          <a href="javascript:void(0)" onclick="window.authManager.switchTab('reset')" style="font-size: 12px; color: var(--primary-accent); text-decoration: none;">Forgot Password?</a>
                      </div>
                      <input type="password" id="login-password" placeholder="********">
                  </div>
                  <div class="form-actions">
                      <button class="btn btn-secondary" onclick="window.authManager.closeModal()">Cancel</button>
                      <button class="btn btn-primary" onclick="window.authManager.login(document.getElementById('login-email').value, document.getElementById('login-password').value)">Login</button>
                  </div>
              </div>

              <!-- REGISTER TAB -->
              <div id="tab-register" class="auth-form-section">
                  <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">Create an account to track your top quiz scores!</p>
                  <div class="form-group"><label>Desired Username</label><input type="text" id="reg-username" placeholder="e.g. John Doe"></div>
                  <div class="form-group"><label>Email Address</label><input type="email" id="reg-email" placeholder="user@email.com"></div>
                  <div class="form-group"><label>Password</label><input type="password" id="reg-password" placeholder="********"></div>
                  <div class="form-actions">
                      <button class="btn btn-secondary" onclick="window.authManager.closeModal()">Cancel</button>
                      <button class="btn btn-primary" onclick="window.authManager.register(document.getElementById('reg-email').value, document.getElementById('reg-password').value, document.getElementById('reg-username').value)">Register</button>
                  </div>
              </div>

              <!-- RESET PASSWORD TAB -->
              <div id="tab-reset" class="auth-form-section">
                  <h3 style="margin-top: 0; margin-bottom: 10px;">Reset Password</h3>
                  <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">Enter your registered email address to receive a secure password reset link.</p>
                  <div class="form-group"><label>Email Address</label><input type="email" id="reset-email" placeholder="user@email.com"></div>
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
}