/**
 * config.js - Global Configuration & Settings for Chelan High Systems
 * Version: 1.1.10
 * 
 * Loaded globally via standard <script src="config.js?v=1.004"></script>
 */

window.APP_CONFIG = {
    // Application Metadata
    appName: "Chelan High School Phone & Pass Kiosk",
    version: "1.1.10",
    schoolName: "Chelan High School",
    department: "ROOM 176",

    // Timeouts and Thresholds (In Minutes)
    settings: {
        hallPassTimeoutMinutes: 10,  // Time after which a student on a pass is flagged overdue
        autoRefreshIntervalMs: 3000,  // Polling interval for live dashboard sync
        defaultSortColumn: "lastName"
    },

    // Firebase Credentials (Replace placeholders if connecting to Firebase Live DB)
    firebaseConfig: {
        apiKey: "YOUR_API_KEY_HERE",
        authDomain: "chelan-kiosk.firebaseapp.com",
        projectId: "chelan-kiosk",
        storageBucket: "chelan-kiosk.appspot.com",
        messagingSenderId: "1234567890",
        appId: "1:1234567890:web:abcdef123456"
    }
};

// Optional: Console log confirmation on load for easy debugging
console.log(`[Config Loaded] ${window.APP_CONFIG.appName} v${window.APP_CONFIG.version}`);
