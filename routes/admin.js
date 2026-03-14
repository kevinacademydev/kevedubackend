const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const { getDB, saveDB, canAccessClass, getTeacherClassIds, getTeacherStudentIds } = require('../db/database');
const { notifyGradingComplete } = require('../utils/sms');
const { notifyGradingCompleteEmail } = require('../utils/email');

// 관리자/강사 인증 미들웨어
function requireAdmin(req, res, next) {
  if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'teacher')) {
    return res.redirect('/');
  }
  next();
}

// 원장 전용 미들웨어
function requireSuperAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('권한이 없습니다.');
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

// Sidebar data for all admin views
router.use((req, res, next) => {
  if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'teacher')) {
    return next();
  }
  const db = getDB();
  const userRole = req.session.user.role;
  const userId = req.session.user.id;
  let sidebarClasses = [];
  if (userRole === 'teacher') {
    const classIds = getTeacherClassIds(db, userId);
    if (classIds.length > 0) {
      const ph = classIds.map(() => '?').join(',');
      const stmt = db.prepare(`SELECT id, name, type, status FROM classes WHERE id IN (${ph}) ORDER BY status ASC, name ASC`);
      stmt.bind(classIds);
      while (stmt.step()) sidebarClasses.push(stmt.getAsObject());
      stmt.free();
    }
  } else {
    const stmt = db.prepare('SELECT id, name, type, status FROM classes ORDER BY status ASC, name ASC');
    while (stmt.step()) sidebarClasses.push(stmt.getAsObject());
    stmt.free();
  }
  res.locals.sidebarClasses = sidebarClasses;
  next();
});

// ======= 대시보드 =======

