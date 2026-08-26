/**
 * Activates Firebase App Check so Realtime Database only accepts requests
 * carrying a valid attestation token from this registered web app.
 * Must load after firebase-config.js (which calls firebase.initializeApp)
 * and before any script that touches the database.
 */

// Local/dev testing only: reCAPTCHA v3 cannot mint real tokens from
// localhost or file://. Register a debug token in Firebase Console >
// App Check > Apps > Manage debug tokens, then uncomment the next line.
// self.FIREBASE_APPCHECK_DEBUG_TOKEN = "PASTE_YOUR_DEBUG_TOKEN_HERE";

const RECAPTCHA_V3_SITE_KEY = "6Lc_YIotAAAAAGDI4fiQS5RxpYxiiJQa_HcohfMM";

firebase
  .appCheck()
  .activate(
    new firebase.appCheck.ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
    true
  );