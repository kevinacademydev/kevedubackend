document.addEventListener('DOMContentLoaded', () => {
  // Syllabus tab switching
  const tabBtns = document.querySelectorAll('#spSyllabusTabs .sp-tab-btn');
  const panels = document.querySelectorAll('.sp-syllabus-panel');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.querySelector(`.sp-syllabus-panel[data-panel="${tab}"]`);
      if (panel) panel.classList.add('active');
    });
  });

  // Syllabus-scoped language toggle (KOR/ENG inside panel area only)
  let currentSylLang = 'ko';
  const sylLangBtns = document.querySelectorAll('#spSylLangToggle .sp-syl-lang-btn');
  sylLangBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      if (lang === currentSylLang) return;
      currentSylLang = lang;
      sylLangBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Only toggle data-syl-lang elements (scoped to syllabus content)
      document.querySelectorAll('[data-syl-lang="ko"]').forEach(el => {
        el.style.display = lang === 'ko' ? '' : 'none';
      });
      document.querySelectorAll('[data-syl-lang="en"]').forEach(el => {
        el.style.display = lang === 'en' ? '' : 'none';
      });
    });
  });

});
