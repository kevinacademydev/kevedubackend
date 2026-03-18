const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const { sql, canAccessClass, getTeacherClassIds, getTeacherStudentIds } = require('../db/database');
const { notifyGradingComplete } = require('../utils/sms');
const { notifyGradingCompleteEmail } = require('../utils/email');
const { uploadFile, downloadFile, deleteFile, listFiles, uploadFileDirect, createFolder, sanitizeName, getUniquePath, getKSTDateString } = require('../utils/drive');

// Helper: admin 또는 subadmin인지 체크
function isAdminLike(role) {
  return role === 'admin' || role === 'subadmin';
}

// 관리자/부원장/강사 인증 미들웨어
function requireAdmin(req, res, next) {
  if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'subadmin' && req.session.user.role !== 'teacher')) {
    return res.redirect('/management');
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

// 원장+부원장 미들웨어 (강사 불가)
function requireAdminLike(req, res, next) {
  if (!req.session.user || !isAdminLike(req.session.user.role)) {
    return res.status(403).send('권한이 없습니다.');
  }
  next();
}

// Multer 설정 - 메모리 저장 (Google Drive로 전송)
const upload = multer({
  storage: multer.memoryStorage(),
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

// Role ↔ path validation: redirect to correct section
router.use((req, res, next) => {
  const user = req.session.user;
  if (!user) return res.redirect('/management');
  const isOnAdminPath = req.baseUrl.includes('/admin');
  const isOnTeacherPath = req.baseUrl.includes('/teacher');
  if (isOnAdminPath && user.role === 'teacher') {
    return res.redirect(req.originalUrl.replace('/admin', '/teacher'));
  }
  if (isOnTeacherPath && (user.role === 'admin' || user.role === 'subadmin')) {
    return res.redirect(req.originalUrl.replace('/teacher', '/admin'));
  }
  next();
});

// Sidebar data for all admin views
router.use(async (req, res, next) => {
  if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'subadmin' && req.session.user.role !== 'teacher')) {
    return next();
  }
  try {
    const userRole = req.session.user.role;
    const userId = req.session.user.id;
    let sidebarClasses;
    if (userRole === 'teacher') {
      const classIds = await getTeacherClassIds(userId);
      if (classIds.length > 0) {
        sidebarClasses = await sql`SELECT id, name, type, status FROM classes WHERE id = ANY(${classIds}) ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'inactive' THEN 2 END, name ASC`;
      } else {
        sidebarClasses = [];
      }
    } else {
      sidebarClasses = await sql`SELECT id, name, type, status FROM classes ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'inactive' THEN 2 END, name ASC`;
    }
    res.locals.sidebarClasses = sidebarClasses;
    next();
  } catch (err) {
    console.error('Sidebar error:', err);
    res.locals.sidebarClasses = [];
    next();
  }
});

// ======= 대시보드 =======

// GET /admin - 대시보드
router.get('/', requireAdmin, async (req, res) => {
  try {
    const userRole = req.session.user.role;
    const userId = req.session.user.id;

    let classes, submissions, gradedFiles, teachers = [];
    let enrollmentCount = 0, uniqueStudentCount = 0;

    if (userRole === 'teacher') {
      const classIds = await getTeacherClassIds(userId);
      if (classIds.length > 0) {
        classes = await sql`SELECT c.*,
          (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id AND ce.status = 'active') as student_count,
          (SELECT STRING_AGG(u.name, ', ') FROM class_teachers ct JOIN users u ON ct.teacher_id = u.id WHERE ct.class_id = c.id) as teacher_names
          FROM classes c WHERE c.id = ANY(${classIds}) ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'inactive' THEN 2 END, c.name ASC`;

        submissions = await sql`
          SELECT s.*, u.username, u.name as student_name, c.name as class_name
          FROM submissions s JOIN users u ON s.student_id = u.id JOIN classes c ON s.class_id = c.id
          WHERE s.class_id = ANY(${classIds})
          ORDER BY s.submitted_at DESC LIMIT 20`;

        gradedFiles = await sql`
          SELECT g.*, u.username, u.name as student_name, c.name as class_name
          FROM graded_files g JOIN users u ON g.student_id = u.id JOIN classes c ON g.class_id = c.id
          WHERE g.class_id = ANY(${classIds})
          ORDER BY g.uploaded_at DESC LIMIT 20`;

        const ecRow = await sql`SELECT COUNT(*) as cnt FROM class_enrollments WHERE class_id = ANY(${classIds}) AND status = 'active'`;
        enrollmentCount = parseInt(ecRow[0].cnt, 10);
        const usRow = await sql`SELECT COUNT(DISTINCT student_id) as cnt FROM class_enrollments WHERE class_id = ANY(${classIds}) AND status = 'active'`;
        uniqueStudentCount = parseInt(usRow[0].cnt, 10);
      } else {
        classes = []; submissions = []; gradedFiles = [];
      }
    } else {
      classes = await sql`SELECT c.*,
        (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id AND ce.status = 'active') as student_count,
        (SELECT STRING_AGG(u.name, ', ') FROM class_teachers ct JOIN users u ON ct.teacher_id = u.id WHERE ct.class_id = c.id) as teacher_names
        FROM classes c ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'inactive' THEN 2 END, c.name ASC`;

      submissions = await sql`
        SELECT s.*, u.username, u.name as student_name, c.name as class_name
        FROM submissions s JOIN users u ON s.student_id = u.id JOIN classes c ON s.class_id = c.id
        ORDER BY s.submitted_at DESC LIMIT 20`;

      gradedFiles = await sql`
        SELECT g.*, u.username, u.name as student_name, c.name as class_name
        FROM graded_files g JOIN users u ON g.student_id = u.id JOIN classes c ON g.class_id = c.id
        ORDER BY g.uploaded_at DESC LIMIT 20`;

      teachers = await sql`SELECT u.id, u.username, u.name, u.created_at,
        (SELECT COUNT(*) FROM class_teachers ct WHERE ct.teacher_id = u.id) as class_count
        FROM users u WHERE u.role = 'teacher' ORDER BY u.created_at DESC`;

      const ecRow = await sql`SELECT COUNT(*) as cnt FROM class_enrollments WHERE status = 'active'`;
      enrollmentCount = parseInt(ecRow[0].cnt, 10);
      const usRow = await sql`SELECT COUNT(DISTINCT student_id) as cnt FROM class_enrollments WHERE status = 'active'`;
      uniqueStudentCount = parseInt(usRow[0].cnt, 10);
    }

    res.render('admin-dashboard', { classes, submissions, gradedFiles, teachers, userRole, userId, enrollmentCount, uniqueStudentCount, user: req.session.user, isAdminLike: isAdminLike(userRole) });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).send('서버 오류');
  }
});

// ======= 강사 관리 전용 페이지 (admin only) =======

router.get('/teachers', requireAdminLike, async (req, res) => {
  try {
    const userRole = req.session.user.role;
    const teachers = await sql`SELECT u.id, u.username, u.name, u.created_at,
      (SELECT STRING_AGG(c.name, ', ') FROM class_teachers ct JOIN classes c ON ct.class_id = c.id WHERE ct.teacher_id = u.id) as class_names,
      (SELECT COUNT(*) FROM class_teachers ct WHERE ct.teacher_id = u.id) as class_count
      FROM users u WHERE u.role = 'teacher' ORDER BY u.created_at DESC`;

    let subadmins = [];
    if (userRole === 'admin') {
      subadmins = await sql`SELECT u.id, u.username, u.name, u.created_at
        FROM users u WHERE u.role = 'subadmin' ORDER BY u.created_at DESC`;
    }

    res.render('admin-teachers', { teachers, subadmins, userRole, user: req.session.user });
  } catch (err) {
    console.error('Teachers page error:', err);
    res.status(500).send('서버 오류');
  }
});

// ======= 최근 과제 제출 전용 페이지 =======

router.get('/submissions', requireAdmin, async (req, res) => {
  try {
    const userRole = req.session.user.role;
    const userId = req.session.user.id;
    const showAll = req.query.all === '1';
    const limit = showAll ? 10000 : 100;

    let submissions;
    if (userRole === 'teacher') {
      const classIds = await getTeacherClassIds(userId);
      if (classIds.length > 0) {
        submissions = await sql`
          SELECT s.*, u.username, u.name as student_name, c.name as class_name
          FROM submissions s JOIN users u ON s.student_id = u.id JOIN classes c ON s.class_id = c.id
          WHERE s.class_id = ANY(${classIds})
          ORDER BY s.submitted_at DESC LIMIT ${limit}`;
      } else {
        submissions = [];
      }
    } else {
      submissions = await sql`
        SELECT s.*, u.username, u.name as student_name, c.name as class_name
        FROM submissions s JOIN users u ON s.student_id = u.id JOIN classes c ON s.class_id = c.id
        ORDER BY s.submitted_at DESC LIMIT ${limit}`;
    }

    res.render('admin-submissions', { submissions, showAll, userRole, user: req.session.user });
  } catch (err) {
    console.error('Submissions page error:', err);
    res.status(500).send('서버 오류');
  }
});

