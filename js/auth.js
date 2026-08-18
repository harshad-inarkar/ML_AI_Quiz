class AuthManager {
  constructor(database) {
    this.database = database;
    this.auth = firebase.auth();
    this.userProfile = null;
    
    this.auth.onAuthStateChanged(this.handleAuthStateChange.bind(this));
    this.checkPendingEmailLink();
  }

  async sendLoginLink(email, requestedUsername) {
    const actionCodeSettings = {
      url: window.location.href,
      handleCodeInApp: true
    };
    try {
      await this.auth.sendSignInLinkToEmail(email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      if (requestedUsername) window.localStorage.setItem('requestedUsername', requestedUsername);
      alert("A login link has been sent to your email. Please check your inbox!");
      document.getElementById('auth-modal').style.display = 'none';
    } catch (error) {
      alert("Error: " + error.message);
    }
  }

  async checkPendingEmailLink() {
    if (this.auth.isSignInWithEmailLink(window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) email = window.prompt('Please confirm your email address to complete login:');
      
      try {
        const result = await this.auth.signInWithEmailLink(email, window.location.href);
        window.localStorage.removeItem('emailForSignIn');
        
        if (result.additionalUserInfo.isNewUser) {
          const rawName = window.localStorage.getItem('requestedUsername') || email.split('@')[0];
          await this.createNewUserProfile(result.user, rawName);
          window.localStorage.removeItem('requestedUsername');
        }
        window.history.replaceState(null, "", window.location.pathname);
      } catch (error) {
        alert("Login link expired or invalid. Please try again.");
      }
    }
  }

  async createNewUserProfile(user, rawName) {
    let baseName = rawName.replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "_");
    if (!baseName) baseName = "user";

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
      role: "user" 
    });
    await this.database.ref(`usernames/${finalName}`).set(user.uid);
  }

 async handleAuthStateChange(user) {
    const authStatus = document.getElementById('auth-status');
    const authActions = document.getElementById('auth-actions');

    if (user) {
      const profileSnap = await this.database.ref(`users/${user.uid}`).once('value');
      this.userProfile = profileSnap.val();
      
      let badge = this.userProfile.role === 'admin' ? '<span class="admin-badge">Admin</span>' : '';
      
      authStatus.innerHTML = `Hi, <strong style="color: var(--text-primary);">${this.userProfile.username}</strong> ${badge}`;
      
      // Changed from Button to standard nav-link styling
      authActions.innerHTML = `<a href="javascript:void(0)" class="nav-link" onclick="window.authManager.logout()">Logout</a>`;
      
      if (this.userProfile.role === 'admin') {
        document.body.classList.add('admin-mode');
      }
      
      document.dispatchEvent(new CustomEvent('auth-resolved'));
    } else {
      this.userProfile = null;
      document.body.classList.remove('admin-mode');
      
      authStatus.innerHTML = ``;
      
      // Changed from Button to standard nav-link styling
      authActions.innerHTML = `<a href="javascript:void(0)" class="nav-link" onclick="document.getElementById('auth-modal').style.display='flex'">Login / Register</a>`;
      
      document.dispatchEvent(new CustomEvent('auth-resolved'));
    }
  }

  logout() {
    this.auth.signOut().then(() => window.location.reload());
  }
}