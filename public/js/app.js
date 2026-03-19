document.addEventListener('DOMContentLoaded', () => {
  // Init dropzones
  document.querySelectorAll('.dropzone').forEach(initDropzone);

  // Page-specific init
  if (document.getElementById('adminDashboard')) {
    initAdminDashboard();
    if (document.getElementById('dashboardScheduleCard')) initDashboardSchedules();
  }
  if (document.getElementById('adminClassesPage')) {
    initAdminClassesPage();
  }
  if (document.getElementById('adminTeachersPage')) {
    initAdminTeachersPage();
  }
  if (document.getElementById('adminClassPage')) {
    initAdminClassPage();
    const classEl = document.getElementById('adminClassPage');
    if (classEl && document.getElementById('calendarGrid')) {
      initClassCalendar(classEl.dataset.classId, false);
    }
  }
  if (document.getElementById('adminStudentPage')) initAdminStudentPage();
  if (document.getElementById('studentClassPage')) {
    initStudentClassPage();
    const stuClassEl = document.getElementById('studentClassPage');
    if (stuClassEl && document.getElementById('calendarGrid')) {
      initClassCalendar(stuClassEl.dataset.classId, true);
    }
  }

  if (document.getElementById('scheduleListPage')) initScheduleListPage();
  if (document.getElementById('scheduleEditorPage')) initScheduleEditorPage();

  // Student/Admin sidebar
  const sidebarEl = document.getElementById('studentSidebar') || document.getElementById('adminSidebar');
  if (sidebarEl) {
    initSidebar(sidebarEl);
  }
});

// ======= Sidebar (Student & Admin) =======
function initSidebar(sidebar) {
  const overlay = document.getElementById('sidebarOverlay');
  const hamburger = document.getElementById('hamburgerBtn');
  const closeBtn = document.getElementById('sidebarClose');
  function openSidebar() {
    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (hamburger) hamburger.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (overlay) overlay.addEventListener('click', closeSidebar);

  // Toggle submenus (generic: works for all .sidebar-toggle with data-target)
  sidebar.querySelectorAll('.sidebar-toggle').forEach(toggle => {
    const targetId = toggle.dataset.target;
    const submenu = targetId ? document.getElementById(targetId) : null;
    if (!submenu) return;
    toggle.addEventListener('click', () => {
      const isOpen = submenu.classList.contains('open');
      submenu.classList.toggle('open');
      toggle.classList.toggle('active', !isOpen);
    });
  });

  // Classes unified sidebar: arrow button toggles submenu
  sidebar.querySelectorAll('.sidebar-arrow-btn').forEach(btn => {
    const targetId = btn.dataset.target;
    const submenu = targetId ? document.getElementById(targetId) : null;
    if (!submenu) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = submenu.classList.contains('open');
      submenu.classList.toggle('open');
      btn.classList.toggle('open', !isOpen);
    });
  });

  // Subgroup toggles inside classes submenu
  sidebar.querySelectorAll('.sidebar-subgroup-toggle').forEach(toggle => {
    const targetId = toggle.dataset.target;
    const submenu = targetId ? document.getElementById(targetId) : null;
    if (!submenu) return;
    toggle.addEventListener('click', () => {
      const isOpen = submenu.classList.contains('open');
      submenu.classList.toggle('open');
      toggle.classList.toggle('active', !isOpen);
      // Update arrow
      const arrow = toggle.querySelector('.sidebar-arrow');
      if (arrow) arrow.innerHTML = isOpen ? '&#9654;' : '&#9660;';
    });
  });
}

// ======= Dropzone =======
function initDropzone(zone) {
  const fileInput = zone.querySelector('input[type="file"]');
  if (!fileInput) return;

  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    fileInput.files = e.dataTransfer.files;
    fileInput.dispatchEvent(new Event('change'));
  });
}

// ======= Admin Dashboard =======
function initAdminDashboard() {
  const el = document.getElementById('adminDashboard');
  const userRole = el.dataset.userRole;

  // Create teacher (dashboard)
  const btnCreateTeacher = document.getElementById('btnCreateTeacher');
  if (btnCreateTeacher) {
    btnCreateTeacher.addEventListener('click', () => {
      const roleInput = document.getElementById('newTeacherRole');
      if (roleInput) roleInput.value = 'teacher';
      document.getElementById('createTeacherModal').style.display = 'flex';
    });
  }

  const btnConfirmCreateTeacher = document.getElementById('btnConfirmCreateTeacher');
  if (btnConfirmCreateTeacher) {
    btnConfirmCreateTeacher.addEventListener('click', async () => {
      const username = document.getElementById('newTeacherId').value.trim();
      const name = document.getElementById('newTeacherName').value.trim();
      const password = document.getElementById('newTeacherPw').value;
      const roleInput = document.getElementById('newTeacherRole');
      const role = roleInput ? roleInput.value : 'teacher';
      if (!username || !name || !password) return alert('모든 항목을 입력해주세요.');

      const res = await fetch(window.__SEC + '/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name, password, role })
      });
      const data = await res.json();
      if (data.success) {
        location.reload();
      } else {
        alert(data.error || '강사 생성 실패');
      }
    });
  }

  // Delete teacher
  document.querySelectorAll('.btn-delete-teacher').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('정말 삭제하시겠습니까?')) return;
      const res = await fetch(`${window.__SEC}/teachers/${btn.dataset.id}/delete`, { method: 'POST' });
      const data = await res.json();
      if (data.success) location.reload();
      else alert(data.error || '삭제 실패');
    });
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });
}

// ======= Admin Classes Page =======
function initAdminClassesPage() {
  // Create class
  const btnCreateClass = document.getElementById('btnCreateClass');
  if (btnCreateClass) {
    btnCreateClass.addEventListener('click', () => {
      document.getElementById('createClassModal').style.display = 'flex';
    });
  }

  const btnConfirmCreateClass = document.getElementById('btnConfirmCreateClass');
  if (btnConfirmCreateClass) {
    btnConfirmCreateClass.addEventListener('click', async () => {
      const name = document.getElementById('newClassName').value.trim();
      const type = document.getElementById('newClassType').value;
      if (!name) return alert('수업 이름을 입력해주세요.');

      const res = await fetch(window.__SEC + '/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type })
      });
      const data = await res.json();
      if (data.success) {
        location.reload();
      } else {
        alert(data.error || '수업 생성 실패');
      }
    });
  }

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });

  // ── Bulk edit mode ──
  const btnEdit = document.getElementById('btnEditMode');
  const toolbar = document.getElementById('bulkToolbar');
  const btnCancel = document.getElementById('btnCancelEdit');
  if (!btnEdit) return;

  let editMode = false;

  function setEditMode(on) {
    editMode = on;
    document.getElementById('adminClassesPage').classList.toggle('bulk-edit-mode', on);
    toolbar.style.display = on ? 'flex' : 'none';
    btnEdit.style.display = on ? 'none' : '';
    document.querySelectorAll('.bulk-checkbox').forEach(el => el.style.display = on ? '' : 'none');
    if (!on) {
      document.querySelectorAll('.bulk-item-check, .bulk-select-all').forEach(cb => cb.checked = false);
      document.querySelectorAll('.classes-col-card-wrap').forEach(el => el.classList.remove('bulk-selected'));
    }
    updateBulkCount();
  }

  function updateBulkCount() {
    const cnt = document.querySelectorAll('.bulk-item-check:checked').length;
    document.getElementById('bulkCount').textContent = cnt + '개 선택';
    toolbar.querySelectorAll('[data-bulk-status]').forEach(btn => btn.disabled = cnt === 0);
  }

  btnEdit.addEventListener('click', () => setEditMode(true));
  btnCancel.addEventListener('click', () => setEditMode(false));

  // Select-all per column
  document.querySelectorAll('.bulk-select-all').forEach(sa => {
    sa.addEventListener('change', () => {
      const col = sa.closest('.classes-column');
      col.querySelectorAll('.bulk-item-check').forEach(cb => {
        cb.checked = sa.checked;
        cb.closest('.classes-col-card-wrap').classList.toggle('bulk-selected', sa.checked);
      });
      updateBulkCount();
    });
  });

  // Individual checkbox
  document.addEventListener('change', e => {
    if (!e.target.classList.contains('bulk-item-check')) return;
    e.target.closest('.classes-col-card-wrap').classList.toggle('bulk-selected', e.target.checked);
    updateBulkCount();
  });

  // Bulk status buttons
  toolbar.querySelectorAll('[data-bulk-status]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const status = btn.dataset.bulkStatus;
      const ids = [...document.querySelectorAll('.bulk-item-check:checked')].map(cb => parseInt(cb.value));
      if (ids.length === 0) return;

      const labelMap = { active: '진행 중', upcoming: '예정', inactive: '종강' };
      if (!confirm(ids.length + '개 수업을 "' + labelMap[status] + '"(으)로 변경하시겠습니까?')) return;

      const res = await fetch(window.__SEC + '/classes/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classIds: ids, status })
      });
      const data = await res.json();
      if (data.success) {
        location.reload();
      } else {
        alert(data.error || '상태 변경 실패');
      }
    });
  });
}

// ======= Admin Teachers Page =======
function initAdminTeachersPage() {
  // Create teacher
  const btnCreateTeacher = document.getElementById('btnCreateTeacher');
  if (btnCreateTeacher) {
    btnCreateTeacher.addEventListener('click', () => {
      const roleInput = document.getElementById('newTeacherRole');
      const titleEl = document.getElementById('createTeacherModalTitle');
      if (roleInput) roleInput.value = 'teacher';
      if (titleEl) titleEl.textContent = '강사 계정 생성';
      document.getElementById('createTeacherModal').style.display = 'flex';
    });
  }

  // Create subadmin
  const btnCreateSubadmin = document.getElementById('btnCreateSubadmin');
  if (btnCreateSubadmin) {
    btnCreateSubadmin.addEventListener('click', () => {
      const roleInput = document.getElementById('newTeacherRole');
      const titleEl = document.getElementById('createTeacherModalTitle');
      if (roleInput) roleInput.value = 'subadmin';
      if (titleEl) titleEl.textContent = '부원장 계정 생성';
      document.getElementById('createTeacherModal').style.display = 'flex';
    });
  }

  const btnConfirmCreateTeacher = document.getElementById('btnConfirmCreateTeacher');
  if (btnConfirmCreateTeacher) {
    btnConfirmCreateTeacher.addEventListener('click', async () => {
      const username = document.getElementById('newTeacherId').value.trim();
      const name = document.getElementById('newTeacherName').value.trim();
      const password = document.getElementById('newTeacherPw').value;
      const roleInput = document.getElementById('newTeacherRole');
      const role = roleInput ? roleInput.value : 'teacher';
      if (!username || !name || !password) return alert('모든 항목을 입력해주세요.');

      const res = await fetch(window.__SEC + '/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name, password, role })
      });
      const data = await res.json();
      if (data.success) {
        location.reload();
      } else {
        alert(data.error || '생성 실패');
      }
    });
  }

  // Delete teacher/subadmin
  document.querySelectorAll('.btn-delete-teacher').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('정말 삭제하시겠습니까?')) return;
      const res = await fetch(`${window.__SEC}/teachers/${btn.dataset.id}/delete`, { method: 'POST' });
      const data = await res.json();
      if (data.success) location.reload();
      else alert(data.error || '삭제 실패');
    });
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });
}

