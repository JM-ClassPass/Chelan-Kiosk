/**
 * Chelan High School - Teacher Station Script
 * Version: 1.1.10
 */

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initNavigation();
});

/**
 * Updates the live header clock in 12-hour AM/PM format
 */
function initClock() {
  const clockElement = document.getElementById('live-clock');

  function updateClock() {
    if (!clockElement) return;

    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12;
    hours = hours ? hours : 12; // Handle midnight (0) as 12

    clockElement.textContent = `${hours}:${minutes} ${ampm}`;
  }

  updateClock();
  setInterval(updateClock, 1000);
}

/**
 * Handles toggle state between Live Dashboard and Manage Roster
 */
function initNavigation() {
  const btnDashboard = document.getElementById('nav-dashboard');
  const btnRoster = document.getElementById('nav-roster');
  const viewDashboard = document.getElementById('view-dashboard');
  const viewRoster = document.getElementById('view-roster');

  if (!btnDashboard || !btnRoster) return;

  const activeClasses = ['border', 'border-[#22c55e]', 'bg-[#14532d]/50', 'text-white', 'font-bold', 'shadow-sm'];
  const inactiveClasses = ['text-gray-200', 'hover:text-white', 'font-semibold'];

  function switchTab(activeBtn, inactiveBtn, showView, hideView) {
    // Update button visual states
    activeBtn.classList.remove(...inactiveClasses);
    activeBtn.classList.add(...activeClasses);

    inactiveBtn.classList.remove(...activeClasses);
    inactiveBtn.classList.add(...inactiveClasses);

    // Toggle view visibility
    if (showView && hideView) {
      showView.classList.remove('hidden');
      showView.classList.add('block');
      hideView.classList.remove('block');
      hideView.classList.add('hidden');
    }
  }

  btnDashboard.addEventListener('click', () => {
    switchTab(btnDashboard, btnRoster, viewDashboard, viewRoster);
  });

  btnRoster.addEventListener('click', () => {
    switchTab(btnRoster, btnDashboard, viewRoster, viewDashboard);
  });
}
