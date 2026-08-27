import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, get, onValue, set, push, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { APP_CONFIG, escapeHtml } from "./config.js";

// 1. Initialize Firebase App, Auth & DB
const app = initializeApp(APP_CONFIG.firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const provider = new GoogleAuthProvider();

// Live clock — this existed in the HTML markup but was never wired up to
// any JS, so it just sat frozen at its placeholder text. Mirrors the same
// approach kiosk.js already uses.
const liveClockEl = document.getElementById('live-clock');
if (liveClockEl) {
  const tickClock = () => {
    liveClockEl.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  };
  tickClock();
  setInterval(tickClock, 1000);
}

// Header Profile Elements
const userProfile = document.getElementById("user-profile");
const userEmailSpan = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");

// Login Elements
const loginOverlay = document.getElementById("login-overlay");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");

// 2. Auth Guard & Allowlist Verification
onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (loginError) loginError.textContent = "Verifying permissions...";

    // Check this user's own allowlist entry, keyed by their UID.
    // The security rules only let a user read their own entry, so this
    // is also the most this client is *able* to check — actual
    // enforcement happens in the rules, not here.
    //
    // This read can transiently fail right after a page load / tab switch,
    // because the Realtime Database connection can take a beat to pick up
    // the just-restored auth token. We do NOT want to treat that hiccup as
    // "not authorized" and sign the person out — only a definitive answer
    // (the read succeeded and the entry genuinely isn't true) should do that.
    const allowRef = ref(db, `allowed_teachers/${user.uid}`);
    const delays = [0, 500, 1200, 2500]; // a few attempts, backing off
    let snapshot = null;
    let lastErr = null;

    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await new Promise(resolve => setTimeout(resolve, delays[i]));
      try {
        snapshot = await get(allowRef);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`Allowlist check attempt ${i + 1} failed:`, err.code || err.message);
      }
    }

    if (lastErr) {
      console.error("Allowlist check failed after all retries:", lastErr.code || lastErr.message);
      if (loginError) loginError.textContent = "Couldn't verify your access — check your connection and try again.";
      if (loginOverlay) loginOverlay.classList.remove("hidden");
      if (userProfile) userProfile.classList.add("hidden");
      return; // do NOT sign out — this was a connection problem, not a denial
    }

    const isAllowed = snapshot.exists() && snapshot.val() === true;

    if (isAllowed) {
      if (loginOverlay) loginOverlay.classList.add("hidden");
      if (loginError) loginError.textContent = "";
      if (userEmailSpan) userEmailSpan.textContent = user.email;
      if (userProfile) userProfile.classList.remove("hidden");

      console.log(`Teacher authorized on Dashboard: ${user.email}`);
    } else {
      if (loginError) loginError.textContent = "Access Denied: this account isn't on the approved teacher list. Ask an admin to add your UID.";
      if (userProfile) userProfile.classList.add("hidden");
      signOut(auth);
    }
  } else {
    if (loginOverlay) loginOverlay.classList.remove("hidden");
    if (userProfile) userProfile.classList.add("hidden");
  }
});

// 3. Auth Buttons
if (loginBtn) {
  loginBtn.addEventListener("click", () => signInWithPopup(auth, provider));
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => signOut(auth));
}

// ==========================================
// 4. STATE VARIABLES
// ==========================================
let phonesData = {};
let bathroomPassesData = {};
let hallPassesData = {};
let pendingApprovalsData = {};
let logsData = {};
let rosterData = {}; // for the Manual Pass Override search — not currently rendered as a full roster view here, just used for name lookups
let currentSort = 'last';

