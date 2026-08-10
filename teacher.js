/**
 * Chelan High School - Teacher Station Script
 * Version: 1.1.10
 */

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initFilters();
  initSearch();
});

/**
 * Live 12-hour AM/PM Clock logic for top-right header display
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
    hours = hours ? hours : 12;

    clockElement.textContent = `${hours}:${minutes} ${ampm}`;
  }

  updateClock();
  setInterval(updateClock, 1000);
}

/**
 * Filter functionality (All Students, In Class, On Pass)
 */
function initFilters() {
  const filterButtons = document.querySelectorAll('.filter-btn');
  const cards = document.querySelectorAll('.student-card');

  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      const filter = button.getAttribute('data-filter');

      // Update button styling
      filterButtons.forEach(btn => {
        btn.classList.remove('bg-[#0d4a2b]', 'text-white', 'active-filter');
        btn.classList.add('bg-gray-100', 'text-gray-700');
      });

      button.classList.remove('bg-gray-100', 'text-gray-700');
      button.classList.add('bg-[#0d4a2b]', 'text-white', 'active-filter');

      // Filter student cards
      cards.forEach(card => {
        const status = card.getAttribute('data-status');
        if (filter === 'all' || status === filter) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });
    });
  });
}

/**
 * Live student search input filtering by name or ID
 */
function initSearch() {
  const searchInput = document.getElementById('search-input');
  const cards = document.querySelectorAll('.student-card');

  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();

    cards.forEach(card => {
      const name = card.getAttribute('data-name') || '';
      const cardText = card.innerText.toLowerCase();

      if (name.includes(query) || cardText.includes(query)) {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });
  });
}
