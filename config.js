import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, onValue, get, set, push, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { APP_CONFIG } from "./config.js";

// 1. Initialize Firebase App, Auth, and Database
const app = initializeApp(APP_CONFIG.firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// 2. Authenticate the Kiosk Silently
signInAnonymously(auth)
  .then(() => {
    // Swapped roomId for department to match your config.js
    console.log(`Kiosk connected securely for ${APP_CONFIG.department}`);
    
    // ==========================================
    // 1. KIOSK CONFIGURATION
    // Other teachers can easily update their room details below.
    // ==========================================
    const KIOSK_CONFIG = {
      roomNumber: "176",
      kioskName: "STUDENT KIOSK",
    };

    // Apply Configuration to the UI
    document.getElementById('kiosk-room').innerHTML = `${KIOSK_CONFIG.kioskName} &bull; ROOM ${KIOSK_CONFIG.roomNumber}`;

    // ==========================================
    // 2. State Variables
    // ==========================================
    let currentMode = 'phone';
    let selectedPocket = null;
    let occupiedPockets = [];
    let unrecognizedAttempts = {};

    // 3. UI Element References
    const clockEl = document.getElementById('kiosk-clock');
    const tabs = document.querySelectorAll('.kiosk-tab');
    const pocketContainer = document.getElementById('phone-pocket-container');
    const pocketGrid = document.getElementById('pocket-grid');

    // Drive the pocket grid's column count from config, so rows/cols can be
    // changed in one place (APP_CONFIG.pocketLayout) without touching layout CSS.
    pocketGrid.style.gridTemplateColumns = `repeat(${APP_CONFIG.pocketLayout.cols}, minmax(0, 1fr))`;

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

    // 4. Live Clock
    setInterval(() => {
      clockEl.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    }, 1000);

    // 5. Tab UI Switching Logic
    const tabConfigs = {
      phone: { badge: 'Phone Storage Mode Active', title: 'Phone Storage', subtitle: 'Scan/Enter your student ID to check your mobile device in/out of a pocket.' },
      bathroom: { badge: 'Bathroom Pass Mode Active', title: 'Bathroom Pass', subtitle: 'Scan/Enter ID to sign out/in for the restroom.' },
      hall: { badge: 'Hall Pass Mode Active', title: 'Hall Pass', subtitle: 'Scan/Enter ID to sign out/in with a hall pass.' }
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

    // 6. Build Pocket Grid & Listen for Occupancy
    function buildPocketGrid() {
      pocketGrid.innerHTML = '';
      for (let i = 1; i <= APP_CONFIG.pocketsAvailable; i++) {
        const btn = document.createElement('button');
        const pStr = i.toString().padStart(2, '0');
        const isOccupied = occupiedPockets.includes(pStr);
        
        btn.textContent = i;
        btn.id = `pocket-btn-${i}`;
        
        if (isOccupied) {
          // 🚫 OCCUPIED: Gray it out and completely disable clicking
          btn.className = 'bg-slate-200 border-slate-300 text-slate-400 font-bold py-2 rounded-lg cursor-not-allowed opacity-60 text-xs';
          btn.disabled = true;
        } else {
          // ✅ AVAILABLE: Make it clickable and style normally
          btn.className = 'bg-white border border-slate-300 text-slate-700 font-bold py-2 rounded-lg hover:bg-slate-100 transition shadow-sm text-xs';
          btn.addEventListener('click', () => {
            setPocketActive(i);
          });
        }
        pocketGrid.appendChild(btn);
      }
    }

    function setPocketActive(num) {
      selectedPocket = num.toString().padStart(2, '0');
      selectedPocketNumSpan.textContent = num;
      
      // Update visual state for all buttons without recreating them
      for (let i = 1; i <= APP_CONFIG.pocketsAvailable; i++) {
        const pBtn = document.getElementById(`pocket-btn-${i}`);
        const pStr = i.toString().padStart(2, '0');
        
        if (occupiedPockets.includes(pStr)) {
          pBtn.className = 'bg-slate-200 border-slate-300 text-slate-400 font-bold py-2 rounded-lg cursor-not-allowed opacity-60 text-xs';
          pBtn.disabled = true;
        } else {
          pBtn.className = 'bg-white border border-slate-300 text-slate-700 font-bold py-2 rounded-lg hover:bg-slate-100 transition shadow-sm text-xs';
          pBtn.disabled = false;
        }
      }
      
      // Highlight the currently selected one in Dark Forest Green
      const activeBtn = document.getElementById(`pocket-btn-${num}`);
      if (activeBtn) {
        activeBtn.className = 'bg-[#0B4F2C] text-white border-[#0B4F2C] font-bold py-2 rounded-lg transform scale-105 shadow-md transition text-xs';
      }
      idInput.focus();
    }

    function autoSelectLowestPocket() {
      for (let i = 1; i <= APP_CONFIG.pocketsAvailable; i++) {
        if (!occupiedPockets.includes(i.toString().padStart(2, '0'))) {
          setPocketActive(i);
          return;
        }
      }
      // Failsafe if all 35 are full
      selectedPocket = null; 
      selectedPocketNumSpan.textContent = "FULL";
    }

    // Listen to Firebase for live occupied pockets
    onValue(ref(db, 'active_phones_in_class'), (snapshot) => {
      occupiedPockets = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.values(data).forEach(student => {
          if (student.pocket) {
            // Force it into a padded string (e.g. "05") to guarantee exact matching
            occupiedPockets.push(student.pocket.toString().padStart(2, '0'));
          }
        });
      }
      if (currentMode === 'phone') {
        buildPocketGrid();
        autoSelectLowestPocket();
      }
    }, (error) => {
      console.error("Firebase Read Blocked:", error);
    });

    // Initial load
    buildPocketGrid();

    // 7. Core Database Operations
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
        console.error("Firebase Write or Logic Error:", err);
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

      // Helper to calculate duration in minutes/hours
      const getDuration = (startTimestamp) => {
        if (!startTimestamp) return '--';
        const diffMins = Math.floor((Date.now() - startTimestamp) / 60000);
        if (diffMins < 1) return '<1m';
        if (diffMins < 60) return `${diffMins}m`;
        return `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
      };

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
          const durationStr = getDuration(prevData.timestamp); // Calculate Duration

          await remove(phoneRef);
          await set(push(ref(db, 'system_logs')), {
            studentId, name: fullName, type: 'Phone', details: 'COS', timestamp: serverTimestamp(), duration: durationStr
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
          const durationStr = getDuration(bathroomSnap.val().timestamp); // Calculate Duration
          await remove(bathroomRef);
          await set(push(ref(db, 'system_logs')), { studentId, name: fullName, type: 'BP', details: 'BP-I', timestamp: serverTimestamp(), duration: durationStr });
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
          await set(push(ref(db, 'system_logs')), { studentId, name: fullName, type: 'BP', details: 'BP-O', timestamp: serverTimestamp(), duration: '--' });
          showOverlay(`PASS CREATED`, `${studentData.firstName} signed out for bathroom`, 'success');
        }
        idInput.value = '';
      } 
      else if (currentMode === 'hall') {
        if (hasHall) {
          // --- HALL RETURN LOGIC ---
          const durationStr = getDuration(hallSnap.val().timestamp); // Calculate Duration
          await remove(hallRef);
          await set(push(ref(db, 'system_logs')), { studentId, name: fullName, type: 'HP', details: 'HP-I', timestamp: serverTimestamp(), duration: durationStr });
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
          await set(push(ref(db, 'system_logs')), { studentId, name: fullName, type: 'HP', details: 'HP-O', timestamp: serverTimestamp(), duration: '--' });
          showOverlay(`PASS CREATED`, `${studentData.firstName} signed out for hallway`, 'success');
        }
        idInput.value = '';
      }
    }
    
    // 8. Guest & Unrecognized Handlers
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

    // 9. Overlay Controls
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

    // ==========================================
    // CONFIG VERSION UPDATE
    // ==========================================
    function updateVersionTag() {
        const versionEl = document.getElementById('version');
        if (versionEl && typeof APP_CONFIG !== 'undefined') {
            versionEl.textContent = APP_CONFIG.version;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateVersionTag);
    } else {
        updateVersionTag();
    }

  })
  .catch((error) => {
    console.error("Kiosk failed to connect to Firebase:", error.code, error.message);
    alert("Connection error. Please tell the teacher.");
  });
