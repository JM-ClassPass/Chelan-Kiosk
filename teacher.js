/**
 * teacher.js - Chelan High Live Teacher Dashboard Logic
 * Version: 1.004
 */

// Global Dashboard State
let activeLogs = [];
let rosterMap = new Map();
let searchFilter = '';
let statusFilter = 'ALL';

// DOM Elements Container
let elements = {};

document.addEventListener('DOMContentLoaded', () => {
    // Cache DOM Elements
    elements = {
        tbody: document.getElementById('dashboard-tbody'),
        totalActiveCount: document.getElementById('total-active-count'),
        hallPassCount: document.getElementById('hall-pass-count'),
        tardyCount: document.getElementById('tardy-count'),
        searchInput: document.getElementById('search-dashboard'),
        statusFilterSelect: document.getElementById('status-filter'),
        clearAllBtn: document.getElementById('clear-completed-btn'),
        exportLogsBtn: document.getElementById('export-logs-btn')
    };

    // Load Initial Data
    loadRosterMap();
    loadActiveLogs();

    // Attach Event Listeners
    setupEventListeners();

    // Polling / Auto Refresh Sync (Simulates Live Data Stream Every 3 Seconds)
    setInterval(loadActiveLogs, 3000);
});

// ==========================================
// DATA MANAGEMENT
// ==========================================

function loadRosterMap() {
    const savedRoster = localStorage.getItem('chelan_roster');
    if (savedRoster) {
        try {
            const rosterArray = JSON.parse(savedRoster);
            rosterMap = new Map(rosterArray.map(student => [student.id, student]));
        } catch (e) {
            console.error('Error parsing roster map in teacher.js:', e);
        }
    }
}

function loadActiveLogs() {
    const savedLogs = localStorage.getItem('chelan_kiosk_logs');
    if (savedLogs) {
        try {
            activeLogs = JSON.parse(savedLogs);
        } catch (e) {
            console.error('Error parsing kiosk logs:', e);
            activeLogs = getSampleDashboardLogs();
        }
    } else {
        activeLogs = getSampleDashboardLogs();
        saveLogs();
    }
    renderDashboard();
}

function saveLogs() {
    localStorage.setItem('chelan_kiosk_logs', JSON.stringify(activeLogs));
    renderDashboard();
}

function getSampleDashboardLogs() {
    const now = new Date();
    return [
        {
            id: 'log_1',
            studentId: '1001',
            firstName: 'Alex',
            lastName: 'Smith',
            reason: 'Restroom Pass',
            destination: 'Restroom - Main Hall',
            timestamp: new Date(now.getTime() - 8 * 60000).toISOString(),
            status: 'OUT'
        },
        {
            id: 'log_2',
            studentId: '1002',
            firstName: 'Jordan',
            lastName: 'Baker',
            reason: 'Tardy Check-In',
            destination: 'Classroom 104',
            timestamp: new Date(now.getTime() - 25 * 60000).toISOString(),
            status: 'IN'
        }
    ];
}

// ==========================================
// DASHBOARD RENDERING & STATS
// ==========================================

