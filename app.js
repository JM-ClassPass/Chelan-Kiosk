/**
 * Chelan High School - Kiosk Pass Logic (app.js)
 */

import { APP_CONFIG, formatTime } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { 
  getDatabase, ref, onValue, set, remove, push 
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

// Initialize Firebase
const app = initializeApp(APP_CONFIG.firebaseConfig);
const db = getDatabase(app);

// State
let rosterData = {};
let activePasses = {};
let activeScreen = "bathroom"; // "bathroom" | "hall" | "phone"
let selectedPocket = 1;
let failedAttemptsCount = 0;
let pendingUnknownID = "";

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  setupTabNavigation();
  setupInputHandlers();
  setupPocketModal();
  setupGuestModal();
  attachFirebaseListeners();
});

// Live Clock
function initClock() {
  const clockEl = document.getElementById("kiosk-clock");
  if (!clockEl) return;
  const update = () => {
    clockEl.textContent = formatTime(new Date());
  };
  setInterval(update, 1000);
  update();
}

// Realtime Firebase Listeners
function attachFirebaseListeners() {
  onValue(ref(db, "roster"), (snapshot) => {
    rosterData = snapshot.exists() ? snapshot.val() : {};
  });

  onValue(ref(db, "active_passes"), (snapshot) => {
    activePasses = snapshot.exists() ? snapshot.val() : {};
  });
}

