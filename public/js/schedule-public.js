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

  // Language toggle
  let currentLang = 'ko';
  const langBtns = document.querySelectorAll('#spLangToggle .sp-lang-btn');
  langBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      if (lang === currentLang) return;
      currentLang = lang;
      langBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Toggle all data-lang elements (exclude the toggle buttons themselves)
      document.querySelectorAll('[data-lang="ko"]:not(.sp-lang-btn)').forEach(el => {
        el.style.display = lang === 'ko' ? '' : 'none';
      });
      document.querySelectorAll('[data-lang="en"]:not(.sp-lang-btn)').forEach(el => {
        el.style.display = lang === 'en' ? '' : 'none';
      });

      // Update html lang attribute
      document.documentElement.lang = lang === 'ko' ? 'ko' : 'en';
    });
  });

  // PNG export
  const pngBtn = document.getElementById('spExportPng');
  if (pngBtn) {
    pngBtn.addEventListener('click', async () => {
      pngBtn.disabled = true;
      pngBtn.textContent = '...';
      try {
        const exportBar = document.querySelector('.sp-export-bar');
        const langToggle = document.getElementById('spLangToggle');
        if (exportBar) exportBar.style.display = 'none';
        if (langToggle) langToggle.style.display = 'none';
        const canvas = await html2canvas(document.body, {
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: document.body.scrollWidth,
          windowHeight: document.body.scrollHeight
        });
        if (exportBar) exportBar.style.display = '';
        if (langToggle) langToggle.style.display = '';
        const link = document.createElement('a');
        link.download = 'schedule.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (e) {
        alert('PNG 내보내기에 실패했습니다.');
        console.error(e);
      }
      pngBtn.disabled = false;
      pngBtn.textContent = 'PNG';
    });
  }

  // PDF export
  const pdfBtn = document.getElementById('spExportPdf');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', async () => {
      pdfBtn.disabled = true;
      pdfBtn.textContent = '...';
      try {
        const exportBar = document.querySelector('.sp-export-bar');
        const langToggle = document.getElementById('spLangToggle');
        if (exportBar) exportBar.style.display = 'none';
        if (langToggle) langToggle.style.display = 'none';
        const canvas = await html2canvas(document.body, {
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: document.body.scrollWidth,
          windowHeight: document.body.scrollHeight
        });
        if (exportBar) exportBar.style.display = '';
        if (langToggle) langToggle.style.display = '';
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pxW = canvas.width;
        const pxH = canvas.height;
        const pdfW = 210; // A4 mm
        const pdfH = (pxH * pdfW) / pxW;
        const pdf = new jsPDF({ orientation: pdfH > 297 ? 'p' : 'p', unit: 'mm', format: [pdfW, Math.max(pdfH, 297)] });
        pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
        pdf.save('schedule.pdf');
      } catch (e) {
        alert('PDF 내보내기에 실패했습니다.');
        console.error(e);
      }
      pdfBtn.disabled = false;
      pdfBtn.textContent = 'PDF';
    });
  }
});