// GET /admin - 대시보드
router.get('/', requireAdmin, (req, res) => {
  const db = getDB();
  const userRole = req.session.user.role;
  const userId = req.session.user.id;

  // 수업 목록 (강사: 담당 수업만, 원장: 전체)
  let classes = [];
  if (userRole === 'teacher') {
    const classIds = getTeacherClassIds(db, userId);
    if (classIds.length > 0) {
      const ph = classIds.map(() => '?').join(',');
      const stmt = db.prepare(`SELECT c.*,
        (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id AND ce.status = 'active') as student_count,
        (SELECT GROUP_CONCAT(u.name, ', ') FROM class_teachers ct JOIN users u ON ct.teacher_id = u.id WHERE ct.class_id = c.id) as teacher_names
        FROM classes c WHERE c.id IN (${ph}) ORDER BY c.status ASC, c.name ASC`);
      stmt.bind(classIds);
      while (stmt.step()) classes.push(stmt.getAsObject());
      stmt.free();
    }
  } else {
    const stmt = db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id AND ce.status = 'active') as student_count,
      (SELECT GROUP_CONCAT(u.name, ', ') FROM class_teachers ct JOIN users u ON ct.teacher_id = u.id WHERE ct.class_id = c.id) as teacher_names
      FROM classes c ORDER BY c.status ASC, c.name ASC`);
    while (stmt.step()) classes.push(stmt.getAsObject());
    stmt.free();
  }

  // 최근 과제 제출 (최근 20건)
  const submissions = [];
  const subStmt = db.prepare(`
    SELECT s.*, u.username, u.name as student_name, c.name as class_name
    FROM submissions s
    JOIN users u ON s.student_id = u.id
    JOIN classes c ON s.class_id = c.id
    ORDER BY s.submitted_at DESC LIMIT 20
  `);
  while (subStmt.step()) submissions.push(subStmt.getAsObject());
  subStmt.free();

  // 최근 채점 파일 (최근 20건)
  const gradedFiles = [];
  const gradeStmt = db.prepare(`
    SELECT g.*, u.username, u.name as student_name, c.name as class_name
    FROM graded_files g
    JOIN users u ON g.student_id = u.id
    JOIN classes c ON g.class_id = c.id
    ORDER BY g.uploaded_at DESC LIMIT 20
  `);
  while (gradeStmt.step()) gradedFiles.push(gradeStmt.getAsObject());
  gradeStmt.free();

  // 강사 목록 (원장만)
  let teachers = [];
  if (userRole === 'admin') {
    const tStmt = db.prepare(`SELECT u.id, u.username, u.name, u.created_at,
      (SELECT COUNT(*) FROM class_teachers ct WHERE ct.teacher_id = u.id) as class_count
      FROM users u WHERE u.role = 'teacher' ORDER BY u.created_at DESC`);
    while (tStmt.step()) teachers.push(tStmt.getAsObject());
    tStmt.free();
  }

  // 통계: 구좌 수(총 등록 건수) vs 학생 수(유니크 학생 수)
  let enrollmentCount = 0;
  let uniqueStudentCount = 0;

  if (userRole === 'teacher') {
    const classIds = getTeacherClassIds(db, userId);
    if (classIds.length > 0) {
      const ph = classIds.map(() => '?').join(',');
      // 구좌 수 = 각 수업별 등록 학생 수 총합
      const ecStmt = db.prepare(`SELECT COUNT(*) as cnt FROM class_enrollments WHERE class_id IN (${ph}) AND status = 'active'`);
      ecStmt.bind(classIds);
      ecStmt.step();
      enrollmentCount = ecStmt.getAsObject().cnt;
      ecStmt.free();
      // 학생 수 = 유니크 학생 수
      const usStmt = db.prepare(`SELECT COUNT(DISTINCT student_id) as cnt FROM class_enrollments WHERE class_id IN (${ph}) AND status = 'active'`);
      usStmt.bind(classIds);
      usStmt.step();
      uniqueStudentCount = usStmt.getAsObject().cnt;
      usStmt.free();
    }
  } else {
    // 원장: 전체 기준
    const ecStmt = db.prepare("SELECT COUNT(*) as cnt FROM class_enrollments WHERE status = 'active'");
    ecStmt.step();
    enrollmentCount = ecStmt.getAsObject().cnt;
    ecStmt.free();
    const usStmt = db.prepare("SELECT COUNT(DISTINCT student_id) as cnt FROM class_enrollments WHERE status = 'active'");
    usStmt.step();
    uniqueStudentCount = usStmt.getAsObject().cnt;
    usStmt.free();
  }

  res.render('admin-dashboard', { classes, submissions, gradedFiles, teachers, userRole, userId, enrollmentCount, uniqueStudentCount, user: req.session.user });
});

// ======= 강사 관리 전용 페이지 (admin only) =======

// GET /admin/teachers - 강사 관리 페이지
router.get('/teachers', requireSuperAdmin, (req, res) => {
  const db = getDB();

  const teachers = [];
  const tStmt = db.prepare(`SELECT u.id, u.username, u.name, u.created_at,
    (SELECT GROUP_CONCAT(c.name, ', ') FROM class_teachers ct JOIN classes c ON ct.class_id = c.id WHERE ct.teacher_id = u.id) as class_names,
    (SELECT COUNT(*) FROM class_teachers ct WHERE ct.teacher_id = u.id) as class_count
    FROM users u WHERE u.role = 'teacher' ORDER BY u.created_at DESC`);
  while (tStmt.step()) teachers.push(tStmt.getAsObject());
  tStmt.free();

  res.render('admin-teachers', { teachers, userRole: 'admin', user: req.session.user });
});

// ======= 최근 과제 제출 전용 페이지 =======

// GET /admin/submissions - 최근 과제 제출 전체 목록
router.get('/submissions', requireAdmin, (req, res) => {
  const db = getDB();
  const userRole = req.session.user.role;
  const userId = req.session.user.id;
  const showAll = req.query.all === '1';
  const limitClause = showAll ? '' : ' LIMIT 100';

  const submissions = [];
  if (userRole === 'teacher') {
    const classIds = getTeacherClassIds(db, userId);
    if (classIds.length > 0) {
      const ph = classIds.map(() => '?').join(',');
      const stmt = db.prepare(`
        SELECT s.*, u.username, u.name as student_name, c.name as class_name
        FROM submissions s
        JOIN users u ON s.student_id = u.id
        JOIN classes c ON s.class_id = c.id
        WHERE s.class_id IN (${ph})
        ORDER BY s.submitted_at DESC${limitClause}
      `);
      stmt.bind(classIds);
      while (stmt.step()) submissions.push(stmt.getAsObject());
      stmt.free();
    }
  } else {
    const stmt = db.prepare(`
      SELECT s.*, u.username, u.name as student_name, c.name as class_name
      FROM submissions s
      JOIN users u ON s.student_id = u.id
      JOIN classes c ON s.class_id = c.id
      ORDER BY s.submitted_at DESC${limitClause}
    `);
    while (stmt.step()) submissions.push(stmt.getAsObject());
    stmt.free();
  }

  res.render('admin-submissions', { submissions, showAll, userRole, user: req.session.user });
});

// ======= 최근 채점 업로드 전용 페이지 =======

// GET /admin/graded - 최근 채점 업로드 전체 목록
router.get('/graded', requireAdmin, (req, res) => {
  const db = getDB();
  const userRole = req.session.user.role;
  const userId = req.session.user.id;
  const showAll = req.query.all === '1';
  const limitClause = showAll ? '' : ' LIMIT 100';

  const gradedFiles = [];
  if (userRole === 'teacher') {
    const classIds = getTeacherClassIds(db, userId);
    if (classIds.length > 0) {
      const ph = classIds.map(() => '?').join(',');
      const stmt = db.prepare(`
        SELECT g.*, u.username, u.name as student_name, c.name as class_name
        FROM graded_files g
        JOIN users u ON g.student_id = u.id
        JOIN classes c ON g.class_id = c.id
        WHERE g.class_id IN (${ph})
        ORDER BY g.uploaded_at DESC${limitClause}
      `);
      stmt.bind(classIds);
      while (stmt.step()) gradedFiles.push(stmt.getAsObject());
      stmt.free();
    }
  } else {
    const stmt = db.prepare(`
      SELECT g.*, u.username, u.name as student_name, c.name as class_name
      FROM graded_files g
      JOIN users u ON g.student_id = u.id
      JOIN classes c ON g.class_id = c.id
      ORDER BY g.uploaded_at DESC${limitClause}
    `);
    while (stmt.step()) gradedFiles.push(stmt.getAsObject());
    stmt.free();
  }

  res.render('admin-graded', { gradedFiles, showAll, userRole, user: req.session.user });
});

// ======= 통계 페이지 =======

// GET /admin/stats - 통계 대시보드
router.get('/stats', requireAdmin, (req, res) => {
  const db = getDB();
  const userRole = req.session.user.role;
  const userId = req.session.user.id;

  // 활성 수업 수
  let activeClassCount = 0;
  let uniqueStudentCount = 0;
  let enrollmentCount = 0;
  let teacherCount = 0;

  if (userRole === 'teacher') {
    const classIds = getTeacherClassIds(db, userId);
    activeClassCount = classIds.length;
    if (classIds.length > 0) {
      const ph = classIds.map(() => '?').join(',');
      const ecStmt = db.prepare(`SELECT COUNT(*) as cnt FROM class_enrollments WHERE class_id IN (${ph}) AND status = 'active'`);
      ecStmt.bind(classIds);
      ecStmt.step();
      enrollmentCount = ecStmt.getAsObject().cnt;
      ecStmt.free();
      const usStmt = db.prepare(`SELECT COUNT(DISTINCT student_id) as cnt FROM class_enrollments WHERE class_id IN (${ph}) AND status = 'active'`);
      usStmt.bind(classIds);
      usStmt.step();
      uniqueStudentCount = usStmt.getAsObject().cnt;
      usStmt.free();
    }
  } else {
    const acStmt = db.prepare("SELECT COUNT(*) as cnt FROM classes WHERE status = 'active'");
    acStmt.step();
    activeClassCount = acStmt.getAsObject().cnt;
    acStmt.free();
    const ecStmt = db.prepare("SELECT COUNT(*) as cnt FROM class_enrollments WHERE status = 'active'");
    ecStmt.step();
    enrollmentCount = ecStmt.getAsObject().cnt;
    ecStmt.free();
    const usStmt = db.prepare("SELECT COUNT(DISTINCT student_id) as cnt FROM class_enrollments WHERE status = 'active'");
    usStmt.step();
    uniqueStudentCount = usStmt.getAsObject().cnt;
    usStmt.free();
    const tcStmt = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'teacher'");
    tcStmt.step();
    teacherCount = tcStmt.getAsObject().cnt;
    tcStmt.free();
  }

  // 수업별 현황
  const classStats = [];
  if (userRole === 'teacher') {
    const classIds = getTeacherClassIds(db, userId);
    if (classIds.length > 0) {
      const ph = classIds.map(() => '?').join(',');
      const csStmt = db.prepare(`SELECT c.id, c.name, c.type, c.status,
        (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id AND ce.status = 'active') as student_count,
        (SELECT COUNT(*) FROM submissions s WHERE s.class_id = c.id) as submission_count,
        (SELECT COUNT(*) FROM graded_files g WHERE g.class_id = c.id) as graded_count,
        (SELECT ROUND(AVG(cs2.score), 1) FROM class_scores cs2 WHERE cs2.class_id = c.id) as avg_score
        FROM classes c WHERE c.id IN (${ph}) ORDER BY c.status ASC, c.name ASC`);
      csStmt.bind(classIds);
      while (csStmt.step()) classStats.push(csStmt.getAsObject());
      csStmt.free();
    }
  } else {
    const csStmt = db.prepare(`SELECT c.id, c.name, c.type, c.status,
      (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id AND ce.status = 'active') as student_count,
      (SELECT COUNT(*) FROM submissions s WHERE s.class_id = c.id) as submission_count,
      (SELECT COUNT(*) FROM graded_files g WHERE g.class_id = c.id) as graded_count,
      (SELECT ROUND(AVG(cs2.score), 1) FROM class_scores cs2 WHERE cs2.class_id = c.id) as avg_score
      FROM classes c ORDER BY c.status ASC, c.name ASC`);
    while (csStmt.step()) classStats.push(csStmt.getAsObject());
    csStmt.free();
  }

  // 점수 통계 (수업별 평균/최저/최고)
  const scoreStats = [];
  if (userRole === 'teacher') {
    const classIds = getTeacherClassIds(db, userId);
    if (classIds.length > 0) {
      const ph = classIds.map(() => '?').join(',');
      const ssStmt = db.prepare(`SELECT c.name,
        ROUND(AVG(cs2.score), 1) as avg_score,
        MIN(cs2.score) as min_score,
        MAX(cs2.score) as max_score,
        COUNT(cs2.score) as score_count
        FROM class_scores cs2
        JOIN classes c ON cs2.class_id = c.id
        WHERE cs2.class_id IN (${ph})
        GROUP BY cs2.class_id ORDER BY c.name`);
      ssStmt.bind(classIds);
      while (ssStmt.step()) scoreStats.push(ssStmt.getAsObject());
      ssStmt.free();
    }
  } else {
    const ssStmt = db.prepare(`SELECT c.name,
      ROUND(AVG(cs2.score), 1) as avg_score,
      MIN(cs2.score) as min_score,
      MAX(cs2.score) as max_score,
      COUNT(cs2.score) as score_count
      FROM class_scores cs2
      JOIN classes c ON cs2.class_id = c.id
      GROUP BY cs2.class_id ORDER BY c.name`);
    while (ssStmt.step()) scoreStats.push(ssStmt.getAsObject());
    ssStmt.free();
  }

  // 월별 트렌드 (최근 6개월, 월별 과제 제출 수 + 채점 수)
  const monthlyTrend = [];
  if (userRole === 'teacher') {
    const classIds = getTeacherClassIds(db, userId);
    if (classIds.length > 0) {
      const ph = classIds.map(() => '?').join(',');
      const mtStmt = db.prepare(`SELECT
        strftime('%Y-%m', s.submitted_at) as month,
        COUNT(*) as submission_count,
        0 as graded_count
        FROM submissions s WHERE s.class_id IN (${ph})
        GROUP BY month ORDER BY month DESC LIMIT 6`);
      mtStmt.bind(classIds);
      while (mtStmt.step()) monthlyTrend.push(mtStmt.getAsObject());
      mtStmt.free();
      // merge graded counts
      const mgStmt = db.prepare(`SELECT
        strftime('%Y-%m', g.uploaded_at) as month,
        COUNT(*) as graded_count
        FROM graded_files g WHERE g.class_id IN (${ph})
        GROUP BY month ORDER BY month DESC LIMIT 6`);
      mgStmt.bind(classIds);
      while (mgStmt.step()) {
        const row = mgStmt.getAsObject();
        const existing = monthlyTrend.find(m => m.month === row.month);
        if (existing) existing.graded_count = row.graded_count;
        else monthlyTrend.push({ month: row.month, submission_count: 0, graded_count: row.graded_count });
      }
      mgStmt.free();
    }
  } else {
    const mtStmt = db.prepare(`SELECT
      strftime('%Y-%m', s.submitted_at) as month,
      COUNT(*) as submission_count,
      0 as graded_count
      FROM submissions s
      GROUP BY month ORDER BY month DESC LIMIT 6`);
    while (mtStmt.step()) monthlyTrend.push(mtStmt.getAsObject());
    mtStmt.free();
    const mgStmt = db.prepare(`SELECT
      strftime('%Y-%m', g.uploaded_at) as month,
      COUNT(*) as graded_count
      FROM graded_files g
      GROUP BY month ORDER BY month DESC LIMIT 6`);
    while (mgStmt.step()) {
      const row = mgStmt.getAsObject();
      const existing = monthlyTrend.find(m => m.month === row.month);
      if (existing) existing.graded_count = row.graded_count;
      else monthlyTrend.push({ month: row.month, submission_count: 0, graded_count: row.graded_count });
    }
    mgStmt.free();
  }
  monthlyTrend.sort((a, b) => a.month.localeCompare(b.month));

  res.render('admin-stats', { activeClassCount, uniqueStudentCount, enrollmentCount, teacherCount, classStats, scoreStats, monthlyTrend, userRole, user: req.session.user });
});

// ======= 학생 목록 =======

// GET /admin/:username/students-list - 학생 목록 페이지
router.get('/:username/students-list', requireAdmin, (req, res) => {
  // URL의 username이 로그인한 사용자와 일치하는지 확인
  if (req.params.username !== req.session.user.username) {
    return res.redirect(`/admin/${req.session.user.username}/students-list`);
  }
  const db = getDB();
  const userRole = req.session.user.role;
  const userId = req.session.user.id;

  let students = [];
  if (userRole === 'teacher') {
    const studentIds = getTeacherStudentIds(db, userId);
    if (studentIds.length > 0) {
      const ph = studentIds.map(() => '?').join(',');
      const stmt = db.prepare(`SELECT id, username, name, name_en, school, gender, grade FROM users WHERE role = 'student' AND id IN (${ph}) ORDER BY username`);
      stmt.bind(studentIds);
      while (stmt.step()) students.push(stmt.getAsObject());
      stmt.free();
    }
  } else {
    const stmt = db.prepare("SELECT id, username, name, name_en, school, gender, grade FROM users WHERE role = 'student' ORDER BY username");
    while (stmt.step()) students.push(stmt.getAsObject());
    stmt.free();
  }

  res.render('admin-students-list', { students, userRole, user: req.session.user });
});

// GET /admin/students - 학생 목록 JSON
router.get('/students', requireAdmin, (req, res) => {
  const db = getDB();
  const userRole = req.session.user.role;
  const userId = req.session.user.id;

  let students = [];
  if (userRole === 'teacher') {
    const studentIds = getTeacherStudentIds(db, userId);
    if (studentIds.length > 0) {
      const ph = studentIds.map(() => '?').join(',');
      const stmt = db.prepare(`SELECT id, username, name, name_en, school, gender FROM users WHERE role = 'student' AND id IN (${ph}) ORDER BY username`);
      stmt.bind(studentIds);
      while (stmt.step()) students.push(stmt.getAsObject());
      stmt.free();
    }
  } else {
    const stmt = db.prepare("SELECT id, username, name, name_en, school, gender FROM users WHERE role = 'student' ORDER BY username");
    while (stmt.step()) students.push(stmt.getAsObject());
    stmt.free();
  }
  res.json(students);
});

// ======= 수업 관리 =======

// POST /admin/classes - 수업 생성 (admin only)
router.post('/classes', requireSuperAdmin, (req, res) => {
  const db = getDB();
  const name = (req.body.name || '').trim();
  const type = req.body.type || 'regular';

  if (!name) return res.status(400).json({ error: '수업 이름을 입력해주세요.' });
  if (!['regular', 'team', 'private'].includes(type)) return res.status(400).json({ error: '유효하지 않은 수업 유형입니다.' });

  db.run('INSERT INTO classes (name, type) VALUES (?, ?)', [name, type]);
  saveDB();

  const idStmt = db.prepare('SELECT last_insert_rowid() as id');
  idStmt.step();
  const classId = idStmt.getAsObject().id;
  idStmt.free();

  res.json({ success: true, classId });
});

// GET /admin/class/:id - 수업 관리 페이지
router.get('/class/:id', requireAdmin, (req, res) => {
  const db = getDB();
  const classId = parseInt(req.params.id, 10);
  const userRole = req.session.user.role;
  const userId = req.session.user.id;

  if (!canAccessClass(db, userId, userRole, classId)) {
    return res.status(403).send('접근 권한이 없습니다.');
  }

  // 수업 정보
  const clsStmt = db.prepare('SELECT * FROM classes WHERE id = ?');
  clsStmt.bind([classId]);
  if (!clsStmt.step()) {
    clsStmt.free();
    return res.status(404).send('수업을 찾을 수 없습니다.');
  }
  const cls = clsStmt.getAsObject();
  clsStmt.free();

  // 등록 학생
  const stuStmt = db.prepare(`
    SELECT u.id, u.username, u.name, u.name_en, u.school, u.grade, ce.status as enrollment_status
    FROM class_enrollments ce
    JOIN users u ON ce.student_id = u.id
    WHERE ce.class_id = ?
    ORDER BY ce.status ASC, u.username ASC
  `);
  stuStmt.bind([classId]);
  const students = [];
  while (stuStmt.step()) students.push(stuStmt.getAsObject());
  stuStmt.free();

  // 담당 강사
  const tchStmt = db.prepare(`
    SELECT u.id, u.username, u.name
    FROM class_teachers ct
    JOIN users u ON ct.teacher_id = u.id
    WHERE ct.class_id = ?
  `);
  tchStmt.bind([classId]);
  const classTeachers = [];
  while (tchStmt.step()) classTeachers.push(tchStmt.getAsObject());
  tchStmt.free();

  // 과제 제출 목록
  const subStmt = db.prepare(`
    SELECT s.*, u.username, u.name as student_name
    FROM submissions s JOIN users u ON s.student_id = u.id
    WHERE s.class_id = ?
    ORDER BY s.submitted_at DESC
  `);
  subStmt.bind([classId]);
  const submissions = [];
  while (subStmt.step()) submissions.push(subStmt.getAsObject());
  subStmt.free();

  // 채점 파일 목록
  const grStmt = db.prepare(`
    SELECT g.*, u.username, u.name as student_name, uploader.name as uploader_name
    FROM graded_files g
    JOIN users u ON g.student_id = u.id
    JOIN users uploader ON g.uploaded_by = uploader.id
    WHERE g.class_id = ?
    ORDER BY g.uploaded_at DESC
  `);
  grStmt.bind([classId]);
  const gradedFiles = [];
  while (grStmt.step()) gradedFiles.push(grStmt.getAsObject());
  grStmt.free();

  // 수업 일정 목록 (점수 테이블 컬럼용, 날짜순)
  const classSchedules = [];
  const csStmt = db.prepare('SELECT id, schedule_date, description, start_time FROM class_schedules WHERE class_id = ? ORDER BY schedule_date, start_time, id');
  csStmt.bind([classId]);
  while (csStmt.step()) classSchedules.push(csStmt.getAsObject());
  csStmt.free();

  // 점수 데이터 (학생별, schedule_id 기준)
  const scoreData = {};
  students.forEach(s => { scoreData[s.id] = {}; });
  const scStmt = db.prepare('SELECT * FROM class_scores WHERE class_id = ? ORDER BY student_id, schedule_id');
  scStmt.bind([classId]);
  while (scStmt.step()) {
    const row = scStmt.getAsObject();
    if (!scoreData[row.student_id]) scoreData[row.student_id] = {};
    scoreData[row.student_id][row.schedule_id] = row.score;
  }
  scStmt.free();

  // 전체 강사 목록 (배정용, admin only)
  let allTeachers = [];
  if (userRole === 'admin') {
    const atStmt = db.prepare("SELECT id, username, name FROM users WHERE role = 'teacher' ORDER BY username");
    while (atStmt.step()) allTeachers.push(atStmt.getAsObject());
    atStmt.free();
  }

  res.render('admin-class', { cls, students, classTeachers, submissions, gradedFiles, scoreData, classSchedules, allTeachers, userRole, userId });
});

// POST /admin/class/:id/edit - 수업 수정
router.post('/class/:id/edit', requireSuperAdmin, (req, res) => {
  const db = getDB();
  const classId = req.params.id;
  const name = (req.body.name || '').trim();
  const type = req.body.type || 'regular';
  const status = req.body.status || 'active';

  if (!name) return res.status(400).json({ error: '수업 이름을 입력해주세요.' });

  db.run('UPDATE classes SET name = ?, type = ?, status = ? WHERE id = ?', [name, type, status, classId]);
  saveDB();
  res.json({ success: true });
});

// POST /admin/class/:id/notes - 비고 저장
router.post('/class/:id/notes', requireAdmin, (req, res) => {
  const db = getDB();
  const classId = parseInt(req.params.id, 10);

  if (!canAccessClass(db, req.session.user.id, req.session.user.role, classId)) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  const notes = (req.body.notes || '').trim();
  db.run('UPDATE classes SET notes = ? WHERE id = ?', [notes, classId]);
  saveDB();
  res.json({ success: true });
});

// POST /admin/class/:id/delete - 수업 삭제 (cascade)
router.post('/class/:id/delete', requireSuperAdmin, (req, res) => {
  const db = getDB();
  const classId = req.params.id;

  db.run('DELETE FROM class_schedules WHERE class_id = ?', [classId]);
  db.run('DELETE FROM class_scores WHERE class_id = ?', [classId]);
  db.run('DELETE FROM graded_files WHERE class_id = ?', [classId]);
  db.run('DELETE FROM submissions WHERE class_id = ?', [classId]);
  db.run('DELETE FROM class_enrollments WHERE class_id = ?', [classId]);
  db.run('DELETE FROM class_teachers WHERE class_id = ?', [classId]);
  db.run('DELETE FROM classes WHERE id = ?', [classId]);
  saveDB();
  res.json({ success: true });
});

// ======= 수업 일정 =======

// GET /admin/class/:id/schedules - 월별 일정 조회
router.get('/class/:id/schedules', requireAdmin, (req, res) => {
  const db = getDB();
  const classId = parseInt(req.params.id, 10);

  if (!canAccessClass(db, req.session.user.id, req.session.user.role, classId)) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

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

// Helper: 같은 강사의 다른 수업과 시간 겹침 체크
function checkTeacherOverlap(db, classId, dates, startTime, endTime, excludeScheduleId) {
  if (!startTime || !endTime) return [];
  // 이 수업의 강사 조회
  const tStmt = db.prepare('SELECT teacher_id FROM class_teachers WHERE class_id = ?');
  tStmt.bind([classId]);
  const teacherIds = [];
  while (tStmt.step()) teacherIds.push(tStmt.getAsObject().teacher_id);
  tStmt.free();
  if (teacherIds.length === 0) return [];

  // 해당 강사의 다른 수업 ID 조회
  const tph = teacherIds.map(() => '?').join(',');
  const cStmt = db.prepare(`SELECT DISTINCT class_id FROM class_teachers WHERE teacher_id IN (${tph}) AND class_id != ?`);
  cStmt.bind([...teacherIds, classId]);
  const otherClassIds = [];
  while (cStmt.step()) otherClassIds.push(cStmt.getAsObject().class_id);
  cStmt.free();
  if (otherClassIds.length === 0) return [];

  // 겹치는 일정 조회
  const conflicts = [];
  const cph = otherClassIds.map(() => '?').join(',');
  const dph = dates.map(() => '?').join(',');
  let query = `SELECT cs.*, c.name as class_name FROM class_schedules cs
    JOIN classes c ON cs.class_id = c.id
    WHERE cs.class_id IN (${cph}) AND cs.schedule_date IN (${dph})
    AND cs.start_time < ? AND cs.end_time > ?`;
  const params = [...otherClassIds, ...dates, endTime, startTime];
  if (excludeScheduleId) {
    query += ' AND cs.id != ?';
    params.push(excludeScheduleId);
  }
  const oStmt = db.prepare(query);
  oStmt.bind(params);
  while (oStmt.step()) conflicts.push(oStmt.getAsObject());
  oStmt.free();
  return conflicts;
}

// POST /admin/class/:id/schedules - 일정 추가 (반복 지원)
router.post('/class/:id/schedules', requireAdmin, (req, res) => {
  const db = getDB();
  const classId = parseInt(req.params.id, 10);

  if (!canAccessClass(db, req.session.user.id, req.session.user.role, classId)) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  const scheduleDate = (req.body.schedule_date || '').trim();
  const startTime = (req.body.start_time || '').trim();
  const endTime = (req.body.end_time || '').trim();
  const description = (req.body.description || '').trim();
  const repeatWeeks = parseInt(req.body.repeat_weeks, 10) || 0;
  const forceOverlap = req.body.force_overlap === true;

  if (!scheduleDate || !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) {
    return res.status(400).json({ error: '유효하지 않은 날짜입니다.' });
  }

  const totalCount = 1 + Math.min(Math.max(repeatWeeks, 0), 52);

  // 겹침 체크 (force가 아닌 경우)
  if (!forceOverlap && startTime && endTime) {
    const dates = [];
    for (let i = 0; i < totalCount; i++) {
      const d = new Date(scheduleDate);
      d.setDate(d.getDate() + i * 7);
      dates.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    }
    const conflicts = checkTeacherOverlap(db, classId, dates, startTime, endTime);
    if (conflicts.length > 0) {
      const msgs = conflicts.map(c => `${c.schedule_date} ${c.start_time}~${c.end_time} [${c.class_name}]`);
      return res.json({ success: false, overlap: true, conflicts: msgs });
    }
  }

  const ids = [];
  for (let i = 0; i < totalCount; i++) {
    const d = new Date(scheduleDate);
    d.setDate(d.getDate() + i * 7);
    const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    db.run('INSERT INTO class_schedules (class_id, schedule_date, start_time, end_time, description) VALUES (?, ?, ?, ?, ?)',
      [classId, dateStr, startTime, endTime, description]);

    const idStmt = db.prepare('SELECT last_insert_rowid() as id');
    idStmt.step();
    ids.push(idStmt.getAsObject().id);
    idStmt.free();
  }

  saveDB();
  res.json({ success: true, id: ids[0], count: ids.length });
});

// POST /admin/class/:id/schedules/:sid/edit - 일정 수정
router.post('/class/:id/schedules/:sid/edit', requireAdmin, (req, res) => {
  const db = getDB();
  const classId = parseInt(req.params.id, 10);
  const sid = parseInt(req.params.sid, 10);

  if (!canAccessClass(db, req.session.user.id, req.session.user.role, classId)) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  const startTime = (req.body.start_time || '').trim();
  const endTime = (req.body.end_time || '').trim();
  const description = (req.body.description || '').trim();
  const forceOverlap = req.body.force_overlap === true;

  // 겹침 체크
  if (!forceOverlap && startTime && endTime) {
    const dStmt = db.prepare('SELECT schedule_date FROM class_schedules WHERE id = ? AND class_id = ?');
    dStmt.bind([sid, classId]);
    if (dStmt.step()) {
      const schedDate = dStmt.getAsObject().schedule_date;
      dStmt.free();
      const conflicts = checkTeacherOverlap(db, classId, [schedDate], startTime, endTime, sid);
      if (conflicts.length > 0) {
        const msgs = conflicts.map(c => `${c.schedule_date} ${c.start_time}~${c.end_time} [${c.class_name}]`);
        return res.json({ success: false, overlap: true, conflicts: msgs });
      }
    } else {
      dStmt.free();
    }
  }

  db.run('UPDATE class_schedules SET start_time = ?, end_time = ?, description = ? WHERE id = ? AND class_id = ?',
    [startTime, endTime, description, sid, classId]);
  saveDB();
  res.json({ success: true });
});

// POST /admin/class/:id/schedules/:sid/delete - 일정 삭제
router.post('/class/:id/schedules/:sid/delete', requireAdmin, (req, res) => {
  const db = getDB();
  const classId = parseInt(req.params.id, 10);
  const sid = parseInt(req.params.sid, 10);

  if (!canAccessClass(db, req.session.user.id, req.session.user.role, classId)) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  db.run('DELETE FROM class_schedules WHERE id = ? AND class_id = ?', [sid, classId]);
  saveDB();
  res.json({ success: true });
});

// POST /admin/class/:id/enroll - 학생 등록
router.post('/class/:id/enroll', requireAdmin, (req, res) => {
  const db = getDB();
  const classId = req.params.id;
  const studentId = req.body.student_id;

  if (!canAccessClass(db, req.session.user.id, req.session.user.role, parseInt(classId, 10))) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  if (!studentId) return res.status(400).json({ error: '학생을 선택해주세요.' });

  // 개인 수업은 학생 1명만 등록 가능
  const typeStmt = db.prepare('SELECT type FROM classes WHERE id = ?');
  typeStmt.bind([classId]);
  if (typeStmt.step()) {
    const cls = typeStmt.getAsObject();
    typeStmt.free();
    if (cls.type === 'private') {
      const cntStmt = db.prepare("SELECT COUNT(*) as cnt FROM class_enrollments WHERE class_id = ? AND status = 'active'");
      cntStmt.bind([classId]);
      const { cnt } = cntStmt.getAsObject();
      cntStmt.free();
      // 이미 다른 active 학생이 있는지 확인 (재등록 케이스 제외)
      const alreadyStmt = db.prepare("SELECT id FROM class_enrollments WHERE class_id = ? AND student_id = ? AND status = 'active'");
      alreadyStmt.bind([classId, studentId]);
      const isAlready = alreadyStmt.step();
      alreadyStmt.free();
      if (cnt >= 1 && !isAlready) {
        return res.status(400).json({ error: '개인 수업은 학생을 1명만 등록할 수 있습니다.' });
      }
    }
  } else {
    typeStmt.free();
  }

  // Check for existing enrollment (including dropped)
  const checkStmt = db.prepare('SELECT id, status FROM class_enrollments WHERE class_id = ? AND student_id = ?');
  checkStmt.bind([classId, studentId]);
  if (checkStmt.step()) {
    const existing = checkStmt.getAsObject();
    checkStmt.free();
    if (existing.status === 'active') {
      return res.status(400).json({ error: '이미 등록된 학생입니다.' });
    }
    // Re-activate dropped enrollment
    db.run("UPDATE class_enrollments SET status = 'active' WHERE id = ?", [existing.id]);
  } else {
    checkStmt.free();
    db.run('INSERT INTO class_enrollments (class_id, student_id) VALUES (?, ?)', [classId, studentId]);
  }
  saveDB();
  res.json({ success: true });
});

// POST /admin/class/:id/unenroll - 학생 등록 해제
router.post('/class/:id/unenroll', requireAdmin, (req, res) => {
  const db = getDB();
  const classId = req.params.id;
  const studentId = req.body.student_id;

  if (!canAccessClass(db, req.session.user.id, req.session.user.role, parseInt(classId, 10))) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  db.run("UPDATE class_enrollments SET status = 'dropped' WHERE class_id = ? AND student_id = ?", [classId, studentId]);
  saveDB();
  res.json({ success: true });
});

// POST /admin/class/:id/upload - 채점 파일 업로드 (수업 내 자동매칭)
router.post('/class/:id/upload', requireAdmin, (req, res) => {
  const classId = parseInt(req.params.id, 10);

  if (!canAccessClass(getDB(), req.session.user.id, req.session.user.role, classId)) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

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
    const uploaderId = req.session.user.id;

    // Get enrolled students for this class
    const enrollStmt = db.prepare(`
      SELECT u.id, u.username FROM class_enrollments ce
      JOIN users u ON ce.student_id = u.id
      WHERE ce.class_id = ? AND ce.status = 'active'
    `);
    enrollStmt.bind([classId]);
    const enrolledStudents = [];
    while (enrollStmt.step()) enrolledStudents.push(enrollStmt.getAsObject());
    enrollStmt.free();

    const results = [];

    req.files.forEach(file => {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const matches = originalName.match(/\d{4}/g);

      if (!matches) {
        results.push({ file: originalName, success: false, error: '파일명에 4자리 숫자가 없습니다 (예: 0014_채점.pdf)' });
        return;
      }

      // Match against enrolled students only
      const matchedStudents = [];
      const uniqueNums = [...new Set(matches)];
      for (const numStr of uniqueNums) {
        const username = `student${numStr}`;
        const found = enrolledStudents.find(s => s.username === username);
        if (found) matchedStudents.push(found);
      }

      if (matchedStudents.length > 1) {
        results.push({ file: originalName, success: false, error: '대응되는 학생을 특정할 수 없습니다', errorType: 'ambiguous' });
        return;
      }

      if (matchedStudents.length === 1) {
        const student = matchedStudents[0];
        db.run(
          'INSERT INTO graded_files (class_id, student_id, uploaded_by, file_name, file_path, is_new) VALUES (?, ?, ?, ?, ?, 1)',
          [classId, student.id, uploaderId, originalName, file.path]
        );

        // Notify student
        const phoneStmt = db.prepare('SELECT name, parent_phone, email FROM users WHERE id = ?');
        phoneStmt.bind([student.id]);
        if (phoneStmt.step()) {
          const userData = phoneStmt.getAsObject();
          if (userData.parent_phone) notifyGradingComplete(userData.parent_phone, userData.name);
          if (userData.email) notifyGradingCompleteEmail(userData.email, userData.name);
        }
        phoneStmt.free();

        results.push({ file: originalName, success: true, matched: student.username });
      } else {
        results.push({ file: originalName, success: false, error: `매칭되는 학생을 찾을 수 없습니다 (숫자: ${matches.join(', ')})` });
      }
    });

    saveDB();
    res.json({ results });
  });
});

// GET /admin/class/:id/file/:fileId - 과제 다운로드
router.get('/class/:id/file/:fileId', requireAdmin, (req, res) => {
  const db = getDB();
  const stmt = db.prepare('SELECT * FROM submissions WHERE id = ? AND class_id = ?');
  stmt.bind([req.params.fileId, req.params.id]);

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

// POST /admin/class/:id/scores - 점수 일괄 저장 (schedule_id 기준)
router.post('/class/:id/scores', requireAdmin, (req, res) => {
  const db = getDB();
  const classId = req.params.id;
  const scores = req.body.scores; // { "studentId": { "scheduleId": score } }

  if (!canAccessClass(db, req.session.user.id, req.session.user.role, parseInt(classId, 10))) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  if (!scores || typeof scores !== 'object') {
    return res.status(400).json({ error: '점수 데이터가 없습니다.' });
  }

  for (const [studentId, scheduleScores] of Object.entries(scores)) {
    for (const [scheduleIdStr, scoreVal] of Object.entries(scheduleScores)) {
      const scheduleId = parseInt(scheduleIdStr, 10);
      if (!scheduleId) continue;

      const score = scoreVal === '' || scoreVal === null ? null : parseInt(scoreVal, 10);

      const existStmt = db.prepare('SELECT id FROM class_scores WHERE class_id = ? AND student_id = ? AND schedule_id = ?');
      existStmt.bind([classId, studentId, scheduleId]);

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
          db.run('INSERT INTO class_scores (class_id, student_id, schedule_id, score) VALUES (?, ?, ?, ?)', [classId, studentId, scheduleId, score]);
        }
      }
    }
  }

  saveDB();
  res.json({ success: true });
});

// POST /admin/class/:id/teachers - 강사 배정
router.post('/class/:id/teachers', requireSuperAdmin, (req, res) => {
  const db = getDB();
  const classId = req.params.id;
  const teacherId = req.body.teacher_id;

  if (!teacherId) return res.status(400).json({ error: '강사를 선택해주세요.' });

  const checkStmt = db.prepare('SELECT id FROM class_teachers WHERE class_id = ? AND teacher_id = ?');
  checkStmt.bind([classId, teacherId]);
  if (checkStmt.step()) {
    checkStmt.free();
    return res.status(400).json({ error: '이미 배정된 강사입니다.' });
  }
  checkStmt.free();

  db.run('INSERT INTO class_teachers (class_id, teacher_id) VALUES (?, ?)', [classId, teacherId]);
  saveDB();
  res.json({ success: true });
});

// POST /admin/class/:id/teachers/:tid/remove - 강사 해제
router.post('/class/:id/teachers/:tid/remove', requireSuperAdmin, (req, res) => {
  const db = getDB();
  db.run('DELETE FROM class_teachers WHERE class_id = ? AND teacher_id = ?', [req.params.id, req.params.tid]);
  saveDB();
  res.json({ success: true });
});

// GET /admin/class/:id/students - 수업 학생 JSON
router.get('/class/:id/students', requireAdmin, (req, res) => {
  const db = getDB();
  const classId = parseInt(req.params.id, 10);

  if (!canAccessClass(db, req.session.user.id, req.session.user.role, classId)) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  const stmt = db.prepare(`
    SELECT u.id, u.username, u.name, u.name_en, u.school, ce.status
    FROM class_enrollments ce JOIN users u ON ce.student_id = u.id
    WHERE ce.class_id = ?
    ORDER BY u.username
  `);
  stmt.bind([classId]);
  const students = [];
  while (stmt.step()) students.push(stmt.getAsObject());
  stmt.free();
  res.json(students);
});

// GET /admin/class/:id/teachers - 수업 강사 JSON
router.get('/class/:id/teachers', requireAdmin, (req, res) => {
  const db = getDB();
  const stmt = db.prepare(`
    SELECT u.id, u.username, u.name
    FROM class_teachers ct JOIN users u ON ct.teacher_id = u.id
    WHERE ct.class_id = ?
  `);
  stmt.bind([req.params.id]);
  const teachers = [];
  while (stmt.step()) teachers.push(stmt.getAsObject());
  stmt.free();
  res.json(teachers);
});

// ======= 학생 상세 =======

// GET /admin/student/:id - 학생 프로필
router.get('/student/:id', requireAdmin, (req, res) => {
  const db = getDB();
  const studentId = req.params.id;
  const userRole = req.session.user.role;
  const userId = req.session.user.id;

  // 강사: 담당 수업의 학생만 접근
  if (userRole === 'teacher') {
    const myStudentIds = getTeacherStudentIds(db, userId);
    if (!myStudentIds.includes(parseInt(studentId, 10))) {
      return res.status(403).send('접근 권한이 없습니다.');
    }
  }

  const userStmt = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'");
  userStmt.bind([studentId]);
  if (!userStmt.step()) {
    userStmt.free();
    return res.status(404).send('학생을 찾을 수 없습니다.');
  }
  const student = userStmt.getAsObject();
  userStmt.free();

  // 수업 목록
  const classStmt = db.prepare(`
    SELECT c.id, c.name, c.type, ce.status
    FROM class_enrollments ce
    JOIN classes c ON ce.class_id = c.id
    WHERE ce.student_id = ?
    ORDER BY ce.status ASC, c.name ASC
  `);
  classStmt.bind([studentId]);
  const classes = [];
  while (classStmt.step()) classes.push(classStmt.getAsObject());
  classStmt.free();

  // 피드백
  const fbStmt = db.prepare(`
    SELECT sf.*, u.name as author_name
    FROM student_feedbacks sf JOIN users u ON sf.author_id = u.id
    WHERE sf.student_id = ?
    ORDER BY sf.created_at DESC
  `);
  fbStmt.bind([studentId]);
  const feedbacks = [];
  while (fbStmt.step()) feedbacks.push(fbStmt.getAsObject());
  fbStmt.free();

  // 상담기록 (원장만)
  let consultations = [];
  if (userRole === 'admin') {
    const conStmt = db.prepare(`
      SELECT sc.*, u.name as author_name
      FROM student_consultations sc JOIN users u ON sc.author_id = u.id
      WHERE sc.student_id = ?
      ORDER BY sc.created_at DESC
    `);
    conStmt.bind([studentId]);
    while (conStmt.step()) consultations.push(conStmt.getAsObject());
    conStmt.free();
  }

  res.render('admin-student', { student, classes, feedbacks, consultations, userRole, user: req.session.user });
});

// POST /admin/student/:id/feedback
router.post('/student/:id/feedback', requireAdmin, (req, res) => {
  const db = getDB();
  const content = (req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: '피드백 내용을 입력해주세요.' });

  db.run('INSERT INTO student_feedbacks (student_id, author_id, content) VALUES (?, ?, ?)',
    [req.params.id, req.session.user.id, content]);
  saveDB();
  res.json({ success: true });
});

// POST /admin/feedback/:id/delete
router.post('/feedback/:id/delete', requireAdmin, (req, res) => {
  const db = getDB();
  db.run('DELETE FROM student_feedbacks WHERE id = ?', [req.params.id]);
  saveDB();
  res.json({ success: true });
});

// POST /admin/student/:id/consultation
router.post('/student/:id/consultation', requireAdmin, (req, res) => {
  const db = getDB();
  const content = (req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: '상담기록 내용을 입력해주세요.' });

  db.run('INSERT INTO student_consultations (student_id, author_id, content) VALUES (?, ?, ?)',
    [req.params.id, req.session.user.id, content]);
  saveDB();
  res.json({ success: true });
});

// POST /admin/consultation/:id/delete (admin only)
router.post('/consultation/:id/delete', requireSuperAdmin, (req, res) => {
  const db = getDB();
  db.run('DELETE FROM student_consultations WHERE id = ?', [req.params.id]);
  saveDB();
  res.json({ success: true });
});

// ======= 강사 관리 (admin only) =======

// POST /admin/teachers - 강사 계정 생성
router.post('/teachers', requireSuperAdmin, (req, res) => {
  const db = getDB();
  const username = (req.body.username || '').trim();
  const name = (req.body.name || '').trim();
  const password = req.body.password || '';

  if (!username || !name || !password) {
    return res.status(400).json({ error: '아이디, 이름, 비밀번호를 모두 입력해주세요.' });
  }

  const checkStmt = db.prepare('SELECT id FROM users WHERE username = ?');
  checkStmt.bind([username]);
  if (checkStmt.step()) {
    checkStmt.free();
    return res.status(400).json({ error: '이미 존재하는 아이디입니다.' });
  }
  checkStmt.free();

  const hashedPassword = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO users (username, name, password, role) VALUES (?, ?, ?, ?)',
    [username, name, hashedPassword, 'teacher']);
  saveDB();
  res.json({ success: true });
});

// POST /admin/teachers/:id/delete
router.post('/teachers/:id/delete', requireSuperAdmin, (req, res) => {
  const db = getDB();
  const teacherId = req.params.id;
  db.run('DELETE FROM class_teachers WHERE teacher_id = ?', [teacherId]);
  db.run("DELETE FROM users WHERE id = ? AND role = 'teacher'", [teacherId]);
  saveDB();
  res.json({ success: true });
});

// ======= 대시보드 일정 API =======

// GET /admin/dashboard-schedules - 날짜 범위별 일정 조회
router.get('/dashboard-schedules', requireAdmin, (req, res) => {
  const db = getDB();
  const userRole = req.session.user.role;
  const userId = req.session.user.id;

  // Get class IDs this user can access
  let classFilter = '';
  let classParams = [];
  if (userRole === 'teacher') {
    const classIds = getTeacherClassIds(db, userId);
    if (classIds.length === 0) return res.json({ schedules: [] });
    classFilter = `AND cs.class_id IN (${classIds.map(() => '?').join(',')})`;
    classParams = classIds;
  }

  const startDate = (req.query.start || '').trim();
  const endDate = (req.query.end || '').trim();

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'start, end 파라미터가 필요합니다.' });
  }

  const query = `SELECT cs.*, c.name as class_name FROM class_schedules cs JOIN classes c ON cs.class_id = c.id WHERE cs.schedule_date >= ? AND cs.schedule_date < ? ${classFilter} ORDER BY cs.schedule_date, cs.start_time, cs.id`;

  const stmt = db.prepare(query);
  stmt.bind([startDate, endDate, ...classParams]);
  const schedules = [];
  while (stmt.step()) schedules.push(stmt.getAsObject());
  stmt.free();

  res.json({ schedules });
});

// ======= 시간표 페이지 (Schedule Pages) =======

// GET /admin/schedule-pages - 목록
router.get('/schedule-pages', requireAdmin, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;
  const userRole = req.session.user.role;
  const maxSlots = userRole === 'admin' ? 10 : 5;

  let myPages = [];
  let teacherPages = [];
  let pendingCount = 0;

  if (userRole === 'admin') {
    // Own pages
    const stmt1 = db.prepare('SELECT sp.*, u.name as owner_name FROM schedule_pages sp JOIN users u ON sp.owner_id = u.id WHERE sp.owner_id = ? ORDER BY sp.slot_number ASC');
    stmt1.bind([userId]);
    while (stmt1.step()) myPages.push(stmt1.getAsObject());
    stmt1.free();

    // Teacher pages (all other users' pages), pending first
    const stmt2 = db.prepare("SELECT sp.*, u.name as owner_name FROM schedule_pages sp JOIN users u ON sp.owner_id = u.id WHERE sp.owner_id != ? ORDER BY CASE WHEN sp.status = 'pending' THEN 0 ELSE 1 END, sp.updated_at DESC");
    stmt2.bind([userId]);
    while (stmt2.step()) teacherPages.push(stmt2.getAsObject());
    stmt2.free();

    pendingCount = teacherPages.filter(p => p.status === 'pending').length;
  } else {
    const stmt = db.prepare('SELECT * FROM schedule_pages WHERE owner_id = ? ORDER BY slot_number ASC');
    stmt.bind([userId]);
    while (stmt.step()) myPages.push(stmt.getAsObject());
    stmt.free();
  }

  res.render('admin-schedule-list', {
    activePage: 'schedule-pages',
    userRole,
    userId,
    myPages,
    teacherPages,
    maxSlots,
    pendingCount
  });
});

// GET /admin/schedule-pages/new - 새 에디터
router.get('/schedule-pages/new', requireAdmin, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;
  const userRole = req.session.user.role;
  const maxSlots = userRole === 'admin' ? 10 : 5;

  // Check slot count
  const stmt = db.prepare('SELECT COUNT(*) as cnt FROM schedule_pages WHERE owner_id = ?');
  stmt.bind([userId]);
  stmt.step();
  const count = stmt.getAsObject().cnt;
  stmt.free();

  if (count >= maxSlots) {
    return res.redirect('/admin/schedule-pages');
  }

  res.render('admin-schedule-editor', {
    activePage: 'schedule-pages',
    userRole,
    userId,
    pageId: null
  });
});

// GET /admin/schedule-pages/:id/edit - 기존 편집
router.get('/schedule-pages/:id/edit', requireAdmin, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;
  const userRole = req.session.user.role;
  const pageId = req.params.id;

  const stmt = db.prepare('SELECT * FROM schedule_pages WHERE id = ?');
  stmt.bind([pageId]);
  if (!stmt.step()) { stmt.free(); return res.redirect('/admin/schedule-pages'); }
  const page = stmt.getAsObject();
  stmt.free();

  if (userRole !== 'admin' && page.owner_id !== userId) {
    return res.redirect('/admin/schedule-pages');
  }

  res.render('admin-schedule-editor', {
    activePage: 'schedule-pages',
    userRole,
    userId,
    pageId: page.id
  });
});

// GET /admin/schedule-pages/:id/data - JSON API
router.get('/schedule-pages/:id/data', requireAdmin, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;
  const userRole = req.session.user.role;

  const stmt = db.prepare('SELECT sp.*, u.name as owner_name FROM schedule_pages sp JOIN users u ON sp.owner_id = u.id WHERE sp.id = ?');
  stmt.bind([req.params.id]);
  if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'Not found' }); }
  const page = stmt.getAsObject();
  stmt.free();

  if (userRole !== 'admin' && page.owner_id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json({
    id: page.id,
    owner_id: page.owner_id,
    owner_name: page.owner_name,
    slot_number: page.slot_number,
    title: page.title,
    slug: page.slug,
    status: page.status,
    header_data: JSON.parse(page.header_data || '{}'),
    schedule_data: JSON.parse(page.schedule_data || '{}'),
    syllabus_data: JSON.parse(page.syllabus_data || '{}'),
    theme_data: JSON.parse(page.theme_data || '{}')
  });
});

// POST /admin/schedule-pages - 새 페이지 생성
router.post('/schedule-pages', requireAdmin, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;
  const userRole = req.session.user.role;
  const maxSlots = userRole === 'admin' ? 10 : 5;
  let { title, slug, status, header_data, schedule_data, syllabus_data, theme_data } = req.body;

  // Enforce status restrictions for teachers
  if (userRole !== 'admin' && (status === 'published' || status === 'private')) {
    status = 'draft';
  }

  // Find next available slot
  const stmt = db.prepare('SELECT slot_number FROM schedule_pages WHERE owner_id = ? ORDER BY slot_number ASC');
  stmt.bind([userId]);
  const usedSlots = new Set();
  while (stmt.step()) usedSlots.add(stmt.getAsObject().slot_number);
  stmt.free();

  let nextSlot = null;
  for (let i = 1; i <= maxSlots; i++) {
    if (!usedSlots.has(i)) { nextSlot = i; break; }
  }
  if (!nextSlot) {
    return res.status(400).json({ error: `슬롯이 가득 찼습니다 (최대 ${maxSlots}개)` });
  }

  // Check slug uniqueness
  if (slug) {
    const chk = db.prepare('SELECT id FROM schedule_pages WHERE slug = ?');
    chk.bind([slug]);
    if (chk.step()) { chk.free(); return res.status(400).json({ error: '이미 사용 중인 slug입니다.' }); }
    chk.free();
  }

  db.run(`INSERT INTO schedule_pages (owner_id, slot_number, title, slug, status, header_data, schedule_data, syllabus_data, theme_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, nextSlot, title || '', slug || null, status || 'draft',
      JSON.stringify(header_data || {}), JSON.stringify(schedule_data || {}),
      JSON.stringify(syllabus_data || {}), JSON.stringify(theme_data || {})]);
  saveDB();

  const newId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  res.json({ success: true, id: newId, slot_number: nextSlot });
});

