const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getDB, saveDB } = require('../db/database');
const { notifyGradingComplete, notifyExtraRequestStatus } = require('../utils/sms');

// 어드민 인증 미들웨어
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/');
  }
  next();
}

// Multer 설정 - 채점 파일 업로드
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads', 'graded'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('PDF, JPG, PNG 파일만 업로드 가능합니다.'));
    }
  }
});

// GET /admin - 어드민 대시보드
router.get('/', requireAdmin, (req, res) => {
  const db = getDB();

  // 전체 학생 목록
  const studentStmt = db.prepare("SELECT * FROM users WHERE role = 'student' ORDER BY student_id");
  const students = [];
  while (studentStmt.step()) {
    students.push(studentStmt.getAsObject());
  }
  studentStmt.free();

  // 최근 과제 제출 (최근 50건)
  const subStmt = db.prepare(`
    SELECT s.*, u.student_id, u.name
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    ORDER BY s.submitted_at DESC
    LIMIT 50
  `);
  const submissions = [];
  while (subStmt.step()) {
    submissions.push(subStmt.getAsObject());
  }
  subStmt.free();

  // 최근 채점 파일 업로드 (최근 50건)
  const gradeStmt = db.prepare(`
    SELECT g.*, u.student_id, u.name
    FROM graded_files g
    JOIN users u ON g.user_id = u.id
    ORDER BY g.uploaded_at DESC
    LIMIT 50
  `);
  const gradedFiles = [];
  while (gradeStmt.step()) {
    gradedFiles.push(gradeStmt.getAsObject());
  }
  gradeStmt.free();

  // 추가 첨삭 요청 목록
  const extraStmt = db.prepare(`
    SELECT er.*, u.student_id, u.name, u.parent_phone,
      GROUP_CONCAT(erf.file_name, ', ') as file_names
    FROM extra_requests er
    JOIN users u ON er.user_id = u.id
    LEFT JOIN extra_request_files erf ON er.id = erf.request_id
    GROUP BY er.id
    ORDER BY er.requested_at DESC
  `);
  const extraRequests = [];
  while (extraStmt.step()) {
    extraRequests.push(extraStmt.getAsObject());
  }
  extraStmt.free();

  res.render('admin-dashboard', { students, submissions, gradedFiles, extraRequests });
});

// POST /admin/upload - 채점 파일 일괄 업로드 (자동 매칭)
router.post('/upload', requireAdmin, (req, res) => {
  upload.array('files', 30)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: '최대 30개 파일까지 업로드 가능합니다.' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '파일을 선택해주세요.' });
    }

    const db = getDB();
    const results = [];

    req.files.forEach(file => {
      // 한글 파일명 인코딩 보정
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

      // 파일명에서 4자리 숫자 추출하여 studentXXXX 매칭
      const matches = originalName.match(/\d{4}/g);
      if (!matches) {
        results.push({
          file: originalName,
          success: false,
          error: '파일명에 4자리 숫자가 없습니다 (예: 0014_채점.pdf)'
        });
        return;
      }

      // 4자리 숫자 중 실제 존재하는 학생과 매칭되는 첫 번째를 사용
      let matched = false;
      for (const numStr of matches) {
        const studentId = `student${numStr}`;
        const userStmt = db.prepare('SELECT id FROM users WHERE student_id = ?');
        userStmt.bind([studentId]);

        if (userStmt.step()) {
          const user = userStmt.getAsObject();
          userStmt.free();

          db.run(
            'INSERT INTO graded_files (user_id, file_name, file_path, is_new) VALUES (?, ?, ?, 1)',
            [user.id, originalName, file.path]
          );

          // SMS 알림 (학부모 전화번호 조회)
          const phoneStmt = db.prepare('SELECT name, parent_phone FROM users WHERE id = ?');
          phoneStmt.bind([user.id]);
          if (phoneStmt.step()) {
            const userData = phoneStmt.getAsObject();
            if (userData.parent_phone) {
              notifyGradingComplete(userData.parent_phone, userData.name);
            }
          }
          phoneStmt.free();

          results.push({
            file: originalName,
            success: true,
            matched: studentId
          });
          matched = true;
          break;
        } else {
          userStmt.free();
        }
      }

      if (!matched) {
        results.push({
          file: originalName,
          success: false,
          error: `매칭되는 학생을 찾을 수 없습니다 (숫자: ${matches.join(', ')})`
        });
      }
    });

    saveDB();
    res.json({ results });
  });
});

