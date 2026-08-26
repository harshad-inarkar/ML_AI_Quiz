/**
 * Shared Firebase project configuration for the Quiz Portal application.
 * Must be loaded (via <script>) after the Firebase compat SDKs and before
 * any page controller that calls `firebase.initializeApp`.
 */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBugi9hxa8hsMZ_MZHUrEguA_k-tMtPtaQ",
  authDomain: "quizportal-d0eff.firebaseapp.com",
  databaseURL:
    "https://quizportal-d0eff-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "quizportal-d0eff",
  storageBucket: "quizportal-d0eff.firebasestorage.app",
  messagingSenderId: "545650564737",
  appId: "1:545650564737:web:feb792a331ce365976f780",
};

// Initialized here (not inside a page controller) so App Check can activate
// immediately after, before any page-specific script runs.
firebase.initializeApp(FIREBASE_CONFIG);