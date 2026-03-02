const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getDB, saveDB } = require('../db/database');
const { notifyExtraRequestStatus } = require('../utils/sms');

// 학생 인증 미들웨어
function requireStudent(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'student') {
    return res.redirect('/');
  }
  next();
}

// Multer 설정 - 학생 과제 업로드
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads', 'homework'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `hw-${req.session.user.student_id}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
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

// Multer 설정 - 추가 첨삭 파일 업로드
const extraStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads', 'extra'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `extra-${req.session.user.student_id}-${uniqueSuffix}${ext}`);
  }
});

const extraUpload = multer({
  storage: extraStorage,
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

// GET /student - 학생 대시보드
router.get('/', requireStudent, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;

  // 내 과제 제출 목록
  const subStmt = db.prepare('SELECT * FROM submissions WHERE user_id = ? ORDER BY submitted_at DESC');
  subStmt.bind([userId]);
  const submissions = [];
  while (subStmt.step()) {
    submissions.push(subStmt.getAsObject());
  }
  subStmt.free();

  // 내 채점 파일 목록
  const gradeStmt = db.prepare('SELECT * FROM graded_files WHERE user_id = ? ORDER BY uploaded_at DESC');
  gradeStmt.bind([userId]);
  const gradedFiles = [];
  while (gradeStmt.step()) {
    gradedFiles.push(gradeStmt.getAsObject());
  }
  gradeStmt.free();

  // 새 채점 파일 수
  const newCountStmt = db.prepare('SELECT COUNT(*) as cnt FROM graded_files WHERE user_id = ? AND is_new = 1');
  newCountStmt.bind([userId]);
  newCountStmt.step();
  const newCount = newCountStmt.getAsObject().cnt;
  newCountStmt.free();

  // 추가 첨삭 요청 목록
  const extraStmt = db.prepare(`
    SELECT er.*, GROUP_CONCAT(erf.file_name, ', ') as file_names
    FROM extra_requests er
    LEFT JOIN extra_request_files erf ON er.id = erf.request_id
    WHERE er.user_id = ?
    GROUP BY er.id
    ORDER BY er.requested_at DESC
  `);
  extraStmt.bind([userId]);
  const extraRequests = [];
  while (extraStmt.step()) {
    extraRequests.push(extraStmt.getAsObject());
  }
  extraStmt.free();

  // 내 수업별 점수 데이터 (그래프용)
  const classStmt = db.prepare('SELECT * FROM student_classes WHERE user_id = ? ORDER BY status ASC, class_name ASC');
  classStmt.bind([userId]);
  const myClasses = [];
  while (classStmt.step()) {
    myClasses.push(classStmt.getAsObject());
  }
  classStmt.free();

  const classesWithScores = myClasses.map(cls => {
    // 내 점수
    const scoreStmt = db.prepare('SELECT session_number, score FROM class_scores WHERE student_class_id = ? ORDER BY session_number');
    scoreStmt.bind([cls.id]);
    const scores = {};
    while (scoreStmt.step()) {
      const row = scoreStmt.getAsObject();
      scores[row.session_number] = row.score;
    }
    scoreStmt.free();

    // 같은 수업을 듣는 모든 학생의 회차별 점수 (평균 + 등수 계산용)
    const allStmt = db.prepare(`
      SELECT cs.session_number, cs.score
      FROM class_scores cs
      JOIN student_classes sc ON cs.student_class_id = sc.id
      WHERE sc.class_name = ?
      ORDER BY cs.session_number, cs.score DESC
    `);
    allStmt.bind([cls.class_name]);
    const sessionScores = {}; // { session: [score1, score2, ...] }
    while (allStmt.step()) {
      const row = allStmt.getAsObject();
      if (!sessionScores[row.session_number]) sessionScores[row.session_number] = [];
      sessionScores[row.session_number].push(row.score);
    }
    allStmt.free();

    // 회차별 평균, 등수, 총 인원 계산
    const averages = {};
    const ranks = {};
    const totalStudents = {};
    for (const [session, allScores] of Object.entries(sessionScores)) {
      const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
      averages[session] = Math.round(avg * 10) / 10;
      totalStudents[session] = allScores.length;
      // 등수: 내 점수보다 높은 사람 수 + 1
      if (scores[session] !== undefined) {
        const rank = allScores.filter(s => s > scores[session]).length + 1;
        ranks[session] = rank;
      }
    }

    return { ...cls, scores, averages, ranks, totalStudents };
  });

  res.render('student-dashboard', { submissions, gradedFiles, newCount, extraRequests, myClasses: classesWithScores });
});

// POST /student/upload - 과제 제출
router.post('/upload', requireStudent, (req, res) => {
  upload.array('files', 10)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: '최대 10개 파일까지 업로드 가능합니다.' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '파일을 선택해주세요.' });
    }

    const db = getDB();
    const userId = req.session.user.id;

    req.files.forEach(file => {
      // 한글 파일명 인코딩 보정
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      db.run(
        'INSERT INTO submissions (user_id, file_name, file_path) VALUES (?, ?, ?)',
        [userId, originalName, file.path]
      );
    });
    saveDB();

    res.json({ success: true, count: req.files.length });
  });
});

