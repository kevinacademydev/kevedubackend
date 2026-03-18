const express = require('express');
const router = express.Router();
const multer = require('multer');
const { sql } = require('../db/database');
const { uploadFile, downloadFile, deleteFile } = require('../utils/drive');

// 학생 인증 미들웨어
function requireStudent(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'student') {
    return res.redirect('/management');
  }
  next();
}

// Multer 설정 - 메모리 저장 (Google Drive로 전송)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = require('path').extname(file.originalname).toLowerCase();
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('PDF, JPG, PNG 파일만 업로드 가능합니다.'));
    }
  }
});

// GET /student - 대시보드 (내 수업 목록)
router.get('/', requireStudent, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const myClasses = await sql`
      SELECT c.id, c.name, c.type, ce.status,
        (SELECT COUNT(*) FROM submissions s WHERE s.class_id = c.id AND s.student_id = ${userId}) as submission_count,
        (SELECT COUNT(*) FROM graded_files g WHERE g.class_id = c.id AND g.student_id = ${userId}) as graded_count,
        (SELECT COUNT(*) FROM graded_files g WHERE g.class_id = c.id AND g.student_id = ${userId} AND g.is_new = 1) as new_graded_count
      FROM class_enrollments ce
      JOIN classes c ON ce.class_id = c.id
      WHERE ce.student_id = ${userId} AND ce.status = 'active'
      ORDER BY c.name ASC
    `;

    const feedbacks = await sql`
      SELECT sf.*, u.name as author_name
      FROM student_feedbacks sf JOIN users u ON sf.author_id = u.id
      WHERE sf.student_id = ${userId}
      ORDER BY sf.created_at DESC LIMIT 5
    `;

    res.render('student-dashboard', { myClasses, feedbacks });
  } catch (err) {
    console.error('Student dashboard error:', err);
    res.status(500).send('서버 오류');
  }
});

// GET /student/class/:classId - 수업 상세
router.get('/class/:classId', requireStudent, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const classId = parseInt(req.params.classId, 10);

    // 등록 확인
    const enrolled = await sql`SELECT id FROM class_enrollments WHERE class_id = ${classId} AND student_id = ${userId} AND status = 'active'`;
    if (enrolled.length === 0) return res.status(403).send('등록되지 않은 수업입니다.');

    // 수업 정보
    const clsRows = await sql`SELECT * FROM classes WHERE id = ${classId}`;
    if (clsRows.length === 0) return res.status(404).send('수업을 찾을 수 없습니다.');
    const cls = clsRows[0];

    // 내 과제 제출
    const submissions = await sql`SELECT * FROM submissions WHERE class_id = ${classId} AND student_id = ${userId} ORDER BY submitted_at DESC`;

    // 내 채점 파일
    const gradedFiles = await sql`SELECT * FROM graded_files WHERE class_id = ${classId} AND student_id = ${userId} ORDER BY uploaded_at DESC`;

    // 수업 일정 목록
    const classSchedules = await sql`SELECT id, schedule_date, description, start_time FROM class_schedules WHERE class_id = ${classId} ORDER BY schedule_date, start_time, id`;

    // 내 점수
    const scoreRows = await sql`SELECT schedule_id, score FROM class_scores WHERE class_id = ${classId} AND student_id = ${userId} ORDER BY schedule_id`;
    const myScores = {};
    scoreRows.forEach(r => { myScores[r.schedule_id] = r.score; });

    // 같은 수업 전체 학생 점수 (평균/등수 계산용)
    const allScoreRows = await sql`
      SELECT cs.schedule_id, cs.score
      FROM class_scores cs
      JOIN class_enrollments ce ON cs.class_id = ce.class_id AND cs.student_id = ce.student_id
      WHERE cs.class_id = ${classId} AND ce.status = 'active'
      ORDER BY cs.schedule_id, cs.score DESC
    `;
    const sessionScores = {};
    allScoreRows.forEach(r => {
      if (!sessionScores[r.schedule_id]) sessionScores[r.schedule_id] = [];
      sessionScores[r.schedule_id].push(r.score);
    });

    const averages = {};
    const ranks = {};
    const totalStudents = {};
    for (const [schedId, allScrs] of Object.entries(sessionScores)) {
      const avg = allScrs.reduce((a, b) => a + b, 0) / allScrs.length;
      averages[schedId] = Math.round(avg * 10) / 10;
      totalStudents[schedId] = allScrs.length;
      if (myScores[schedId] !== undefined && myScores[schedId] !== null) {
        ranks[schedId] = allScrs.filter(s => s > myScores[schedId]).length + 1;
      }
    }

    // 사이드바용 내 수업 목록
    const myClasses = await sql`
      SELECT c.id, c.name, c.type
      FROM class_enrollments ce
      JOIN classes c ON ce.class_id = c.id
      WHERE ce.student_id = ${userId} AND ce.status = 'active'
      ORDER BY c.name ASC
    `;

    // 교재 목록 + 학생별 다운로드 횟수
    const textbooks = await sql`
      SELECT ct.*, u.name as uploader_name,
        (SELECT COUNT(*) FROM textbook_downloads td WHERE td.textbook_id = ct.id AND td.student_id = ${userId}) as download_count
      FROM class_textbooks ct JOIN users u ON ct.uploaded_by = u.id
      WHERE ct.class_id = ${classId}
      ORDER BY ct.uploaded_at DESC
    `;

    res.render('student-class', { cls, submissions, gradedFiles, classSchedules, myScores, averages, ranks, totalStudents, myClasses, textbooks });
  } catch (err) {
    console.error('Student class error:', err);
    res.status(500).send('서버 오류');
  }
});

