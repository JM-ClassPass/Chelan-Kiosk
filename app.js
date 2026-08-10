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
let activeScreen = "phone"; // "phone" (Green) | "bathroom" (Red) | "hall" (Purple)
let selectedPocket = 1;
let failedAttemptsCount = 0;
let pendingUnknownID = "";

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  setupTabNavigation();
  setupInputHandlers();
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
    renderPocketGrid();
  });
}

// Fullscreen Timed Notice (Exactly 1.0 Second)
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

  setTimeout(() => {
    notice.classList.add("hidden");
    notice.classList.remove("flex");
    if (inputEl) {
      inputEl.value = "";
      inputEl.focus();
    }
  }, 1000);
}

// Tab Navigation with Full Color Coordination (Phone = Green, Bathroom = Red, Hall = Purple)
function setupTabNavigation() {
  const tabs = {
    phone: document.getElementById("tab-phone"),
    bathroom: document.getElementById("tab-bathroom"),
    hall: document.getElementById("tab-hall")
  };

  const badge = document.getElementById("screen-badge");
  const title = document.getElementById("screen-title");
  const subtitle = document.getElementById("screen-subtitle");
  const pocketContainer = document.getElementById("phone-pocket-container");
  const submitBtn = document.getElementById("btn-submit-id");
  const idInput = document.getElementById("kiosk-id-input");

  const inactiveTabClass = "kiosk-tab py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition text-slate-600 hover:text-slate-900 hover:bg-white/60";

  Object.entries(tabs).forEach(([type, btn]) => {
    if (!btn) return;

    btn.onclick = () => {
      activeScreen = type;

      // Reset all tabs to inactive styling
      Object.values(tabs).forEach(t => {
        if (t) t.className = inactiveTabClass;
      });

      // Apply screen-specific Color Coordination
      if (type === "phone") {
        // Phone Mode: Green Theme
        btn.className = "kiosk-tab py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition bg-[#0B4F2C] text-white shadow-md";
        badge.className = "inline-block px-3 py-1 rounded-full bg-emerald-100 text-[#0B4F2C] font-extrabold text-xs uppercase tracking-wider mb-2";
        badge.textContent = "Phone Storage Mode Active";
        title.textContent = "Scan Student ID to Store Phone";
        subtitle.textContent = "Scan your ID to check in your mobile device into a classroom pocket.";
        
        if (submitBtn) {
          submitBtn.className = "w-full bg-[#0B4F2C] hover:bg-[#07381e] active:scale-[0.98] text-white font-extrabold py-3.5 rounded-2xl shadow-md transition text-sm uppercase tracking-wider flex items-center justify-center gap-2";
        }
        if (idInput) {
          idInput.className = "w-full text-center text-2xl font-mono font-black py-3.5 px-6 rounded-2xl border-2 border-slate-300 focus:border-[#0B4F2C] focus:ring-4 focus:ring-emerald-100 focus:outline-none transition tracking-widest text-slate-800 bg-slate-50";
        }
        if (pocketContainer) pocketContainer.classList.remove("hidden");
        renderPocketGrid();

      } else if (type === "bathroom") {
        // Bathroom Pass Mode: Red Theme
        btn.className = "kiosk-tab py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition bg-rose-800 text-white shadow-md";
        badge.className = "inline-block px-3 py-1 rounded-full bg-rose-100 text-rose-800 font-extrabold text-xs uppercase tracking-wider mb-2";
        badge.textContent = "Bathroom Mode Active";
        title.textContent = "Scan Student ID Barcode";
        subtitle.textContent = "Scan or enter your Student ID to check out or return a Bathroom Pass.";
        
        if (submitBtn) {
          submitBtn.className = "w-full bg-rose-800 hover:bg-rose-900 active:scale-[0.98] text-white font-extrabold py-3.5 rounded-2xl shadow-md transition text-sm uppercase tracking-wider flex items-center justify-center gap-2";
        }
        if (idInput) {
          idInput.className = "w-full text-center text-2xl font-mono font-black py-3.5 px-6 rounded-2xl border-2 border-slate-300 focus:border-rose-800 focus:ring-4 focus:ring-rose-100 focus:outline-none transition tracking-widest text-slate-800 bg-slate-50";
        }
        if (pocketContainer) pocketContainer.classList.add("hidden");

      } else if (type === "hall") {
        // Hall Pass Mode: Purple Theme
        btn.className = "kiosk-tab py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition bg-purple-800 text-white shadow-md";
        badge.className = "inline-block px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-extrabold text-xs uppercase tracking-wider mb-2";
        badge.textContent = "Hall Pass Mode Active";
        title.textContent = "Scan Student ID Barcode";
        subtitle.textContent = "Scan or enter your Student ID to check out or return a Hall Pass.";
        
        if (submitBtn) {
          submitBtn.className = "w-full bg-purple-800 hover:bg-purple-900 active:scale-[0.98] text-white font-extrabold py-3.5 rounded-2xl shadow-md transition text-sm uppercase tracking-wider flex items-center justify-center gap-2";
        }
        if (idInput) {
          idInput.className = "w-full text-center text-2xl font-mono font-black py-3.5 px-6 rounded-2xl border-2 border-slate-300 focus:border-purple-800 focus:ring-4 focus:ring-purple-100 focus:outline-none transition tracking-widest text-slate-800 bg-slate-50";
        }
        if (pocketContainer) pocketContainer.classList.add("hidden");
      }

      if (idInput) idInput.focus();
    };
  });
}

