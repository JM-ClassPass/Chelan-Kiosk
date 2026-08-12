import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getDatabase, ref, get, set, push, onValue, serverTimestamp, remove } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

// ==========================================
// 1. KIOSK CONFIGURATION
// Other teachers can easily update their room details below.
// ==========================================
const KIOSK_CONFIG = {
  roomNumber: "176",
  kioskName: "STUDENT KIOSK",
  version: "v1.1.13" // Bumped version to reflect strict data contract
};

// Apply Configuration to the UI
document.getElementById('kiosk-room').innerHTML = `${KIOSK_CONFIG.kioskName} &bull; ROOM ${KIOSK_CONFIG.roomNumber}`;
document.getElementById('kiosk-version').innerText = KIOSK_CONFIG.version;

// ==========================================
// 2. FIREBASE INITIALIZATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDOqjLMzMydaR31WWUA35sr1FrNLfHPxuI",
  authDomain: "chelan-classroom-pass-a811e.firebaseapp.com",
  databaseURL: "https://chelan-classroom-pass-a811e-default-rtdb.firebaseio.com",
  projectId: "chelan-classroom-pass-a811e",
  storageBucket: "chelan-classroom-pass-a811e.firebasestorage.app",
  messagingSenderId: "645480807479",
  appId: "1:645480807479:web:d280d4ef38e8754a9953b2"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 3. State Variables
let currentMode = 'phone';
let selectedPocket = null;
let occupiedPockets = [];
let unrecognizedAttempts = {};

// 4. UI Element References
const clockEl = document.getElementById('kiosk-clock');
const tabs = document.querySelectorAll('.kiosk-tab');
const pocketContainer = document.getElementById('phone-pocket-container');
const pocketGrid = document.getElementById('pocket-grid');
const selectedPocketNumSpan = document.getElementById('selected-pocket-num');
const badge = document.getElementById('screen-badge');
const title = document.getElementById('screen-title');
const subtitle = document.getElementById('screen-subtitle');

const idInput = document.getElementById('kiosk-id-input');
const submitIdBtn = document.getElementById('btn-submit-id');

const guestModal = document.getElementById('guest-request-modal');
const guestIdDisplay = document.getElementById('guest-id-display');
const guestNameInput = document.getElementById('guest-name-input');
const btnCancelGuest = document.getElementById('btn-cancel-guest');
const btnSubmitGuest = document.getElementById('btn-submit-guest');

const overlay = document.getElementById('fullscreen-notice');
const overlayIcon = document.getElementById('fullscreen-notice-icon');
const overlayTitle = document.getElementById('fullscreen-notice-title');
const overlaySubtitle = document.getElementById('fullscreen-notice-subtitle');

// 5. Live Clock
setInterval(() => {
  clockEl.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}, 1000);

// 6. Tab UI Switching Logic
const tabConfigs = {
  phone: { badge: 'Phone Storage Mode Active', title: 'Scan/Enter ID to Store Phone', subtitle: 'Scan/Enter ID to check in your mobile device into a classroom pocket.' },
  bathroom: { badge: 'Bathroom Pass Mode Active', title: 'Scan/Enter ID for Bathroom', subtitle: 'Scan/Enter ID to sign out for the restroom.' },
  hall: { badge: 'Hall Pass Mode Active', title: 'Scan/Enter ID for Hallway', subtitle: 'Scan/Enter ID to request a general hall pass.' }
};

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => {
      t.className = "kiosk-tab py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition text-slate-600 hover:text-slate-900 hover:bg-white/60";
    });
    
    tab.className = "kiosk-tab py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition bg-[#0B4F2C] text-white shadow-md";
    currentMode = tab.dataset.action;
    
    badge.textContent = tabConfigs[currentMode].badge;
    title.textContent = tabConfigs[currentMode].title;
    subtitle.textContent = tabConfigs[currentMode].subtitle;

    if (currentMode === 'phone') {
      pocketContainer.classList.remove('hidden');
      autoSelectLowestPocket();
    } else {
      pocketContainer.classList.add('hidden');
      selectedPocket = null;
    }
    idInput.focus();
  });
});

// 7. Build Pocket Grid & Listen for Occupancy
function buildPocketGrid() {
  pocketGrid.innerHTML = '';
  for (let i = 1; i <= 36; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.id = `pocket-btn-${i}`;
    btn.className = 'bg-white border border-slate-300 text-slate-700 font-bold py-2 rounded-lg hover:bg-slate-100 transition shadow-sm text-xs';
    
    btn.addEventListener('click', () => {
      if (!occupiedPockets.includes(i.toString().padStart(2, '0'))) {
        setPocketActive(i);
      }
    });
    pocketGrid.appendChild(btn);
  }
}