// POST /admin/schedule-pages/:id - 업데이트
router.post('/schedule-pages/:id', requireAdmin, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;
  const userRole = req.session.user.role;
  const pageId = req.params.id;

  const stmt = db.prepare('SELECT * FROM schedule_pages WHERE id = ?');
  stmt.bind([pageId]);
  if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'Not found' }); }
  const page = stmt.getAsObject();
  stmt.free();

  if (userRole !== 'admin' && page.owner_id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  let { title, slug, status, header_data, schedule_data, syllabus_data, theme_data } = req.body;

  // Teacher can only set draft or pending; block published/private
  if (userRole !== 'admin' && status !== 'draft' && status !== 'pending') {
    status = 'draft';
  }

  // Check slug uniqueness (exclude self)
  if (slug) {
    const chk = db.prepare('SELECT id FROM schedule_pages WHERE slug = ? AND id != ?');
    chk.bind([slug, pageId]);
    if (chk.step()) { chk.free(); return res.status(400).json({ error: '이미 사용 중인 slug입니다.' }); }
    chk.free();
  }

  db.run(`UPDATE schedule_pages SET title=?, slug=?, status=?, header_data=?, schedule_data=?, syllabus_data=?, theme_data=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [title || '', slug || null, status || 'draft',
      JSON.stringify(header_data || {}), JSON.stringify(schedule_data || {}),
      JSON.stringify(syllabus_data || {}), JSON.stringify(theme_data || {}), pageId]);
  saveDB();

  res.json({ success: true });
});

// POST /admin/schedule-pages/:id/delete - 삭제
router.post('/schedule-pages/:id/delete', requireAdmin, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;
  const userRole = req.session.user.role;
  const pageId = req.params.id;

  const stmt = db.prepare('SELECT * FROM schedule_pages WHERE id = ?');
  stmt.bind([pageId]);
  if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'Not found' }); }
  const page = stmt.getAsObject();
  stmt.free();

  if (userRole !== 'admin' && page.owner_id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.run('DELETE FROM schedule_pages WHERE id = ?', [pageId]);
  saveDB();

  res.json({ success: true });
});

module.exports = router;
