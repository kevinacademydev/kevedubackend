document.addEventListener('DOMContentLoaded', () => {
  // 모든 드롭존 초기화
  document.querySelectorAll('.dropzone').forEach(initDropzone);

  // 추가 첨삭 요청 폼 초기화
  initExtraRequest();

  // 관리자 추가 첨삭 관리 버튼 초기화
  initAdminExtraActions();
});

function initDropzone(dropzone) {
  const url = dropzone.dataset.url;
  const maxFiles = parseInt(dropzone.dataset.max, 10);
  const fileInput = dropzone.querySelector('input[type="file"]');
  const progressEl = dropzone.parentElement.querySelector('.upload-progress');
  const resultEl = dropzone.parentElement.querySelector('.upload-result');

  // 클릭으로 파일 선택
  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      uploadFiles(fileInput.files, url, maxFiles, progressEl, resultEl);
    }
  });

  // 드래그 앤 드롭 이벤트
  dropzone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadFiles(files, url, maxFiles, progressEl, resultEl);
    }
  });
}

function uploadFiles(files, url, maxFiles, progressEl, resultEl) {
  // 파일 수 제한 체크
  if (files.length > maxFiles) {
    resultEl.innerHTML = `<div class="result-item result-error">최대 ${maxFiles}개 파일까지 업로드 가능합니다. (선택: ${files.length}개)</div>`;
    return;
  }

  // 파일 형식 체크
  const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
  for (let i = 0; i < files.length; i++) {
    if (!allowed.includes(files[i].type)) {
      resultEl.innerHTML = `<div class="result-item result-error">"${files[i].name}" - PDF, JPG, PNG 파일만 업로드 가능합니다.</div>`;
      return;
    }
  }

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }

  // 프로그레스 표시
  progressEl.style.display = 'flex';
  resultEl.innerHTML = '';

  fetch(url, {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    progressEl.style.display = 'none';

    if (data.error) {
      resultEl.innerHTML = `<div class="result-item result-error">${data.error}</div>`;
      return;
    }

    // 학생 업로드 결과
    if (data.success) {
      resultEl.innerHTML = `<div class="result-item result-success">${data.count}개 파일이 성공적으로 제출되었습니다.</div>`;
      // 2초 후 페이지 새로고침
      setTimeout(() => location.reload(), 2000);
      return;
    }

    // 어드민 업로드 결과 (개별 매칭 결과)
    if (data.results) {
      let html = '';
      data.results.forEach(r => {
        if (r.success) {
          html += `<div class="result-item result-success">${r.file} → ${r.matched} 매칭 완료</div>`;
        } else {
          html += `<div class="result-item result-error">${r.file} - ${r.error}</div>`;
        }
      });
      resultEl.innerHTML = html;
      // 3초 후 페이지 새로고침
      setTimeout(() => location.reload(), 3000);
    }
  })
  .catch(err => {
    progressEl.style.display = 'none';
    resultEl.innerHTML = `<div class="result-item result-error">업로드 중 오류가 발생했습니다.</div>`;
  });
}