// ======= Admin Class Page =======
function initAdminClassPage() {
  const el = document.getElementById('adminClassPage');
  const classId = el.dataset.classId;
  const userRole = el.dataset.userRole;

  // Edit class
  const btnEdit = document.getElementById('btnEditClass');
  if (btnEdit) {
    btnEdit.addEventListener('click', async () => {
      const name = document.getElementById('editClassName').value.trim();
      const type = document.getElementById('editClassType').value;
      const status = document.getElementById('editClassStatus').value;
      if (!name) return alert('수업 이름을 입력해주세요.');

      const res = await fetch(`${window.__SEC}/class/${classId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, status })
      });
      const data = await res.json();
      if (data.success) location.reload();
      else alert(data.error || '수정 실패');
    });
  }

  // Delete class
  const btnDelete = document.getElementById('btnDeleteClass');
  if (btnDelete) {
    btnDelete.addEventListener('click', async () => {
      if (!confirm('정말 이 수업을 삭제하시겠습니까? 모든 관련 데이터가 삭제됩니다.')) return;
      const res = await fetch(`${window.__SEC}/class/${classId}/delete`, { method: 'POST' });
      const data = await res.json();
      if (data.success) location.href = window.__SEC;
      else alert(data.error || '삭제 실패');
    });
  }

  // Add teacher
  const btnAddTeacher = document.getElementById('btnAddTeacher');
  if (btnAddTeacher) {
    btnAddTeacher.addEventListener('click', async () => {
      const tid = document.getElementById('addTeacherSelect').value;
      if (!tid) return alert('강사를 선택해주세요.');

      const res = await fetch(`${window.__SEC}/class/${classId}/teachers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: tid })
      });
      const data = await res.json();
      if (data.success) location.reload();
      else alert(data.error || '배정 실패');
    });
  }

  // Remove teacher
  document.querySelectorAll('.btn-remove-teacher').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('강사 배정을 해제하시겠습니까?')) return;
      const res = await fetch(`${window.__SEC}/class/${classId}/teachers/${btn.dataset.tid}/remove`, { method: 'POST' });
      const data = await res.json();
      if (data.success) location.reload();
      else alert(data.error || '해제 실패');
    });
  });

  // Load students for enrollment select
  loadStudentsForEnroll(classId);

  // Enroll student
  const btnEnroll = document.getElementById('btnEnrollStudent');
  if (btnEnroll) {
    btnEnroll.addEventListener('click', async () => {
      const sid = document.getElementById('addStudentSelect').value;
      if (!sid) return alert('학생을 선택해주세요.');

      const res = await fetch(`${window.__SEC}/class/${classId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: sid })
      });
      const data = await res.json();
      if (data.success) location.reload();
      else alert(data.error || '등록 실패');
    });
  }

  // Unenroll
  document.querySelectorAll('.btn-unenroll').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('학생 등록을 해제하시겠습니까?')) return;
      const res = await fetch(`${window.__SEC}/class/${classId}/unenroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: btn.dataset.sid })
      });
      const data = await res.json();
      if (data.success) location.reload();
      else alert(data.error || '해제 실패');
    });
  });

  // Re-enroll
  document.querySelectorAll('.btn-reenroll').forEach(btn => {
    btn.addEventListener('click', async () => {
      const res = await fetch(`${window.__SEC}/class/${classId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: btn.dataset.sid })
      });
      const data = await res.json();
      if (data.success) location.reload();
      else alert(data.error || '재등록 실패');
    });
  });

  // Grading file upload
  const gradingDropzone = document.getElementById('gradingDropzone');
  if (gradingDropzone) {
    const fileInput = gradingDropzone.querySelector('input[type="file"]');
    fileInput.addEventListener('change', async () => {
      if (!fileInput.files.length) return;
      const formData = new FormData();
      for (const f of fileInput.files) formData.append('files', f);

      document.getElementById('gradingProgress').style.display = 'flex';
      document.getElementById('gradingResults').innerHTML = '';

      try {
        const res = await fetch(`${window.__SEC}/class/${classId}/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        document.getElementById('gradingProgress').style.display = 'none';

        if (data.results) {
          const html = data.results.map(r => {
            if (r.success) {
              return `<div class="result-item result-success">${r.file} → ${r.matched}</div>`;
            } else {
              return `<div class="result-item result-error">${r.file}: ${r.error}</div>`;
            }
          }).join('');
          document.getElementById('gradingResults').innerHTML = html;
        } else if (data.error) {
          document.getElementById('gradingResults').innerHTML = `<div class="result-item result-error">${data.error}</div>`;
        }
      } catch (e) {
        document.getElementById('gradingProgress').style.display = 'none';
        document.getElementById('gradingResults').innerHTML = '<div class="result-item result-error">업로드 중 오류 발생</div>';
      }
      fileInput.value = '';
    });
  }

  // Textbook upload (drag & drop + multi-file)
  const textbookDropzone = document.getElementById('textbookDropzone');
  const textbookInput = document.getElementById('textbookFileInput');
  if (textbookDropzone && textbookInput) {
    async function uploadTextbooks(files) {
      if (!files.length) return;
      const progressDiv = document.getElementById('textbookProgress');
      const progressFill = document.getElementById('textbookProgressFill');
      const resultEl = document.getElementById('textbookUploadResult');
      progressDiv.style.display = 'block';
      progressFill.style.width = '0%';
      resultEl.textContent = '업로드 중...';
      resultEl.style.color = 'var(--gray-500)';

      const formData = new FormData();
      for (const f of files) formData.append('files', f);

      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${window.__SEC}/class/${classId}/textbook`);
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            progressFill.style.width = pct + '%';
            resultEl.textContent = '업로드 중... ' + pct + '%';
          }
        });
        await new Promise((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status === 200) {
              const data = JSON.parse(xhr.responseText);
              if (data.success) resolve(data);
              else reject(new Error(data.error || '업로드 실패'));
            } else reject(new Error('서버 오류'));
          };
          xhr.onerror = () => reject(new Error('네트워크 오류'));
          xhr.send(formData);
        });
        resultEl.textContent = '업로드 완료!';
        resultEl.style.color = 'var(--success, #16a34a)';
        setTimeout(() => location.reload(), 800);
      } catch (e) {
        resultEl.textContent = e.message || '업로드 중 오류 발생';
        resultEl.style.color = 'var(--danger)';
      }
      textbookInput.value = '';
    }

    textbookInput.addEventListener('change', () => uploadTextbooks(Array.from(textbookInput.files)));
    textbookDropzone.addEventListener('click', () => textbookInput.click());
    ['dragenter','dragover'].forEach(evt => {
      textbookDropzone.addEventListener(evt, e => { e.preventDefault(); textbookDropzone.style.borderColor = '#2563eb'; textbookDropzone.style.background = '#eff6ff'; });
    });
    ['dragleave','drop'].forEach(evt => {
      textbookDropzone.addEventListener(evt, e => { e.preventDefault(); textbookDropzone.style.borderColor = '#cbd5e1'; textbookDropzone.style.background = ''; });
    });
    textbookDropzone.addEventListener('drop', e => {
      const files = Array.from(e.dataTransfer.files);
      if (files.length) uploadTextbooks(files);
    });
  }

  // Textbook delete
  document.querySelectorAll('.btn-delete-textbook').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('교재를 삭제하시겠습니까?')) return;
      const res = await fetch(`${window.__SEC}/class/${classId}/textbook/${btn.dataset.tid}/delete`, { method: 'POST' });
      const data = await res.json();
      if (data.success) location.reload();
      else alert(data.error || '삭제 실패');
    });
  });

  // Save notes
  const btnSaveNotes = document.getElementById('btnSaveNotes');
  if (btnSaveNotes) {
    btnSaveNotes.addEventListener('click', async () => {
      const notes = document.getElementById('classNotes').value;
      const res = await fetch(`${window.__SEC}/class/${classId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });
      const data = await res.json();
      const resultEl = document.getElementById('notesSaveResult');
      if (data.success) {
        resultEl.textContent = '저장 완료!';
        resultEl.style.color = 'var(--success)';
        setTimeout(() => { resultEl.textContent = ''; }, 3000);
      } else {
        resultEl.textContent = data.error || '저장 실패';
        resultEl.style.color = 'var(--danger)';
      }
    });
  }

  // Save scores
  const btnSaveScores = document.getElementById('btnSaveScores');
  if (btnSaveScores) {
    btnSaveScores.addEventListener('click', async () => {
      const scores = {};
      const rows = document.querySelectorAll('#scoresTable tbody tr');
      rows.forEach(row => {
        const studentId = row.dataset.studentId;
        scores[studentId] = {};
        row.querySelectorAll('.score-input').forEach(input => {
          const scheduleId = input.dataset.scheduleId;
          scores[studentId][scheduleId] = input.value;
        });
      });

      const res = await fetch(`${window.__SEC}/class/${classId}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores })
      });
      const data = await res.json();
      const resultEl = document.getElementById('scoresSaveResult');
      if (data.success) {
        resultEl.textContent = '저장 완료!';
        resultEl.style.color = 'var(--success)';
        setTimeout(() => { resultEl.textContent = ''; }, 3000);
      } else {
        resultEl.textContent = data.error || '저장 실패';
        resultEl.style.color = 'var(--danger)';
      }
    });
  }
}

async function loadStudentsForEnroll(classId) {
  const select = document.getElementById('addStudentSelect');
  if (!select) return;

  try {
    const res = await fetch(window.__SEC + '/students');
    const students = await res.json();

    // Get currently enrolled
    const enrolledRes = await fetch(`${window.__SEC}/class/${classId}/students`);
    const enrolled = await enrolledRes.json();
    const enrolledIds = new Set(enrolled.filter(e => e.status === 'active').map(e => e.id));

    students.forEach(s => {
      if (!enrolledIds.has(s.id)) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (${s.username})`;
        select.appendChild(opt);
      }
    });
  } catch (e) {
    // ignore
  }
}

// ======= Admin Student Page =======
function initAdminStudentPage() {
  const el = document.getElementById('adminStudentPage');
  const studentId = el.dataset.studentId;

  // Delete student
  const btnDelete = document.getElementById('btnDeleteStudent');
  if (btnDelete) {
    btnDelete.addEventListener('click', async () => {
      if (!confirm('이 학생을 삭제하시겠습니까?\n(학생 번호는 보존되며, 수업 등록이 모두 해제됩니다)')) return;
      const res = await fetch(`${window.__SEC}/student/${studentId}/delete`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('학생이 삭제되었습니다.');
        location.href = window.__SEC;
      } else {
        alert(data.error || '삭제 실패');
      }
    });
  }

  // Add feedback
  const btnFb = document.getElementById('btnAddFeedback');
  if (btnFb) {
    btnFb.addEventListener('click', async () => {
      const content = document.getElementById('feedbackContent').value.trim();
      if (!content) return alert('피드백 내용을 입력해주세요.');

      const res = await fetch(`${window.__SEC}/student/${studentId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (data.success) location.reload();
      else alert(data.error || '작성 실패');
    });
  }

  // Delete feedback
  document.querySelectorAll('.btn-delete-feedback').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('피드백을 삭제하시겠습니까?')) return;
      const res = await fetch(`${window.__SEC}/feedback/${btn.dataset.id}/delete`, { method: 'POST' });
      const data = await res.json();
      if (data.success) location.reload();
      else alert(data.error || '삭제 실패');
    });
  });

  // Add consultation
  const btnCon = document.getElementById('btnAddConsultation');
  if (btnCon) {
    btnCon.addEventListener('click', async () => {
      const content = document.getElementById('consultationContent').value.trim();
      if (!content) return alert('상담기록 내용을 입력해주세요.');

      const res = await fetch(`${window.__SEC}/student/${studentId}/consultation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (data.success) location.reload();
      else alert(data.error || '작성 실패');
    });
  }

  // Delete consultation
  document.querySelectorAll('.btn-delete-consultation').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('상담기록을 삭제하시겠습니까?')) return;
      const res = await fetch(`${window.__SEC}/consultation/${btn.dataset.id}/delete`, { method: 'POST' });
      const data = await res.json();
      if (data.success) location.reload();
      else alert(data.error || '삭제 실패');
    });
  });
}