// Fullscreen Timed Confirmation Alert (Exact 1.0 Second Notice - Requirement #6)
function showFullscreenNotice(title, subtitle, type = "success") {
  const notice = document.getElementById("fullscreen-notice");
  const iconEl = document.getElementById("fullscreen-notice-icon");
  const titleEl = document.getElementById("fullscreen-notice-title");
  const subtitleEl = document.getElementById("fullscreen-notice-subtitle");
  const inputEl = document.getElementById("kiosk-id-input");

  if (!notice || !titleEl || !subtitleEl) return;

  titleEl.textContent = title;
  subtitleEl.textContent = subtitle;

  if (type === "success") {
    iconEl.className = "text-6xl mb-4 text-emerald-400";
    iconEl.innerHTML = `<i class="fa-solid fa-circle-check"></i>`;
  } else if (type === "warning") {
    iconEl.className = "text-6xl mb-4 text-amber-400";
    iconEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i>`;
  } else if (type === "error") {
    iconEl.className = "text-6xl mb-4 text-rose-500";
    iconEl.innerHTML = `<i class="fa-solid fa-circle-xmark"></i>`;
  }

  notice.classList.remove("hidden");
  notice.classList.add("flex");

  // Dismiss after 1000ms (1 second)
  setTimeout(() => {
    notice.classList.add("hidden");
    notice.classList.remove("flex");
    if (inputEl) {
      inputEl.value = "";
      inputEl.focus();
    }
  }, 1000);
}

// Screen Tab Navigation (Requirement #5)
function setupTabNavigation() {
  const tabs = {
    bathroom: document.getElementById("tab-bathroom"),
    hall: document.getElementById("tab-hall"),
    phone: document.getElementById("tab-phone")
  };

  const badge = document.getElementById("screen-badge");
  const title = document.getElementById("screen-title");
  const subtitle = document.getElementById("screen-subtitle");

  Object.entries(tabs).forEach(([type, btn]) => {
    if (!btn) return;

    btn.onclick = () => {
      activeScreen = type;

      // Update Tab Styles
      Object.values(tabs).forEach(t => {
        if (t) {
          t.className = "kiosk-tab py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition text-slate-600 hover:text-slate-900 hover:bg-white/60";
        }
      });
      btn.className = "kiosk-tab py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition bg-[#0B4F2C] text-white shadow-md";

      // Update Header Labels
      if (type === "bathroom") {
        badge.textContent = "Bathroom Mode Active";
        title.textContent = "Scan Student ID Barcode";
        subtitle.textContent = "Scan or enter your Student ID to check out or return a Bathroom Pass.";
      } else if (type === "hall") {
        badge.textContent = "Hall Pass Mode Active";
        title.textContent = "Scan Student ID Barcode";
        subtitle.textContent = "Scan or enter your Student ID to check out or return a Hall Pass.";
      } else if (type === "phone") {
        badge.textContent = "Phone Storage Mode Active";
        title.textContent = "Scan Student ID to Store Phone";
        subtitle.textContent = "Scan your ID to check in your mobile device into a classroom pocket.";
      }

      const input = document.getElementById("kiosk-id-input");
      if (input) input.focus();
    };
  });
}

// Handle ID Submission
function setupInputHandlers() {
  const input = document.getElementById("kiosk-id-input");
  const submitBtn = document.getElementById("btn-submit-id");

  const processID = () => {
    const rawId = input.value.trim();
    if (!rawId) return;

    // Validate against Roster with 3-Attempt Rule (Requirement #1)
    const student = rosterData[rawId];
    if (!student) {
      failedAttemptsCount++;
      pendingUnknownID = rawId;

      if (failedAttemptsCount < 3) {
        showFullscreenNotice(
          `ID NOT FOUND (ATTEMPT ${failedAttemptsCount}/3)`,
          `ID ${rawId} is not registered in the roster. Please re-enter.`,
          "error"
        );
      } else {
        // Attempt 3 -> Open Pop-up to send request to Dashboard
        openGuestModal(rawId);
      }
      return;
    }

    // Reset failed attempts on valid ID scan
    failedAttemptsCount = 0;

    // Process Pass Request / Return
    handlePassWorkflow(rawId, student);
  };

  if (submitBtn) submitBtn.onclick = processID;

  if (input) {
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        processID();
      }
    };
  }
}

// Pass Creation and Screen-Specific Check-In Logic (Requirements #3, #5)
async function handlePassWorkflow(studentId, student) {
  const existingPass = activePasses[studentId];

  // ================= SCENARIO A: RETURN PASS =================
  if (existingPass) {
    // Requirement #5: Return pass ONLY if student is on the corresponding active screen
    if (existingPass.type !== activeScreen) {
      const activeScreenName = activeScreen.toUpperCase();
      const requiredScreenName = existingPass.type.toUpperCase();
      showFullscreenNotice(
        "WRONG SCREEN FOR RETURN",
        `You have an active ${requiredScreenName} pass. Switch to the ${requiredScreenName} screen to check in!`,
        "warning"
      );
      return;
    }

    // Check in pass (remove from active_passes, log to pass_logs)
    await remove(ref(db, `active_passes/${studentId}`));
    await push(ref(db, "pass_logs"), {
      studentId: studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      type: existingPass.type,
      pocketNumber: existingPass.pocketNumber || null,
      timeOut: existingPass.timeOut,
      timeIn: new Date().toISOString()
    });

    showFullscreenNotice(
      "PASS RETURNED SUCCESSFULLY",
      `Welcome back, ${student.firstName}! Pass checked in.`,
      "success"
    );
    return;
  }

  // ================= SCENARIO B: CREATE PASS =================
  if (activeScreen === "phone") {
    // Open Phone Pocket Modal with lowest available number pre-selected (Requirements #2, #4)
    openPocketModal(studentId, student);
    return;
  }

  // Requirement #3: Hall or Bathroom Pass NOT allowed without checking in phone first!
  const hasPhoneCheckedIn = hasActivePhoneCheckin(studentId);
  if (!hasPhoneCheckedIn) {
    showFullscreenNotice(
      "PHONE CHECK-IN REQUIRED",
      "Please check in your phone on the Phone Storage tab before taking a pass!",
      "warning"
    );
    return;
  }

  // Issue Hall or Bathroom Pass
  await set(ref(db, `active_passes/${studentId}`), {
    studentId: studentId,
    studentName: `${student.firstName} ${student.lastName}`,
    type: activeScreen,
    timeOut: new Date().toISOString()
  });

  showFullscreenNotice(
    `${activeScreen.toUpperCase()} PASS CREATED`,
    `Pass granted for ${student.firstName} ${student.lastName}.`,
    "success"
  );
}

// Helper: Check if student has checked in phone
function hasActivePhoneCheckin(studentId) {
  return Object.values(activePasses).some(
    pass => pass.studentId === studentId && pass.type === "phone"
  );
}

// Helper: Find Lowest Available Pocket Number (Requirement #2)
function getLowestAvailablePocket() {
  const occupiedPockets = new Set(
    Object.values(activePasses)
      .filter(p => p.type === "phone" && p.pocketNumber)
      .map(p => Number(p.pocketNumber))
  );

  let pocket = 1;
  while (occupiedPockets.has(pocket)) {
    pocket++;
  }
  return pocket;
}

// Phone Pocket Modal setup (Requirement #2, #4)
function openPocketModal(studentId, student) {
  const modal = document.getElementById("phone-pocket-modal");
  const grid = document.getElementById("pocket-grid");
  if (!modal || !grid) return;

  // Auto-select lowest available pocket
  selectedPocket = getLowestAvailablePocket();

  // Render Pockets 1 through 36
  grid.innerHTML = "";
  const occupiedPockets = new Set(
    Object.values(activePasses)
      .filter(p => p.type === "phone" && p.pocketNumber)
      .map(p => Number(p.pocketNumber))
  );

  for (let i = 1; i <= 36; i++) {
    const isOccupied = occupiedPockets.has(i);
    const isSelected = i === selectedPocket;

    let btnClass = "py-2 rounded-xl text-xs font-black transition border ";
    if (isOccupied) {
      btnClass += "bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed";
    } else if (isSelected) {
      btnClass += "bg-[#0B4F2C] text-white border-[#0B4F2C] shadow-md ring-2 ring-emerald-400";
    } else {
      btnClass += "bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-300";
    }

    const pocketBtn = document.createElement("button");
    pocketBtn.type = "button";
    pocketBtn.className = btnClass;
    pocketBtn.textContent = i;
    pocketBtn.disabled = isOccupied;

    pocketBtn.onclick = () => {
      selectedPocket = i;
      openPocketModal(studentId, student); // re-render selections
    };

    grid.appendChild(pocketBtn);
  }

  modal.classList.remove("hidden");

  // Confirm Button
  const confirmBtn = document.getElementById("btn-confirm-pocket");
  confirmBtn.onclick = async () => {
    modal.classList.add("hidden");

    await set(ref(db, `active_passes/${studentId}`), {
      studentId: studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      type: "phone",
      pocketNumber: selectedPocket,
      timeOut: new Date().toISOString()
    });

    showFullscreenNotice(
      `PHONE STORED IN POCKET #${selectedPocket}`,
      `Phone stored for ${student.firstName} ${student.lastName}.`,
      "success"
    );
  };
}

