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

  // Timetable block click → scroll to matching syllabus
  document.querySelectorAll('.sp-tt-block-clickable').forEach(block => {
    block.addEventListener('click', () => {
      const subjectId = block.dataset.subjectId;
      if (!subjectId) return;

      // Find the matching syllabus tab and activate it
      const matchTab = document.querySelector(`#spSyllabusTabs .sp-tab-btn[data-subject-id="${subjectId}"]`);
      if (matchTab) {
        // Activate tab
        tabBtns.forEach(b => b.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        matchTab.classList.add('active');
        const tabIdx = matchTab.dataset.tab;
        const panel = document.querySelector(`.sp-syllabus-panel[data-panel="${tabIdx}"]`);
        if (panel) panel.classList.add('active');

        // Scroll to syllabus section
        const syllabusSection = document.getElementById('spSyllabusTabs');
        if (syllabusSection) {
          syllabusSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
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