// Render Inline Phone Pocket Grid (Pockets 1 through 36)
function renderPocketGrid() {
  const grid = document.getElementById("pocket-grid");
  const numDisplay = document.getElementById("selected-pocket-num");
  if (!grid || activeScreen !== "phone") return;

  const occupiedPockets = new Set(
    Object.values(activePasses)
      .filter(p => p.type === "phone" && p.pocketNumber)
      .map(p => Number(p.pocketNumber))
  );

  if (occupiedPockets.has(selectedPocket) || !selectedPocket) {
    selectedPocket = getLowestAvailablePocket();
  }

  if (numDisplay) numDisplay.textContent = selectedPocket;

  grid.innerHTML = "";

  for (let i = 1; i <= 36; i++) {
    const isOccupied = occupiedPockets.has(i);
    const isSelected = i === selectedPocket;

    let btnClass = "py-2.5 rounded-xl font-mono text-xs font-black transition border flex items-center justify-center ";
    if (isOccupied) {
      btnClass += "bg-rose-100 text-rose-700 border-rose-300 cursor-not-allowed opacity-80";
    } else if (isSelected) {
      btnClass += "bg-[#0B4F2C] text-white border-[#0B4F2C] shadow-md ring-2 ring-emerald-400 scale-105 font-bold";
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
      renderPocketGrid();
    };

    grid.appendChild(pocketBtn);
  }
}

// Find Lowest Available Unoccupied Pocket
function getLowestAvailablePocket() {
  const occupiedPockets = new Set(
    Object.values(activePasses)
      .filter(p => p.type === "phone" && p.pocketNumber)
      .map(p => Number(p.pocketNumber))
  );

  let pocket = 1;
  while (occupiedPockets.has(pocket) && pocket <= 36) {
    pocket++;
  }
  return pocket <= 36 ? pocket : 1;
}

// Handle ID Submission
function setupInputHandlers() {
  const input = document.getElementById("kiosk-id-input");
  const submitBtn = document.getElementById("btn-submit-id");

  const processID = () => {
    const rawId = input.value.trim();
    if (!rawId) return;

    // Validate Roster ID with 3-Attempt Rule
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
        openGuestModal(rawId);
      }
      return;
    }

    failedAttemptsCount = 0;
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

// Pass Creation & Screen-Specific Return Workflow
async function handlePassWorkflow(studentId, student) {
  const existingPass = activePasses[studentId];

  // SCENARIO A: RETURN PASS
  if (existingPass) {
    if (existingPass.type !== activeScreen) {
      const requiredScreenName = existingPass.type.toUpperCase();
      showFullscreenNotice(
        "WRONG SCREEN FOR RETURN",
        `You have an active ${requiredScreenName} pass. Switch to the ${requiredScreenName} screen to check in!`,
        "warning"
      );
      return;
    }

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

  // SCENARIO B: CREATE PASS
  if (activeScreen === "phone") {
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

    selectedPocket = getLowestAvailablePocket();
    renderPocketGrid();
    return;
  }

  // Require phone check-in prior to issuing Bathroom or Hall pass
  const hasPhoneCheckedIn = Object.values(activePasses).some(
    pass => pass.studentId === studentId && pass.type === "phone"
  );

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

// Guest Request Pop-up Modal setup for Attempt 3
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