function setupPocketModal() {
  const cancelBtn = document.getElementById("btn-cancel-pocket");
  const modal = document.getElementById("phone-pocket-modal");
  if (cancelBtn && modal) {
    cancelBtn.onclick = () => modal.classList.add("hidden");
  }
}

// Guest Pop-up Modal setup for Attempt 3 (Requirement #1)
function openGuestModal(rawId) {
  const modal = document.getElementById("guest-request-modal");
  const displayId = document.getElementById("guest-id-display");
  const nameInput = document.getElementById("guest-name-input");

  if (!modal || !displayId) return;

  displayId.value = rawId;
  if (nameInput) nameInput.value = "";
  modal.classList.remove("hidden");
}

function setupGuestModal() {
  const modal = document.getElementById("guest-request-modal");
  const cancelBtn = document.getElementById("btn-cancel-guest");
  const submitBtn = document.getElementById("btn-submit-guest");
  const nameInput = document.getElementById("guest-name-input");

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      modal.classList.add("hidden");
      failedAttemptsCount = 0;
    };
  }

  if (submitBtn) {
    submitBtn.onclick = async () => {
      const guestName = nameInput.value.trim();
      if (!guestName) {
        alert("Please enter the student's full name.");
        return;
      }

      // Submit request directly to Firebase Dashboard under teacher_requests & active_passes
      const requestId = pendingUnknownID || "GUEST_" + Date.now().toString().slice(-4);

      await set(ref(db, `active_passes/${requestId}`), {
        studentId: requestId,
        studentName: `${guestName} (Guest)`,
        type: activeScreen,
        isGuest: true,
        timeOut: new Date().toISOString()
      });

      modal.classList.add("hidden");
      failedAttemptsCount = 0;

      showFullscreenNotice(
        "GUEST REQUEST SENT TO DASHBOARD",
        `Teacher notified for guest student ${guestName}.`,
        "success"
      );
    };
  }
}
