/**
 * Teacher Station Roster Controller - Revision 9
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Header Clock
  initHeaderClock();

  // Initialize Navigation Tab Handler
  initNavigation();

  // Render Roster Cards
  renderRosterGrid();
});

/* =========================================================
   1. LIVE HEADER CLOCK LOGIC
   ========================================================= */
function initHeaderClock() {
  function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;

    const timeString = `${hours}:${minutes} ${ampm}`;
    const clockElement = document.getElementById('header-clock');
    if (clockElement) {
      clockElement.textContent = timeString;
    }
  }

  updateClock();
  setInterval(updateClock, 1000);
}

/* =========================================================
   2. HEADER NAVIGATION CONTROLLER
   ========================================================= */
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');

  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      navItems.forEach((nav) => nav.classList.remove('active'));
      item.classList.add('active');

      const targetTab = item.getAttribute('data-tab');
      if (targetTab === 'kiosk') {
        window.open('kiosk.html', '_blank');
      }
    });
  });
}

/* =========================================================
   3. STUDENT DATASET & ROSTER CARD RENDERER
   ========================================================= */
const studentData = [
  { id: '101', name: 'Alexander Wright', grade: '11th Grade', status: 'in-class', statusText: 'In Class' },
  { id: '102', name: 'Brianna Miller', grade: '12th Grade', status: 'hall-pass', statusText: 'Hall Pass (Restroom 4m)' },
  { id: '103', name: 'Cameron Davis', grade: '11th Grade', status: 'in-class', statusText: 'In Class' },
  { id: '104', name: 'Dakota Johnson', grade: '10th Grade', status: 'absent', statusText: 'Unexcused Absence' },
  { id: '105', name: 'Emily Thorne', grade: '11th Grade', status: 'in-class', statusText: 'In Class' },
  { id: '106', name: 'Ethan Vance', grade: '12th Grade', status: 'hall-pass', statusText: 'Hall Pass (Library 8m)' }
];

function renderRosterGrid() {
  const container = document.getElementById('roster-grid');
  if (!container) return;

  container.innerHTML = studentData
    .map((student) => {
      const initials = student.name
        .split(' ')
        .map((n) => n[0])
        .join('');

      return `
        <div class="student-card" data-student-id="${student.id}">
          <div>
            <div class="card-header">
              <div class="student-avatar">${initials}</div>
              <div class="student-info">
                <div class="student-name">${student.name}</div>
                <div class="student-meta">${student.grade} • ID: ${student.id}</div>
              </div>
            </div>

            <div class="status-badge ${student.status}">
              • ${student.statusText}
            </div>
          </div>

          <div class="card-actions">
            <button class="btn-action btn-primary" onclick="handlePassIssue('${student.id}')">Issue Pass</button>
            <button class="btn-action" onclick="handleOptions('${student.id}')">Options</button>
          </div>
        </div>
      `;
    })
    .join('');
}

/* Handler Placeholders */
function handlePassIssue(id) {
  console.log(`Issuing hall pass for student ID: ${id}`);
}

function handleOptions(id) {
  console.log(`Opening options for student ID: ${id}`);
}
