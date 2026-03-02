const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDB, saveDB } = require('../db/database');

// POST /auth/login
router.post('/login', (req, res) => {
  const { student_id, password } = req.body;
  const db = getDB();

  const stmt = db.prepare('SELECT * FROM users WHERE student_id = ?');
  stmt.bind([student_id]);

  if (stmt.step()) {
    const row = stmt.getAsObject();
    if (bcrypt.compareSync(password, row.password)) {
      req.session.user = {
        id: row.id,
        student_id: row.student_id,
        name: row.name,
        role: row.role
      };
      stmt.free();
      if (row.role === 'admin') {
        return res.redirect('/admin');
      }
      return res.redirect('/student');
    }
  }
  stmt.free();
  res.render('login', { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
});

// POST /auth/register
router.post('/register', (req, res) => {
  const { student_id, name, birth_date, classes, school, parent_phone, gender, password, password_confirm } = req.body;
  const db = getDB();

  // 유효성 검사
  if (!student_id || !name || !password) {
    return res.render('register', { error: '필수 항목을 모두 입력해주세요.', success: null });
  }

  if (password !== password_confirm) {
    return res.render('register', { error: '비밀번호가 일치하지 않습니다.', success: null });
  }

  // student_id 형식 검사
  if (!/^student\d{4}$/.test(student_id)) {
    return res.render('register', { error: '학생 ID는 student0001 형식이어야 합니다.', success: null });
  }

  // 중복 검사
  const checkStmt = db.prepare('SELECT id FROM users WHERE student_id = ?');
  checkStmt.bind([student_id]);
  if (checkStmt.step()) {
    checkStmt.free();
    return res.render('register', { error: '이미 존재하는 학생 ID입니다.', success: null });
  }
  checkStmt.free();

  const hashedPassword = bcrypt.hashSync(password, 10);
  db.run(
    `INSERT INTO users (student_id, name, birth_date, classes, school, parent_phone, gender, password, role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'student')`,
    [student_id, name, birth_date || null, classes || null, school || null, parent_phone || null, gender || null, hashedPassword]
  );
  saveDB();

  res.render('register', { error: null, success: '회원가입이 완료되었습니다. 로그인해주세요.' });
});

// GET /auth/logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