// === 추가 첨삭 요청 ===
function initExtraRequest() {
  const dropzone = document.getElementById('extraDropzone');
  if (!dropzone) return;

  const fileInput = document.getElementById('extraFileInput');
  const fileListEl = document.getElementById('extraFileList');
  const pageInput = document.getElementById('extraPageCount');
  const amountEl = document.getElementById('extraAmount');
  const submitBtn = document.getElementById('submitExtraRequest');
  const resultEl = document.getElementById('extraRequestResult');

  let selectedFiles = [];

  // 금액 계산
  pageInput.addEventListener('input', () => {
    const count = parseInt(pageInput.value, 10) || 0;
    amountEl.textContent = (count * 3000).toLocaleString() + '원';
  });

  // 드롭존 클릭
  dropzone.addEventListener('click', () => fileInput.click());

  // 드래그 앤 드롭
  dropzone.addEventListener('dragenter', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    addFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  function addFiles(files) {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    for (let i = 0; i < files.length; i++) {
      if (!allowed.includes(files[i].type)) {
        resultEl.innerHTML = `<div class="result-item result-error">"${files[i].name}" - PDF, JPG, PNG 파일만 업로드 가능합니다.</div>`;
        return;
      }
      if (selectedFiles.length >= 10) {
        resultEl.innerHTML = `<div class="result-item result-error">최대 10개 파일까지 선택 가능합니다.</div>`;
        return;
      }
      selectedFiles.push(files[i]);
    }
    renderFileList();
  }

  function renderFileList() {
    fileListEl.innerHTML = selectedFiles.map((f, i) =>
      `<div class="extra-file-item">
        <span>${f.name}</span>
        <button class="remove-file" data-index="${i}">&times;</button>
      </div>`
    ).join('');

    // 삭제 버튼
    fileListEl.querySelectorAll('.remove-file').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedFiles.splice(parseInt(btn.dataset.index, 10), 1);
        renderFileList();
      });
    });

    submitBtn.disabled = selectedFiles.length === 0;
  }

  // 제출
  submitBtn.addEventListener('click', () => {
    const pageCount = parseInt(pageInput.value, 10);
    if (!pageCount || pageCount < 1) {
      resultEl.innerHTML = `<div class="result-item result-error">페이지 수를 입력해주세요.</div>`;
      return;
    }
    if (selectedFiles.length === 0) {
      resultEl.innerHTML = `<div class="result-item result-error">파일을 선택해주세요.</div>`;
      return;
    }

    const formData = new FormData();
    formData.append('page_count', pageCount);
    selectedFiles.forEach(f => formData.append('files', f));

    submitBtn.disabled = true;
    submitBtn.textContent = '요청 중...';
    resultEl.innerHTML = '';

    fetch('/student/extra-request', {
      method: 'POST',
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        resultEl.innerHTML = `<div class="result-item result-error">${data.error}</div>`;
        submitBtn.disabled = false;
        submitBtn.textContent = '결제 완료 및 첨삭 요청';
        return;
      }
      resultEl.innerHTML = `<div class="result-item result-success">추가 첨삭 요청이 접수되었습니다. (금액: ${data.totalAmount.toLocaleString()}원)</div>`;
      setTimeout(() => location.reload(), 2000);
    })
    .catch(() => {
      resultEl.innerHTML = `<div class="result-item result-error">요청 중 오류가 발생했습니다.</div>`;
      submitBtn.disabled = false;
      submitBtn.textContent = '결제 완료 및 첨삭 요청';
    });
  });

  // 결제 완료 버튼 (이력 목록)
  document.querySelectorAll('.btn-pay-confirm').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      btn.disabled = true;
      btn.textContent = '처리중...';

      fetch(`/student/extra-request/${id}/pay`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            alert(data.error);
            btn.disabled = false;
            btn.textContent = '결제 완료';
            return;
          }
          btn.textContent = '완료';
          setTimeout(() => location.reload(), 1000);
        })
        .catch(() => {
          alert('오류가 발생했습니다.');
          btn.disabled = false;
          btn.textContent = '결제 완료';
        });
    });
  });
}

// === 관리자: 추가 첨삭 관리 ===
function initAdminExtraActions() {
  let rejectTargetId = null;

  // 승인 버튼
  document.querySelectorAll('.btn-approve').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('이 요청을 승인하시겠습니까?')) return;
      const id = btn.dataset.id;
      btn.disabled = true;

      fetch(`/admin/extra-request/${id}/approve`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.error) { alert(data.error); btn.disabled = false; return; }
          location.reload();
        })
        .catch(() => { alert('오류가 발생했습니다.'); btn.disabled = false; });
    });
  });

  // 거절 버튼 → 모달 열기
  const rejectModal = document.getElementById('rejectModal');
  if (rejectModal) {
    const noteInput = document.getElementById('rejectNote');
    const closeBtn = document.getElementById('rejectModalClose');
    const cancelBtn = document.getElementById('rejectModalCancel');
    const confirmBtn = document.getElementById('rejectModalConfirm');

    document.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        rejectTargetId = btn.dataset.id;
        noteInput.value = '';
        rejectModal.style.display = 'flex';
      });
    });

    function closeModal() {
      rejectModal.style.display = 'none';
      rejectTargetId = null;
    }

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    rejectModal.addEventListener('click', (e) => {
      if (e.target === rejectModal) closeModal();
    });

    confirmBtn.addEventListener('click', () => {
      if (!rejectTargetId) return;
      confirmBtn.disabled = true;

      fetch(`/admin/extra-request/${rejectTargetId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteInput.value })
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) { alert(data.error); confirmBtn.disabled = false; return; }
          closeModal();
          location.reload();
        })
        .catch(() => { alert('오류가 발생했습니다.'); confirmBtn.disabled = false; });
    });
  }

  // 완료 버튼
  document.querySelectorAll('.btn-complete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('이 요청을 완료 처리하시겠습니까?')) return;
      const id = btn.dataset.id;
      btn.disabled = true;

      fetch(`/admin/extra-request/${id}/complete`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.error) { alert(data.error); btn.disabled = false; return; }
          location.reload();
        })
        .catch(() => { alert('오류가 발생했습니다.'); btn.disabled = false; });
    });
  });
}