function setPocketActive(num) {
  selectedPocket = num.toString().padStart(2, '0');
  selectedPocketNumSpan.textContent = num;
  
  for (let i = 1; i <= 36; i++) {
    const pBtn = document.getElementById(`pocket-btn-${i}`);
    const pStr = i.toString().padStart(2, '0');
    if (occupiedPockets.includes(pStr)) {
      pBtn.className = 'bg-slate-200 border-slate-300 text-slate-400 font-bold py-2 rounded-lg cursor-not-allowed opacity-60 text-xs';
    } else {
      pBtn.className = 'bg-white border border-slate-300 text-slate-700 font-bold py-2 rounded-lg hover:bg-slate-100 transition shadow-sm text-xs';
    }
  }
  
  const activeBtn = document.getElementById(`pocket-btn-${num}`);
  if (activeBtn) {
    activeBtn.className = 'bg-[#0B4F2C] text-white border-[#0B4F2C] font-bold py-2 rounded-lg transform scale-105 shadow-md transition text-xs';
  }
  idInput.focus();
}

function autoSelectLowestPocket() {
  for (let i = 1; i <= 36; i++) {
    if (!occupiedPockets.includes(i.toString().padStart(2, '0'))) {
      setPocketActive(i);
      return;
    }
  }
  selectedPocket = null; // Failsafe if all 36 are full
}

// Listen to Firebase for live occupied pockets
onValue(ref(db, 'active_phones_in_class'), (snapshot) => {
  occupiedPockets = [];
  if (snapshot.exists()) {
    const data = snapshot.val();
    Object.values(data).forEach(student => {
      if (student.pocket) occupiedPockets.push(student.pocket);
    });
  }
  if (currentMode === 'phone') {
    buildPocketGrid();
    autoSelectLowestPocket();
  }
});

buildPocketGrid();

// 8. Core Database Operations
submitIdBtn.addEventListener('click', handleIdSubmit);
idInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleIdSubmit();
});

async function handleIdSubmit() {
  const rawId = idInput.value.trim();
  if (!rawId) return;
  const studentId = rawId.replace(/[^a-zA-Z0-9]/g, '');

  try {
    const rosterRef = ref(db, `classroom_roster/${studentId}`);
    const snapshot = await get(rosterRef);

    if (snapshot.exists()) {
      const studentData = snapshot.val();
      unrecognizedAttempts[studentId] = 0;
      await processAction(studentId, studentData);
    } else {
      handleUnrecognized(studentId);
    }
  } catch (err) {
    showOverlay('SYSTEM ERROR', 'Check connection.', 'error');
  }
}

// MULTI-STATE CHECKS & LIMITS
async function processAction(studentId, studentData) {
  const fullName = `${studentData.firstName} ${studentData.lastName}`;

  // Grab all three potential active states simultaneously
  const phoneRef = ref(db, `active_phones_in_class/${studentId}`);
  const bathroomRef = ref(db, `active_bathroom_passes/${studentId}`);
  const hallRef = ref(db, `active_hall_passes/${studentId}`);

  const [phoneSnap, bathroomSnap, hallSnap] = await Promise.all([
    get(phoneRef),
    get(bathroomRef),
    get(hallRef)
  ]);

  const hasPhone = phoneSnap.exists();
  const hasBathroom = bathroomSnap.exists();
  const hasHall = hallSnap.exists();

  if (currentMode === 'phone') {
    if (hasPhone) {
      // --- PHONE CHECKOUT LOGIC ---
      if (hasBathroom || hasHall) {
        const passType = hasBathroom ? "bathroom" : "hall";
        showOverlay('ACTION DENIED', `Please return your ${passType} pass before retrieving your phone.`, 'error');
        idInput.value = '';
        return;
      }

      const prevData = phoneSnap.val();
      const oldPocket = prevData.pocket;

      await remove(phoneRef);
      // FIXED CONTRACT: type: 'Phone', details: 'COS'
      await set(push(ref(db, 'system_logs')), {
        studentId, name: fullName, type: 'Phone', details: 'COS', timestamp: serverTimestamp(), duration: '--'
      });

      showOverlay(`PHONE RETRIEVED`, `${studentData.firstName} removed phone from pocket ${oldPocket}`, 'success');
      idInput.value = '';
    } else {
      // --- PHONE CHECK-IN LOGIC ---
      if (!selectedPocket) {
        return showOverlay('ERROR', 'No pocket selected. (All full?)', 'error');
      }
      
      const pocketToUse = selectedPocket;

      await set(phoneRef, {
        studentName: fullName,
        firstName: studentData.firstName,
        lastName: studentData.lastName,
        pocket: pocketToUse,
        timestamp: serverTimestamp()
      });

      // FIXED CONTRACT: type: 'Phone', details: `CI-${pocketToUse}`
      await set(push(ref(db, 'system_logs')), {
        studentId, name: fullName, type: 'Phone', details: `CI-${pocketToUse}`, timestamp: serverTimestamp(), duration: '--'
      });

      showOverlay(`PHONE STORED`, `${studentData.firstName} secured phone in pocket ${pocketToUse}`, 'success');
      idInput.value = '';
    }
  } 
  else if (currentMode === 'bathroom') {
    if (hasBathroom) {
      // --- BATHROOM RETURN LOGIC ---
      await remove(bathroomRef);
      // FIXED CONTRACT: type: 'BP', details: 'BP-I'
      await set(push(ref(db, 'system_logs')), { studentId, name: fullName, type: 'BP', details: 'BP-I', timestamp: serverTimestamp(), duration: '--' });
      showOverlay(`WELCOME BACK`, `${studentData.firstName} has returned`, 'success');
    } else {
      // --- BATHROOM OUT LOGIC ---
      if (!hasPhone) {
        showOverlay('ACTION DENIED', 'You must check in your phone first.', 'error');
        idInput.value = '';
        return;
      }
      if (hasHall) {
        showOverlay('ACTION DENIED', 'You already have a hall pass out.', 'error');
        idInput.value = '';
        return;
      }
      
      // STRICT RULE: Only 1 bathroom pass at a time globally
      const allBathroomRef = ref(db, 'active_bathroom_passes');
      const allBathroomSnap = await get(allBathroomRef);
      if (allBathroomSnap.exists() && Object.keys(allBathroomSnap.val()).length >= 1) {
        showOverlay('ACTION DENIED', 'The bathroom pass is currently in use by another student.', 'error');
        idInput.value = '';
        return;
      }

      await set(bathroomRef, { studentName: fullName, timestamp: serverTimestamp() });
      // FIXED CONTRACT: type: 'BP', details: 'BP-O'
      await set(push(ref(db, 'system_logs')), { studentId, name: fullName, type: 'BP', details: 'BP-O', timestamp: serverTimestamp(), duration: '--' });
      showOverlay(`PASS CREATED`, `${studentData.firstName} signed out for bathroom`, 'success');
    }
    idInput.value = '';
  } 
  else if (currentMode === 'hall') {
    if (hasHall) {
      // --- HALL RETURN LOGIC ---
      await remove(hallRef);
      // FIXED CONTRACT: type: 'HP', details: 'HP-I'
      await set(push(ref(db, 'system_logs')), { studentId, name: fullName, type: 'HP', details: 'HP-I', timestamp: serverTimestamp(), duration: '--' });
      showOverlay(`WELCOME BACK`, `${studentData.firstName} has returned`, 'success');
    } else {
      // --- HALL OUT LOGIC ---
      if (!hasPhone) {
        showOverlay('ACTION DENIED', 'You must check in your phone first.', 'error');
        idInput.value = '';
        return;
      }
      if (hasBathroom) {
        showOverlay('ACTION DENIED', 'You already have a bathroom pass out.', 'error');
        idInput.value = '';
        return;
      }

      await set(hallRef, { studentName: fullName, timestamp: serverTimestamp() });
      // FIXED CONTRACT: type: 'HP', details: 'HP-O'
      await set(push(ref(db, 'system_logs')), { studentId, name: fullName, type: 'HP', details: 'HP-O', timestamp: serverTimestamp(), duration: '--' });
      showOverlay(`PASS CREATED`, `${studentData.firstName} signed out for hallway`, 'success');
    }
    idInput.value = '';
  }
}