// ======= Student Class Page =======
function initStudentClassPage() {
  const el = document.getElementById('studentClassPage');
  const classId = el.dataset.classId;

  // Textbook download - update remaining count after click
  document.querySelectorAll('.btn-download-textbook').forEach(btn => {
    btn.addEventListener('click', () => {
      const tid = btn.dataset.tid;
      const remainEl = document.querySelector(`.textbook-remaining[data-tid="${tid}"]`);
      if (remainEl) {
        const match = remainEl.textContent.match(/(\d+)/);
        if (match) {
          const newCount = Math.max(0, parseInt(match[1], 10) - 1);
          remainEl.textContent = `잔여 ${newCount}회`;
          if (newCount === 0) {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline');
            btn.textContent = '횟수 초과';
            btn.removeAttribute('href');
            btn.style.pointerEvents = 'none';
          }
        }
      }
    });
  });

  // Homework upload
  const hwDropzone = document.getElementById('homeworkDropzone');
  if (hwDropzone) {
    const fileInput = hwDropzone.querySelector('input[type="file"]');
    fileInput.addEventListener('change', async () => {
      if (!fileInput.files.length) return;
      const formData = new FormData();
      for (const f of fileInput.files) formData.append('files', f);

      document.getElementById('hwProgress').style.display = 'flex';
      document.getElementById('hwResults').innerHTML = '';

      try {
        const res = await fetch(`${window.__BASE}/student/class/${classId}/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        document.getElementById('hwProgress').style.display = 'none';

        if (data.success) {
          document.getElementById('hwResults').innerHTML =
            `<div class="result-item result-success">${data.count}개 파일 업로드 완료</div>`;
          setTimeout(() => location.reload(), 1500);
        } else {
          document.getElementById('hwResults').innerHTML =
            `<div class="result-item result-error">${data.error}</div>`;
        }
      } catch (e) {
        document.getElementById('hwProgress').style.display = 'none';
        document.getElementById('hwResults').innerHTML = '<div class="result-item result-error">업로드 중 오류 발생</div>';
      }
      fileInput.value = '';
    });
  }
}

// ======= Class Calendar =======
function initClassCalendar(classId, readOnly) {
  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth() + 1;
  let schedules = [];
  let editingId = null;

  const isStudent = !!document.getElementById('studentClassPage');
  const apiBase = isStudent ? `${window.__BASE}/student/class/${classId}` : `${window.__SEC}/class/${classId}`;

  const grid = document.getElementById('calendarGrid');
  const titleEl = document.getElementById('calTitle');

  // Admin modal elements
  const modal = document.getElementById('scheduleModal');
  const modalTitle = modal ? document.getElementById('scheduleModalTitle') : null;
  const dateInput = modal ? document.getElementById('scheduleDate') : null;
  const startTimeInput = modal ? document.getElementById('scheduleStartTime') : null;
  const endTimeInput = modal ? document.getElementById('scheduleEndTime') : null;
  const descInput = modal ? document.getElementById('scheduleDesc') : null;
  const btnSave = modal ? document.getElementById('btnSaveSchedule') : null;
  const btnDelete = modal ? document.getElementById('btnDeleteSchedule') : null;
  const btnCancel = modal ? document.getElementById('btnCancelSchedule') : null;
  const btnClose = modal ? document.getElementById('scheduleModalClose') : null;
  const repeatGroup = modal ? document.getElementById('repeatGroup') : null;
  const repeatInput = modal ? document.getElementById('scheduleRepeatWeeks') : null;
  const repeatHint = modal ? document.getElementById('repeatHint') : null;

  // 24h time input auto-format (HH:MM)
  function setupTimeInput(input) {
    if (!input) return;
    input.addEventListener('input', function () {
      let v = this.value.replace(/[^0-9]/g, '');
      if (v.length >= 3) v = v.substring(0, 2) + ':' + v.substring(2, 4);
      this.value = v.substring(0, 5);
    });
    input.addEventListener('blur', function () {
      const m = this.value.match(/^(\d{1,2}):(\d{2})$/);
      if (m) {
        const h = Math.min(parseInt(m[1], 10), 23);
        const min = Math.min(parseInt(m[2], 10), 59);
        this.value = String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
      }
    });
  }
  setupTimeInput(startTimeInput);
  setupTimeInput(endTimeInput);

  // Student view modal
  const viewModal = document.getElementById('scheduleViewModal');
  const viewContent = viewModal ? document.getElementById('scheduleViewContent') : null;
  const viewClose = viewModal ? document.getElementById('scheduleViewClose') : null;
  const viewOk = viewModal ? document.getElementById('scheduleViewOk') : null;

  // Nav
  document.getElementById('calPrev').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    loadMonth();
  });
  document.getElementById('calNext').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    loadMonth();
  });
  document.getElementById('calToday').addEventListener('click', () => {
    const t = new Date();
    currentYear = t.getFullYear();
    currentMonth = t.getMonth() + 1;
    loadMonth();
  });

  // Admin modal setup
  if (!readOnly && modal) {
    btnCancel.addEventListener('click', closeModal);
    btnClose.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    if (repeatInput) {
      repeatInput.addEventListener('input', updateRepeatHint);
    }

    btnSave.addEventListener('click', async () => {
      const date = dateInput.value;
      const startTime = startTimeInput.value || '';
      const endTime = endTimeInput.value || '';
      const description = descInput ? descInput.value.trim() : '';

      if (editingId) {
        let payload = { start_time: startTime, end_time: endTime, description };
        let res = await fetch(`${window.__SEC}/class/${classId}/schedules/${editingId}/edit`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        let data = await res.json();
        if (data.overlap) {
          const msg = '⚠️ 같은 강사의 수업 시간이 겹칩니다!\n\n' + data.conflicts.join('\n') + '\n\n그래도 진행하시겠습니까?';
          if (!confirm(msg)) return;
          payload.force_overlap = true;
          res = await fetch(`${window.__SEC}/class/${classId}/schedules/${editingId}/edit`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
          });
          data = await res.json();
        }
        if (!data.success) return alert(data.error || '수정 실패');
      } else {
        const repeatWeeks = parseInt(repeatInput.value, 10) || 0;
        let payload = { schedule_date: date, start_time: startTime, end_time: endTime, description, repeat_weeks: repeatWeeks };
        let res = await fetch(`${window.__SEC}/class/${classId}/schedules`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        let data = await res.json();
        if (data.overlap) {
          const msg = '⚠️ 같은 강사의 수업 시간이 겹칩니다!\n\n' + data.conflicts.join('\n') + '\n\n그래도 진행하시겠습니까?';
          if (!confirm(msg)) return;
          payload.force_overlap = true;
          res = await fetch(`${window.__SEC}/class/${classId}/schedules`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
          });
          data = await res.json();
        }
        if (!data.success) return alert(data.error || '추가 실패');
        if (data.count > 1) {
          alert(data.count + '개 일정이 추가되었습니다.');
        }
      }
      closeModal();
      loadMonth();
    });

    btnDelete.addEventListener('click', async () => {
      if (!editingId) return;
      if (!confirm('이 일정을 삭제하시겠습니까?')) return;
      const res = await fetch(`${window.__SEC}/class/${classId}/schedules/${editingId}/delete`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) return alert(data.error || '삭제 실패');
      closeModal();
      loadMonth();
    });
  }

  // Student view modal
  if (viewModal) {
    const closeView = () => { viewModal.style.display = 'none'; };
    viewClose.addEventListener('click', closeView);
    viewOk.addEventListener('click', closeView);
    viewModal.addEventListener('click', e => { if (e.target === viewModal) closeView(); });
  }

  function updateRepeatHint() {
    const weeks = parseInt(repeatInput.value, 10) || 0;
    if (weeks > 0) {
      const baseDate = new Date(dateInput.value);
      const endDate = new Date(baseDate);
      endDate.setDate(endDate.getDate() + weeks * 7);
      repeatHint.textContent = `${dateInput.value} ~ ${formatDate(endDate)} (총 ${weeks + 1}개 일정)`;
    } else {
      repeatHint.textContent = '';
    }
  }

  function openAddModal(dateStr) {
    if (readOnly) return;
    editingId = null;
    modalTitle.textContent = '일정 추가';
    dateInput.value = dateStr;
    startTimeInput.value = '';
    endTimeInput.value = '';
    if (descInput) descInput.value = '';
    btnDelete.style.display = 'none';
    if (repeatGroup) repeatGroup.style.display = '';
    if (repeatInput) repeatInput.value = '0';
    if (repeatHint) repeatHint.textContent = '';
    modal.style.display = 'flex';
    startTimeInput.focus();
  }

  function openEditModal(schedule) {
    if (readOnly) {
      openViewModal(schedule);
      return;
    }
    editingId = schedule.id;
    modalTitle.textContent = '일정 수정';
    dateInput.value = schedule.schedule_date;
    startTimeInput.value = schedule.start_time || '';
    endTimeInput.value = schedule.end_time || '';
    if (descInput) descInput.value = schedule.description || '';
    btnDelete.style.display = '';
    if (repeatGroup) repeatGroup.style.display = 'none';
    modal.style.display = 'flex';
    startTimeInput.focus();
  }

  function openViewModal(schedule) {
    if (!viewModal) return;
    while (viewContent.firstChild) viewContent.removeChild(viewContent.firstChild);

    const rows = [
      { label: '회차', value: schedule.seq + '회차' },
      { label: '날짜', value: schedule.schedule_date },
    ];
    if (schedule.start_time || schedule.end_time) {
      rows.push({ label: '시간', value: formatTimeRange(schedule.start_time, schedule.end_time) });
    }
    if (schedule.description) {
      rows.push({ label: '설명', value: schedule.description });
    }

    rows.forEach(r => {
      const row = document.createElement('div');
      row.className = 'schedule-view-row';
      const label = document.createElement('span');
      label.className = 'schedule-view-label';
      label.textContent = r.label;
      const value = document.createElement('span');
      value.textContent = r.value;
      row.appendChild(label);
      row.appendChild(value);
      viewContent.appendChild(row);
    });

    viewModal.style.display = 'flex';
  }

  function closeModal() {
    if (modal) modal.style.display = 'none';
    editingId = null;
  }

  function formatTimeRange(start, end) {
    if (!start && !end) return '';
    if (start && end) return start.substring(0, 5) + ' ~ ' + end.substring(0, 5);
    if (start) return start.substring(0, 5) + ' ~';
    return '~ ' + end.substring(0, 5);
  }

  async function loadMonth() {
    titleEl.textContent = `${currentYear}년 ${currentMonth}월`;
    try {
      const res = await fetch(`${apiBase}/schedules?year=${currentYear}&month=${currentMonth}`);
      schedules = await res.json();
    } catch (e) {
      schedules = [];
    }
    renderCalendar();
  }

  function renderCalendar() {
    while (grid.firstChild) grid.removeChild(grid.firstChild);

    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Monday=0
    const daysInMonth = lastDay.getDate();
    const prevLastDay = new Date(currentYear, currentMonth - 1, 0);
    const prevDays = prevLastDay.getDate();
    const todayStr = formatDate(new Date());

    const scheduleMap = {};
    schedules.forEach(s => {
      if (!scheduleMap[s.schedule_date]) scheduleMap[s.schedule_date] = [];
      scheduleMap[s.schedule_date].push(s);
    });

    for (let i = startDow - 1; i >= 0; i--) {
      const day = prevDays - i;
      const m = currentMonth - 1 <= 0 ? 12 : currentMonth - 1;
      const y = currentMonth - 1 <= 0 ? currentYear - 1 : currentYear;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cellDow = (startDow - 1) - i;
      createDayCell(day, dateStr, true, cellDow, todayStr, scheduleMap[dateStr] || []);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = (startDow + d - 1) % 7;
      createDayCell(d, dateStr, false, dow, todayStr, scheduleMap[dateStr] || []);
    }

    const totalCells = startDow + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= remaining; d++) {
      const m = currentMonth + 1 > 12 ? 1 : currentMonth + 1;
      const y = currentMonth + 1 > 12 ? currentYear + 1 : currentYear;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = (totalCells + d - 1) % 7;
      createDayCell(d, dateStr, true, dow, todayStr, scheduleMap[dateStr] || []);
    }
  }

  function createDayCell(day, dateStr, isOtherMonth, dow, todayStr, daySchedules) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    if (isOtherMonth) cell.classList.add('other-month');

    const numEl = document.createElement('div');
    numEl.className = 'day-number';
    if (dow === 6) numEl.classList.add('sun');
    if (dow === 5) numEl.classList.add('sat');
    if (dateStr === todayStr) numEl.classList.add('today');
    numEl.textContent = day;
    cell.appendChild(numEl);

    const schedContainer = document.createElement('div');
    schedContainer.className = 'day-schedules';

    const maxShow = 3;
    daySchedules.slice(0, maxShow).forEach(s => {
      const tag = document.createElement('div');
      tag.className = 'schedule-tag';

      if (s.start_time) {
        const ts = document.createElement('span');
        ts.className = 'tag-time';
        ts.textContent = s.start_time.substring(0, 5) + ' ';
        tag.appendChild(ts);
      }
      tag.appendChild(document.createTextNode(s.seq ? s.seq + '회' : '일정'));

      tag.addEventListener('click', e => {
        e.stopPropagation();
        openEditModal(s);
      });
      schedContainer.appendChild(tag);
    });

    if (daySchedules.length > maxShow) {
      const more = document.createElement('div');
      more.className = 'schedule-more';
      more.textContent = '+' + (daySchedules.length - maxShow) + '개 더';
      schedContainer.appendChild(more);
    }

    cell.appendChild(schedContainer);

    if (!readOnly) {
      cell.addEventListener('click', () => { openAddModal(dateStr); });
    }

    grid.appendChild(cell);
  }

  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  loadMonth();
}

// ======= Dashboard Schedules =======
function initDashboardSchedules() {
  let currentTab = 'day';
  let schedules = [];

  // Navigation state: each tab has its own "current date/offset"
  const navState = {
    day: new Date(),
    week: new Date(),
    month: new Date()
  };

  const contentEl = document.getElementById('dashScheduleContent');
  const calendarEl = document.getElementById('dashMonthCalendar');
  const calendarGrid = document.getElementById('dashCalendarGrid');
  const tabs = document.querySelectorAll('.schedule-tab');
  const navEl = document.getElementById('dashScheduleNav');
  const navTitle = document.getElementById('dashNavTitle');
  const navPrev = document.getElementById('dashNavPrev');
  const navNext = document.getElementById('dashNavNext');
  const navToday = document.getElementById('dashNavToday');

  // Teacher filter (admin/subadmin only)
  const teacherFilter = document.getElementById('dashTeacherFilter');
  if (teacherFilter) {
    fetch(window.__SEC + '/dashboard-teachers')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        (data.teachers || []).forEach(function(t) {
          var opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = t.name;
          teacherFilter.appendChild(opt);
        });
      });
    teacherFilter.addEventListener('change', function() { loadAndRender(); });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active', 'btn-primary');
        t.classList.add('btn-outline');
      });
      tab.classList.add('active', 'btn-primary');
      tab.classList.remove('btn-outline');
      currentTab = tab.dataset.tab;
      loadAndRender();
    });
  });

  if (navPrev) navPrev.addEventListener('click', () => navigate(-1));
  if (navNext) navNext.addEventListener('click', () => navigate(1));
  if (navToday) navToday.addEventListener('click', () => {
    navState[currentTab] = new Date();
    loadAndRender();
  });

  function navigate(dir) {
    const d = navState[currentTab];
    if (currentTab === 'day') {
      d.setDate(d.getDate() + dir);
    } else if (currentTab === 'week') {
      d.setDate(d.getDate() + dir * 7);
    } else {
      d.setMonth(d.getMonth() + dir);
    }
    loadAndRender();
  }

  function getDateRange() {
    const d = navState[currentTab];
    if (currentTab === 'day') {
      const start = fmtDate(d);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      return { start, end: fmtDate(next) };
    } else if (currentTab === 'week') {
      const dow = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
      const sunEnd = new Date(mon);
      sunEnd.setDate(mon.getDate() + 7);
      return { start: fmtDate(mon), end: fmtDate(sunEnd) };
    } else {
      const y = d.getFullYear();
      const m = d.getMonth();
      const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const nextM = new Date(y, m + 1, 1);
      return { start, end: fmtDate(nextM) };
    }
  }

  function updateNavTitle() {
    const d = navState[currentTab];
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    if (currentTab === 'day') {
      navTitle.textContent = `${fmtDate(d)} (${dayNames[d.getDay()]})`;
    } else if (currentTab === 'week') {
      const dow = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      navTitle.textContent = `${fmtDate(mon)} ~ ${fmtDate(sun)}`;
    } else {
      navTitle.textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    }
  }

  async function loadAndRender() {
    updateNavTitle();
    const range = getDateRange();
    try {
      let url = `${window.__SEC}/dashboard-schedules?start=${range.start}&end=${range.end}`;
      if (teacherFilter && teacherFilter.value) {
        url += `&teacher_id=${teacherFilter.value}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      schedules = data.schedules || [];
    } catch (e) {
      schedules = [];
    }
    render();
  }

  function render() {
    if (currentTab === 'month') {
      contentEl.style.display = 'none';
      calendarEl.style.display = '';
      renderMonthCalendar();
    } else if (currentTab === 'week') {
      contentEl.style.display = '';
      calendarEl.style.display = 'none';
      renderWeekColumns();
    } else {
      contentEl.style.display = '';
      calendarEl.style.display = 'none';
      renderScheduleList();
    }
  }

  function renderMonthCalendar() {
    while (calendarGrid.firstChild) calendarGrid.removeChild(calendarGrid.firstChild);

    const d = navState.month;
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Monday=0
    const daysInMonth = lastDay.getDate();
    const prevLastDay = new Date(year, month - 1, 0);
    const prevDays = prevLastDay.getDate();
    const todayStr = fmtDate(new Date());

    const scheduleMap = {};
    schedules.forEach(s => {
      if (!scheduleMap[s.schedule_date]) scheduleMap[s.schedule_date] = [];
      scheduleMap[s.schedule_date].push(s);
    });

    for (let i = startDow - 1; i >= 0; i--) {
      const day = prevDays - i;
      const m = month - 1 <= 0 ? 12 : month - 1;
      const y = month - 1 <= 0 ? year - 1 : year;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cellDow = (startDow - 1) - i;
      makeDayCell(calendarGrid, day, dateStr, true, cellDow, todayStr, scheduleMap[dateStr] || []);
    }

    for (let dd = 1; dd <= daysInMonth; dd++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      const dow = (startDow + dd - 1) % 7;
      makeDayCell(calendarGrid, dd, dateStr, false, dow, todayStr, scheduleMap[dateStr] || []);
    }

    const totalCells = startDow + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let dd = 1; dd <= remaining; dd++) {
      const m = month + 1 > 12 ? 1 : month + 1;
      const y = month + 1 > 12 ? year + 1 : year;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      const dow = (totalCells + dd - 1) % 7;
      makeDayCell(calendarGrid, dd, dateStr, true, dow, todayStr, scheduleMap[dateStr] || []);
    }
  }

  function makeDayCell(grid, day, dateStr, isOtherMonth, dow, todayStr, daySchedules) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    if (isOtherMonth) cell.classList.add('other-month');

    const numEl = document.createElement('div');
    numEl.className = 'day-number';
    if (dow === 6) numEl.classList.add('sun');
    if (dow === 5) numEl.classList.add('sat');
    if (dateStr === todayStr) numEl.classList.add('today');
    numEl.textContent = day;
    cell.appendChild(numEl);

    const schedContainer = document.createElement('div');
    schedContainer.className = 'day-schedules';

    const maxShow = 3;
    daySchedules.slice(0, maxShow).forEach(s => {
      const tag = document.createElement('div');
      tag.className = 'schedule-tag tag-class-' + (s.class_id % 10);
      tag.style.cursor = 'pointer';
      if (s.start_time) {
        const ts = document.createElement('span');
        ts.className = 'tag-time';
        ts.textContent = s.start_time.substring(0, 5) + ' ';
        tag.appendChild(ts);
      }
      tag.appendChild(document.createTextNode(s.class_name || ''));
      tag.addEventListener('click', () => { location.href = window.__SEC + '/class/' + s.class_id; });
      schedContainer.appendChild(tag);
    });

    if (daySchedules.length > maxShow) {
      const more = document.createElement('div');
      more.className = 'schedule-more';
      more.textContent = '+' + (daySchedules.length - maxShow) + '개 더';
      schedContainer.appendChild(more);
    }

    cell.appendChild(schedContainer);
    grid.appendChild(cell);
  }

  function renderWeekColumns() {
    while (contentEl.firstChild) contentEl.removeChild(contentEl.firstChild);

    const d = navState.week;
    const dow = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));

    const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
    const todayStr = fmtDate(new Date());

    // Build schedule map by date
    const scheduleMap = {};
    schedules.forEach(s => {
      if (!scheduleMap[s.schedule_date]) scheduleMap[s.schedule_date] = [];
      scheduleMap[s.schedule_date].push(s);
    });

    // Determine time range: default 7~22, extend if schedules exist outside
    let minHour = 7, maxHour = 22;
    schedules.forEach(s => {
      if (s.start_time) {
        const h = parseInt(s.start_time.substring(0, 2), 10);
        if (h < minHour) minHour = h;
      }
      if (s.end_time) {
        const h = parseInt(s.end_time.substring(0, 2), 10);
        const m = parseInt(s.end_time.substring(3, 5), 10);
        const endH = m > 0 ? h + 1 : h;
        if (endH > maxHour) maxHour = endH;
      }
    });

    const totalHours = maxHour - minHour;
    const HOUR_PX = 36;
    const bodyHeight = totalHours * HOUR_PX;

    const timetable = document.createElement('div');
    timetable.className = 'week-timetable';

    // Time axis column
    const timeCol = document.createElement('div');
    timeCol.className = 'tt-time-col';
    const timeSpacer = document.createElement('div');
    timeSpacer.className = 'tt-header-spacer';
    timeCol.appendChild(timeSpacer);
    const timeBody = document.createElement('div');
    timeBody.className = 'tt-time-body';
    timeBody.style.height = bodyHeight + 'px';
    for (let h = minHour; h < maxHour; h++) {
      const label = document.createElement('div');
      label.className = 'tt-time-label';
      label.style.top = ((h - minHour) * HOUR_PX) + 'px';
      label.textContent = String(h).padStart(2, '0') + ':00';
      timeBody.appendChild(label);
    }
    timeCol.appendChild(timeBody);
    timetable.appendChild(timeCol);

    // 7 day columns
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(mon);
      dayDate.setDate(mon.getDate() + i);
      const dateStr = fmtDate(dayDate);
      const dayScheds = scheduleMap[dateStr] || [];

      const col = document.createElement('div');
      col.className = 'tt-day-col';
      if (dateStr === todayStr) col.classList.add('tt-day-today');

      const header = document.createElement('div');
      header.className = 'tt-day-header';
      if (i === 5) header.classList.add('sat');
      if (i === 6) header.classList.add('sun');
      header.innerHTML = `<div class="tt-day-name">${dayNames[i]}</div><div class="tt-day-date">${dayDate.getMonth() + 1}/${dayDate.getDate()}</div>`;
      col.appendChild(header);

      const body = document.createElement('div');
      body.className = 'tt-day-body';
      body.style.height = bodyHeight + 'px';

      // Hour grid lines
      for (let h = minHour; h < maxHour; h++) {
        const line = document.createElement('div');
        line.className = 'tt-hour-line';
        line.style.top = ((h - minHour) * HOUR_PX) + 'px';
        body.appendChild(line);
      }

      // Schedule blocks
      dayScheds.forEach(s => {
        if (!s.start_time || !s.end_time) return;
        const startH = parseInt(s.start_time.substring(0, 2), 10);
        const startM = parseInt(s.start_time.substring(3, 5), 10);
        const endH = parseInt(s.end_time.substring(0, 2), 10);
        const endM = parseInt(s.end_time.substring(3, 5), 10);

        const topPx = ((startH - minHour) + startM / 60) * HOUR_PX;
        const heightPx = ((endH - startH) + (endM - startM) / 60) * HOUR_PX;

        const block = document.createElement('div');
        block.className = 'tt-block tag-class-' + (s.class_id % 10);
        block.style.top = topPx + 'px';
        block.style.height = Math.max(heightPx, 20) + 'px';
        block.style.cursor = 'pointer';
        block.addEventListener('click', () => { location.href = window.__SEC + '/class/' + s.class_id; });

        const name = document.createElement('div');
        name.className = 'tt-block-name';
        name.textContent = s.class_name;
        block.appendChild(name);

        const time = document.createElement('div');
        time.className = 'tt-block-time';
        time.textContent = s.start_time.substring(0, 5) + '~' + s.end_time.substring(0, 5);
        block.appendChild(time);

        if (s.description && heightPx >= 50) {
          const desc = document.createElement('div');
          desc.className = 'tt-block-desc';
          desc.textContent = s.description;
          block.appendChild(desc);
        }

        body.appendChild(block);
      });

      col.appendChild(body);
      timetable.appendChild(col);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'week-timetable-wrapper';
    wrapper.appendChild(timetable);
    contentEl.appendChild(wrapper);
  }

  function renderScheduleList() {
    while (contentEl.firstChild) contentEl.removeChild(contentEl.firstChild);

    if (schedules.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-message';
      p.textContent = currentTab === 'day' ? '이 날의 일정이 없습니다.' : '이 주의 일정이 없습니다.';
      contentEl.appendChild(p);
      return;
    }

    const list = document.createElement('div');
    list.className = 'dash-schedule-list';

    let lastDate = '';
    schedules.forEach(s => {
      if (currentTab !== 'day' && s.schedule_date !== lastDate) {
        lastDate = s.schedule_date;
        const header = document.createElement('div');
        header.className = 'dash-date-header';
        const d = new Date(s.schedule_date + 'T00:00:00');
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        header.textContent = `${s.schedule_date} (${dayNames[d.getDay()]})`;
        list.appendChild(header);
      }

      const item = document.createElement('div');
      item.className = 'dash-schedule-item';

      const dot = document.createElement('div');
      dot.className = 'dash-schedule-dot dot-class-' + (s.class_id % 10);
      item.appendChild(dot);

      const info = document.createElement('div');
      info.className = 'dash-schedule-info';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'dash-schedule-title';
      titleDiv.textContent = s.class_name;
      info.appendChild(titleDiv);

      const meta = document.createElement('div');
      meta.className = 'dash-schedule-meta';
      let metaText = '';
      if (s.start_time || s.end_time) {
        metaText = formatTimeRange(s.start_time, s.end_time);
      }
      if (s.description) {
        metaText += (metaText ? ' | ' : '') + s.description;
      }
      if (metaText) meta.textContent = metaText;
      info.appendChild(meta);

      item.appendChild(info);

      if (currentTab === 'day') {
        const timeEl = document.createElement('div');
        timeEl.className = 'dash-schedule-date';
        timeEl.textContent = s.start_time ? s.start_time.substring(0, 5) : '';
        item.appendChild(timeEl);
      }

      item.style.cursor = 'pointer';
      item.addEventListener('click', () => { location.href = window.__SEC + '/class/' + s.class_id; });

      list.appendChild(item);
    });

    contentEl.appendChild(list);
  }

  function formatTimeRange(start, end) {
    if (!start && !end) return '';
    if (start && end) return start.substring(0, 5) + ' ~ ' + end.substring(0, 5);
    if (start) return start.substring(0, 5) + ' ~';
    return '~ ' + end.substring(0, 5);
  }

  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  loadAndRender();
}