// GET /admin/file/:id - 과제 파일 다운로드
router.get('/file/:id', requireAdmin, (req, res) => {
  const db = getDB();
  const fileId = req.params.id;

  const stmt = db.prepare('SELECT * FROM submissions WHERE id = ?');
  stmt.bind([fileId]);

  if (stmt.step()) {
    const file = stmt.getAsObject();
    stmt.free();
    const encodedName = encodeURIComponent(file.file_name);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.sendFile(path.resolve(file.file_path));
  } else {
    stmt.free();
    res.status(404).send('파일을 찾을 수 없습니다.');
  }
});

// GET /admin/students - 학생 목록 JSON
router.get('/students', requireAdmin, (req, res) => {
  const db = getDB();
  const stmt = db.prepare("SELECT id, student_id, name, school, classes, gender FROM users WHERE role = 'student' ORDER BY student_id");
  const students = [];
  while (stmt.step()) {
    students.push(stmt.getAsObject());
  }
  stmt.free();
  res.json(students);
});

// POST /admin/extra-request/:id/approve - 추가 첨삭 승인
router.post('/extra-request/:id/approve', requireAdmin, (req, res) => {
  const db = getDB();
  const requestId = req.params.id;

  const stmt = db.prepare(`
    SELECT er.*, u.name, u.parent_phone
    FROM extra_requests er JOIN users u ON er.user_id = u.id
    WHERE er.id = ?
  `);
  stmt.bind([requestId]);

  if (!stmt.step()) {
    stmt.free();
    return res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
  }

  const request = stmt.getAsObject();
  stmt.free();

  if (request.status !== 'payment_sent' && request.status !== 'payment_pending') {
    return res.status(400).json({ error: '승인할 수 없는 상태입니다.' });
  }

  db.run(
    "UPDATE extra_requests SET status = 'approved', approved_at = datetime('now', 'localtime') WHERE id = ?",
    [requestId]
  );
  saveDB();

  // SMS 알림
  if (request.parent_phone) {
    notifyExtraRequestStatus(request.parent_phone, request.name, 'approved');
  }

  res.json({ success: true });
});

// POST /admin/extra-request/:id/reject - 추가 첨삭 거절
router.post('/extra-request/:id/reject', requireAdmin, (req, res) => {
  const db = getDB();
  const requestId = req.params.id;
  const adminNote = req.body.note || '';

  const stmt = db.prepare(`
    SELECT er.*, u.name, u.parent_phone
    FROM extra_requests er JOIN users u ON er.user_id = u.id
    WHERE er.id = ?
  `);
  stmt.bind([requestId]);

  if (!stmt.step()) {
    stmt.free();
    return res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
  }

  const request = stmt.getAsObject();
  stmt.free();

  db.run(
    "UPDATE extra_requests SET status = 'rejected', admin_note = ?, approved_at = datetime('now', 'localtime') WHERE id = ?",
    [adminNote, requestId]
  );
  saveDB();

  // SMS 알림
  if (request.parent_phone) {
    notifyExtraRequestStatus(request.parent_phone, request.name, 'rejected', adminNote);
  }

  res.json({ success: true });
});

// POST /admin/extra-request/:id/complete - 추가 첨삭 완료
router.post('/extra-request/:id/complete', requireAdmin, (req, res) => {
  const db = getDB();
  const requestId = req.params.id;

  const stmt = db.prepare(`
    SELECT er.*, u.name, u.parent_phone
    FROM extra_requests er JOIN users u ON er.user_id = u.id
    WHERE er.id = ?
  `);
  stmt.bind([requestId]);

  if (!stmt.step()) {
    stmt.free();
    return res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
  }

  const request = stmt.getAsObject();
  stmt.free();

  if (request.status !== 'approved') {
    return res.status(400).json({ error: '승인된 요청만 완료 처리할 수 있습니다.' });
  }

  db.run("UPDATE extra_requests SET status = 'completed' WHERE id = ?", [requestId]);
  saveDB();

  // SMS 알림
  if (request.parent_phone) {
    notifyExtraRequestStatus(request.parent_phone, request.name, 'completed');
  }

  res.json({ success: true });
});

// ======= 학생 관리 페이지 (점수 관리) =======

// GET /admin/student/:id - 학생 관리 페이지
router.get('/student/:id', requireAdmin, (req, res) => {
  const db = getDB();
  const studentId = req.params.id;

  // 학생 정보 조회
  const userStmt = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'");
  userStmt.bind([studentId]);
  if (!userStmt.step()) {
    userStmt.free();
    return res.status(404).send('학생을 찾을 수 없습니다.');
  }
  const student = userStmt.getAsObject();
  userStmt.free();

  // 수업 목록
  const classStmt = db.prepare('SELECT * FROM student_classes WHERE user_id = ? ORDER BY status ASC, class_name ASC');
  classStmt.bind([studentId]);
  const classes = [];
  while (classStmt.step()) {
    classes.push(classStmt.getAsObject());
  }
  classStmt.free();

  // 각 수업의 점수 데이터
  const classesWithScores = classes.map(cls => {
    const scoreStmt = db.prepare('SELECT session_number, score FROM class_scores WHERE student_class_id = ? ORDER BY session_number');
    scoreStmt.bind([cls.id]);
    const scores = {};
    while (scoreStmt.step()) {
      const row = scoreStmt.getAsObject();
      scores[row.session_number] = row.score;
    }
    scoreStmt.free();
    return { ...cls, scores };
  });

  res.render('admin-student', { student, classes: classesWithScores });
});