// ======= 최근 채점 업로드 전용 페이지 =======

router.get('/graded', requireAdmin, async (req, res) => {
  try {
    const userRole = req.session.user.role;
    const userId = req.session.user.id;
    const showAll = req.query.all === '1';
    const limit = showAll ? 10000 : 100;

    let gradedFiles;
    if (userRole === 'teacher') {
      const classIds = await getTeacherClassIds(userId);
      if (classIds.length > 0) {
        gradedFiles = await sql`
          SELECT g.*, u.username, u.name as student_name, c.name as class_name
          FROM graded_files g JOIN users u ON g.student_id = u.id JOIN classes c ON g.class_id = c.id
          WHERE g.class_id = ANY(${classIds})
          ORDER BY g.uploaded_at DESC LIMIT ${limit}`;
      } else {
        gradedFiles = [];
      }
    } else {
      gradedFiles = await sql`
        SELECT g.*, u.username, u.name as student_name, c.name as class_name
        FROM graded_files g JOIN users u ON g.student_id = u.id JOIN classes c ON g.class_id = c.id
        ORDER BY g.uploaded_at DESC LIMIT ${limit}`;
    }

    res.render('admin-graded', { gradedFiles, showAll, userRole, user: req.session.user });
  } catch (err) {
    console.error('Graded page error:', err);
    res.status(500).send('서버 오류');
  }
});

// ======= 통계 페이지 =======

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const userRole = req.session.user.role;
    const userId = req.session.user.id;

    let activeClassCount = 0, uniqueStudentCount = 0, enrollmentCount = 0, teacherCount = 0;

    if (userRole === 'teacher') {
      const classIds = await getTeacherClassIds(userId);
      activeClassCount = classIds.length;
      if (classIds.length > 0) {
        const ecRow = await sql`SELECT COUNT(*) as cnt FROM class_enrollments WHERE class_id = ANY(${classIds}) AND status = 'active'`;
        enrollmentCount = parseInt(ecRow[0].cnt, 10);
        const usRow = await sql`SELECT COUNT(DISTINCT student_id) as cnt FROM class_enrollments WHERE class_id = ANY(${classIds}) AND status = 'active'`;
        uniqueStudentCount = parseInt(usRow[0].cnt, 10);
      }
    } else {
      const acRow = await sql`SELECT COUNT(*) as cnt FROM classes WHERE status = 'active'`;
      activeClassCount = parseInt(acRow[0].cnt, 10);
      const ecRow = await sql`SELECT COUNT(*) as cnt FROM class_enrollments WHERE status = 'active'`;
      enrollmentCount = parseInt(ecRow[0].cnt, 10);
      const usRow = await sql`SELECT COUNT(DISTINCT student_id) as cnt FROM class_enrollments WHERE status = 'active'`;
      uniqueStudentCount = parseInt(usRow[0].cnt, 10);
      const tcRow = await sql`SELECT COUNT(*) as cnt FROM users WHERE role = 'teacher'`;
      teacherCount = parseInt(tcRow[0].cnt, 10);
    }

    // 수업별 현황
    let classStats;
    if (userRole === 'teacher') {
      const classIds = await getTeacherClassIds(userId);
      if (classIds.length > 0) {
        classStats = await sql`SELECT c.id, c.name, c.type, c.status,
          (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id AND ce.status = 'active') as student_count,
          (SELECT COUNT(*) FROM submissions s WHERE s.class_id = c.id) as submission_count,
          (SELECT COUNT(*) FROM graded_files g WHERE g.class_id = c.id) as graded_count,
          (SELECT ROUND(AVG(cs2.score)::numeric, 1) FROM class_scores cs2 WHERE cs2.class_id = c.id) as avg_score
          FROM classes c WHERE c.id = ANY(${classIds}) ORDER BY c.status ASC, c.name ASC`;
      } else {
        classStats = [];
      }
    } else {
      classStats = await sql`SELECT c.id, c.name, c.type, c.status,
        (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id AND ce.status = 'active') as student_count,
        (SELECT COUNT(*) FROM submissions s WHERE s.class_id = c.id) as submission_count,
        (SELECT COUNT(*) FROM graded_files g WHERE g.class_id = c.id) as graded_count,
        (SELECT ROUND(AVG(cs2.score)::numeric, 1) FROM class_scores cs2 WHERE cs2.class_id = c.id) as avg_score
        FROM classes c ORDER BY c.status ASC, c.name ASC`;
    }

    // 점수 통계
    let scoreStats;
    if (userRole === 'teacher') {
      const classIds = await getTeacherClassIds(userId);
      if (classIds.length > 0) {
        scoreStats = await sql`SELECT c.name,
          ROUND(AVG(cs2.score)::numeric, 1) as avg_score,
          MIN(cs2.score) as min_score,
          MAX(cs2.score) as max_score,
          COUNT(cs2.score) as score_count
          FROM class_scores cs2 JOIN classes c ON cs2.class_id = c.id
          WHERE cs2.class_id = ANY(${classIds})
          GROUP BY cs2.class_id, c.name ORDER BY c.name`;
      } else {
        scoreStats = [];
      }
    } else {
      scoreStats = await sql`SELECT c.name,
        ROUND(AVG(cs2.score)::numeric, 1) as avg_score,
        MIN(cs2.score) as min_score,
        MAX(cs2.score) as max_score,
        COUNT(cs2.score) as score_count
        FROM class_scores cs2 JOIN classes c ON cs2.class_id = c.id
        GROUP BY cs2.class_id, c.name ORDER BY c.name`;
    }

    // 월별 트렌드
    const monthlyTrend = [];
    if (userRole === 'teacher') {
      const classIds = await getTeacherClassIds(userId);
      if (classIds.length > 0) {
        const subTrend = await sql`SELECT
          TO_CHAR(s.submitted_at, 'YYYY-MM') as month,
          COUNT(*) as submission_count, 0 as graded_count
          FROM submissions s WHERE s.class_id = ANY(${classIds})
          GROUP BY month ORDER BY month DESC LIMIT 6`;
        subTrend.forEach(r => monthlyTrend.push(r));

        const grTrend = await sql`SELECT
          TO_CHAR(g.uploaded_at, 'YYYY-MM') as month,
          COUNT(*) as graded_count
          FROM graded_files g WHERE g.class_id = ANY(${classIds})
          GROUP BY month ORDER BY month DESC LIMIT 6`;
        grTrend.forEach(row => {
          const existing = monthlyTrend.find(m => m.month === row.month);
          if (existing) existing.graded_count = row.graded_count;
          else monthlyTrend.push({ month: row.month, submission_count: 0, graded_count: row.graded_count });
        });
      }
    } else {
      const subTrend = await sql`SELECT
        TO_CHAR(s.submitted_at, 'YYYY-MM') as month,
        COUNT(*) as submission_count, 0 as graded_count
        FROM submissions s
        GROUP BY month ORDER BY month DESC LIMIT 6`;
      subTrend.forEach(r => monthlyTrend.push(r));

      const grTrend = await sql`SELECT
        TO_CHAR(g.uploaded_at, 'YYYY-MM') as month,
        COUNT(*) as graded_count
        FROM graded_files g
        GROUP BY month ORDER BY month DESC LIMIT 6`;
      grTrend.forEach(row => {
        const existing = monthlyTrend.find(m => m.month === row.month);
        if (existing) existing.graded_count = row.graded_count;
        else monthlyTrend.push({ month: row.month, submission_count: 0, graded_count: row.graded_count });
      });
    }
    monthlyTrend.sort((a, b) => a.month.localeCompare(b.month));

    res.render('admin-stats', { activeClassCount, uniqueStudentCount, enrollmentCount, teacherCount, classStats, scoreStats, monthlyTrend, userRole, user: req.session.user, isAdminLike: isAdminLike(userRole) });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).send('서버 오류');
  }
});

// ======= 프로필 편집 =======

// GET /admin/profile
router.get('/profile', requireAdmin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    const rows = await sql`SELECT id, username, name, role FROM users WHERE id = ${userId}`;
    if (rows.length === 0) return res.redirect('/management');
    res.render('admin-profile', { profile: rows[0], userRole, user: req.session.user, message: null, error: null });
  } catch (err) {
    console.error('Profile page error:', err);
    res.status(500).send('서버 오류');
  }
});

