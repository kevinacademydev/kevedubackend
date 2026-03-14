const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getDB, saveDB } = require('../db/database');

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
    cb(null, `hw-${req.session.user.username}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
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

// GET /student - 대시보드 (내 수업 목록)
router.get('/', requireStudent, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;

  // 내 수업 목록
  const classStmt = db.prepare(`
    SELECT c.id, c.name, c.type, ce.status,
      (SELECT COUNT(*) FROM submissions s WHERE s.class_id = c.id AND s.student_id = ?) as submission_count,
      (SELECT COUNT(*) FROM graded_files g WHERE g.class_id = c.id AND g.student_id = ?) as graded_count,
      (SELECT COUNT(*) FROM graded_files g WHERE g.class_id = c.id AND g.student_id = ? AND g.is_new = 1) as new_graded_count
    FROM class_enrollments ce
    JOIN classes c ON ce.class_id = c.id
    WHERE ce.student_id = ? AND ce.status = 'active'
    ORDER BY c.name ASC
  `);
  classStmt.bind([userId, userId, userId, userId]);
  const myClasses = [];
  while (classStmt.step()) myClasses.push(classStmt.getAsObject());
  classStmt.free();

  // 피드백
  const fbStmt = db.prepare(`
    SELECT sf.*, u.name as author_name
    FROM student_feedbacks sf JOIN users u ON sf.author_id = u.id
    WHERE sf.student_id = ?
    ORDER BY sf.created_at DESC LIMIT 5
  `);
  fbStmt.bind([userId]);
  const feedbacks = [];
  while (fbStmt.step()) feedbacks.push(fbStmt.getAsObject());
  fbStmt.free();

  res.render('student-dashboard', { myClasses, feedbacks });
});

// GET /student/class/:classId - 수업 상세
router.get('/class/:classId', requireStudent, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;
  const classId = parseInt(req.params.classId, 10);

  // 등록 확인
  const enrollStmt = db.prepare("SELECT id FROM class_enrollments WHERE class_id = ? AND student_id = ? AND status = 'active'");
  enrollStmt.bind([classId, userId]);
  if (!enrollStmt.step()) {
    enrollStmt.free();
    return res.status(403).send('등록되지 않은 수업입니다.');
  }
  enrollStmt.free();

  // 수업 정보
  const clsStmt = db.prepare('SELECT * FROM classes WHERE id = ?');
  clsStmt.bind([classId]);
  if (!clsStmt.step()) { clsStmt.free(); return res.status(404).send('수업을 찾을 수 없습니다.'); }
  const cls = clsStmt.getAsObject();
  clsStmt.free();

  // 내 과제 제출
  const subStmt = db.prepare('SELECT * FROM submissions WHERE class_id = ? AND student_id = ? ORDER BY submitted_at DESC');
  subStmt.bind([classId, userId]);
  const submissions = [];
  while (subStmt.step()) submissions.push(subStmt.getAsObject());
  subStmt.free();

  // 내 채점 파일
  const grStmt = db.prepare('SELECT * FROM graded_files WHERE class_id = ? AND student_id = ? ORDER BY uploaded_at DESC');
  grStmt.bind([classId, userId]);
  const gradedFiles = [];
  while (grStmt.step()) gradedFiles.push(grStmt.getAsObject());
  grStmt.free();

  // 수업 일정 목록 (점수 컬럼용)
  const classSchedules = [];
  const csStmt = db.prepare('SELECT id, schedule_date, description, start_time FROM class_schedules WHERE class_id = ? ORDER BY schedule_date, start_time, id');
  csStmt.bind([classId]);
  while (csStmt.step()) classSchedules.push(csStmt.getAsObject());
  csStmt.free();

  // 내 점수 (schedule_id 기준)
  const myScores = {};
  const scStmt = db.prepare('SELECT schedule_id, score FROM class_scores WHERE class_id = ? AND student_id = ? ORDER BY schedule_id');
  scStmt.bind([classId, userId]);
  while (scStmt.step()) {
    const row = scStmt.getAsObject();
    myScores[row.schedule_id] = row.score;
  }
  scStmt.free();

  // 같은 수업 전체 학생 점수 (평균/등수 계산용)
  const allScoresStmt = db.prepare(`
    SELECT cs.schedule_id, cs.score
    FROM class_scores cs
    JOIN class_enrollments ce ON cs.class_id = ce.class_id AND cs.student_id = ce.student_id
    WHERE cs.class_id = ? AND ce.status = 'active'
    ORDER BY cs.schedule_id, cs.score DESC
  `);
  allScoresStmt.bind([classId]);
  const sessionScores = {};
  while (allScoresStmt.step()) {
    const row = allScoresStmt.getAsObject();
    if (!sessionScores[row.schedule_id]) sessionScores[row.schedule_id] = [];
    sessionScores[row.schedule_id].push(row.score);
  }
  allScoresStmt.free();

  const averages = {};
  const ranks = {};
  const totalStudents = {};
  for (const [schedId, allScrs] of Object.entries(sessionScores)) {
    const avg = allScrs.reduce((a, b) => a + b, 0) / allScrs.length;
    averages[schedId] = Math.round(avg * 10) / 10;
    totalStudents[schedId] = allScrs.length;
    if (myScores[schedId] !== undefined) {
      ranks[schedId] = allScrs.filter(s => s > myScores[schedId]).length + 1;
    }
  }

  // 사이드바용 내 수업 목록
  const myClassesStmt = db.prepare(`
    SELECT c.id, c.name, c.type
    FROM class_enrollments ce
    JOIN classes c ON ce.class_id = c.id
    WHERE ce.student_id = ? AND ce.status = 'active'
    ORDER BY c.name ASC
  `);
  myClassesStmt.bind([userId]);
  const myClasses = [];
  while (myClassesStmt.step()) myClasses.push(myClassesStmt.getAsObject());
  myClassesStmt.free();

  res.render('student-class', { cls, submissions, gradedFiles, classSchedules, myScores, averages, ranks, totalStudents, myClasses });
});

// POST /student/class/:classId/upload - 수업별 과제 제출
router.post('/class/:classId/upload', requireStudent, (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const userId = req.session.user.id;

  // Verify enrollment
  const db = getDB();
  const enrollStmt = db.prepare("SELECT id FROM class_enrollments WHERE class_id = ? AND student_id = ? AND status = 'active'");
  enrollStmt.bind([classId, userId]);
  if (!enrollStmt.step()) {
    enrollStmt.free();
    return res.status(403).json({ error: '등록되지 않은 수업입니다.' });
  }
  enrollStmt.free();

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

    const db2 = getDB();
    req.files.forEach(file => {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      db2.run(
        'INSERT INTO submissions (class_id, student_id, file_name, file_path) VALUES (?, ?, ?, ?)',
        [classId, userId, originalName, file.path]
      );
    });
    saveDB();
    res.json({ success: true, count: req.files.length });
  });
});

// GET /student/class/:classId/schedules - 수업 일정 조회 (읽기 전용)
router.get('/class/:classId/schedules', requireStudent, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;
  const classId = parseInt(req.params.classId, 10);

  // 등록 확인
  const enrollStmt = db.prepare("SELECT id FROM class_enrollments WHERE class_id = ? AND student_id = ? AND status = 'active'");
  enrollStmt.bind([classId, userId]);
  if (!enrollStmt.step()) {
    enrollStmt.free();
    return res.status(403).json({ error: '등록되지 않은 수업입니다.' });
  }
  enrollStmt.free();

  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: '유효하지 않은 날짜입니다.' });
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  // Count schedules before this month for seq numbering
  const offsetStmt = db.prepare('SELECT COUNT(*) as cnt FROM class_schedules WHERE class_id = ? AND schedule_date < ?');
  offsetStmt.bind([classId, startDate]);
  offsetStmt.step();
  const seqOffset = offsetStmt.getAsObject().cnt;
  offsetStmt.free();

  const stmt = db.prepare(
    'SELECT * FROM class_schedules WHERE class_id = ? AND schedule_date >= ? AND schedule_date < ? ORDER BY schedule_date, start_time, id'
  );
  stmt.bind([classId, startDate, endDate]);
  const schedules = [];
  while (stmt.step()) schedules.push(stmt.getAsObject());
  stmt.free();

  schedules.forEach((s, i) => { s.seq = seqOffset + i + 1; });
  res.json(schedules);
});

// GET /student/file/:id - 채점 파일 다운로드
router.get('/file/:id', requireStudent, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;
  const fileId = req.params.id;

  const stmt = db.prepare('SELECT * FROM graded_files WHERE id = ? AND student_id = ?');
  stmt.bind([fileId, userId]);

  if (stmt.step()) {
    const file = stmt.getAsObject();
    stmt.free();

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

module.exports = router;