// ==========================================
// 5. UTILITY FUNCTIONS
// ==========================================
// CSV-cell escaping only (used by exportLogsToCSV below). This does NOT make
// text safe to insert into innerHTML — use escapeHtml() from config.js for that.
function escapeAttr(str) {
    return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function formatDuration(ms) {
    if (!ms || ms < 0) return '--';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
}

function parseDurationToDecimalMinutes(durationStr) {
    if (!durationStr || durationStr === '--') return '--';
    if (durationStr === '<1m') return '0.5';

    let totalMinutes = 0;
    let foundMatch = false;

    // Extract hours
    const hourMatch = durationStr.match(/(\d+)h/);
    if (hourMatch) { totalMinutes += parseInt(hourMatch[1], 10) * 60; foundMatch = true; }

    // Extract minutes
    const minMatch = durationStr.match(/(\d+)m/);
    if (minMatch) { totalMinutes += parseInt(minMatch[1], 10); foundMatch = true; }
    
    // Extract seconds (from dashboard manual checkouts)
    const secMatch = durationStr.match(/(\d+)s/);
    if (secMatch) { totalMinutes += parseInt(secMatch[1], 10) / 60; foundMatch = true; }

    if (!foundMatch) return durationStr; // Fallback for plain text

    return totalMinutes.toFixed(1);
}

// ==========================================
// 6. GLOBAL DASHBOARD ACTIONS (Attached to Window)
// ==========================================
window.exportLogsToCSV = () => {
    const keys = Object.keys(logsData).reverse();
    if (keys.length === 0) {
        alert("No logs to export.");
        return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Date,Time,Student,Action,Code,Duration (Minutes)\n";
    
    keys.forEach(k => {
        const l = logsData[k];
        const dateObj = l.timestamp ? new Date(l.timestamp) : new Date();
        const dateStr = dateObj.toLocaleDateString();
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        const name = `"${escapeAttr(l.name || l.studentId || 'Unknown')}"`;
        const actionType = `"${escapeAttr(l.type || 'Phone')}"`;
        const detailsCode = `"${escapeAttr(l.details || l.action || '--')}"`;
        
        // Parse the duration string to decimal before exporting
        const rawDuration = l.duration || '--';
        const parsedDuration = parseDurationToDecimalMinutes(rawDuration);
        const duration = `"${escapeAttr(parsedDuration)}"`;
        
        csvContent += `${dateStr},${timeStr},${name},${actionType},${detailsCode},${duration}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Chelan_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.clearLogs = async () => {
    const keys = Object.keys(logsData);
    if (keys.length === 0) {
        alert("Logs are already empty.");
        return;
    }
    if (!confirm(`⚠️ Are you sure you want to permanently delete all ${keys.length} log entries?\n\nThis cannot be undone. We recommend Exporting to CSV first.`)) {
        return;
    }
    
    try {
        await remove(ref(db, 'system_logs'));
    } catch (err) {
        console.error("Clear logs error:", err);
        alert("Error clearing logs: " + err.message);
    }
};

window.setPhoneSort = (sortType) => {
    currentSort = sortType;
    const btnFirst = document.getElementById('sort-first');
    const btnLast = document.getElementById('sort-last');
    const btnPocket = document.getElementById('sort-pocket');

    const activeClass = "bg-chelan text-white px-2 py-0.5 rounded-md";
    const inactiveClass = "px-2 py-0.5 rounded-md hover:text-slate-800";

    if (btnFirst) btnFirst.className = sortType === 'first' ? activeClass : inactiveClass;
    if (btnLast) btnLast.className = sortType === 'last' ? activeClass : inactiveClass;
    if (btnPocket) btnPocket.className = sortType === 'pocket' ? activeClass : inactiveClass;

    renderPhones();
};

window.forceRemovePhone = async (id) => {
    const phone = phonesData[id];
    const studentName = phone ? (phone.studentName || `${phone.firstName || ''} ${phone.lastName || ''}`.trim()) : id;
    const now = Date.now();

    try {
        // Phone
        if (phone) {
            const duration = formatDuration(now - (phone.timestamp || now));
            await remove(ref(db, `active_phones_in_class/${id}`));
            await push(ref(db, 'system_logs'), {
                studentId: id, name: studentName, type: 'Phone', details: 'COT', timestamp: now, duration: duration
            });
        }

        // Also close out any bathroom pass this student still has open —
        // "Check Out" for a student should mean fully checked out, not just
        // their phone, same as what Check Out All does across everyone.
        const bathroomPass = bathroomPassesData[id];
        if (bathroomPass) {
            const duration = formatDuration(now - (bathroomPass.timestamp || now));
            await remove(ref(db, `active_bathroom_passes/${id}`));
            await push(ref(db, 'system_logs'), {
                studentId: id, name: studentName, type: 'BP', details: 'BP-I', timestamp: now, duration: duration
            });
        }

        // Same for an open hall pass.
        const hallPass = hallPassesData[id];
        if (hallPass) {
            const duration = formatDuration(now - (hallPass.timestamp || now));
            await remove(ref(db, `active_hall_passes/${id}`));
            await push(ref(db, 'system_logs'), {
                studentId: id, name: studentName, type: 'HP', details: 'HP-I', timestamp: now, duration: duration
            });
        }
    } catch (err) {
        console.error("Checkout error:", err);
    }
};

window.clearAllActivity = async () => {
    const phoneKeys = Object.keys(phonesData);
    const bpKeys = Object.keys(bathroomPassesData);
    const hpKeys = Object.keys(hallPassesData);
    const totalItems = phoneKeys.length + bpKeys.length + hpKeys.length;

    if (totalItems === 0) return;
    if (!confirm(`Are you sure you want to Check Out ALL ${totalItems} active items (Phones & Passes)?`)) return;

    const now = Date.now();

    try {
        for (const id of phoneKeys) {
            const phone = phonesData[id];
            const studentName = phone ? (phone.studentName || `${phone.firstName || ''} ${phone.lastName || ''}`.trim()) : id;
            const duration = formatDuration(now - (phone.timestamp || now));
            
            await push(ref(db, 'system_logs'), {
                studentId: id, name: studentName, type: 'Phone', details: 'COA', timestamp: now, duration: duration
            });
        }
        await remove(ref(db, 'active_phones_in_class'));

        for (const id of bpKeys) {
            const pass = bathroomPassesData[id];
            const name = pass ? pass.studentName : id;
            const duration = formatDuration(now - (pass.timestamp || now));
            
            await push(ref(db, 'system_logs'), {
                studentId: id, name: name, type: 'BP', details: 'BP-I', timestamp: now, duration: duration
            });
        }
        await remove(ref(db, 'active_bathroom_passes'));

        for (const id of hpKeys) {
            const pass = hallPassesData[id];
            const name = pass ? pass.studentName : id;
            const duration = formatDuration(now - (pass.timestamp || now));
            
            await push(ref(db, 'system_logs'), {
                studentId: id, name: name, type: 'HP', details: 'HP-I', timestamp: now, duration: duration
            });
        }
        await remove(ref(db, 'active_hall_passes'));

    } catch (err) {
        console.error("Clear all error:", err);
    }
};

window.forceClearPass = async (passType, studentId) => {
    const node = passType === 'bathroom' ? 'active_bathroom_passes' : 'active_hall_passes';
    const logCode = passType === 'bathroom' ? 'BP-I' : 'HP-I';
    const actionType = passType === 'bathroom' ? 'BP' : 'HP';
    
    const passData = passType === 'bathroom' ? bathroomPassesData[studentId] : hallPassesData[studentId];
    const name = passData ? passData.studentName : studentId;
    
    const now = Date.now();
    const duration = passData ? formatDuration(now - passData.timestamp) : '--';

    try {
        await remove(ref(db, `${node}/${studentId}`));
        await push(ref(db, 'system_logs'), {
            studentId: studentId,
            name: name,
            type: actionType,
            details: logCode,
            timestamp: now,
            duration: duration
        });
    } catch (err) {
        console.error("Clear pass error:", err);
    }
};

window.issueManualPass = async (studentId, passType) => {
    const student = rosterData[studentId];
    if (!student) return;
    const fullName = `${student.firstName} ${student.lastName}`.trim();

    // Deliberately does NOT check for an active phone check-in — that's
    // exactly the restriction this button exists to bypass, for students
    // who legitimately don't have a phone to check in. Everything else
    // (already has a pass out, only one bathroom pass at a time) still
    // applies, same as the kiosk enforces.
    if (bathroomPassesData[studentId] || hallPassesData[studentId]) {
        alert(`${fullName} already has an active pass out.`);
        return;
    }

    const node = passType === 'bathroom' ? 'active_bathroom_passes' : 'active_hall_passes';

    if (passType === 'bathroom' && Object.keys(bathroomPassesData).length >= 1) {
        alert('The bathroom pass is currently in use by another student.');
        return;
    }

    const now = Date.now();
    try {
        await set(ref(db, `${node}/${studentId}`), { studentName: fullName, timestamp: now });
        await push(ref(db, 'system_logs'), {
            studentId: studentId,
            name: fullName,
            type: passType === 'bathroom' ? 'BP' : 'HP',
            details: (passType === 'bathroom' ? 'BP-O' : 'HP-O') + ' (Staff)',
            timestamp: now,
            duration: '--'
        });
        if (manualPassSearch) manualPassSearch.value = '';
        renderManualPassResults('');
    } catch (err) {
        console.error("Manual pass issue error:", err);
        alert("Error issuing pass: " + err.message);
    }
};

// ==========================================
// MANUAL PASS OVERRIDE — SEARCH
// ==========================================
const manualPassSearch = document.getElementById('manual-pass-search');
const manualPassResults = document.getElementById('manual-pass-results');

function renderManualPassResults(query) {
    if (!manualPassResults) return;
    const q = query.trim().toLowerCase();
    if (!q) { manualPassResults.innerHTML = ''; return; }

    const matches = Object.entries(rosterData).filter(([id, s]) => {
        const full = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
        return id.toLowerCase().includes(q) || full.includes(q);
    }).slice(0, 8); // cap the list so it can't grow unbounded on a broad search

    if (matches.length === 0) {
        manualPassResults.innerHTML = `<p class="text-[11px] text-slate-400 italic px-1">No matching students.</p>`;
        return;
    }

    manualPassResults.innerHTML = matches.map(([id, s]) => {
        const name = escapeHtml(`${s.firstName || ''} ${s.lastName || ''}`.trim());
        const safeId = escapeHtml(id);
        return `
            <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                <span class="font-bold text-slate-800 truncate mr-1">${name}</span>
                <div class="flex gap-1 flex-shrink-0">
                    <button onclick="issueManualPass('${safeId}', 'bathroom')" class="bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded font-bold text-[10px]" title="Issue Bathroom Pass">🚻 BP</button>
                    <button onclick="issueManualPass('${safeId}', 'hall')" class="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2 py-1 rounded font-bold text-[10px]" title="Issue Hall Pass">🎟️ HP</button>
                </div>
            </div>
        `;
    }).join('');
}

if (manualPassSearch) {
    manualPassSearch.addEventListener('input', (e) => renderManualPassResults(e.target.value));
}

// ==========================================
// BATHROOM PASS REMINDER — recurring toast every 5 minutes per student
// ==========================================
let bathroomReminderLastShown = {}; // studentId -> highest 5-min threshold already shown

function showToast(title, message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-lg p-3.5 max-w-xs';
    toast.innerHTML = `
        <div class="flex justify-between items-start gap-2">
            <div>
                <p class="font-black text-amber-900 text-xs uppercase tracking-wider mb-1">${escapeHtml(title)}</p>
                <p class="text-xs text-amber-800 font-medium">${escapeHtml(message)}</p>
            </div>
            <button class="text-amber-700 hover:text-amber-900 font-bold text-sm leading-none flex-shrink-0" aria-label="Dismiss">&times;</button>
        </div>
    `;
    toast.querySelector('button').addEventListener('click', () => toast.remove());
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 20000); // auto-dismiss after 20s if not manually closed
}

function checkBathroomReminders() {
    const activeIds = new Set(Object.keys(bathroomPassesData));

    // Clean up tracking for anyone no longer out (they returned).
    for (const id of Object.keys(bathroomReminderLastShown)) {
        if (!activeIds.has(id)) delete bathroomReminderLastShown[id];
    }

    for (const [id, data] of Object.entries(bathroomPassesData)) {
        if (!data.timestamp) continue;
        const elapsedMin = Math.floor((Date.now() - data.timestamp) / 60000);
        const lastShown = bathroomReminderLastShown[id] || 0;
        const nextThreshold = lastShown + 5;
        if (elapsedMin >= nextThreshold) {
            bathroomReminderLastShown[id] = nextThreshold;
            showToast('Bathroom Pass Reminder', `${data.studentName || id} has been out for ${elapsedMin} minute${elapsedMin === 1 ? '' : 's'}.`);
        }
    }
}

setInterval(checkBathroomReminders, 15000); // check every 15s so a threshold isn't missed by much


    if (!item) return;

    const firstName = item.firstName || '';
    const lastName = item.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim() || id;
    const pocketNum = item.pocket !== undefined ? item.pocket : 0;
    const now = Date.now();

    try {
        await set(ref(db, `classroom_roster/${id}`), { firstName, lastName });

        const phoneEntry = {
            studentName: fullName,
            firstName: firstName,
            lastName: lastName,
            pocket: pocketNum,
            timestamp: now
        };

        await set(ref(db, `active_phones_in_class/${id}`), phoneEntry);

        const formattedPocket = String(pocketNum).padStart(2, '0');
        await push(ref(db, 'system_logs'), {
            studentId: id,
            name: fullName,
            type: 'Phone',
            details: `CI-${formattedPocket}`,
            timestamp: now,
            duration: '--'
        });

        await remove(ref(db, `pending_roster_approvals/${id}`));

    } catch (err) {
        console.error("Approval error:", err);
        alert("Error approving student: " + err.message);
    }
};

window.rejectPendingStudent = (id) => {
    remove(ref(db, `pending_roster_approvals/${id}`));
};

window.handleLogSearch = () => {
    renderLogs(logsData);
};

// ==========================================
// 7. QUICK ADD FORM LISTENER
// ==========================================
const form = document.getElementById('quick-add-form');
if (form) {
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = document.getElementById('add-btn');
        const idInput = document.getElementById('add-student-id');
        const fInput = document.getElementById('add-student-fname');
        const lInput = document.getElementById('add-student-lname');

        const studentId = idInput.value.trim();
        const firstName = fInput.value.trim();
        const lastName = lInput.value.trim();

        if (!studentId || !firstName || !lastName) {
            alert("Please fill in all 3 fields.");
            return;
        }

        btn.disabled = true;
        btn.textContent = "Saving...";

        set(ref(db, 'classroom_roster/' + studentId), {
            firstName: firstName,
            lastName: lastName
        })
        .then(() => {
            btn.textContent = "✓ Added!";
            btn.classList.remove('bg-chelan');
            btn.classList.add('bg-green-600');
            form.reset();
            
            setTimeout(() => {
                btn.textContent = "+ Add to Roster";
                btn.classList.remove('bg-green-600');
                btn.classList.add('bg-chelan');
                btn.disabled = false;
            }, 1500);
        })
        .catch((error) => {
            alert("Error saving: " + error.message);
            btn.disabled = false;
        });
    });
}

// ==========================================
// 8. FIREBASE REALTIME LISTENERS
// ==========================================
onValue(ref(db, 'active_phones_in_class'), s => {
    phonesData = s.val() || {};
    renderPhones();
});
onValue(ref(db, 'active_bathroom_passes'), s => {
    bathroomPassesData = s.val() || {};
    renderPasses('b', bathroomPassesData);
    renderPhones();
});
onValue(ref(db, 'active_hall_passes'), s => {
    hallPassesData = s.val() || {};
    renderPasses('h', hallPassesData);
    renderPhones();
});
onValue(ref(db, 'pending_roster_approvals'), s => {
    pendingApprovalsData = s.val() || {};
    renderPendingApprovals();
});
onValue(ref(db, 'system_logs'), s => {
    logsData = s.val() || {};
    renderLogs(logsData);
    updateStatsOverview();
});
onValue(ref(db, 'classroom_roster'), s => {
    rosterData = s.val() || {};
});

// ==========================================
// 9. RENDER FUNCTIONS
// ==========================================
function updateStatsOverview() {
    const todayStr = new Date().toDateString();
    const logKeys = Object.keys(logsData);

    let checkinCount = 0;
    let passCount = 0;
    const hourCounts = {};

    logKeys.forEach(k => {
        const item = logsData[k];
        if (!item.timestamp) return;

        const itemDate = new Date(item.timestamp);
        if (itemDate.toDateString() === todayStr) {
            const type = (item.type || '').toUpperCase();
            const details = (item.details || '').toUpperCase();

            if (type === 'PHONE' && (details.includes('CI-') || details.includes('COS') || details.includes('COT') || details.includes('COA') || details.includes('COED'))) {
                checkinCount++;
            }

            if (type === 'BP' || type === 'HP' || details.includes('BP-') || details.includes('HP-')) {
                passCount++;
            }

            const hour = itemDate.getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        }
    });

    let peakHour = null;
    let maxCount = 0;
    Object.keys(hourCounts).forEach(h => {
        if (hourCounts[h] > maxCount) {
            maxCount = hourCounts[h];
            peakHour = parseInt(h);
        }
    });

    let peakText = "--";
    if (peakHour !== null) {
        const ampm = peakHour >= 12 ? 'PM' : 'AM';
        const formattedHour = peakHour % 12 || 12;
        peakText = `${formattedHour}:00 ${ampm}`;
    }

    const statCheckins = document.getElementById('stat-checkins');
    const statPasses = document.getElementById('stat-passes');
    const statPeak = document.getElementById('stat-peak');

    if (statCheckins) statCheckins.textContent = checkinCount;
    if (statPasses) statPasses.textContent = passCount;
    if (statPeak) statPeak.textContent = peakText;
}

function renderPendingApprovals() {
    const card = document.getElementById('pending-approvals-card');
    const list = document.getElementById('pending-approvals-list');
    const badge = document.getElementById('pending-count-badge');
    
    if (!card || !list || !badge) return;

    const keys = Object.keys(pendingApprovalsData);
    badge.textContent = keys.length;

    if (keys.length === 0) {
        card.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    card.classList.remove('hidden');
    list.innerHTML = keys.map(id => {
        const item = pendingApprovalsData[id];
        const safeId = escapeAttr(id);
        const displayId = escapeHtml(id);
        const displayFirst = escapeHtml(item.firstName || '');
        const displayLast = escapeHtml(item.lastName || '');

        return `
            <div class="flex items-center justify-between bg-white p-2 rounded-xl border border-amber-200 shadow-sm text-xs">
                <div class="flex items-center gap-1.5">
                    <span class="font-mono font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-300">${displayId}</span>
                    <div class="flex flex-col">
                        <span class="font-bold text-slate-800 leading-tight">${displayFirst} ${displayLast}</span>
                        ${item.pocket !== undefined ? `<span class="text-[10px] text-green-700 font-bold">Pocket #${item.pocket}</span>` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="approvePendingStudent('${safeId}')" class="bg-green-700 hover:bg-green-800 text-white font-bold px-2 py-1 rounded-lg transition shadow-sm">✓</button>
                    <button onclick="rejectPendingStudent('${safeId}')" class="bg-red-600 hover:bg-red-700 text-white font-bold px-2 py-1 rounded-lg transition shadow-sm">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderPhones() {
    const list = document.getElementById('active-phones-list');
    if (!list) return;

    const keys = Object.keys(phonesData);
    const countEl = document.getElementById('dash-phone-count');
    if (countEl) countEl.textContent = `${keys.length} Students`;
    
    if (keys.length === 0) {
        list.innerHTML = '<p class="text-xs text-slate-400 italic col-span-2">No phones currently checked in.</p>';
        return;
    }

    const items = keys.map(id => ({ id, ...phonesData[id] }));

    items.sort((a, b) => {
        if (currentSort === 'first') {
            return (a.firstName || a.studentName || '').localeCompare(b.firstName || b.studentName || '');
        } else if (currentSort === 'pocket') {
            return (parseInt(a.pocket) || 0) - (parseInt(b.pocket) || 0);
        } else {
            return (a.lastName || a.studentName || '').localeCompare(b.lastName || b.studentName || '');
        }
    });

    const total = items.length;
    const mid = Math.ceil(total / 2);
    const col1 = items.slice(0, mid);
    const col2 = items.slice(mid);

    const gridOrderedItems = [];
    for (let i = 0; i < mid; i++) {
        if (col1[i]) gridOrderedItems.push(col1[i]);
        if (col2[i]) gridOrderedItems.push(col2[i]);
    }

    list.innerHTML = gridOrderedItems.map(item => {
        const id = item.id;
        const hasBathroomPass = !!bathroomPassesData[id];
        const hasHallPass = !!hallPassesData[id];

        let containerClass = "border-green-200 bg-green-50/70";
        let badgeClass = "text-green-800 bg-green-200/80";
        let passTag = "";

        if (hasBathroomPass) {
            containerClass = "border-red-300 bg-red-100/90 shadow-sm";
            badgeClass = "text-red-900 bg-red-200 font-black";
            passTag = `<span class="text-[9px] bg-red-600 text-white font-black px-1 py-0.5 rounded uppercase">BP</span>`;
        } else if (hasHallPass) {
            containerClass = "border-indigo-300 bg-indigo-100/90 shadow-sm";
            badgeClass = "text-indigo-900 bg-indigo-200 font-black";
            passTag = `<span class="text-[9px] bg-indigo-600 text-white font-black px-1 py-0.5 rounded uppercase">HP</span>`;
        }

        const displayNameRaw = item.studentName || `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Student';
        const displayName = escapeHtml(displayNameRaw);

        return `
            <div class="flex items-center justify-between border ${containerClass} rounded-xl px-2.5 py-2 transition text-xs">
                <div class="flex items-center gap-1.5 overflow-hidden mr-1">
                    ${passTag}
                    <span class="font-bold text-slate-800 truncate" title="${displayName}">${displayName}</span>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                    <span class="text-[11px] ${badgeClass} px-2 py-0.5 rounded-md font-mono font-bold">${item.pocket || 0}</span>
                    <button onclick="forceRemovePhone('${id}')" title="Check Out" class="text-red-500 hover:text-red-700 font-bold text-sm leading-none">&times;</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderPasses(type, data) {
    const keys = Object.keys(data);
    if(type === 'b') {
        const passCount = document.getElementById('dash-pass-count');
        if (passCount) passCount.textContent = `${keys.length}/1 Out`;
        const d = document.getElementById('bathroom-status-detail');
        if (d) {
            d.innerHTML = keys.length ? `<div class="w-full flex justify-between items-center"><span class="font-bold text-slate-800 not-italic">${escapeHtml(data[keys[0]].studentName)}</span><button onclick="forceClearPass('bathroom', '${keys[0]}')" class="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-0.5 rounded font-bold not-italic transition">Return</button></div>` : 'No students out.';
        }
    } else {
        const hallCount = document.getElementById('dash-hall-count');
        if (hallCount) hallCount.textContent = `${keys.length} Out`;
        const d = document.getElementById('hallpass-status-detail');
        if (d) {
            d.innerHTML = keys.length ? keys.map(k => `<div class="w-full flex justify-between items-center mb-1"><span class="font-bold text-slate-800 not-italic">${escapeHtml(data[k].studentName)}</span><button onclick="forceClearPass('hall', '${k}')" class="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded font-bold not-italic transition">Return</button></div>`).join('') : 'No students out.';
        }
    }
}

function renderLogs(data) {
    const tableBody = document.getElementById('logs-table-body');
    const logCount = document.getElementById('log-count');
    if (!tableBody) return;

    const keys = Object.keys(data).reverse();
    if (logCount) logCount.textContent = `${keys.length}`;
    
    if (keys.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="px-3 py-4 text-center text-slate-400 text-xs italic">No activity logged yet.</td></tr>';
        return;
    }
    
    const searchInput = document.getElementById('log-search');
    let filterText = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filteredKeys = keys.filter(k => {
        const l = data[k];
        const nameMatch = (l.name || l.studentId || '').toLowerCase().includes(filterText);
        const typeMatch = (l.type || l.action || '').toLowerCase().includes(filterText);
        const detailMatch = (l.details || '').toLowerCase().includes(filterText);
        
        return nameMatch || typeMatch || detailMatch;
    });

    if (filteredKeys.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="px-3 py-4 text-center text-slate-400 text-xs italic">No matching records found.</td></tr>';
        return;
    }

    tableBody.innerHTML = filteredKeys.map(k => {
        const l = data[k];
        const timeStr = l.timestamp ? new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
        const name = escapeHtml(l.name || l.studentId || 'Unknown');
        
        let actionType = l.type || 'Phone';
        let detailsCode = l.details || l.action || '--';
        let duration = l.duration || '--';

        let badgeClass = "bg-green-100 text-green-800 border-green-300";
        if (actionType === 'BP' || detailsCode.startsWith('BP')) {
            actionType = 'BP';
            badgeClass = "bg-red-100 text-red-800 border-red-300";
        } else if (actionType === 'HP' || detailsCode.startsWith('HP')) {
            actionType = 'HP';
            badgeClass = "bg-indigo-100 text-indigo-800 border-indigo-300";
        } else {
            actionType = 'Phone';
        }

        return `
            <tr class="hover:bg-slate-100 transition border-b border-slate-50 last:border-0">
                <td class="px-3 py-2 font-mono text-slate-500 text-xs truncate">${timeStr}</td>
                <td class="px-2 py-2 font-bold text-slate-800 max-w-[120px] truncate" title="${name}">${name}</td>
                <td class="px-2 py-2 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase border ${badgeClass}">
                        ${actionType}
                    </span>
                </td>
                <td class="px-2 py-2 font-mono text-xs font-semibold text-slate-500 text-center truncate">${duration}</td>
                <td class="px-3 py-2 font-mono font-bold text-xs text-slate-600 text-center">${detailsCode}</td>
            </tr>
        `;
    }).join('');
}

// ==========================================
// 10. VERSION TAG & MOBILE MENU
// ==========================================
function updateVersionTag() {
    const versionEl = document.getElementById('version');
    if (versionEl && typeof APP_CONFIG !== 'undefined') {
        versionEl.textContent = APP_CONFIG.version;
    }
}

function initMobileMenu() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const menuIcon = document.getElementById('mobile-menu-icon');

    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            if (menuIcon) {
                menuIcon.className = mobileMenu.classList.contains('hidden') ? "fa-solid fa-bars" : "fa-solid fa-xmark";
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        updateVersionTag();
        initMobileMenu();
    });
} else {
    updateVersionTag();
    initMobileMenu();
}