// GET /student/file/:id - 채점 파일 다운로드 (+ is_new 업데이트)
router.get('/file/:id', requireStudent, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;
  const fileId = req.params.id;

  const stmt = db.prepare('SELECT * FROM graded_files WHERE id = ? AND user_id = ?');
  stmt.bind([fileId, userId]);

  if (stmt.step()) {
    const file = stmt.getAsObject();
    stmt.free();

    // 미확인 → 확인완료
    if (file.is_new === 1) {
      db.run('UPDATE graded_files SET is_new = 0 WHERE id = ?', [fileId]);
      saveDB();
    }

    const encodedName = encodeURIComponent(file.file_name);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.sendFile(path.resolve(file.file_path));
  } else {
    stmt.free();
    res.status(404).send('파일을 찾을 수 없습니다.');
  }
});

// POST /student/extra-request - 추가 첨삭 요청
router.post('/extra-request', requireStudent, (req, res) => {
  extraUpload.array('files', 10)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '파일을 선택해주세요.' });
    }

    const pageCount = parseInt(req.body.page_count, 10);
    if (!pageCount || pageCount < 1) {
      return res.status(400).json({ error: '페이지 수를 올바르게 입력해주세요.' });
    }

    const db = getDB();
    const userId = req.session.user.id;
    const totalAmount = pageCount * 3000;

    // 추가 첨삭 요청 생성
    db.run(
      'INSERT INTO extra_requests (user_id, page_count, total_amount) VALUES (?, ?, ?)',
      [userId, pageCount, totalAmount]
    );

    // 방금 생성한 요청의 ID 조회
    const idStmt = db.prepare('SELECT last_insert_rowid() as id');
    idStmt.step();
    const requestId = idStmt.getAsObject().id;
    idStmt.free();

    // 파일 정보 저장
    req.files.forEach(file => {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      db.run(
        'INSERT INTO extra_request_files (request_id, file_name, file_path) VALUES (?, ?, ?)',
        [requestId, originalName, file.path]
      );
    });

    saveDB();
    res.json({ success: true, requestId, totalAmount });
  });
});

// POST /student/extra-request/:id/pay - 결제 완료 알림
router.post('/extra-request/:id/pay', requireStudent, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;
  const requestId = req.params.id;

  const stmt = db.prepare('SELECT * FROM extra_requests WHERE id = ? AND user_id = ?');
  stmt.bind([requestId, userId]);

  if (!stmt.step()) {
    stmt.free();
    return res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
  }

  const request = stmt.getAsObject();
  stmt.free();

  if (request.status !== 'payment_pending') {
    return res.status(400).json({ error: '이미 처리된 요청입니다.' });
  }

  // 상태를 payment_sent로 변경 (결제했다고 알림)
  db.run("UPDATE extra_requests SET status = 'payment_sent' WHERE id = ?", [requestId]);
  saveDB();

  res.json({ success: true, message: '결제 완료가 전달되었습니다. 관리자 확인 후 처리됩니다.' });
});

module.exports = router;