// 9. Guest & Unrecognized Handlers
function handleUnrecognized(studentId) {
  unrecognizedAttempts[studentId] = (unrecognizedAttempts[studentId] || 0) + 1;
  
  if (unrecognizedAttempts[studentId] >= 3) {
    guestIdDisplay.value = studentId;
    guestNameInput.value = '';
    guestModal.classList.remove('hidden');
    guestModal.classList.add('flex');
    guestNameInput.focus();
  } else {
    showOverlay('ID NOT FOUND', `Attempt ${unrecognizedAttempts[studentId]} of 3. Try again.`, 'error');
    idInput.value = '';
    idInput.focus();
  }
}

btnCancelGuest.addEventListener('click', () => {
  guestModal.classList.add('hidden');
  guestModal.classList.remove('flex');
  idInput.value = '';
  idInput.focus();
});

btnSubmitGuest.addEventListener('click', async () => {
  const fullNameRaw = guestNameInput.value.trim();
  if (!fullNameRaw) return alert("Please enter a name.");
  
  const nameParts = fullNameRaw.split(' ');
  const fName = nameParts[0];
  const lName = nameParts.slice(1).join(' ') || '';
  const sId = guestIdDisplay.value;

  try {
    await set(ref(db, `pending_roster_approvals/${sId}`), {
      firstName: fName,
      lastName: lName,
      pocket: currentMode === 'phone' ? selectedPocket : null,
      timestamp: serverTimestamp()
    });
    
    guestModal.classList.add('hidden');
    guestModal.classList.remove('flex');
    showOverlay('REQUEST SENT', 'Awaiting teacher approval.', 'success');
    idInput.value = '';
  } catch (err) {
    alert("Error sending request.");
  }
});

// 10. Overlay Controls
function showOverlay(titleText, subtitleText, type) {
  overlayTitle.textContent = titleText;
  overlaySubtitle.textContent = subtitleText;
  
  if (type === 'success') {
    overlayIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    overlayIcon.className = "text-7xl mb-6 text-emerald-400";
  } else {
    overlayIcon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
    overlayIcon.className = "text-7xl mb-6 text-red-500";
  }

  overlay.classList.remove('hidden');
  overlay.classList.add('flex');

  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
    if (currentMode === 'phone') autoSelectLowestPocket();
    idInput.focus();
  }, 2000); 
}