// POST /admin/profile
router.post('/profile', requireAdmin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    const newUsername = (req.body.username || '').trim();
    const newName = (req.body.name || '').trim();
    const currentPassword = req.body.current_password || '';
    const newPassword = req.body.new_password || '';

    const rows = await sql`SELECT * FROM users WHERE id = ${userId}`;
    if (rows.length === 0) return res.redirect('/management');
    const currentUser = rows[0];

    // Validate
    if (!newUsername || !newName) {
      return res.render('admin-profile', { profile: currentUser, userRole, user: req.session.user, message: null, error: '아이디와 이름은 필수입니다.' });
    }

    // Check username uniqueness
    if (newUsername !== currentUser.username) {
      const existing = await sql`SELECT id FROM users WHERE username = ${newUsername}`;
      if (existing.length > 0) {
        return res.render('admin-profile', { profile: currentUser, userRole, user: req.session.user, message: null, error: '이미 존재하는 아이디입니다.' });
      }
    }

    // Password change
    if (newPassword) {
      if (!currentPassword) {
        return res.render('admin-profile', { profile: currentUser, userRole, user: req.session.user, message: null, error: '비밀번호 변경 시 현재 비밀번호를 입력해주세요.' });
      }
      if (!bcrypt.compareSync(currentPassword, currentUser.password)) {
        return res.render('admin-profile', { profile: currentUser, userRole, user: req.session.user, message: null, error: '현재 비밀번호가 올바르지 않습니다.' });
      }
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      await sql`UPDATE users SET username = ${newUsername}, name = ${newName}, password = ${hashedPassword} WHERE id = ${userId}`;
    } else {
      await sql`UPDATE users SET username = ${newUsername}, name = ${newName} WHERE id = ${userId}`;
    }

    // Update session
    req.session.user.username = newUsername;
    req.session.user.name = newName;

    const updatedUser = { ...currentUser, username: newUsername, name: newName };
    res.render('admin-profile', { profile: updatedUser, userRole, user: req.session.user, message: '프로필이 수정되었습니다.', error: null });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).send('서버 오류');
  }
});

// ======= 학생 목록 =======

router.get('/:username/students-list', requireAdmin, async (req, res) => {
  if (req.params.username !== req.session.user.username) {
    return res.redirect(`${req.baseUrl}/${req.session.user.username}/students-list`);
  }
  try {
    const userRole = req.session.user.role;
    const userId = req.session.user.id;

    let students;
    if (userRole === 'teacher') {
      const studentIds = await getTeacherStudentIds(userId);
      if (studentIds.length > 0) {
        students = await sql`SELECT id, username, name, name_en, school, gender, grade FROM users WHERE role = 'student' AND id = ANY(${studentIds}) ORDER BY username`;
      } else {
        students = [];
      }
    } else {
      students = await sql`SELECT id, username, name, name_en, school, gender, grade FROM users WHERE role = 'student' ORDER BY username`;
    }

    res.render('admin-students-list', { students, userRole, user: req.session.user });
  } catch (err) {
    console.error('Students list error:', err);
    res.status(500).send('서버 오류');
  }
});

