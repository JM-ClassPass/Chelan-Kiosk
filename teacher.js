import { APP_CONFIG } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, remove, push, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ==========================================
// 1. LOCAL AUTH & CLOCK
// ==========================================
const TEACHER_PIN = "486200";

if (localStorage.getItem('chelan_teacher_authorized') === 'true') {
    document.getElementById('device-lock-screen').classList.add('hidden');
}

window.handlePinSubmit = function(e) {
    e.preventDefault();
    if (document.getElementById('pin-input').value === TEACHER_PIN) {
        localStorage.setItem('chelan_teacher_authorized', 'true');
        document.getElementById('device-lock-screen').classList.add('hidden');
    } else {
        alert("Incorrect PIN");
    }
};

setInterval(() => {
    const clock = document.getElementById('live-clock');
    if(clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}, 1000);

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

// ==========================================
// 3. STATE VARIABLES
// ==========================================
let phonesData = {};
let bathroomPassesData = {};
let hallPassesData = {};
let pendingApprovalsData = {};
let logsData = {};
let currentSort = 'last';

// ==========================================
// 4. UTILITY FUNCTIONS
// ==========================================
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

// ==========================================
// 5. GLOBAL DASHBOARD ACTIONS (Attached to Window for HTML access)
// ==========================================
window.exportLogsToCSV = () => {
    const keys = Object.keys(logsData).reverse();
    if (keys.length === 0) {
        alert("No logs to export.");
        return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Date,Time,Student,Action,Code,Duration\n";
    
    keys.forEach(k => {
        const l = logsData[k];
        const dateObj = l.timestamp ? new Date(l.timestamp) : new Date();
        const dateStr = dateObj.toLocaleDateString();
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        const name = `"${escapeAttr(l.name || l.studentId || 'Unknown')}"`;
        const actionType = `"${escapeAttr(l.type || 'Phone')}"`;
        const detailsCode = `"${escapeAttr(l.details || l.action || '--')}"`;
        const duration = `"${escapeAttr(l.duration || '--')}"`;
        
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

    btnFirst.className = sortType === 'first' ? activeClass : inactiveClass;
    btnLast.className = sortType === 'last' ? activeClass : inactiveClass;
    btnPocket.className = sortType === 'pocket' ? activeClass : inactiveClass;

    renderPhones();
};

window.forceRemovePhone = async (id) => {
    const phone = phonesData[id];
    const studentName = phone ? (phone.studentName || `${phone.firstName || ''} ${phone.lastName || ''}`.trim()) : id;
    const now = Date.now();
    const duration = formatDuration(now - (phone.timestamp || now));

    try {
        await remove(ref(db, `active_phones_in_class/${id}`));
        await push(ref(db, 'system_logs'), {
            studentId: id,
            name: studentName,
            type: 'Phone',
            details: 'COT',
            timestamp: now,
            duration: duration
        });
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
        // Clear Phones
        for (const id of phoneKeys) {
            const phone = phonesData[id];
            const studentName = phone ? (phone.studentName || `${phone.firstName || ''} ${phone.lastName || ''}`.trim()) : id;
            const duration = formatDuration(now - (phone.timestamp || now));
            
            await push(ref(db, 'system_logs'), {
                studentId: id, name: studentName, type: 'Phone', details: 'COA', timestamp: now, duration: duration
            });
        }
        await remove(ref(db, 'active_phones_in_class'));

        // Clear Bathroom Passes
        for (const id of bpKeys) {
            const pass = bathroomPassesData[id];
            const name = pass ? pass.studentName : id;
            const duration = formatDuration(now - (pass.timestamp || now));
            
            await push(ref(db, 'system_logs'), {
                studentId: id, name: name, type: 'BP', details: 'BP-I', timestamp: now, duration: duration
            });
        }
        await remove(ref(db, 'active_bathroom_passes'));

        // Clear Hall Passes
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

window.approvePendingStudent = async (id) => {
    const item = pendingApprovalsData[id];
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
// 6. QUICK ADD FORM LISTENER
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
// 7. FIREBASE REALTIME LISTENERS
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

// ==========================================
// 8. RENDER FUNCTIONS
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

    document.getElementById('stat-checkins').textContent = checkinCount;
    document.getElementById('stat-passes').textContent = passCount;
    document.getElementById('stat-peak').textContent = peakText;
}

function renderPendingApprovals() {
    const card = document.getElementById('pending-approvals-card');
    const list = document.getElementById('pending-approvals-list');
    const badge = document.getElementById('pending-count-badge');
    
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

        return `
            <div class="flex items-center justify-between bg-white p-2 rounded-xl border border-amber-200 shadow-sm text-xs">
                <div class="flex items-center gap-1.5">
                    <span class="font-mono font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-300">${id}</span>
                    <div class="flex flex-col">
                        <span class="font-bold text-slate-800 leading-tight">${item.firstName || ''} ${item.lastName || ''}</span>
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
    const keys = Object.keys(phonesData);
    document.getElementById('dash-phone-count').textContent = `${keys.length} Students`;
    
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

        const displayName = item.studentName || `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Student';

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
        document.getElementById('dash-pass-count').textContent = `${keys.length}/1 Out`;
        const d = document.getElementById('bathroom-status-detail');
        d.innerHTML = keys.length ? `<div class="w-full flex justify-between items-center"><span class="font-bold text-slate-800 not-italic">${data[keys[0]].studentName}</span><button onclick="forceClearPass('bathroom', '${keys[0]}')" class="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-0.5 rounded font-bold not-italic transition">Return</button></div>` : 'No students out.';
    } else {
        document.getElementById('dash-hall-count').textContent = `${keys.length} Out`;
        const d = document.getElementById('hallpass-status-detail');
        d.innerHTML = keys.length ? keys.map(k => `<div class="w-full flex justify-between items-center mb-1"><span class="font-bold text-slate-800 not-italic">${data[k].studentName}</span><button onclick="forceClearPass('hall', '${k}')" class="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded font-bold not-italic transition">Return</button></div>`).join('') : 'No students out.';
    }
}

function renderLogs(data) {
    const keys = Object.keys(data).reverse();
    document.getElementById('log-count').textContent = `${keys.length}`;
    if (keys.length === 0) {
        document.getElementById('logs-table-body').innerHTML = '<tr><td colspan="5" class="px-3 py-4 text-center text-slate-400 text-xs italic">No activity logged yet.</td></tr>';
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
        document.getElementById('logs-table-body').innerHTML = '<tr><td colspan="5" class="px-3 py-4 text-center text-slate-400 text-xs italic">No matching records found.</td></tr>';
        return;
    }

    document.getElementById('logs-table-body').innerHTML = filteredKeys.map(k => {
        const l = data[k];
        const timeStr = l.timestamp ? new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
        const name = l.name || l.studentId || 'Unknown';
        
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

// ==========================================
// MOBILE MENU TOGGLE LOGIC
// ==========================================
function initMobileMenu() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const menuIcon = document.getElementById('mobile-menu-icon');

    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            
            if (menuIcon) {
                if (mobileMenu.classList.contains('hidden')) {
                    menuIcon.className = "fa-solid fa-bars";
                } else {
                    menuIcon.className = "fa-solid fa-xmark";
                }
            }
        });
    }
}

// Ensure event listener connects whether the page is loading or already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMenu);
} else {
    initMobileMenu();
}
