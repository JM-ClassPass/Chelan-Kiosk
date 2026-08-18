/**
 * CHS ClassPass Phone & Pass Tracking
 * Configuration & Firebase Central Module
 */

export const APP_CONFIG = {
  version: "v2.1.1",
  schoolName: "Chelan High",
  department: "ROOM 176",
  pocketLayout: {
    rows: 5,                          // Rows in the phone pocket grid
    cols: 7                           // Columns in the phone pocket grid
  },
  maxBathroomPasses: 1,             // Max active bathroom passes allowed
  // Dedicated permanent sign-in used by the kiosk (not a real mailbox).
  // Replaces anonymous auth so the kiosk has one stable, named identity
  // instead of a session that looks like disposable clutter in the
  // Firebase Users list and can go stale in ways that are hard to trace.
  // This is public the same way everything else in this file is public —
  // access control comes from database.rules.json, not from hiding this.
  kioskAuth: {
    email: "classpass@chelanschools.net",
    password: "Goatkiosk2026!"
  },
  firebaseConfig: {
    apiKey: "AIzaSyDOqjLMzMydaR31WWUA35sr1FrNLfHPxuI",
    authDomain: "chelan-classroom-pass-a811e.firebaseapp.com",
    databaseURL: "https://chelan-classroom-pass-a811e-default-rtdb.firebaseio.com",
    projectId: "chelan-classroom-pass-a811e",
    storageBucket: "chelan-classroom-pass-a811e.firebasestorage.app",
    messagingSenderId: "645480807479",
    appId: "1:645480807479:web:d280d4ef38e8754a9953b2"
  }
};

// Total selectable pockets — always derived from pocketLayout above, so this
// number can never drift out of sync with the grid the way it did before
// (config used to say 30 while the kiosk grid actually rendered 35).
// To change pocket count, edit pocketLayout.rows / pocketLayout.cols only.
APP_CONFIG.pocketsAvailable = APP_CONFIG.pocketLayout.rows * APP_CONFIG.pocketLayout.cols;

/**
 * Shared Helper Functions
 */

// Formats seconds into "Xm Ys" or "Xs"
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return "--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

// Formats timestamp into "10:13 AM"
export function formatTime(dateObj = new Date()) {
  return dateObj.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

// Formats timestamp into "8/10/2026"
export function formatDate(dateObj = new Date()) {
  return dateObj.toLocaleDateString("en-US");
}

// Escapes untrusted text (student names, guest-request names, etc.) so it can be
// safely inserted into innerHTML — as text content OR inside a quoted attribute
// like value="..." or title="...". Use this anywhere a name/ID that a person
// typed is being template-strung into HTML. Do NOT use for CSV building — CSV
// quoting rules are different (see escapeAttr in teacher.js).
export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