// GET /admin/students - 학생 목록 JSON
router.get('/students', requireAdmin, async (req, res) => {
  try {
    const userRole = req.session.user.role;
    const userId = req.session.user.id;

    let students;
    if (userRole === 'teacher') {
      const studentIds = await getTeacherStudentIds(userId);
      if (studentIds.length > 0) {
        students = await sql`SELECT id, username, name, name_en, school, gender FROM users WHERE role = 'student' AND id = ANY(${studentIds}) ORDER BY username`;
      } else {
        students = [];
      }
    } else {
      students = await sql`SELECT id, username, name, name_en, school, gender FROM users WHERE role = 'student' ORDER BY username`;
    }
    res.json(students);
  } catch (err) {
    console.error('Students JSON error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ======= 수업 관리 =======

// GET /admin/classes-list - 수업 목록 (분반 팝업용)
router.get('/classes-list', requireAdmin, async (req, res) => {
  try {
    const classes = await sql`SELECT id, name, type, status FROM classes ORDER BY name`;
    res.json({ success: true, classes });
  } catch (err) {
    console.error('Classes list error:', err);
    res.json({ success: false, classes: [] });
  }
});

// POST /admin/classes - 수업 생성 (admin + subadmin)
router.post('/classes', requireAdminLike, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const type = req.body.type || 'regular';

    if (!name) return res.status(400).json({ error: '수업 이름을 입력해주세요.' });
    if (!['regular', 'team', 'private'].includes(type)) return res.status(400).json({ error: '유효하지 않은 수업 유형입니다.' });

    const result = await sql`INSERT INTO classes (name, type) VALUES (${name}, ${type}) RETURNING id`;
    res.json({ success: true, classId: result[0].id });
  } catch (err) {
    console.error('Create class error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// GET /admin/class/:id - 수업 관리 페이지
router.get('/class/:id', requireAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    const userRole = req.session.user.role;
    const userId = req.session.user.id;

    if (!(await canAccessClass(userId, userRole, classId))) {
      return res.status(403).send('접근 권한이 없습니다.');
    }

    const clsRows = await sql`SELECT * FROM classes WHERE id = ${classId}`;
    if (clsRows.length === 0) return res.status(404).send('수업을 찾을 수 없습니다.');
    const cls = clsRows[0];

    const students = await sql`
      SELECT u.id, u.username, u.name, u.name_en, u.school, u.grade, ce.status as enrollment_status
      FROM class_enrollments ce JOIN users u ON ce.student_id = u.id
      WHERE ce.class_id = ${classId}
      ORDER BY ce.status ASC, u.username ASC`;

    const classTeachers = await sql`
      SELECT u.id, u.username, u.name
      FROM class_teachers ct JOIN users u ON ct.teacher_id = u.id
      WHERE ct.class_id = ${classId}`;

    const submissions = await sql`
      SELECT s.*, u.username, u.name as student_name
      FROM submissions s JOIN users u ON s.student_id = u.id
      WHERE s.class_id = ${classId}
      ORDER BY s.submitted_at DESC`;

    const gradedFiles = await sql`
      SELECT g.*, u.username, u.name as student_name, uploader.name as uploader_name
      FROM graded_files g
      JOIN users u ON g.student_id = u.id
      JOIN users uploader ON g.uploaded_by = uploader.id
      WHERE g.class_id = ${classId}
      ORDER BY g.uploaded_at DESC`;

    const classSchedules = await sql`SELECT id, schedule_date, description, start_time FROM class_schedules WHERE class_id = ${classId} ORDER BY schedule_date, start_time, id`;

    // 점수 데이터
    const scoreData = {};
    students.forEach(s => { scoreData[s.id] = {}; });
    const scoreRows = await sql`SELECT * FROM class_scores WHERE class_id = ${classId} ORDER BY student_id, schedule_id`;
    scoreRows.forEach(row => {
      if (!scoreData[row.student_id]) scoreData[row.student_id] = {};
      scoreData[row.student_id][row.schedule_id] = row.score;
    });

    let allTeachers = [];
    if (isAdminLike(userRole)) {
      allTeachers = await sql`SELECT id, username, name FROM users WHERE role = 'teacher' ORDER BY username`;
    }

    const textbooks = await sql`SELECT ct.*, u.name as uploader_name FROM class_textbooks ct JOIN users u ON ct.uploaded_by = u.id WHERE ct.class_id = ${classId} ORDER BY ct.uploaded_at DESC`;

    res.render('admin-class', { cls, students, classTeachers, submissions, gradedFiles, scoreData, classSchedules, allTeachers, textbooks, userRole, userId, isAdminLike: isAdminLike(userRole) });
  } catch (err) {
    console.error('Admin class error:', err);
    res.status(500).send('서버 오류');
  }
});

// POST /admin/class/:id/edit - 수업 수정
router.post('/class/:id/edit', requireAdminLike, async (req, res) => {
  try {
    const classId = req.params.id;
    const name = (req.body.name || '').trim();
    const type = req.body.type || 'regular';
    let status = req.body.status || 'active';
    if (!['active', 'inactive', 'upcoming'].includes(status)) status = 'active';

    if (!name) return res.status(400).json({ error: '수업 이름을 입력해주세요.' });

    await sql`UPDATE classes SET name = ${name}, type = ${type}, status = ${status} WHERE id = ${classId}`;
    res.json({ success: true });
  } catch (err) {
    console.error('Edit class error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/class/:id/notes - 비고 저장
router.post('/class/:id/notes', requireAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    if (!(await canAccessClass(req.session.user.id, req.session.user.role, classId))) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }

    const notes = (req.body.notes || '').trim();
    await sql`UPDATE classes SET notes = ${notes} WHERE id = ${classId}`;
    res.json({ success: true });
  } catch (err) {
    console.error('Notes error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/class/:id/textbook - 교재 업로드 (복수 파일 지원)
router.post('/class/:id/textbook', requireAdmin, (req, res) => {
  const classId = parseInt(req.params.id, 10);
  const userId = req.session.user.id;

  upload.array('files', 10)(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: '최대 10개 파일까지 업로드 가능합니다.' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: '파일을 선택해주세요.' });

    try {
      if (!(await canAccessClass(userId, req.session.user.role, classId))) {
        return res.status(403).json({ error: '접근 권한이 없습니다.' });
      }

      // 수업 이름 조회
      const clsRows = await sql`SELECT name FROM classes WHERE id = ${classId}`;
      const className = clsRows.length > 0 ? sanitizeName(clsRows[0].name) : `class_${classId}`;

      for (const file of req.files) {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const desiredPath = `uploads/class/${className}/classmaterial/${originalName}`;
        const uniquePath = await getUniquePath(desiredPath);
        const driveFileId = await uploadFileDirect(file.buffer, uniquePath, file.mimetype);
        await sql`INSERT INTO class_textbooks (class_id, uploaded_by, file_name, file_path) VALUES (${classId}, ${userId}, ${originalName}, ${driveFileId})`;
      }

      res.json({ success: true, count: req.files.length });
    } catch (uploadErr) {
      console.error('Textbook upload error:', uploadErr);
      res.status(500).json({ error: '파일 업로드에 실패했습니다.' });
    }
  });
});

// POST /admin/class/:id/textbook/:tid/delete - 교재 삭제
router.post('/class/:id/textbook/:tid/delete', requireAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    const tid = parseInt(req.params.tid, 10);

    if (!(await canAccessClass(req.session.user.id, req.session.user.role, classId))) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }

    const rows = await sql`SELECT * FROM class_textbooks WHERE id = ${tid} AND class_id = ${classId}`;
    if (rows.length === 0) return res.status(404).json({ error: '교재를 찾을 수 없습니다.' });

    try { await deleteFile(rows[0].file_path); } catch (e) { console.error('Textbook file delete error:', e); }
    await sql`DELETE FROM class_textbooks WHERE id = ${tid}`;
    res.json({ success: true });
  } catch (err) {
    console.error('Textbook delete error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/class/:id/delete - 수업 삭제 (cascade)
router.post('/class/:id/delete', requireAdminLike, async (req, res) => {
  try {
    const classId = req.params.id;
    await sql`DELETE FROM textbook_downloads WHERE textbook_id IN (SELECT id FROM class_textbooks WHERE class_id = ${classId})`;
    await sql`DELETE FROM class_textbooks WHERE class_id = ${classId}`;
    await sql`DELETE FROM class_scores WHERE class_id = ${classId}`;
    await sql`DELETE FROM class_schedules WHERE class_id = ${classId}`;
    await sql`DELETE FROM graded_files WHERE class_id = ${classId}`;
    await sql`DELETE FROM submissions WHERE class_id = ${classId}`;
    await sql`DELETE FROM class_enrollments WHERE class_id = ${classId}`;
    await sql`DELETE FROM class_teachers WHERE class_id = ${classId}`;
    await sql`DELETE FROM classes WHERE id = ${classId}`;
    res.json({ success: true });
  } catch (err) {
    console.error('Delete class error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ======= 수업 일정 =======

// GET /admin/class/:id/schedules - 월별 일정 조회
router.get('/class/:id/schedules', requireAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    if (!(await canAccessClass(req.session.user.id, req.session.user.role, classId))) {
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

    const offsetRows = await sql`SELECT COUNT(*) as cnt FROM class_schedules WHERE class_id = ${classId} AND schedule_date < ${startDate}`;
    const seqOffset = parseInt(offsetRows[0].cnt, 10);

    const schedules = await sql`
      SELECT * FROM class_schedules WHERE class_id = ${classId} AND schedule_date >= ${startDate} AND schedule_date < ${endDate}
      ORDER BY schedule_date, start_time, id`;

    schedules.forEach((s, i) => { s.seq = seqOffset + i + 1; });
    res.json(schedules);
  } catch (err) {
    console.error('Schedules error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// Helper: 같은 강사의 다른 수업과 시간 겹침 체크
async function checkTeacherOverlap(classId, dates, startTime, endTime, excludeScheduleId) {
  if (!startTime || !endTime) return [];
  const teacherRows = await sql`SELECT teacher_id FROM class_teachers WHERE class_id = ${classId}`;
  const teacherIds = teacherRows.map(r => r.teacher_id);
  if (teacherIds.length === 0) return [];

  const otherClassRows = await sql`SELECT DISTINCT class_id FROM class_teachers WHERE teacher_id = ANY(${teacherIds}) AND class_id != ${classId}`;
  const otherClassIds = otherClassRows.map(r => r.class_id);
  if (otherClassIds.length === 0) return [];

  let conflicts;
  if (excludeScheduleId) {
    conflicts = await sql`SELECT cs.*, c.name as class_name FROM class_schedules cs
      JOIN classes c ON cs.class_id = c.id
      WHERE cs.class_id = ANY(${otherClassIds}) AND cs.schedule_date = ANY(${dates})
      AND cs.start_time < ${endTime} AND cs.end_time > ${startTime} AND cs.id != ${excludeScheduleId}`;
  } else {
    conflicts = await sql`SELECT cs.*, c.name as class_name FROM class_schedules cs
      JOIN classes c ON cs.class_id = c.id
      WHERE cs.class_id = ANY(${otherClassIds}) AND cs.schedule_date = ANY(${dates})
      AND cs.start_time < ${endTime} AND cs.end_time > ${startTime}`;
  }
  return conflicts;
}

// POST /admin/class/:id/schedules - 일정 추가 (반복 지원)
router.post('/class/:id/schedules', requireAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    if (!(await canAccessClass(req.session.user.id, req.session.user.role, classId))) {
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

    const dates = [];
    for (let i = 0; i < totalCount; i++) {
      const d = new Date(scheduleDate);
      d.setDate(d.getDate() + i * 7);
      dates.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    }

    if (!forceOverlap && startTime && endTime) {
      const conflicts = await checkTeacherOverlap(classId, dates, startTime, endTime);
      if (conflicts.length > 0) {
        const msgs = conflicts.map(c => `${c.schedule_date} ${c.start_time}~${c.end_time} [${c.class_name}]`);
        return res.json({ success: false, overlap: true, conflicts: msgs });
      }
    }

    const ids = [];
    for (const dateStr of dates) {
      const result = await sql`INSERT INTO class_schedules (class_id, schedule_date, start_time, end_time, description) VALUES (${classId}, ${dateStr}, ${startTime}, ${endTime}, ${description}) RETURNING id`;
      ids.push(result[0].id);
    }

    res.json({ success: true, id: ids[0], count: ids.length });
  } catch (err) {
    console.error('Add schedule error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/class/:id/schedules/:sid/edit - 일정 수정
router.post('/class/:id/schedules/:sid/edit', requireAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    const sid = parseInt(req.params.sid, 10);

    if (!(await canAccessClass(req.session.user.id, req.session.user.role, classId))) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }

    const startTime = (req.body.start_time || '').trim();
    const endTime = (req.body.end_time || '').trim();
    const description = (req.body.description || '').trim();
    const forceOverlap = req.body.force_overlap === true;

    if (!forceOverlap && startTime && endTime) {
      const dRows = await sql`SELECT schedule_date FROM class_schedules WHERE id = ${sid} AND class_id = ${classId}`;
      if (dRows.length > 0) {
        const conflicts = await checkTeacherOverlap(classId, [dRows[0].schedule_date], startTime, endTime, sid);
        if (conflicts.length > 0) {
          const msgs = conflicts.map(c => `${c.schedule_date} ${c.start_time}~${c.end_time} [${c.class_name}]`);
          return res.json({ success: false, overlap: true, conflicts: msgs });
        }
      }
    }

    await sql`UPDATE class_schedules SET start_time = ${startTime}, end_time = ${endTime}, description = ${description} WHERE id = ${sid} AND class_id = ${classId}`;
    res.json({ success: true });
  } catch (err) {
    console.error('Edit schedule error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/class/:id/schedules/:sid/delete - 일정 삭제
router.post('/class/:id/schedules/:sid/delete', requireAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    const sid = parseInt(req.params.sid, 10);

    if (!(await canAccessClass(req.session.user.id, req.session.user.role, classId))) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }

    await sql`DELETE FROM class_schedules WHERE id = ${sid} AND class_id = ${classId}`;
    res.json({ success: true });
  } catch (err) {
    console.error('Delete schedule error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/class/:id/enroll - 학생 등록
router.post('/class/:id/enroll', requireAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    const studentId = req.body.student_id;

    if (!(await canAccessClass(req.session.user.id, req.session.user.role, classId))) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }

    if (!studentId) return res.status(400).json({ error: '학생을 선택해주세요.' });

    // 개인 수업은 학생 1명만 등록 가능
    const typeRows = await sql`SELECT type FROM classes WHERE id = ${classId}`;
    if (typeRows.length > 0 && typeRows[0].type === 'private') {
      const cntRows = await sql`SELECT COUNT(*) as cnt FROM class_enrollments WHERE class_id = ${classId} AND status = 'active'`;
      const alreadyRows = await sql`SELECT id FROM class_enrollments WHERE class_id = ${classId} AND student_id = ${studentId} AND status = 'active'`;
      if (parseInt(cntRows[0].cnt, 10) >= 1 && alreadyRows.length === 0) {
        return res.status(400).json({ error: '개인 수업은 학생을 1명만 등록할 수 있습니다.' });
      }
    }

    // Check existing enrollment
    const existing = await sql`SELECT id, status FROM class_enrollments WHERE class_id = ${classId} AND student_id = ${studentId}`;
    if (existing.length > 0) {
      if (existing[0].status === 'active') {
        return res.status(400).json({ error: '이미 등록된 학생입니다.' });
      }
      await sql`UPDATE class_enrollments SET status = 'active' WHERE id = ${existing[0].id}`;
    } else {
      await sql`INSERT INTO class_enrollments (class_id, student_id) VALUES (${classId}, ${studentId})`;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Enroll error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/class/:id/unenroll - 학생 등록 해제
router.post('/class/:id/unenroll', requireAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    const studentId = req.body.student_id;

    if (!(await canAccessClass(req.session.user.id, req.session.user.role, classId))) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }

    await sql`UPDATE class_enrollments SET status = 'dropped' WHERE class_id = ${classId} AND student_id = ${studentId}`;
    res.json({ success: true });
  } catch (err) {
    console.error('Unenroll error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/class/:id/upload - 채점 파일 업로드 (수업 내 자동매칭)
router.post('/class/:id/upload', requireAdmin, async (req, res) => {
  const classId = parseInt(req.params.id, 10);

  if (!(await canAccessClass(req.session.user.id, req.session.user.role, classId))) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  upload.array('files', 30)(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: '최대 30개 파일까지 업로드 가능합니다.' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '파일을 선택해주세요.' });
    }

    try {
      const uploaderId = req.session.user.id;

      const enrolledStudents = await sql`
        SELECT u.id, u.username FROM class_enrollments ce
        JOIN users u ON ce.student_id = u.id
        WHERE ce.class_id = ${classId} AND ce.status = 'active'`;

      // 수업 이름 조회
      const clsRows = await sql`SELECT name FROM classes WHERE id = ${classId}`;
      const className = clsRows.length > 0 ? sanitizeName(clsRows[0].name) : `class_${classId}`;
      const dateStr = getKSTDateString();

      const results = [];

      for (const file of req.files) {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const matches = originalName.match(/\d{4}/g);

        if (!matches) {
          results.push({ file: originalName, success: false, error: '파일명에 4자리 숫자가 없습니다 (예: 0014_채점.pdf)' });
          continue;
        }

        const matchedStudents = [];
        const uniqueNums = [...new Set(matches)];
        for (const numStr of uniqueNums) {
          const username = `student${numStr}`;
          const found = enrolledStudents.find(s => s.username === username);
          if (found) matchedStudents.push(found);
        }

        if (matchedStudents.length > 1) {
          results.push({ file: originalName, success: false, error: '대응되는 학생을 특정할 수 없습니다', errorType: 'ambiguous' });
          continue;
        }

        if (matchedStudents.length === 1) {
          const student = matchedStudents[0];
          const ext = path.extname(originalName).toLowerCase() || '.pdf';
          const desiredPath = `uploads/class/${className}/hwfeedback/${dateStr}${student.username}${ext}`;
          const uniquePath = await getUniquePath(desiredPath);
          const driveFileId = await uploadFileDirect(file.buffer, uniquePath, file.mimetype);

          await sql`INSERT INTO graded_files (class_id, student_id, uploaded_by, file_name, file_path, is_new) VALUES (${classId}, ${student.id}, ${uploaderId}, ${originalName}, ${driveFileId}, 1)`;

          const userData = await sql`SELECT name, parent_phone, email FROM users WHERE id = ${student.id}`;
          if (userData.length > 0) {
            if (userData[0].parent_phone) notifyGradingComplete(userData[0].parent_phone, userData[0].name);
            if (userData[0].email) notifyGradingCompleteEmail(userData[0].email, userData[0].name);
          }

          results.push({ file: originalName, success: true, matched: student.username });
        } else {
          results.push({ file: originalName, success: false, error: `매칭되는 학생을 찾을 수 없습니다 (숫자: ${matches.join(', ')})` });
        }
      }

      res.json({ results });
    } catch (uploadErr) {
      console.error('Upload error:', uploadErr);
      res.status(500).json({ error: '파일 업로드에 실패했습니다.' });
    }
  });
});

// GET /admin/class/:id/file/:fileId - 과제 다운로드
router.get('/class/:id/file/:fileId', requireAdmin, async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM submissions WHERE id = ${req.params.fileId} AND class_id = ${req.params.id}`;
    if (rows.length === 0) return res.status(404).send('파일을 찾을 수 없습니다.');

    const file = rows[0];
    const { buffer, mimeType } = await downloadFile(file.file_path);
    const encodedName = encodeURIComponent(file.file_name);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.setHeader('Content-Type', mimeType);
    res.send(buffer);
  } catch (err) {
    console.error('File download error:', err);
    res.status(500).send('파일 다운로드에 실패했습니다.');
  }
});

// POST /admin/class/:id/scores - 점수 일괄 저장
router.post('/class/:id/scores', requireAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    const scores = req.body.scores;

    if (!(await canAccessClass(req.session.user.id, req.session.user.role, classId))) {
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

        const existing = await sql`SELECT id FROM class_scores WHERE class_id = ${classId} AND student_id = ${studentId} AND schedule_id = ${scheduleId}`;

        if (existing.length > 0) {
          if (score === null) {
            await sql`DELETE FROM class_scores WHERE id = ${existing[0].id}`;
          } else {
            await sql`UPDATE class_scores SET score = ${score}, updated_at = NOW() WHERE id = ${existing[0].id}`;
          }
        } else {
          if (score !== null) {
            await sql`INSERT INTO class_scores (class_id, student_id, schedule_id, score) VALUES (${classId}, ${studentId}, ${scheduleId}, ${score})`;
          }
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Scores error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/class/:id/teachers - 강사 배정
router.post('/class/:id/teachers', requireAdminLike, async (req, res) => {
  try {
    const classId = req.params.id;
    const teacherId = req.body.teacher_id;

    if (!teacherId) return res.status(400).json({ error: '강사를 선택해주세요.' });

    const existing = await sql`SELECT id FROM class_teachers WHERE class_id = ${classId} AND teacher_id = ${teacherId}`;
    if (existing.length > 0) return res.status(400).json({ error: '이미 배정된 강사입니다.' });

    await sql`INSERT INTO class_teachers (class_id, teacher_id) VALUES (${classId}, ${teacherId})`;
    res.json({ success: true });
  } catch (err) {
    console.error('Assign teacher error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/class/:id/teachers/:tid/remove - 강사 해제
router.post('/class/:id/teachers/:tid/remove', requireAdminLike, async (req, res) => {
  try {
    await sql`DELETE FROM class_teachers WHERE class_id = ${req.params.id} AND teacher_id = ${req.params.tid}`;
    res.json({ success: true });
  } catch (err) {
    console.error('Remove teacher error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// GET /admin/class/:id/students - 수업 학생 JSON
router.get('/class/:id/students', requireAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    if (!(await canAccessClass(req.session.user.id, req.session.user.role, classId))) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }

    const students = await sql`
      SELECT u.id, u.username, u.name, u.name_en, u.school, ce.status
      FROM class_enrollments ce JOIN users u ON ce.student_id = u.id
      WHERE ce.class_id = ${classId}
      ORDER BY u.username`;
    res.json(students);
  } catch (err) {
    console.error('Class students error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// GET /admin/class/:id/teachers - 수업 강사 JSON
router.get('/class/:id/teachers', requireAdmin, async (req, res) => {
  try {
    const teachers = await sql`
      SELECT u.id, u.username, u.name
      FROM class_teachers ct JOIN users u ON ct.teacher_id = u.id
      WHERE ct.class_id = ${req.params.id}`;
    res.json(teachers);
  } catch (err) {
    console.error('Class teachers error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ======= 학생 상세 =======

router.get('/student/:id', requireAdmin, async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    const userRole = req.session.user.role;
    const userId = req.session.user.id;

    if (userRole === 'teacher') {
      const myStudentIds = await getTeacherStudentIds(userId);
      if (!myStudentIds.includes(studentId)) {
        return res.status(403).send('접근 권한이 없습니다.');
      }
    }

    const userRows = await sql`SELECT * FROM users WHERE id = ${studentId} AND role = 'student'`;
    if (userRows.length === 0) return res.status(404).send('학생을 찾을 수 없습니다.');
    const student = userRows[0];

    const classes = await sql`
      SELECT c.id, c.name, c.type, ce.status
      FROM class_enrollments ce JOIN classes c ON ce.class_id = c.id
      WHERE ce.student_id = ${studentId}
      ORDER BY ce.status ASC, c.name ASC`;

    const feedbacks = await sql`
      SELECT sf.*, u.name as author_name
      FROM student_feedbacks sf JOIN users u ON sf.author_id = u.id
      WHERE sf.student_id = ${studentId}
      ORDER BY sf.created_at DESC`;

    let consultations = [];
    if (isAdminLike(userRole)) {
      consultations = await sql`
        SELECT sc.*, u.name as author_name
        FROM student_consultations sc JOIN users u ON sc.author_id = u.id
        WHERE sc.student_id = ${studentId}
        ORDER BY sc.created_at DESC`;
    }

    res.render('admin-student', { student, classes, feedbacks, consultations, userRole, user: req.session.user, isAdminLike: isAdminLike(userRole) });
  } catch (err) {
    console.error('Student detail error:', err);
    res.status(500).send('서버 오류');
  }
});

// POST /admin/student/:id/feedback
router.post('/student/:id/feedback', requireAdmin, async (req, res) => {
  try {
    const content = (req.body.content || '').trim();
    if (!content) return res.status(400).json({ error: '피드백 내용을 입력해주세요.' });

    await sql`INSERT INTO student_feedbacks (student_id, author_id, content) VALUES (${req.params.id}, ${req.session.user.id}, ${content})`;
    res.json({ success: true });
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/feedback/:id/delete
router.post('/feedback/:id/delete', requireAdmin, async (req, res) => {
  try {
    await sql`DELETE FROM student_feedbacks WHERE id = ${req.params.id}`;
    res.json({ success: true });
  } catch (err) {
    console.error('Delete feedback error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/student/:id/consultation
router.post('/student/:id/consultation', requireAdmin, async (req, res) => {
  try {
    const content = (req.body.content || '').trim();
    if (!content) return res.status(400).json({ error: '상담기록 내용을 입력해주세요.' });

    await sql`INSERT INTO student_consultations (student_id, author_id, content) VALUES (${req.params.id}, ${req.session.user.id}, ${content})`;
    res.json({ success: true });
  } catch (err) {
    console.error('Consultation error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/consultation/:id/delete (admin + subadmin)
router.post('/consultation/:id/delete', requireAdminLike, async (req, res) => {
  try {
    await sql`DELETE FROM student_consultations WHERE id = ${req.params.id}`;
    res.json({ success: true });
  } catch (err) {
    console.error('Delete consultation error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/student/:id/delete - 학생 삭제 (소프트 삭제: role='deleted', 번호 보존)
router.post('/student/:id/delete', requireSuperAdmin, async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);

    const userRows = await sql`SELECT * FROM users WHERE id = ${studentId} AND role = 'student'`;
    if (userRows.length === 0) return res.status(404).json({ error: '학생을 찾을 수 없습니다.' });

    // 모든 수업 등록 해제
    await sql`UPDATE class_enrollments SET status = 'dropped' WHERE student_id = ${studentId}`;

    // 소프트 삭제 (username은 보존 → 번호 재사용 방지)
    await sql`UPDATE users SET role = 'deleted' WHERE id = ${studentId}`;

    res.json({ success: true });
  } catch (err) {
    console.error('Student delete error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ======= 강사 관리 (admin only) =======

// POST /admin/teachers - 강사/부원장 계정 생성 (admin only)
router.post('/teachers', requireSuperAdmin, async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const name = (req.body.name || '').trim();
    const password = req.body.password || '';
    const role = req.body.role === 'subadmin' ? 'subadmin' : 'teacher';

    if (!username || !name || !password) {
      return res.status(400).json({ error: '아이디, 이름, 비밀번호를 모두 입력해주세요.' });
    }

    const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
    if (existing.length > 0) return res.status(400).json({ error: '이미 존재하는 아이디입니다.' });

    const hashedPassword = bcrypt.hashSync(password, 10);
    await sql`INSERT INTO users (username, name, password, role) VALUES (${username}, ${name}, ${hashedPassword}, ${role})`;
    res.json({ success: true });
  } catch (err) {
    console.error('Create teacher error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/teachers/:id/delete (admin only)
router.post('/teachers/:id/delete', requireSuperAdmin, async (req, res) => {
  try {
    const teacherId = req.params.id;
    await sql`DELETE FROM class_teachers WHERE teacher_id = ${teacherId}`;
    await sql`DELETE FROM users WHERE id = ${teacherId} AND (role = 'teacher' OR role = 'subadmin')`;
    res.json({ success: true });
  } catch (err) {
    console.error('Delete teacher error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ======= 대시보드 일정 API =======

router.get('/dashboard-teachers', requireAdmin, async (req, res) => {
  try {
    const teachers = await sql`
      SELECT u.id, u.name FROM users u
      WHERE u.role IN ('admin','subadmin','teacher')
      ORDER BY u.name ASC`;
    res.json({ teachers });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

router.get('/dashboard-schedules', requireAdmin, async (req, res) => {
  try {
    const userRole = req.session.user.role;
    const userId = req.session.user.id;

    const startDate = (req.query.start || '').trim();
    const endDate = (req.query.end || '').trim();
    const teacherId = (req.query.teacher_id || '').trim();

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'start, end 파라미터가 필요합니다.' });
    }

    let schedules;
    if (userRole === 'teacher') {
      const classIds = await getTeacherClassIds(userId);
      if (classIds.length === 0) return res.json({ schedules: [] });
      schedules = await sql`SELECT cs.*, c.name as class_name FROM class_schedules cs JOIN classes c ON cs.class_id = c.id
        WHERE cs.schedule_date >= ${startDate} AND cs.schedule_date < ${endDate} AND cs.class_id = ANY(${classIds})
        ORDER BY cs.schedule_date, cs.start_time, cs.id`;
    } else if (teacherId === 'all') {
      schedules = await sql`SELECT cs.*, c.name as class_name FROM class_schedules cs JOIN classes c ON cs.class_id = c.id
        WHERE cs.schedule_date >= ${startDate} AND cs.schedule_date < ${endDate}
        ORDER BY cs.schedule_date, cs.start_time, cs.id`;
    } else if (teacherId && !isNaN(teacherId)) {
      const tClassIds = await getTeacherClassIds(parseInt(teacherId, 10));
      if (tClassIds.length === 0) return res.json({ schedules: [] });
      schedules = await sql`SELECT cs.*, c.name as class_name FROM class_schedules cs JOIN classes c ON cs.class_id = c.id
        WHERE cs.schedule_date >= ${startDate} AND cs.schedule_date < ${endDate} AND cs.class_id = ANY(${tClassIds})
        ORDER BY cs.schedule_date, cs.start_time, cs.id`;
    } else {
      // Default: 본인 담당 수업 (admin은 class_teachers에 없을 수 있으므로 빈 결과시 전체 fallback)
      const myClassIds = await getTeacherClassIds(userId);
      if (myClassIds.length > 0) {
        schedules = await sql`SELECT cs.*, c.name as class_name FROM class_schedules cs JOIN classes c ON cs.class_id = c.id
          WHERE cs.schedule_date >= ${startDate} AND cs.schedule_date < ${endDate} AND cs.class_id = ANY(${myClassIds})
          ORDER BY cs.schedule_date, cs.start_time, cs.id`;
      } else {
        schedules = await sql`SELECT cs.*, c.name as class_name FROM class_schedules cs JOIN classes c ON cs.class_id = c.id
          WHERE cs.schedule_date >= ${startDate} AND cs.schedule_date < ${endDate}
          ORDER BY cs.schedule_date, cs.start_time, cs.id`;
      }
    }

    res.json({ schedules });
  } catch (err) {
    console.error('Dashboard schedules error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ======= 시간표 페이지 (Schedule Pages) =======

router.get('/schedule-pages', requireAdmin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    const maxSlots = isAdminLike(userRole) ? 30 : 5;

    let myPages = [];
    let teacherPages = [];
    let pendingCount = 0;

    if (isAdminLike(userRole)) {
      myPages = await sql`SELECT sp.*, u.name as owner_name FROM schedule_pages sp JOIN users u ON sp.owner_id = u.id WHERE sp.owner_id = ${userId} ORDER BY sp.slot_number ASC`;
      teacherPages = await sql`SELECT sp.*, u.name as owner_name FROM schedule_pages sp JOIN users u ON sp.owner_id = u.id WHERE sp.owner_id != ${userId} ORDER BY CASE WHEN sp.status = 'pending' THEN 0 ELSE 1 END, sp.updated_at DESC`;
      pendingCount = teacherPages.filter(p => p.status === 'pending').length;
    } else {
      myPages = await sql`SELECT * FROM schedule_pages WHERE owner_id = ${userId} ORDER BY slot_number ASC`;
    }

    res.render('admin-schedule-list', {
      activePage: 'schedule-pages',
      userRole, userId, myPages, teacherPages, maxSlots, pendingCount
    });
  } catch (err) {
    console.error('Schedule pages error:', err);
    res.status(500).send('서버 오류');
  }
});

router.get('/schedule-pages/new', requireAdmin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    const maxSlots = isAdminLike(userRole) ? 30 : 5;

    const countRows = await sql`SELECT COUNT(*) as cnt FROM schedule_pages WHERE owner_id = ${userId}`;
    if (parseInt(countRows[0].cnt, 10) >= maxSlots) {
      return res.redirect(req.baseUrl + '/schedule-pages');
    }

    res.render('admin-schedule-editor', {
      activePage: 'schedule-pages', userRole, userId, pageId: null
    });
  } catch (err) {
    console.error('New schedule page error:', err);
    res.status(500).send('서버 오류');
  }
});

router.get('/schedule-pages/:id/edit', requireAdmin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    const pageId = req.params.id;

    const rows = await sql`SELECT * FROM schedule_pages WHERE id = ${pageId}`;
    if (rows.length === 0) return res.redirect(req.baseUrl + '/schedule-pages');
    const page = rows[0];

    if (!isAdminLike(userRole) && page.owner_id !== userId) {
      return res.redirect(req.baseUrl + '/schedule-pages');
    }

    res.render('admin-schedule-editor', {
      activePage: 'schedule-pages', userRole, userId, pageId: page.id
    });
  } catch (err) {
    console.error('Edit schedule page error:', err);
    res.status(500).send('서버 오류');
  }
});

router.get('/schedule-pages/:id/data', requireAdmin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;

    const rows = await sql`SELECT sp.*, u.name as owner_name FROM schedule_pages sp JOIN users u ON sp.owner_id = u.id WHERE sp.id = ${req.params.id}`;
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const page = rows[0];

    if (!isAdminLike(userRole) && page.owner_id !== userId) {
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
  } catch (err) {
    console.error('Schedule page data error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/schedule-pages - 새 페이지 생성
router.post('/schedule-pages', requireAdmin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    const maxSlots = isAdminLike(userRole) ? 30 : 5;
    let { title, slug, status, header_data, schedule_data, syllabus_data, theme_data } = req.body;

    if (!isAdminLike(userRole) && (status === 'published' || status === 'private')) {
      status = 'draft';
    }

    const slotRows = await sql`SELECT slot_number FROM schedule_pages WHERE owner_id = ${userId} ORDER BY slot_number ASC`;
    const usedSlots = new Set(slotRows.map(r => r.slot_number));

    let nextSlot = null;
    for (let i = 1; i <= maxSlots; i++) {
      if (!usedSlots.has(i)) { nextSlot = i; break; }
    }
    if (!nextSlot) {
      return res.status(400).json({ error: `슬롯이 가득 찼습니다 (최대 ${maxSlots}개)` });
    }

    if (slug) {
      const chk = await sql`SELECT id FROM schedule_pages WHERE slug = ${slug}`;
      if (chk.length > 0) return res.status(400).json({ error: '이미 사용 중인 slug입니다.' });
    }

    const result = await sql`INSERT INTO schedule_pages (owner_id, slot_number, title, slug, status, header_data, schedule_data, syllabus_data, theme_data)
      VALUES (${userId}, ${nextSlot}, ${title || ''}, ${slug || null}, ${status || 'draft'},
        ${JSON.stringify(header_data || {})}, ${JSON.stringify(schedule_data || {})},
        ${JSON.stringify(syllabus_data || {})}, ${JSON.stringify(theme_data || {})}) RETURNING id`;

    res.json({ success: true, id: result[0].id, slot_number: nextSlot });
  } catch (err) {
    console.error('Create schedule page error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/schedule-pages/:id - 업데이트
router.post('/schedule-pages/:id', requireAdmin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    const pageId = req.params.id;

    const rows = await sql`SELECT * FROM schedule_pages WHERE id = ${pageId}`;
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const page = rows[0];

    if (!isAdminLike(userRole) && page.owner_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    let { title, slug, status, header_data, schedule_data, syllabus_data, theme_data } = req.body;

    if (!isAdminLike(userRole) && status !== 'draft' && status !== 'pending') {
      status = 'draft';
    }

    if (slug) {
      const chk = await sql`SELECT id FROM schedule_pages WHERE slug = ${slug} AND id != ${pageId}`;
      if (chk.length > 0) return res.status(400).json({ error: '이미 사용 중인 slug입니다.' });
    }

    await sql`UPDATE schedule_pages SET title=${title || ''}, slug=${slug || null}, status=${status || 'draft'},
      header_data=${JSON.stringify(header_data || {})}, schedule_data=${JSON.stringify(schedule_data || {})},
      syllabus_data=${JSON.stringify(syllabus_data || {})}, theme_data=${JSON.stringify(theme_data || {})},
      updated_at=NOW() WHERE id=${pageId}`;

    res.json({ success: true });
  } catch (err) {
    console.error('Update schedule page error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/schedule-pages/:id/delete - 삭제
router.post('/schedule-pages/:id/delete', requireAdmin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    const pageId = req.params.id;

    const rows = await sql`SELECT * FROM schedule_pages WHERE id = ${pageId}`;
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const page = rows[0];

    if (!isAdminLike(userRole) && page.owner_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const ownerId = page.owner_id;
    await sql`DELETE FROM schedule_pages WHERE id = ${pageId}`;

    // Reorder remaining slots: renumber by slot_number order starting from 1
    const remaining = await sql`SELECT id FROM schedule_pages WHERE owner_id = ${ownerId} ORDER BY slot_number ASC`;
    for (let i = 0; i < remaining.length; i++) {
      await sql`UPDATE schedule_pages SET slot_number = ${i + 1} WHERE id = ${remaining[i].id}`;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete schedule page error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /admin/schedule-pages/:id/generate-sessions - 시간표→수업 일정 자동 생성
router.post('/schedule-pages/:id/generate-sessions', requireAdmin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    const pageId = req.params.id;
    const { scheduleId } = req.body;

    if (!scheduleId) return res.status(400).json({ error: 'scheduleId 필요' });

    // Load schedule page
    const rows = await sql`SELECT * FROM schedule_pages WHERE id = ${pageId}`;
    if (rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    const page = rows[0];

    if (!isAdminLike(userRole) && page.owner_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const scheduleData = JSON.parse(page.schedule_data || '{}');
    const syllabusData = JSON.parse(page.syllabus_data || '{}');
    const schedules = scheduleData.schedules || [];
    const sections = scheduleData.sections || [];
    const syllabusSubjects = syllabusData.subjects || [];

    // Find target schedule
    const targetSchedule = schedules.find(s => s.id === scheduleId);
    if (!targetSchedule) return res.status(400).json({ error: '해당 시간표를 찾을 수 없습니다.' });

    const startDate = targetSchedule.dateRange?.start;
    const endDate = targetSchedule.dateRange?.end;
    if (!startDate || !endDate) return res.status(400).json({ error: '날짜 범위가 설정되지 않았습니다.' });

    // Day name → JS getDay() mapping
    const dayMap = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };

    // Filter sections with slots in this schedule AND classId set
    const relevantSections = sections.filter(sec =>
      sec.classId && (sec.slots || []).some(slot => slot.scheduleId === scheduleId)
    );

    if (relevantSections.length === 0) {
      return res.json({ success: true, results: [], message: '수업이 연결된 분반이 없습니다.' });
    }

    const results = [];

    for (const sec of relevantSections) {
      const classId = parseInt(sec.classId, 10);
      const slots = (sec.slots || []).filter(s => s.scheduleId === scheduleId);

      // Get class name for result display
      const classRows = await sql`SELECT name FROM classes WHERE id = ${classId}`;
      const className = classRows.length > 0 ? classRows[0].name : `Class #${classId}`;

      // Count existing schedules for this class to continue numbering
      const existingCount = await sql`SELECT COUNT(*)::int as cnt FROM class_schedules WHERE class_id = ${classId}`;
      let sessionNum = (existingCount[0]?.cnt || 0) + 1;

      // Find syllabus weeklyPlan for this section's subject
      const syllSubj = sec.subjectId
        ? syllabusSubjects.find(s => s.subjectId === sec.subjectId)
        : null;
      const weeklyPlan = syllSubj?.weeklyPlan || [];

      let created = 0;
      let skipped = 0;

      // Collect all dates for all slots, sorted
      const dateSlotsMap = []; // { date, slot }

      for (const slot of slots) {
        const dayNum = dayMap[slot.day];
        if (dayNum === undefined) continue;

        // Iterate through date range
        const cur = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T00:00:00');

        while (cur <= end) {
          if (cur.getDay() === dayNum) {
            const dateStr = cur.getFullYear() + '-' +
              String(cur.getMonth() + 1).padStart(2, '0') + '-' +
              String(cur.getDate()).padStart(2, '0');
            dateSlotsMap.push({ date: dateStr, slot });
          }
          cur.setDate(cur.getDate() + 1);
        }
      }

      // Sort by date then start time
      dateSlotsMap.sort((a, b) => a.date.localeCompare(b.date) || a.slot.start.localeCompare(b.slot.start));

      for (const { date, slot } of dateSlotsMap) {
        // Duplicate check: same class_id + date + start_time
        const dup = await sql`SELECT id FROM class_schedules WHERE class_id = ${classId} AND schedule_date = ${date} AND start_time = ${slot.start}`;
        if (dup.length > 0) {
          skipped++;
          continue;
        }

        // Build description: "N회차" + syllabus topic if available
        const planEntry = weeklyPlan[sessionNum - 1];
        const topic = planEntry?.topic?.ko || '';
        const desc = topic ? `${sessionNum}회차: ${topic}` : `${sessionNum}회차`;

        await sql`INSERT INTO class_schedules (class_id, schedule_date, start_time, end_time, description)
          VALUES (${classId}, ${date}, ${slot.start}, ${slot.end}, ${desc})`;
        sessionNum++;
        created++;
      }

      results.push({ className, classId, created, skipped });
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error('Generate sessions error:', err);
    res.status(500).json({ error: '서버 오류: ' + err.message });
  }
});

// ===== Profile Image Upload/Delete =====

// Multer for profile image (image only)
const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('JPG, PNG, WEBP 파일만 업로드 가능합니다.'));
  }
});

// POST /admin/schedule-pages/:id/profile-image - 업로드
router.post('/schedule-pages/:id/profile-image', requireAdmin, profileUpload.single('image'), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    const pageId = req.params.id;

    const rows = await sql`SELECT * FROM schedule_pages WHERE id = ${pageId}`;
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const page = rows[0];

    if (!isAdminLike(userRole) && page.owner_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!req.file) return res.status(400).json({ error: '이미지 파일이 필요합니다.' });

    // Upload to GCS — uploads/schedule/profile/{slug}.{ext}
    const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
    const desiredPath = `uploads/schedule/profile/${sanitizeName(page.slug)}${ext}`;
    const uniquePath = await getUniquePath(desiredPath);
    const filePath = await uploadFileDirect(req.file.buffer, uniquePath, req.file.mimetype);

    // Update header_data with profileImageId
    const headerData = JSON.parse(page.header_data || '{}');

    // Delete old profile image if exists
    if (headerData.profileImageId) {
      await deleteFile(headerData.profileImageId);
    }

    headerData.profileImageId = filePath;
    await sql`UPDATE schedule_pages SET header_data = ${JSON.stringify(headerData)}, updated_at = NOW() WHERE id = ${pageId}`;

    res.json({ success: true, profileImageId: filePath });
  } catch (err) {
    console.error('Profile image upload error:', err);
    res.status(500).json({ error: '업로드 실패' });
  }
});

// POST /admin/schedule-pages/:id/profile-image/delete - 삭제
router.post('/schedule-pages/:id/profile-image/delete', requireAdmin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    const pageId = req.params.id;

    const rows = await sql`SELECT * FROM schedule_pages WHERE id = ${pageId}`;
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const page = rows[0];

    if (!isAdminLike(userRole) && page.owner_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const headerData = JSON.parse(page.header_data || '{}');
    if (headerData.profileImageId) {
      await deleteFile(headerData.profileImageId);
      delete headerData.profileImageId;
      await sql`UPDATE schedule_pages SET header_data = ${JSON.stringify(headerData)}, updated_at = NOW() WHERE id = ${pageId}`;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Profile image delete error:', err);
    res.status(500).json({ error: '삭제 실패' });
  }
});

// GET /admin/schedule-pages/:id/profile-image - 이미지 서빙
router.get('/schedule-pages/:id/profile-image', requireAdmin, async (req, res) => {
  try {
    const rows = await sql`SELECT header_data FROM schedule_pages WHERE id = ${req.params.id}`;
    if (rows.length === 0) return res.status(404).send('Not found');

    const headerData = JSON.parse(rows[0].header_data || '{}');
    if (!headerData.profileImageId) return res.status(404).send('No image');

    const { buffer, mimeType } = await downloadFile(headerData.profileImageId);
    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    console.error('Profile image serve error:', err);
    res.status(500).send('Error');
  }
});

// ============================================================
// 파일 탐색기 (GCS File Explorer)
// ============================================================

// 파일 탐색기 페이지 렌더
router.get('/files', requireAdmin, async (req, res) => {
  try {
    const classes = await sql`SELECT id, name, status FROM classes ORDER BY status, name`;
    res.render('admin-files', {
      user: req.session.user,
      sidebarClasses: classes,
      activePage: 'files',
    });
  } catch (err) {
    console.error('File explorer render error:', err);
    res.status(500).send('Error');
  }
});

// JSON - 폴더/파일 목록
router.get('/files/list', requireAdmin, async (req, res) => {
  try {
    let prefix = req.query.prefix || '';
    // prefix가 있으면 반드시 /로 끝나도록
    if (prefix && !prefix.endsWith('/')) prefix += '/';
    const result = await listFiles(prefix);
    res.json(result);
  } catch (err) {
    console.error('File list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 파일 다운로드
router.get('/files/download', requireAdmin, async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).send('path required');
    const { buffer, mimeType } = await downloadFile(filePath);
    const fileName = filePath.split('/').pop();
    res.set('Content-Type', mimeType);
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(buffer);
  } catch (err) {
    console.error('File download error:', err);
    res.status(500).send('다운로드 실패');
  }
});

// 파일 업로드
router.post('/files/upload', requireAdmin, upload.array('files', 20), async (req, res) => {
  try {
    let prefix = req.body.prefix || '';
    if (prefix && !prefix.endsWith('/')) prefix += '/';
    const results = [];
    for (const file of req.files) {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const filePath = prefix + originalName;
      await uploadFileDirect(file.buffer, filePath, file.mimetype);
      results.push({ name: originalName, path: filePath });
    }
    res.json({ success: true, files: results });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 파일 삭제 (원장만)
router.post('/files/delete', requireSuperAdmin, async (req, res) => {
  try {
    const filePath = req.body.path;
    if (!filePath) return res.status(400).json({ error: 'path required' });
    await deleteFile(filePath);
    res.json({ success: true });
  } catch (err) {
    console.error('File delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 빈 폴더 생성
router.post('/files/new-folder', requireAdmin, async (req, res) => {
  try {
    let prefix = req.body.prefix || '';
    const folderName = req.body.folderName;
    if (!folderName) return res.status(400).json({ error: 'folderName required' });
    if (prefix && !prefix.endsWith('/')) prefix += '/';
    const folderPath = prefix + folderName + '/';
    await createFolder(folderPath);
    res.json({ success: true, path: folderPath });
  } catch (err) {
    console.error('New folder error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
