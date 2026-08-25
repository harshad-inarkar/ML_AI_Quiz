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

  get actionCodeSettings() {
    return { url: window.location.href.split('?')[0] };
  }

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
    return { 
        QUIZ_ACCESS_LEVEL: 'unrestricted', 
        RESOURCES_ACCESS_LEVEL: 'unrestricted', 
        show_discord_promo: false,
        discord_link1_join: 'https://discord.com',
        discord_link2_channel: 'https://discord.com',
        SHOW_TOTAL_VIEWS: true, 
        autosave_interval_ms: 60000 
    };
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

  // --- DRY Utility: Generates consistent Restriction Boxes ---
  generateRestrictedHTML(title, type) {
    if (type === 'login') {
        return `<div class="restricted-box"><h2>Unlock ${title}</h2><p>To keep your progress and our learning community secure, please <a href="javascript:void(0)" onclick="document.getElementById('auth-modal').style.display='flex'">Log in or Register</a>.</p></div>`;
    }
    if (type === 'verify') {
        return `<div class="restricted-box"><h2>Verification Required</h2><p>For your security, please verify your email address to access ${title.toLowerCase()}. <a href="javascript:void(0)" onclick="window.authManager.resendVerification()">Resend Link</a></p></div>`;
    }
    return '';
  }

  injectDiscordPromo(settings) {
    if (!settings.show_discord_promo || !this.userProfile) return;
    if (document.getElementById('discord-promo-strip')) return; 

    const headerCard = document.querySelector('.header-card');
    if (!headerCard) return;

    const link1 = settings.discord_link1_join || "#";
    const link2 = settings.discord_link2_channel || "#";

    const promoHTML = `
        <div id="discord-promo-strip" class="discord-promo">
            <div class="discord-promo-content">
                <svg width="18" height="18" viewBox="0 0 127.14 96.36" fill="#5865F2"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a67.55,67.55,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.31,60,73.31,53s5-12.74,11.43-12.74S96.1,46,96,53,91.08,65.69,84.69,65.69Z"/></svg>
                <span>Connect, study, and share ideas on our Discord!</span>
            </div>
            <div class="discord-promo-actions">
                <a href="${link1}" target="_blank" class="btn btn-discord">Join Discord</a>
                <a href="${link2}" target="_blank" class="btn btn-discord-outline">Already member</a>
            </div>
        </div>
    `;
    headerCard.insertAdjacentHTML('beforebegin', promoHTML);
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
                  <p class="auth-subtitle">Log in to save your top scores and track your progress.</p>
                  <div class="form-group"><label>Email Address</label><input type="email" id="login-email" placeholder="user@email.com"></div>
                  <div class="form-group">
                      <div class="form-group-header">
                          <label>Password</label>
                          <a href="javascript:void(0)" onclick="window.authManager.switchTab('reset')" class="auth-link">Forgot Password?</a>
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
                  <p class="auth-subtitle">Create an account to track your top quiz scores!</p>
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
                  <p class="auth-subtitle">Enter your registered email address to receive a secure password reset link.</p>
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