// POST /admin/student/:id/class - 수업 추가
router.post('/student/:id/class', requireAdmin, (req, res) => {
  const db = getDB();
  const studentId = req.params.id;
  const className = (req.body.class_name || '').trim();

  if (!className) {
    return res.status(400).json({ error: '수업 이름을 입력해주세요.' });
  }

  // 중복 확인
  const checkStmt = db.prepare('SELECT id FROM student_classes WHERE user_id = ? AND class_name = ?');
  checkStmt.bind([studentId, className]);
  if (checkStmt.step()) {
    checkStmt.free();
    return res.status(400).json({ error: '이미 등록된 수업입니다.' });
  }
  checkStmt.free();

  db.run('INSERT INTO student_classes (user_id, class_name) VALUES (?, ?)', [studentId, className]);
  saveDB();
  res.json({ success: true });
});

// POST /admin/student/:id/class/:classId/status - 수업 상태 변경 (active/inactive)
router.post('/student/:id/class/:classId/status', requireAdmin, (req, res) => {
  const db = getDB();
  const classId = req.params.classId;
  const newStatus = req.body.status;

  if (!['active', 'inactive'].includes(newStatus)) {
    return res.status(400).json({ error: '유효하지 않은 상태입니다.' });
  }

  db.run('UPDATE student_classes SET status = ? WHERE id = ?', [newStatus, classId]);
  saveDB();
  res.json({ success: true });
});

// POST /admin/student/:id/class/:classId/scores - 점수 일괄 저장
router.post('/student/:id/class/:classId/scores', requireAdmin, (req, res) => {
  const db = getDB();
  const classId = req.params.classId;
  const scores = req.body.scores; // { "1": 85, "2": 90, ... }

  if (!scores || typeof scores !== 'object') {
    return res.status(400).json({ error: '점수 데이터가 없습니다.' });
  }

  for (const [sessionStr, scoreVal] of Object.entries(scores)) {
    const sessionNum = parseInt(sessionStr, 10);
    if (sessionNum < 1 || sessionNum > 32) continue;

    const score = scoreVal === '' || scoreVal === null ? null : parseInt(scoreVal, 10);

    // UPSERT: 기존 값이 있으면 업데이트, 없으면 삽입
    const existStmt = db.prepare('SELECT id FROM class_scores WHERE student_class_id = ? AND session_number = ?');
    existStmt.bind([classId, sessionNum]);

    if (existStmt.step()) {
      const existing = existStmt.getAsObject();
      existStmt.free();
      if (score === null) {
        db.run('DELETE FROM class_scores WHERE id = ?', [existing.id]);
      } else {
        db.run("UPDATE class_scores SET score = ?, updated_at = datetime('now', 'localtime') WHERE id = ?", [score, existing.id]);
      }
    } else {
      existStmt.free();
      if (score !== null) {
        db.run('INSERT INTO class_scores (student_class_id, session_number, score) VALUES (?, ?, ?)', [classId, sessionNum, score]);
      }
    }
  }

  saveDB();
  res.json({ success: true });
});

// DELETE /admin/student/:id/class/:classId - 수업 삭제
router.post('/student/:id/class/:classId/delete', requireAdmin, (req, res) => {
  const db = getDB();
  const classId = req.params.classId;

  db.run('DELETE FROM class_scores WHERE student_class_id = ?', [classId]);
  db.run('DELETE FROM student_classes WHERE id = ?', [classId]);
  saveDB();
  res.json({ success: true });
});

// GET /admin/extra-file/:id - 추가 첨삭 요청 파일 다운로드
router.get('/extra-file/:id', requireAdmin, (req, res) => {
  const db = getDB();
  const fileId = req.params.id;

  const stmt = db.prepare('SELECT * FROM extra_request_files WHERE id = ?');
  stmt.bind([fileId]);

  if (stmt.step()) {
    const file = stmt.getAsObject();
    stmt.free();
    const encodedName = encodeURIComponent(file.file_name);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.sendFile(path.resolve(file.file_path));
  } else {
    stmt.free();
    res.status(404).send('파일을 찾을 수 없습니다.');
  }
});

module.exports = router;