function renderDashboard() {
    if (!elements.tbody) return;

    // Filter Logs based on Search and Status Selection
    let filtered = activeLogs.filter(log => {
        const matchesSearch = 
            log.studentId.toLowerCase().includes(searchFilter) ||
            log.firstName.toLowerCase().includes(searchFilter) ||
            log.lastName.toLowerCase().includes(searchFilter) ||
            (log.reason && log.reason.toLowerCase().includes(searchFilter));

        const matchesStatus = 
            statusFilter === 'ALL' || 
            (statusFilter === 'OUT' && log.status === 'OUT') ||
            (statusFilter === 'IN' && log.status === 'IN');

        return matchesSearch && matchesStatus;
    });

    // Update Top Stat Counters
    updateDashboardStats();

    // Render Table Body
    if (filtered.length === 0) {
        elements.tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center text-slate-400 font-medium">
                    No active student activity found.
                </td>
            </tr>`;
        return;
    }

    elements.tbody.innerHTML = filtered.map(log => {
        const timeFormatted = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const minutesElapsed = Math.floor((new Date() - new Date(log.timestamp)) / 60000);
        const isOverdue = log.status === 'OUT' && minutesElapsed > 10;

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 ${isOverdue ? 'bg-rose-50/60' : ''}">
                <td class="p-3 font-mono font-bold text-slate-700 text-xs">${log.studentId}</td>
                <td class="p-3 font-bold text-slate-800">${log.firstName} ${log.lastName}</td>
                <td class="p-3 font-semibold text-slate-600 text-xs">
                    <span class="inline-block px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                        ${log.reason || 'General Check-In'}
                    </span>
                </td>
                <td class="p-3 text-xs font-mono text-slate-500">${timeFormatted} (${minutesElapsed}m ago)</td>
                <td class="p-3">
                    ${getStatusBadge(log.status, isOverdue)}
                </td>
                <td class="p-3 text-right pr-4">
                    ${log.status === 'OUT' ? `
                        <button onclick="returnStudent('${log.id}')" class="text-xs bg-chelan hover:bg-green-800 text-white font-bold px-3 py-1 rounded shadow-sm transition-all">
                            Check In
                        </button>
                    ` : `
                        <button onclick="clearLog('${log.id}')" class="text-xs text-slate-400 hover:text-slate-600 font-bold px-2 py-1">
                            Dismiss
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

function getStatusBadge(status, isOverdue) {
    if (status === 'OUT') {
        if (isOverdue) {
            return `<span class="bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                        ⏱️ Overdue Out
                    </span>`;
        }
        return `<span class="bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                    🚶 Out on Pass
                </span>`;
    }
    return `<span class="bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                ✅ Present / Checked In
            </span>`;
}

function updateDashboardStats() {
    const totalOut = activeLogs.filter(l => l.status === 'OUT').length;
    const totalTardies = activeLogs.filter(l => l.reason && l.reason.toLowerCase().includes('tardy')).length;

    if (elements.totalActiveCount) elements.totalActiveCount.textContent = activeLogs.length;
    if (elements.hallPassCount) elements.hallPassCount.textContent = totalOut;
    if (elements.tardyCount) elements.tardyCount.textContent = totalTardies;
}

// ==========================================
// ACTIONS & EVENT LISTENERS
// ==========================================

window.returnStudent = function(logId) {
    const log = activeLogs.find(l => l.id === logId);
    if (log) {
        log.status = 'IN';
        log.returnTimestamp = new Date().toISOString();
        saveLogs();
    }
};

window.clearLog = function(logId) {
    activeLogs = activeLogs.filter(l => l.id !== logId);
    saveLogs();
};

function setupEventListeners() {
    // Search Filter
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', (e) => {
            searchFilter = e.target.value.trim().toLowerCase();
            renderDashboard();
        });
    }

    // Status Filter Select
    if (elements.statusFilterSelect) {
        elements.statusFilterSelect.addEventListener('change', (e) => {
            statusFilter = e.target.value;
            renderDashboard();
        });
    }

    // Clear Completed Logs Button
    if (elements.clearAllBtn) {
        elements.clearAllBtn.addEventListener('click', () => {
            if (confirm("Clear all checked-in / completed logs from view?")) {
                activeLogs = activeLogs.filter(l => l.status === 'OUT');
                saveLogs();
            }
        });
    }

    // Export Activity Logs
    if (elements.exportLogsBtn) {
        elements.exportLogsBtn.addEventListener('click', exportLogsToCSV);
    }
}

function exportLogsToCSV() {
    if (activeLogs.length === 0) {
        alert("No activity logs available to export.");
        return;
    }

    let csv = "data:text/csv;charset=utf-8,Student ID,First Name,Last Name,Reason,Time Out,Status\n";
    activeLogs.forEach(l => {
        csv += `"${l.studentId}","${l.firstName}","${l.lastName}","${l.reason || ''}","${l.timestamp}","${l.status}"\n`;
    });

    const encodedUri = encodeURI(csv);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Chelan_Dashboard_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
