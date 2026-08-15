/**
 * CHS ClassPass Phone & Pass Tracking
 * Configuration & Firebase Central Module
 */

export const APP_CONFIG = {
  version: "v2.1.1",
  schoolName: "Chelan High",
  department: "ROOM 176",
  pocketsAvailable: 35,             // Total phone pocket slots available
  maxBathroomPasses: 1,             // Max active bathroom passes allowed
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
