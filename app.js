const pageTabs = [...document.querySelectorAll('.page-tab')];
const pagePanels = [...document.querySelectorAll('[data-page-panel]')];

function setPage(page) {
  pageTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.page === page));
  pagePanels.forEach((panel) => panel.classList.toggle('hidden', panel.dataset.pagePanel !== page));
  history.replaceState(null, '', `#${page}`);
}

pageTabs.forEach((tab) => {
  tab.addEventListener('click', () => setPage(tab.dataset.page));
});

window.addEventListener('hashchange', () => {
  const page = location.hash.replace('#', '') || 'overview';
  if (pageTabs.some((tab) => tab.dataset.page === page)) {
    setPage(page);
  }
});

const initialPage = location.hash.replace('#', '') || 'overview';
setPage(pageTabs.some((tab) => tab.dataset.page === initialPage) ? initialPage : 'overview');