// ======= Schedule List Page =======
function initScheduleListPage() {
  // Delete buttons
  document.querySelectorAll('.sp-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const title = btn.dataset.title || '이 시간표';
      if (!confirm(`"${title}"을(를) 정말 삭제하시겠습니까?`)) return;
      try {
        const res = await fetch(`${window.__SEC}/schedule-pages/${id}/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (data.success) location.reload();
        else alert(data.error || '삭제 실패');
      } catch (e) { alert('삭제 중 오류 발생'); }
    });
  });

  // Tab toggle (admin only)
  const tabBtns = document.querySelectorAll('.sp-tab-nav .sp-tab-btn');
  const tabContents = document.querySelectorAll('.sp-tab-content');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const content = document.querySelector(`.sp-tab-content[data-tab-content="${tab}"]`);
      if (content) content.classList.add('active');
    });
  });
}

// ======= Schedule Editor Page =======
function initScheduleEditorPage() {
  const el = document.getElementById('scheduleEditorPage');
  const pageId = el.dataset.pageId;
  const userRole = el.dataset.userRole;
  const isEdit = !!pageId;
  let dirty = false;
  const SWATCHES = ['#3498DB','#E74C3C','#27AE60','#F39C12','#9B59B6','#1ABC9C','#E67E22','#34495E','#e94560','#2ECC71'];

  // Bilingual editing language
  let editLang = 'ko';

  // Helper: get text value from a bilingual field
  function t(field) {
    if (typeof field === 'object' && field !== null) return field[editLang] || '';
    return field || '';
  }
  // Helper: ensure field is bilingual object
  function toBi(field) {
    if (typeof field === 'object' && field !== null && ('ko' in field || 'en' in field)) return field;
    return { ko: field || '', en: '' };
  }

  // State
  let state = {
    title: '', slug: '', status: 'draft',
    header_data: {
      programTitle: { ko: '', en: '' },
      subtitle: { ko: '', en: '' },
      description: { ko: '', en: '' },
      cards: [],
      highlights: [],
      classApplicationUrl: ''
    },
    schedule_data: {
      version: 3,
      subjects: [],
      sections: [],
      schedules: [{
        id: 's_' + Date.now(),
        title: { ko: '시간표', en: 'Schedule' },
        dateRange: { start: '', end: '' },
        days: ['월','화','수','목','금']
      }]
    },
    syllabus_data: { subjects: [] },
    theme_data: { heroBg: '#133327', accent: '#ffffff' }
  };

  // Generate unique IDs
  function genSubjectId() { return 'subj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5); }
  function genSectionId() { return 'sec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5); }

  // Migrate old data to v3 sections-based format
  function migrateData() {
    const hd = state.header_data;
    hd.programTitle = toBi(hd.programTitle);
    hd.subtitle = toBi(hd.subtitle);
    hd.description = toBi(hd.description);
    hd.cards = (hd.cards || []).map(c => ({
      title: toBi(c.title),
      desc: toBi(c.desc)
    }));
    hd.highlights = (hd.highlights || []).map(h => toBi(h));

    const sd = state.schedule_data;

    // Step 1: Normalize to multi-schedule with blocks (old v1 → v2 intermediate)
    if (!sd.schedules) {
      const oldDays = sd.days || ['월','화','수','목','금'];
      const oldBlocks = (sd.blocks || []).map(b => ({ ...b, subject: toBi(b.subject) }));
      sd.schedules = [{
        id: 's_' + Date.now(),
        title: { ko: '시간표', en: 'Schedule' },
        dateRange: { start: '', end: '' },
        days: oldDays,
        blocks: oldBlocks
      }];
      delete sd.days;
      delete sd.blocks;
    } else {
      sd.schedules.forEach(sched => {
        sched.title = toBi(sched.title);
        if (sched.blocks) {
          sched.blocks = sched.blocks.map(b => ({ ...b, subject: toBi(b.subject) }));
        }
        if (!sched.dateRange) sched.dateRange = { start: '', end: '' };
      });
    }

    if (!sd.subjects) sd.subjects = [];

    // Step 2: If still v1/v2 with blocks, extract subjects first
    const hasBlocks = sd.schedules.some(s => s.blocks && s.blocks.length > 0);
    if (hasBlocks && (!sd.version || sd.version < 2)) {
      function parseBlockName(name) {
        let base = (name || '').trim();
        let section = '';
        const parenMatch = base.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
        if (parenMatch) { base = parenMatch[1].trim(); section = parenMatch[2].trim(); }
        if (!section) {
          const letterMatch = base.match(/^(.+?)\s+([A-Z])\s*$/);
          if (letterMatch) { base = letterMatch[1].trim(); section = letterMatch[2]; }
        }
        const thMatch = base.match(/^(.+?)\s*(이론수업|Theory)\s*$/i);
        if (thMatch) { base = thMatch[1].trim(); section = section ? thMatch[2] + ' ' + section : ''; }
        return { baseName: base, section };
      }
      const baseMap = {};
      sd.schedules.forEach(sched => {
        (sched.blocks || []).forEach(b => {
          if (b.subjectId) return;
          const nameKo = (typeof b.subject === 'object' ? b.subject.ko : b.subject) || '';
          const nameEn = (typeof b.subject === 'object' ? b.subject.en : '') || '';
          const parsedKo = parseBlockName(nameKo);
          const parsedEn = parseBlockName(nameEn);
          const baseKey = parsedKo.baseName || parsedEn.baseName;
          if (!baseKey) return;
          if (!baseMap[baseKey]) {
            const id = genSubjectId();
            baseMap[baseKey] = { id, name: { ko: parsedKo.baseName, en: parsedEn.baseName || parsedKo.baseName } };
            sd.subjects.push(baseMap[baseKey]);
          }
          b.subjectId = baseMap[baseKey].id;
          b.sectionLabel = parsedKo.section || parsedEn.section || '';
        });
      });
    }

    // Step 3: Convert blocks → sections (v2 → v3)
    if (hasBlocks && (!sd.version || sd.version < 3)) {
      if (!sd.sections) sd.sections = [];
      // Group blocks by (subjectId + color + sectionLabel) within each schedule → one section
      const sectionMap = {}; // key → section
      sd.schedules.forEach(sched => {
        const schedId = sched.id;
        (sched.blocks || []).forEach(b => {
          const key = (b.subjectId || '') + '|' + (b.color || '#3498DB') + '|' + (b.sectionLabel || '') + '|' + (typeof b.subject === 'object' ? (b.subject.ko || '') : (b.subject || ''));
          if (!sectionMap[key]) {
            const secId = genSectionId();
            sectionMap[key] = {
              id: secId,
              subjectId: b.subjectId || '',
              name: typeof b.subject === 'object' ? { ko: b.subject.ko || '', en: b.subject.en || '' } : toBi(b.subject),
              color: b.color || '#3498DB',
              classId: null,
              slots: []
            };
          }
          sectionMap[key].slots.push({
            scheduleId: schedId,
            day: b.day,
            start: b.start,
            end: b.end
          });
        });
        delete sched.blocks;
      });
      sd.sections = Object.values(sectionMap);
      sd.version = 3;
    }

    // Ensure sections array exists
    if (!sd.sections) sd.sections = [];
    // Clean blocks from schedules (defensive)
    sd.schedules.forEach(sched => { delete sched.blocks; });
    sd.version = 3;

    // Syllabus subjects - migrate to bilingual + link to subject registry
    const syllSubjects = state.syllabus_data.subjects || [];
    state.syllabus_data.subjects = syllSubjects.map(s => ({
      subjectId: s.subjectId || '',
      name: toBi(s.name),
      description: toBi(s.description),
      promo: toBi(s.promo),
      highlights: (s.highlights || []).map(h => toBi(h)),
      placement: toBi(s.placement),
      weeklyPlan: (s.weeklyPlan || []).map(wp => ({
        week: wp.week,
        topic: toBi(wp.topic)
      }))
    }));

    // Link unlinked syllabus subjects to registry by name matching
    const regSubjects = sd.subjects || [];
    state.syllabus_data.subjects.forEach(syllSubj => {
      if (syllSubj.subjectId) return;
      const nameKo = syllSubj.name.ko || '';
      const nameEn = syllSubj.name.en || '';
      const match = regSubjects.find(rs =>
        (nameKo && rs.name.ko === nameKo) || (nameEn && rs.name.en === nameEn)
      );
      if (match) syllSubj.subjectId = match.id;
    });

    // Remove duplicate syllabus subjects
    const seenIds = new Set();
    state.syllabus_data.subjects = state.syllabus_data.subjects.filter(s => {
      if (!s.subjectId) return true;
      if (seenIds.has(s.subjectId)) return false;
      seenIds.add(s.subjectId);
      return true;
    });

    // Sort: linked subjects first (in registry order), unlinked last
    const regOrder = {};
    regSubjects.forEach((rs, i) => { regOrder[rs.id] = i; });
    state.syllabus_data.subjects.sort((a, b) => {
      const oa = a.subjectId ? (regOrder[a.subjectId] ?? 999) : 1000;
      const ob = b.subjectId ? (regOrder[b.subjectId] ?? 999) : 1000;
      return oa - ob;
    });

    if (!state.syllabus_data.version) state.syllabus_data.version = 2;
  }

  // Calculate session count for a subject (for syllabus weeklyPlan length)
  // Based on sections[].slots[] — count max slots across parallel sections for same subject
  function calculateSessionCount(subjectId) {
    const sd = state.schedule_data;
    const sections = (sd.sections || []).filter(s => s.subjectId === subjectId);
    if (!sections.length) return 0;
    // Each section is a parallel offering; take max slot count
    let maxSlots = 0;
    sections.forEach(sec => {
      const count = (sec.slots || []).length;
      if (count > maxSlots) maxSlots = count;
    });
    return maxSlots;
  }

  // Get subject registry entry by id
  function getSubject(subjectId) {
    return (state.schedule_data.subjects || []).find(s => s.id === subjectId);
  }


  // Section toggles
  document.querySelectorAll('.se-section-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const body = document.getElementById(btn.dataset.target);
      if (body) body.classList.toggle('open');
    });
  });

  // Language toggle
  document.querySelectorAll('.se-lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.lang === editLang) return;
      collectState();
      editLang = btn.dataset.lang;
      document.querySelectorAll('.se-lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      fillDOMFromState();
      renderAll();
    });
  });

  // Auto slug from title
  const titleInput = document.getElementById('seTitle');
  const slugInput = document.getElementById('seSlug');
  const slugPreview = document.getElementById('seSlugPreview');
  let slugManual = false;

  slugInput.addEventListener('input', () => { slugManual = true; updateSlugPreview(); markDirty(); });
  titleInput.addEventListener('input', () => {
    if (!slugManual) {
      slugInput.value = toSlug(titleInput.value);
    }
    updateSlugPreview();
    markDirty();
  });

  function toSlug(s) {
    return s.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
  }
  function updateSlugPreview() {
    slugPreview.textContent = slugInput.value || '-';
  }

  function markDirty() { dirty = true; }
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // Collect state from DOM (saves current language's inputs into state)
  function collectState() {
    state.title = titleInput.value;
    state.slug = slugInput.value;
    state.status = document.getElementById('seStatus').value;

    // Header bilingual fields - save current language
    state.header_data.programTitle[editLang] = document.getElementById('seHeroProgramTitle').value;
    state.header_data.subtitle[editLang] = document.getElementById('seHeroSubtitle').value;
    state.header_data.description[editLang] = document.getElementById('seHeroDesc').value;

    // Class application URL
    const classAppUrlEl = document.getElementById('seClassAppUrl');
    if (classAppUrlEl) state.header_data.classApplicationUrl = classAppUrlEl.value.trim();

    // Cards
    document.querySelectorAll('#seHeroCards .se-list-item').forEach((item, i) => {
      if (state.header_data.cards[i]) {
        state.header_data.cards[i].title[editLang] = item.querySelector('.se-card-title')?.value || '';
        state.header_data.cards[i].desc[editLang] = item.querySelector('.se-card-desc')?.value || '';
      }
    });

    // Highlights
    document.querySelectorAll('#seHeroHighlights .se-list-item input').forEach((inp, i) => {
      if (state.header_data.highlights[i]) {
        state.header_data.highlights[i][editLang] = inp.value;
      }
    });

    // Multi-schedule states
    collectAllScheduleStates();

    // Theme
    state.theme_data.heroBg = document.getElementById('seThemeHeroBg').value;
    state.theme_data.accent = document.getElementById('seThemeAccent').value;

    // Syllabus from DOM
    collectSyllabusState();
  }

  function collectSyllabusState() {
    const panel = document.querySelector('.se-subj-panel');
    if (!panel) return;
    const idx = parseInt(panel.dataset.idx);
    if (isNaN(idx) || idx >= state.syllabus_data.subjects.length) return;
    const subj = state.syllabus_data.subjects[idx];

    // Only update name if not linked to subject registry
    if (!subj.subjectId) {
      subj.name[editLang] = panel.querySelector('.se-subj-name')?.value || '';
    }
    subj.description[editLang] = panel.querySelector('.se-subj-description')?.value || '';
    subj.promo[editLang] = panel.querySelector('.se-subj-promo')?.value || '';
    subj.placement[editLang] = panel.querySelector('.se-subj-placement')?.value || '';

    panel.querySelectorAll('.se-subj-hl input').forEach((inp, i) => {
      if (subj.highlights[i]) {
        subj.highlights[i][editLang] = inp.value;
      }
    });
    panel.querySelectorAll('.se-subj-wp').forEach((wp, i) => {
      if (subj.weeklyPlan[i]) {
        subj.weeklyPlan[i].week = wp.querySelector('.se-wp-week')?.value || '';
        subj.weeklyPlan[i].topic[editLang] = wp.querySelector('.se-wp-topic')?.value || '';
      }
    });
  }

  // Fill DOM from state (for current editLang)
  function fillDOMFromState() {
    document.getElementById('seHeroProgramTitle').value = t(state.header_data.programTitle);
    document.getElementById('seHeroSubtitle').value = t(state.header_data.subtitle);
    document.getElementById('seHeroDesc').value = t(state.header_data.description);

    const classAppUrlEl = document.getElementById('seClassAppUrl');
    if (classAppUrlEl) classAppUrlEl.value = state.header_data.classApplicationUrl || '';
  }

  // Render helpers
  function renderCards() {
    const wrap = document.getElementById('seHeroCards');
    wrap.innerHTML = '';
    (state.header_data.cards || []).forEach((card, i) => {
      const div = document.createElement('div');
      div.className = 'se-list-item';
      div.innerHTML = `<input class="se-card-title" placeholder="제목" value="${esc(t(card.title))}"><input class="se-card-desc" placeholder="설명" value="${esc(t(card.desc))}"><button class="se-list-remove" data-idx="${i}">&times;</button>`;
      div.querySelectorAll('input').forEach(inp => inp.addEventListener('input', markDirty));
      div.querySelector('.se-list-remove').addEventListener('click', () => {
        collectState();
        state.header_data.cards.splice(i, 1);
        renderCards();
        markDirty();
      });
      wrap.appendChild(div);
    });
  }

  function renderHighlights() {
    const wrap = document.getElementById('seHeroHighlights');
    wrap.innerHTML = '';
    (state.header_data.highlights || []).forEach((h, i) => {
      const div = document.createElement('div');
      div.className = 'se-list-item';
      div.innerHTML = `<input placeholder="하이라이트" value="${esc(t(h))}"><button class="se-list-remove" data-idx="${i}">&times;</button>`;
      div.querySelector('input').addEventListener('input', markDirty);
      div.querySelector('.se-list-remove').addEventListener('click', () => {
        collectState();
        state.header_data.highlights.splice(i, 1);
        renderHighlights();
        markDirty();
      });
      wrap.appendChild(div);
    });
  }

  // ===== Multi-schedule rendering =====
  let activeScheduleIdx = 0;

  // Get sections with slots for a given schedule
  function getSlotsForSchedule(schedId) {
    const sections = state.schedule_data.sections || [];
    const result = [];
    sections.forEach(sec => {
      (sec.slots || []).forEach(slot => {
        if (slot.scheduleId === schedId) {
          result.push({ ...slot, sectionId: sec.id, color: sec.color, name: sec.name });
        }
      });
    });
    return result;
  }

  function renderScheduleList() {
    const container = document.getElementById('seScheduleList');
    const schedules = state.schedule_data.schedules || [];
    if (!schedules.length) {
      container.innerHTML = '<p class="empty-message">시간표를 추가해주세요.</p>';
      return;
    }

    let html = '';
    schedules.forEach((sched, si) => {
      const allDays = ['월','화','수','목','금','토','일'];
      const checkedDays = sched.days || [];

      html += `<div class="se-schedule-card" data-sched-idx="${si}">
        <div class="se-schedule-card-header">
          <div class="se-sched-title">
            <input type="text" class="se-sched-title-input" data-si="${si}" value="${esc(t(sched.title))}" placeholder="시간표 제목">
          </div>
          <div class="se-sched-date-range">
            <input type="date" class="se-sched-date-start" data-si="${si}" value="${esc(sched.dateRange?.start || '')}">
            <span>~</span>
            <input type="date" class="se-sched-date-end" data-si="${si}" value="${esc(sched.dateRange?.end || '')}">
          </div>
          <button class="btn btn-sm btn-outline se-generate-sessions" data-si="${si}" data-schedule-id="${sched.id}" title="수업 일정 자동 생성" style="font-size:0.75rem;padding:0.15rem 0.5rem;margin-left:0.3rem;">일정 생성</button>
          ${schedules.length > 1 ? `<button class="se-sched-remove" data-si="${si}" title="삭제">&times;</button>` : ''}
        </div>
        <div class="se-days-check" data-si="${si}">`;
      allDays.forEach(d => {
        html += `<label><input type="checkbox" value="${d}" data-si="${si}" ${checkedDays.includes(d) ? 'checked' : ''}> ${d}</label>`;
      });
      html += `</div>`;

      // Section list for this schedule
      html += renderSectionListHTML(si);
      // Read-only grid from sections→slots
      html += renderSlotGridHTML(si);
      html += `</div>`;
    });
    container.innerHTML = html;
    wireScheduleCardEvents();
  }

  // Render section cards for a schedule
  function renderSectionListHTML(si) {
    const sched = state.schedule_data.schedules[si];
    const sections = state.schedule_data.sections || [];
    // Filter sections that have slots in this schedule
    const relevantSections = sections.filter(sec =>
      (sec.slots || []).some(slot => slot.scheduleId === sched.id)
    );

    let html = '<div class="se-section-list">';
    if (relevantSections.length === 0) {
      html += '<p class="empty-message" style="padding:0.25rem 0;font-size:0.82rem;">분반이 없습니다.</p>';
    } else {
      relevantSections.forEach(sec => {
        const slotCount = sec.slots.filter(s => s.scheduleId === sched.id).length;
        const slotSummary = sec.slots.filter(s => s.scheduleId === sched.id)
          .map(s => `${s.day} ${s.start}-${s.end}`).join(', ');
        html += `<div class="se-section-card" data-section-id="${sec.id}" data-si="${si}">
          <span class="se-section-dot" style="background:${sec.color};"></span>
          <span class="se-section-card-name">${esc(t(sec.name))}</span>
          <span class="se-section-card-slots">${esc(slotSummary)}</span>
        </div>`;
      });
    }
    html += `<button class="btn btn-sm btn-outline se-add-section" data-si="${si}" style="margin-top:0.4rem;">+ 분반 추가</button>`;
    html += '</div>';
    return html;
  }

  // Read-only timetable grid from sections→slots
  function renderSlotGridHTML(si) {
    const sched = state.schedule_data.schedules[si];
    const days = sched.days || [];
    if (!days.length) return '<p class="empty-message" style="padding:0.5rem;">요일을 먼저 선택해주세요.</p>';

    const sections = state.schedule_data.sections || [];
    // Collect all slot-blocks for this schedule
    const slotBlocks = [];
    sections.forEach(sec => {
      (sec.slots || []).forEach(slot => {
        if (slot.scheduleId === sched.id) {
          slotBlocks.push({ ...slot, sectionId: sec.id, color: sec.color, name: sec.name, subjectId: sec.subjectId });
        }
      });
    });

    if (!slotBlocks.length) return '';

    let html = '<div class="se-block-grid"><div class="se-block-columns">';
    days.forEach(day => {
      const daySlots = slotBlocks
        .filter(b => b.day === day)
        .sort((a, b) => a.start.localeCompare(b.start));

      html += `<div class="se-block-col"><div class="se-block-col-header">${day}</div><div class="se-block-col-body">`;
      daySlots.forEach(b => {
        html += `<div class="se-block-card" data-section-id="${b.sectionId}" data-si="${si}" style="background:${b.color}15;border-left:3px solid ${b.color};">
          <div class="se-block-card-subj" style="color:${b.color};">${esc(t(b.name))}</div>
          <div class="se-block-card-time">${esc(b.start)} - ${esc(b.end)}</div>
        </div>`;
      });
      html += `</div></div>`;
    });
    html += '</div></div>';
    return html;
  }

  function wireScheduleCardEvents() {
    // Days checkbox change
    document.querySelectorAll('.se-days-check input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        collectAllScheduleStates();
        renderScheduleList();
        markDirty();
      });
    });

    // Title / date inputs
    document.querySelectorAll('.se-sched-title-input').forEach(inp => {
      inp.addEventListener('input', markDirty);
    });
    document.querySelectorAll('.se-sched-date-start, .se-sched-date-end').forEach(inp => {
      inp.addEventListener('change', markDirty);
    });

    // Remove schedule
    document.querySelectorAll('.se-sched-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = parseInt(btn.dataset.si);
        if (!confirm('이 시간표를 삭제하시겠습니까?')) return;
        collectAllScheduleStates();
        const schedId = state.schedule_data.schedules[si].id;
        // Remove slots that reference this schedule from all sections
        (state.schedule_data.sections || []).forEach(sec => {
          sec.slots = (sec.slots || []).filter(s => s.scheduleId !== schedId);
        });
        // Remove sections with no slots left
        state.schedule_data.sections = (state.schedule_data.sections || []).filter(s => s.slots.length > 0);
        state.schedule_data.schedules.splice(si, 1);
        renderScheduleList();
        syncSyllabus();
        markDirty();
      });
    });

    // Block cards click → open section popup
    document.querySelectorAll('.se-block-card[data-section-id]').forEach(card => {
      card.addEventListener('click', () => {
        const si = parseInt(card.dataset.si);
        const sectionId = card.dataset.sectionId;
        openSectionPopup(sectionId, si);
      });
    });

    // Section cards click → open section popup
    document.querySelectorAll('.se-section-card').forEach(card => {
      card.addEventListener('click', () => {
        const si = parseInt(card.dataset.si);
        const sectionId = card.dataset.sectionId;
        openSectionPopup(sectionId, si);
      });
    });

    // Generate sessions button
    document.querySelectorAll('.se-generate-sessions').forEach(btn => {
      btn.addEventListener('click', async () => {
        const si = parseInt(btn.dataset.si);
        const schedId = btn.dataset.scheduleId;

        // Collect latest state from inputs
        collectAllScheduleStates();

        const sched = state.schedule_data.schedules[si];
        if (!sched) return;

        if (!sched.dateRange?.start || !sched.dateRange?.end) {
          return alert('날짜 범위를 먼저 입력해주세요.');
        }

        const sections = state.schedule_data.sections || [];
        const relevantSections = sections.filter(sec =>
          sec.classId && (sec.slots || []).some(slot => slot.scheduleId === schedId)
        );

        if (relevantSections.length === 0) {
          return alert('수업이 연결된 분반이 없습니다.\n분반 편집에서 수업을 연결해주세요.');
        }

        // Calculate estimated count for confirm
        const dayMap = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
        let totalEstimate = 0;
        const details = [];
        relevantSections.forEach(sec => {
          const slots = (sec.slots || []).filter(s => s.scheduleId === schedId);
          let count = 0;
          slots.forEach(slot => {
            const dayNum = dayMap[slot.day];
            if (dayNum === undefined) return;
            const cur = new Date(sched.dateRange.start + 'T00:00:00');
            const end = new Date(sched.dateRange.end + 'T00:00:00');
            while (cur <= end) {
              if (cur.getDay() === dayNum) count++;
              cur.setDate(cur.getDate() + 1);
            }
          });
          totalEstimate += count;
          details.push(`• ${t(sec.name)}: ${slots.map(s => s.day + ' ' + s.start + '-' + s.end).join(', ')} → ${count}개`);
        });

        const msg = `[${t(sched.title)}] 수업 일정 생성\n` +
          `기간: ${sched.dateRange.start} ~ ${sched.dateRange.end}\n\n` +
          details.join('\n') +
          `\n\n총 ${totalEstimate}개 일정을 생성합니다.\n(기존 중복은 자동 건너뜀)\n\n진행하시겠습니까?`;

        if (!confirm(msg)) return;

        // Save current state first
        try {
          await doSave();
        } catch (e) {
          // Continue even if save fails
        }

        btn.disabled = true;
        btn.textContent = '생성 중...';

        try {
          const res = await fetch(`${window.__SEC}/schedule-pages/${pageId}/generate-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scheduleId: schedId })
          });
          const data = await res.json();

          if (data.success) {
            const summary = (data.results || []).map(r =>
              `${r.className}: ${r.created}개 생성, ${r.skipped}개 건너뜀`
            ).join('\n');
            alert('일정 생성 완료!\n\n' + (summary || data.message || ''));
          } else {
            alert('오류: ' + (data.error || '알 수 없는 오류'));
          }
        } catch (err) {
          alert('요청 실패: ' + err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = '일정 생성';
        }
      });
    });

    // Add section buttons
    document.querySelectorAll('.se-add-section').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = parseInt(btn.dataset.si);
        openSectionPopup(null, si);
      });
    });
  }

  function collectScheduleCardDays(si) {
    const sched = state.schedule_data.schedules[si];
    if (!sched) return;
    const days = [];
    document.querySelectorAll(`.se-days-check[data-si="${si}"] input:checked`).forEach(cb => {
      days.push(cb.value);
    });
    sched.days = days;
  }

  function collectAllScheduleStates() {
    const schedules = state.schedule_data.schedules || [];
    schedules.forEach((sched, si) => {
      const titleInp = document.querySelector(`.se-sched-title-input[data-si="${si}"]`);
      if (titleInp) sched.title[editLang] = titleInp.value;
      const startInp = document.querySelector(`.se-sched-date-start[data-si="${si}"]`);
      const endInp = document.querySelector(`.se-sched-date-end[data-si="${si}"]`);
      if (!sched.dateRange) sched.dateRange = { start: '', end: '' };
      if (startInp) sched.dateRange.start = startInp.value;
      if (endInp) sched.dateRange.end = endInp.value;
      collectScheduleCardDays(si);
    });
  }

  // Add schedule button
  document.getElementById('seAddSchedule').addEventListener('click', () => {
    collectAllScheduleStates();
    const schedules = state.schedule_data.schedules;
    if (schedules.length >= 12) { alert('시간표는 최대 12개까지 추가할 수 있습니다.'); return; }
    schedules.push({
      id: 's_' + Date.now(),
      title: { ko: `${schedules.length + 1}주차`, en: `Week ${schedules.length + 1}` },
      dateRange: { start: '', end: '' },
      days: ['월','화','수','목','금']
    });
    renderScheduleList();
    markDirty();
  });

  // ===== Section popup (분반 편집) =====
  let editingSectionId = null;
  const popup = document.getElementById('seBlockPopup');

  function openSectionPopup(sectionId, schedIdx) {
    activeScheduleIdx = schedIdx;
    editingSectionId = sectionId;
    const sched = state.schedule_data.schedules[schedIdx];
    const sections = state.schedule_data.sections || [];
    const sec = sectionId ? sections.find(s => s.id === sectionId) : null;

    // Build popup HTML dynamically
    const subjects = state.schedule_data.subjects || [];
    const allDays = ['월','화','수','목','금','토','일'];

    let subjectOptions = '<option value="">-- 과목 선택 (선택) --</option>';
    subjects.forEach(s => {
      const sel = sec && sec.subjectId === s.id ? 'selected' : '';
      subjectOptions += `<option value="${s.id}" ${sel}>${esc(t(s.name)) || '(이름 없음)'}</option>`;
    });

    const usedClassIds = new Set(
      sections.filter(s => s.classId && (!sec || s.id !== sec.id)).map(s => String(s.classId))
    );
    let classOptions = '<option value="">-- 수업 연결 안 함 --</option>';
    (window.__classesList || []).forEach(c => {
      if (usedClassIds.has(String(c.id))) return;
      const sel = sec && sec.classId == c.id ? 'selected' : '';
      classOptions += `<option value="${c.id}" ${sel}>${esc(c.name)}</option>`;
    });

    const slotsForSched = sec ? (sec.slots || []).filter(s => s.scheduleId === sched.id) : [];
    let slotsHTML = '';
    if (sec) {
      slotsForSched.forEach((slot, i) => {
        let dayOpts = allDays.map(d => `<option value="${d}" ${slot.day === d ? 'selected' : ''}>${d}</option>`).join('');
        slotsHTML += `<div class="se-slot-row" data-slot-idx="${i}">
          <select class="se-slot-day">${dayOpts}</select>
          <input type="time" class="se-slot-start" value="${slot.start}">
          <span>~</span>
          <input type="time" class="se-slot-end" value="${slot.end}">
          <button class="se-slot-remove" data-slot-idx="${i}">&times;</button>
        </div>`;
      });
    }

    const swatchesHTML = SWATCHES.map(c => {
      const active = (sec ? sec.color : SWATCHES[0]) === c ? 'active' : '';
      return `<span class="se-swatch ${active}" data-color="${c}" style="background:${c};" tabindex="0"></span>`;
    }).join('');

    const inner = popup.querySelector('.se-cell-popup-inner');
    inner.innerHTML = `
      <div class="se-popup-title">${sec ? '분반 편집' : '분반 추가'}</div>
      <div class="form-group" style="margin-bottom:0.5rem;">
        <label>분반명</label>
        <input type="text" id="seSecName" placeholder="AMC 10 이론수업 Zoom" value="${sec ? esc(t(sec.name)) : ''}">
      </div>
      <div class="form-row" style="margin-bottom:0.5rem;">
        <div class="form-group" style="flex:1;">
          <label>실라버스 연결 <small style="color:var(--gray-500);font-weight:400;">(선택)</small></label>
          <select id="seSecSubject" class="se-block-subject-select">${subjectOptions}</select>
        </div>
        <div class="form-group" style="flex:1;">
          <label>수업 연결 <small style="color:var(--gray-500);font-weight:400;">(선택)</small></label>
          <select id="seSecClass" class="se-block-subject-select">${classOptions}</select>
        </div>
      </div>
      <div style="margin-bottom:0.75rem;">
        <label style="font-size:0.85rem;font-weight:600;color:var(--gray-700);display:block;margin-bottom:0.35rem;">색상</label>
        <div class="se-color-swatches" id="seSecColors">${swatchesHTML}</div>
      </div>
      <div style="margin-bottom:0.75rem;">
        <label style="font-size:0.85rem;font-weight:600;color:var(--gray-700);display:block;margin-bottom:0.35rem;">시간 슬롯</label>
        <div id="seSecSlots">${slotsHTML}</div>
        <button class="btn btn-sm btn-outline" id="seSecAddSlot" style="margin-top:0.35rem;">+ 시간 추가</button>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-sm btn-primary" id="seSecOk">확인</button>
        ${sec ? '<button class="btn btn-sm btn-danger" id="seSecDelete">삭제</button>' : ''}
        <button class="btn btn-sm btn-outline" id="seSecCancel">취소</button>
      </div>`;

    // Wire popup events
    const colorsWrap = document.getElementById('seSecColors');
    let selectedColor = sec ? sec.color : SWATCHES[0];
    colorsWrap.querySelectorAll('.se-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        colorsWrap.querySelectorAll('.se-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        selectedColor = sw.dataset.color;
      });
    });

    // Add slot
    document.getElementById('seSecAddSlot').addEventListener('click', () => {
      const slotsContainer = document.getElementById('seSecSlots');
      const idx = slotsContainer.children.length;
      let dayOpts = allDays.map(d => `<option value="${d}">${d}</option>`).join('');
      const row = document.createElement('div');
      row.className = 'se-slot-row';
      row.dataset.slotIdx = idx;
      row.innerHTML = `<select class="se-slot-day">${dayOpts}</select>
        <input type="time" class="se-slot-start" value="09:00">
        <span>~</span>
        <input type="time" class="se-slot-end" value="12:00">
        <button class="se-slot-remove" data-slot-idx="${idx}">&times;</button>`;
      slotsContainer.appendChild(row);
      wireSlotRemove();
    });

    function wireSlotRemove() {
      document.querySelectorAll('#seSecSlots .se-slot-remove').forEach(btn => {
        btn.onclick = () => btn.closest('.se-slot-row').remove();
      });
    }
    wireSlotRemove();

    // OK
    document.getElementById('seSecOk').addEventListener('click', () => {
      const nameVal = document.getElementById('seSecName').value.trim();
      if (!nameVal) { document.getElementById('seSecName').focus(); return; }

      const subjectId = document.getElementById('seSecSubject').value || '';
      const classId = document.getElementById('seSecClass').value || null;

      // Collect slots
      const slots = [];
      document.querySelectorAll('#seSecSlots .se-slot-row').forEach(row => {
        slots.push({
          scheduleId: sched.id,
          day: row.querySelector('.se-slot-day').value,
          start: row.querySelector('.se-slot-start').value,
          end: row.querySelector('.se-slot-end').value
        });
      });

      if (!state.schedule_data.sections) state.schedule_data.sections = [];

      if (sec) {
        // Update existing section
        sec.name[editLang] = nameVal;
        sec.subjectId = subjectId;
        sec.color = selectedColor;
        sec.classId = classId;
        // Replace slots for this schedule only; keep slots for other schedules
        sec.slots = (sec.slots || []).filter(s => s.scheduleId !== sched.id).concat(slots);
      } else {
        // Create new section
        const nameBi = { ko: '', en: '' };
        nameBi[editLang] = nameVal;
        state.schedule_data.sections.push({
          id: genSectionId(),
          subjectId,
          name: nameBi,
          color: selectedColor,
          classId,
          slots
        });
      }
      popup.style.display = 'none';
      collectAllScheduleStates();
      renderScheduleList();
      syncSyllabus();
      markDirty();
    });

    // Delete
    const delBtn = document.getElementById('seSecDelete');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        if (!confirm('이 분반을 삭제하시겠습니까?')) return;
        state.schedule_data.sections = (state.schedule_data.sections || []).filter(s => s.id !== sectionId);
        popup.style.display = 'none';
        collectAllScheduleStates();
        renderScheduleList();
        syncSyllabus();
        markDirty();
      });
    }

    // Cancel
    document.getElementById('seSecCancel').addEventListener('click', () => { popup.style.display = 'none'; });

    popup.style.display = 'flex';
    document.getElementById('seSecName').focus();
  }

  // Syllabus
  let activeSyllabusIdx = 0;

  function renderSyllabusTabs() {
    const bar = document.getElementById('seSyllabusTabBar');
    bar.innerHTML = '';
    (state.syllabus_data.subjects || []).forEach((subj, i) => {
      const btn = document.createElement('button');
      btn.className = 'se-syllabus-tab' + (i === activeSyllabusIdx ? ' active' : '');
      btn.textContent = t(subj.name) || `과목 ${i + 1}`;
      btn.addEventListener('click', () => { collectSyllabusState(); activeSyllabusIdx = i; renderSyllabusTabs(); renderSyllabusPanel(); });
      bar.appendChild(btn);
    });
  }

  function renderSyllabusPanel() {
    const panel = document.getElementById('seSyllabusPanel');
    const subjs = state.syllabus_data.subjects || [];
    if (!subjs.length || activeSyllabusIdx >= subjs.length) { panel.innerHTML = '<p class="empty-message">과목을 추가해주세요.</p>'; return; }
    const subj = subjs[activeSyllabusIdx];

    const isLinked = !!subj.subjectId;
    const nameReadonly = isLinked ? 'readonly style="background:var(--gray-100);color:var(--gray-500);"' : '';
    const sessionCount = isLinked ? calculateSessionCount(subj.subjectId) : 0;

    let html = `<div class="se-subj-panel" data-idx="${activeSyllabusIdx}">
      <div class="form-group"><label>과목명${isLinked ? ' <small style="color:var(--gray-500);font-weight:400;">(과목 관리에서 변경)</small>' : ''}</label><input class="se-subj-name" value="${esc(t(subj.name))}" ${nameReadonly}></div>
      ${isLinked && sessionCount > 0 ? `<div style="font-size:0.82rem;color:var(--gray-500);">시간표 슬롯 기준 총 ${sessionCount}회차</div>` : ''}
      <div class="form-group"><label>설명</label><input class="se-subj-description" value="${esc(t(subj.description))}"></div>
      <div class="form-group"><label>홍보 문구</label><textarea class="se-subj-promo" rows="2">${esc(t(subj.promo))}</textarea></div>

      <div class="se-list-section">
        <label>하이라이트</label>
        <div class="se-subj-highlights">`;
    (subj.highlights || []).forEach((h, hi) => {
      html += `<div class="se-list-item se-subj-hl"><input value="${esc(t(h))}" placeholder="토픽"><button class="se-list-remove" data-hl="${hi}">&times;</button></div>`;
    });
    html += `</div><button class="btn btn-sm btn-outline se-add-hl">+ 하이라이트</button></div>

      <div class="form-group"><label>배치 기준 (Placement)</label><input class="se-subj-placement" value="${esc(t(subj.placement))}"></div>

      <div class="se-list-section">
        <label>회차별 진도</label>
        <div class="se-subj-weeks">`;
    (subj.weeklyPlan || []).forEach((wp, wi) => {
      html += `<div class="se-list-item se-subj-wp"><input class="se-wp-week" value="${esc(wp.week)}" placeholder="1회차" style="width:120px;"><input class="se-wp-topic" value="${esc(t(wp.topic))}" placeholder="주제"><button class="se-list-remove" data-wp="${wi}">&times;</button></div>`;
    });
    html += `</div><button class="btn btn-sm btn-outline se-add-wp">+ 회차 추가</button></div>

      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
        <button class="btn btn-sm btn-outline se-move-subj-left" ${activeSyllabusIdx === 0 ? 'disabled' : ''}>&larr; 앞으로</button>
        <button class="btn btn-sm btn-outline se-move-subj-right" ${activeSyllabusIdx >= subjs.length - 1 ? 'disabled' : ''}>뒤로 &rarr;</button>
        <button class="btn btn-sm btn-danger se-remove-subj" style="margin-left:auto;">이 과목 삭제</button>
      </div>
    </div>`;

    panel.innerHTML = html;

    // Wire up events
    panel.querySelectorAll('input, textarea').forEach(inp => inp.addEventListener('input', markDirty));
    panel.querySelector('.se-subj-name')?.addEventListener('input', () => { collectSyllabusState(); renderSyllabusTabs(); });

    panel.querySelector('.se-add-hl')?.addEventListener('click', () => {
      collectSyllabusState();
      state.syllabus_data.subjects[activeSyllabusIdx].highlights.push({ ko: '', en: '' });
      renderSyllabusPanel();
      markDirty();
    });

    panel.querySelectorAll('.se-subj-hl .se-list-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        collectSyllabusState();
        state.syllabus_data.subjects[activeSyllabusIdx].highlights.splice(parseInt(btn.dataset.hl), 1);
        renderSyllabusPanel();
        markDirty();
      });
    });

    panel.querySelector('.se-add-wp')?.addEventListener('click', () => {
      collectSyllabusState();
      const wp = state.syllabus_data.subjects[activeSyllabusIdx].weeklyPlan;
      const nextNum = wp.length + 1;
      wp.push({ week: nextNum + '회차', topic: { ko: '', en: '' } });
      renderSyllabusPanel();
      markDirty();
    });

    panel.querySelectorAll('.se-subj-wp .se-list-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        collectSyllabusState();
        state.syllabus_data.subjects[activeSyllabusIdx].weeklyPlan.splice(parseInt(btn.dataset.wp), 1);
        renderSyllabusPanel();
        markDirty();
      });
    });

    panel.querySelector('.se-remove-subj')?.addEventListener('click', () => {
      if (!confirm('이 과목을 삭제하시겠습니까?')) return;
      collectSyllabusState();
      state.syllabus_data.subjects.splice(activeSyllabusIdx, 1);
      activeSyllabusIdx = Math.max(0, activeSyllabusIdx - 1);
      renderSyllabusTabs();
      renderSyllabusPanel();
      markDirty();
    });

    panel.querySelector('.se-move-subj-left')?.addEventListener('click', () => {
      if (activeSyllabusIdx <= 0) return;
      collectSyllabusState();
      const subjs = state.syllabus_data.subjects;
      [subjs[activeSyllabusIdx - 1], subjs[activeSyllabusIdx]] = [subjs[activeSyllabusIdx], subjs[activeSyllabusIdx - 1]];
      activeSyllabusIdx--;
      renderSyllabusTabs();
      renderSyllabusPanel();
      markDirty();
    });

    panel.querySelector('.se-move-subj-right')?.addEventListener('click', () => {
      const subjs = state.syllabus_data.subjects;
      if (activeSyllabusIdx >= subjs.length - 1) return;
      collectSyllabusState();
      [subjs[activeSyllabusIdx], subjs[activeSyllabusIdx + 1]] = [subjs[activeSyllabusIdx + 1], subjs[activeSyllabusIdx]];
      activeSyllabusIdx++;
      renderSyllabusTabs();
      renderSyllabusPanel();
      markDirty();
    });
  }

  document.getElementById('seAddSubject').addEventListener('click', () => {
    alert('과목은 "과목 관리" 섹션에서 추가해주세요. 추가된 과목이 자동으로 교과과정 탭에 나타납니다.');
  });

  // Add card / highlight buttons
  document.getElementById('seAddCard').addEventListener('click', () => {
    collectState();
    state.header_data.cards.push({ title: { ko: '', en: '' }, desc: { ko: '', en: '' } });
    renderCards();
    markDirty();
  });

  document.getElementById('seAddHighlight').addEventListener('click', () => {
    collectState();
    state.header_data.highlights.push({ ko: '', en: '' });
    renderHighlights();
    markDirty();
  });

  // Kevin Academy theme preset
  document.getElementById('seThemeKevinPreset').addEventListener('click', () => {
    document.getElementById('seThemeHeroBg').value = '#133327';
    document.getElementById('seThemeAccent').value = '#ffffff';
    markDirty();
  });

  // Save
  async function doSave() {
    collectState();
    const saveMsg = document.getElementById('seSaveMsg');
    const url = isEdit ? `${window.__SEC}/schedule-pages/${pageId}` : `${window.__SEC}/schedule-pages`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
      const data = await res.json();
      if (data.success || data.id) {
        dirty = false;
        saveMsg.textContent = '저장되었습니다!';
        saveMsg.style.display = 'block';
        setTimeout(() => { saveMsg.style.display = 'none'; }, 2000);
        if (!isEdit && data.id) {
          window.location.href = `${window.__SEC}/schedule-pages/${data.id}/edit`;
        }
        return true;
      } else {
        alert(data.error || '저장 실패');
        return false;
      }
    } catch (e) { alert('저장 중 오류가 발생했습니다.'); return false; }
  }

  document.getElementById('seSaveBtn').addEventListener('click', doSave);

  // Request review button (teacher only)
  const reviewBtn = document.getElementById('seRequestReviewBtn');
  if (reviewBtn) {
    reviewBtn.addEventListener('click', async () => {
      collectState();
      state.status = 'pending';
      document.getElementById('seStatus').value = 'pending';
      const ok = await doSave();
      if (ok) {
        const saveMsg = document.getElementById('seSaveMsg');
        saveMsg.textContent = '발행 신청이 완료되었습니다! 관리자 승인을 기다려주세요.';
        saveMsg.style.display = 'block';
        setTimeout(() => { saveMsg.style.display = 'none'; }, 3000);
      }
    });
  }

  // Export as text
  document.getElementById('seExportTextBtn').addEventListener('click', () => {
    collectState();
    const sd = state.schedule_data;
    const schedules = sd.schedules || [];
    const sections = sd.sections || [];
    const dayOrder = ['월','화','수','목','금','토','일'];
    const lines = [];

    const fmt = d => { const p = d.split('-'); return parseInt(p[1]) + '/' + parseInt(p[2]); };

    sections.forEach(sec => {
      const name = t(sec.name);
      let totalCount = 0;
      const allDays = new Set();
      let firstTime = null;
      let overallStart = null;
      let overallEnd = null;

      schedules.forEach(sched => {
        const slots = (sec.slots || []).filter(s => s.scheduleId === sched.id);
        if (!slots.length) return;

        // Calculate weeks from dateRange
        const dr = sched.dateRange || {};
        let weeks = 0;
        if (dr.start && dr.end) {
          const s = new Date(dr.start), e = new Date(dr.end);
          weeks = Math.max(Math.round((e - s) / (1000 * 60 * 60 * 24 * 7)), 1);
          if (!overallStart || s < new Date(overallStart)) overallStart = dr.start;
          if (!overallEnd || e > new Date(overallEnd)) overallEnd = dr.end;
        }

        // total = weeks × weekly slots
        totalCount += weeks * slots.length;
        slots.forEach(s => allDays.add(s.day));
        if (!firstTime) firstTime = { start: slots[0].start, end: slots[0].end };
      });

      if (totalCount === 0) return;

      const dateStr = (overallStart && overallEnd) ? fmt(overallStart) + '~' + fmt(overallEnd) : '';
      const daysArr = [...allDays].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
      const timeStr = firstTime ? (firstTime.start + '~' + firstTime.end) : '';

      lines.push(`${name} (${dateStr} ${daysArr.join('')} ${timeStr}, ${totalCount}회)`);
    });

    if (!lines.length) { alert('내보낼 분반 데이터가 없습니다.'); return; }

    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.download = (state.slug || 'schedule') + '_classes.txt';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  });

  // Export as image (capture editor timetable grids)
  document.getElementById('seExportImageBtn').addEventListener('click', async () => {
    collectState();
    const grids = document.querySelectorAll('.se-schedule-card');
    if (!grids.length) { alert('시간표가 없습니다.'); return; }

    const btn = document.getElementById('seExportImageBtn');
    btn.disabled = true;
    btn.textContent = '저장 중...';

    try {
      // Open preview in hidden iframe to capture clean public-style timetable
      const slug = slugInput.value;
      if (!slug) { alert('slug를 먼저 입력해주세요.'); btn.disabled = false; btn.textContent = '이미지 내보내기'; return; }

      // Save first if dirty
      if (dirty) {
        document.getElementById('seSaveBtn').click();
        await new Promise(r => setTimeout(r, 2000));
      }

      // Create hidden iframe with preview
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1200px;height:4000px;border:none;';
      document.body.appendChild(iframe);
      iframe.src = '/p/' + slug + '/preview';

      await new Promise((resolve, reject) => {
        iframe.onload = resolve;
        setTimeout(reject, 10000);
      });

      const doc = iframe.contentDocument;
      const sections = doc.querySelectorAll('.sp-timetable-section');
      if (!sections.length) { alert('시간표를 찾을 수 없습니다.'); document.body.removeChild(iframe); btn.disabled = false; btn.textContent = '이미지 내보내기'; return; }

      const canvases = [];
      for (const sec of sections) {
        const c = await html2canvas(sec, { scale: 3, backgroundColor: '#ffffff', useCORS: true });
        canvases.push(c);
      }

      const gap = 40 * 3;
      const totalW = Math.max(...canvases.map(c => c.width));
      const totalH = canvases.reduce((sum, c) => sum + c.height, 0) + gap * (canvases.length - 1);
      const merged = document.createElement('canvas');
      merged.width = totalW;
      merged.height = totalH;
      const ctx = merged.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, totalW, totalH);
      let y = 0;
      canvases.forEach(c => {
        ctx.drawImage(c, 0, y);
        y += c.height + gap;
      });

      const link = document.createElement('a');
      link.download = (state.slug || 'timetable') + '.png';
      link.href = merged.toDataURL('image/png');
      link.click();

      document.body.removeChild(iframe);
    } catch (e) {
      alert('이미지 생성에 실패했습니다: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '이미지 내보내기';
    }
  });

  // Preview
  document.getElementById('sePreviewBtn').addEventListener('click', async () => {
    const slug = slugInput.value;
    if (!slug) { alert('slug를 먼저 입력해주세요.'); return; }
    if (dirty) {
      document.getElementById('seSaveBtn').click();
      await new Promise(r => setTimeout(r, 1500));
    }
    window.open('/p/' + slug + '/preview', '_blank');
  });

  // Load existing data
  async function loadData() {
    if (!isEdit) {
      migrateData();
      renderAll();
      return;
    }
    try {
      const res = await fetch(`${window.__SEC}/schedule-pages/${pageId}/data`);
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      state.title = data.title || '';
      state.slug = data.slug || '';
      state.status = data.status || 'draft';
      state.header_data = data.header_data || state.header_data;
      state.schedule_data = data.schedule_data || state.schedule_data;
      state.syllabus_data = data.syllabus_data || state.syllabus_data;
      state.theme_data = data.theme_data || state.theme_data;

      // Migrate old string format to bilingual
      migrateData();

      // Show owner info if admin editing someone else's page
      if ((userRole === 'admin' || userRole === 'subadmin') && data.owner_name) {
        const ownerInfo = document.getElementById('seOwnerInfo');
        ownerInfo.textContent = `작성자: ${data.owner_name}`;
        ownerInfo.style.display = 'block';
      }

      // Fill DOM
      titleInput.value = state.title;
      slugInput.value = state.slug;
      slugManual = !!state.slug;
      updateSlugPreview();
      document.getElementById('seStatus').value = state.status;
      fillDOMFromState();
      document.getElementById('seThemeHeroBg').value = state.theme_data.heroBg || '#133327';
      document.getElementById('seThemeAccent').value = state.theme_data.accent || '#ffffff';

      renderAll();

      // Load profile image preview
      if (state.header_data.profileImageId) {
        showProfilePreview(state.header_data.profileImageId);
      }
      dirty = false;
    } catch (e) { console.error(e); }
  }

  // ===== Subject Registry UI (과목 = 실라버스 단위, 색상 없음) =====
  function renderSubjectList() {
    const container = document.getElementById('seSubjectList');
    if (!container) return;
    const subjects = state.schedule_data.subjects || [];
    if (!subjects.length) {
      container.innerHTML = '<p class="empty-message">등록된 과목이 없습니다.</p>';
      return;
    }
    let html = '';
    subjects.forEach((subj, i) => {
      // Count sections linked to this subject
      let secCount = (state.schedule_data.sections || []).filter(s => s.subjectId === subj.id).length;
      html += `<div class="se-subject-item" data-subj-idx="${i}">
        <input type="text" class="se-subject-name-input" data-subj-idx="${i}" value="${esc(subj.name.ko || '')}" placeholder="과목명 (한)">
        <input type="text" class="se-subject-name-input-en" data-subj-idx="${i}" value="${esc(subj.name.en || '')}" placeholder="과목명 (영)">
        <span class="se-subject-block-count">${secCount}개 분반</span>
        <button class="se-subject-remove" data-subj-idx="${i}" title="삭제">&times;</button>
      </div>`;
    });
    container.innerHTML = html;

    // Wire events
    container.querySelectorAll('.se-subject-name-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.subjIdx);
        state.schedule_data.subjects[idx].name.ko = inp.value;
        markDirty();
      });
    });
    container.querySelectorAll('.se-subject-name-input-en').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.subjIdx);
        state.schedule_data.subjects[idx].name.en = inp.value;
        markDirty();
      });
    });
    container.querySelectorAll('.se-subject-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.subjIdx);
        const subj = state.schedule_data.subjects[idx];
        let usedCount = (state.schedule_data.sections || []).filter(s => s.subjectId === subj.id).length;
        if (usedCount > 0) {
          if (!confirm(`이 과목을 사용하는 분반이 ${usedCount}개 있습니다. 분반의 과목 연결이 해제됩니다. 삭제하시겠습니까?`)) return;
          (state.schedule_data.sections || []).forEach(s => {
            if (s.subjectId === subj.id) s.subjectId = '';
          });
        }
        state.schedule_data.subjects.splice(idx, 1);
        renderSubjectList();
        renderScheduleList();
        syncSyllabus();
        markDirty();
      });
    });
  }

  // Add subject button
  document.getElementById('seAddSubjectReg').addEventListener('click', () => {
    if (!state.schedule_data.subjects) state.schedule_data.subjects = [];
    state.schedule_data.subjects.push({
      id: genSubjectId(),
      name: { ko: '', en: '' }
    });
    renderSubjectList();
    syncSyllabus();
    markDirty();
    // Focus the new input
    const inputs = document.querySelectorAll('.se-subject-name-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  // ===== Syllabus auto-sync =====
  function syncSyllabus() {
    const schedSubjects = state.schedule_data.subjects || [];
    const syllSubjects = state.syllabus_data.subjects || [];

    // Build set of current subject IDs
    const schedIds = new Set(schedSubjects.map(s => s.id));

    // Remove syllabus entries for deleted subjects
    state.syllabus_data.subjects = syllSubjects.filter(s => !s.subjectId || schedIds.has(s.subjectId));

    // Add missing subjects
    const existingSyllIds = new Set(state.syllabus_data.subjects.map(s => s.subjectId));
    schedSubjects.forEach(subj => {
      if (!existingSyllIds.has(subj.id)) {
        const count = calculateSessionCount(subj.id);
        const weeklyPlan = [];
        for (let i = 0; i < count; i++) {
          weeklyPlan.push({ week: (i + 1) + '회차', topic: { ko: '', en: '' } });
        }
        state.syllabus_data.subjects.push({
          subjectId: subj.id,
          name: { ko: subj.name.ko || '', en: subj.name.en || '' },
          description: { ko: '', en: '' },
          promo: { ko: '', en: '' },
          highlights: [],
          placement: { ko: '', en: '' },
          weeklyPlan
        });
      }
    });

    // Update session counts (adjust weeklyPlan length)
    state.syllabus_data.subjects.forEach(syllSubj => {
      if (!syllSubj.subjectId) return;
      const count = calculateSessionCount(syllSubj.subjectId);
      if (count <= 0) return; // no blocks yet
      const wp = syllSubj.weeklyPlan || [];
      if (wp.length < count) {
        // Add more weeks
        for (let i = wp.length; i < count; i++) {
          wp.push({ week: (i + 1) + '회차', topic: { ko: '', en: '' } });
        }
      } else if (wp.length > count && count > 0) {
        // Trim from end (only empty ones)
        while (wp.length > count) {
          const last = wp[wp.length - 1];
          const hasContent = (last.topic.ko || '') + (last.topic.en || '');
          if (hasContent) break; // don't remove if has content
          wp.pop();
        }
      }
      syllSubj.weeklyPlan = wp;

      // Sync name from subject registry
      const schedSubj = getSubject(syllSubj.subjectId);
      if (schedSubj) {
        syllSubj.name = { ko: schedSubj.name.ko || '', en: schedSubj.name.en || '' };
      }
    });

    state.syllabus_data.version = 2;
    // Re-render syllabus
    renderSyllabusTabs();
    renderSyllabusPanel();
  }

  function renderAll() {
    renderCards();
    renderHighlights();
    renderSubjectList();
    renderScheduleList();
    renderSyllabusTabs();
    renderSyllabusPanel();
  }

  function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Theme inputs
  document.getElementById('seThemeHeroBg').addEventListener('input', markDirty);
  document.getElementById('seThemeAccent').addEventListener('input', markDirty);
  document.getElementById('seStatus').addEventListener('change', markDirty);

  // ===== Profile image upload =====
  function showProfilePreview(imageId) {
    const preview = document.getElementById('seProfileImagePreview');
    preview.innerHTML = `<img src="/schedule-profile-image/${encodeURIComponent(imageId)}" alt="강사 프로필">`;
    document.getElementById('seDeleteProfileImage').style.display = '';
  }

  function clearProfilePreview() {
    document.getElementById('seProfileImagePreview').innerHTML = '';
    document.getElementById('seDeleteProfileImage').style.display = 'none';
  }

  document.getElementById('seUploadProfileImage').addEventListener('click', () => {
    if (!isEdit) { alert('먼저 페이지를 저장해주세요.'); return; }
    document.getElementById('seProfileImageInput').click();
  });

  document.getElementById('seProfileImageInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch(`${window.__SEC}/schedule-pages/${pageId}/profile-image`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && data.profileImageId) {
        state.header_data.profileImageId = data.profileImageId;
        showProfilePreview(data.profileImageId);
      } else {
        alert(data.error || '업로드 실패');
      }
    } catch (err) {
      alert('업로드 중 오류가 발생했습니다.');
    }
    e.target.value = '';
  });

  document.getElementById('seDeleteProfileImage').addEventListener('click', async () => {
    if (!isEdit) return;
    if (!confirm('프로필 이미지를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`${window.__SEC}/schedule-pages/${pageId}/profile-image/delete`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        delete state.header_data.profileImageId;
        clearProfilePreview();
      } else {
        alert(data.error || '삭제 실패');
      }
    } catch (err) {
      alert('삭제 중 오류가 발생했습니다.');
    }
  });

  // Load classes list for section popup dropdown
  async function loadClassesList() {
    try {
      const res = await fetch(window.__SEC + '/classes-list');
      const data = await res.json();
      if (data.success) window.__classesList = data.classes || [];
    } catch (e) { window.__classesList = []; }
  }

  loadClassesList().then(() => loadData());
}