// POST /student/class/:classId/upload - 수업별 과제 제출
router.post('/class/:classId/upload', requireStudent, (req, res) => {
  const classId = parseInt(req.params.classId, 10);
  const userId = req.session.user.id;

  upload.array('files', 10)(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: '최대 10개 파일까지 업로드 가능합니다.' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '파일을 선택해주세요.' });
    }

    try {
      // Verify enrollment
      const enrolled = await sql`SELECT id FROM class_enrollments WHERE class_id = ${classId} AND student_id = ${userId} AND status = 'active'`;
      if (enrolled.length === 0) {
        return res.status(403).json({ error: '등록되지 않은 수업입니다.' });
      }

      for (const file of req.files) {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const driveFileId = await uploadFile(file.buffer, `hw-${req.session.user.username}-${Date.now()}-${originalName}`, file.mimetype);
        await sql`INSERT INTO submissions (class_id, student_id, file_name, file_path) VALUES (${classId}, ${userId}, ${originalName}, ${driveFileId})`;
      }

      res.json({ success: true, count: req.files.length });
    } catch (uploadErr) {
      console.error('Upload error:', uploadErr);
      res.status(500).json({ error: '파일 업로드에 실패했습니다.' });
    }
  });
});

// GET /student/class/:classId/schedules - 수업 일정 조회 (읽기 전용)
router.get('/class/:classId/schedules', requireStudent, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const classId = parseInt(req.params.classId, 10);

    const enrolled = await sql`SELECT id FROM class_enrollments WHERE class_id = ${classId} AND student_id = ${userId} AND status = 'active'`;
    if (enrolled.length === 0) return res.status(403).json({ error: '등록되지 않은 수업입니다.' });

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
      ORDER BY schedule_date, start_time, id
    `;

    schedules.forEach((s, i) => { s.seq = seqOffset + i + 1; });
    res.json(schedules);
  } catch (err) {
    console.error('Student schedules error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// GET /student/class/:classId/textbook/:tid/download - 교재 다운로드 (3회 제한)
router.get('/class/:classId/textbook/:tid/download', requireStudent, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const classId = parseInt(req.params.classId, 10);
    const tid = parseInt(req.params.tid, 10);

    const enrolled = await sql`SELECT id FROM class_enrollments WHERE class_id = ${classId} AND student_id = ${userId} AND status = 'active'`;
    if (enrolled.length === 0) return res.status(403).send('등록되지 않은 수업입니다.');

    const rows = await sql`SELECT * FROM class_textbooks WHERE id = ${tid} AND class_id = ${classId}`;
    if (rows.length === 0) return res.status(404).send('교재를 찾을 수 없습니다.');

    const countRows = await sql`SELECT COUNT(*) as cnt FROM textbook_downloads WHERE textbook_id = ${tid} AND student_id = ${userId}`;
    const count = parseInt(countRows[0].cnt, 10);
    if (count >= 3) return res.status(403).json({ error: '다운로드 횟수(3회)를 초과했습니다.' });

    const textbook = rows[0];
    const { buffer, mimeType } = await downloadFile(textbook.file_path);

    await sql`INSERT INTO textbook_downloads (textbook_id, student_id) VALUES (${tid}, ${userId})`;

    const encodedName = encodeURIComponent(textbook.file_name);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.setHeader('Content-Type', mimeType);
    res.send(buffer);
  } catch (err) {
    console.error('Textbook download error:', err);
    res.status(500).send('파일 다운로드에 실패했습니다.');
  }
});

// GET /student/file/:id - 채점 파일 다운로드
router.get('/file/:id', requireStudent, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const fileId = req.params.id;

    const rows = await sql`SELECT * FROM graded_files WHERE id = ${fileId} AND student_id = ${userId}`;
    if (rows.length === 0) return res.status(404).send('파일을 찾을 수 없습니다.');

    const file = rows[0];

    if (file.is_new === 1) {
      await sql`UPDATE graded_files SET is_new = 0 WHERE id = ${fileId}`;
    }

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

module.exports = router;
