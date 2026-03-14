const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDB, saveDB } = require('../db/database');
const { sendSMS } = require('../utils/sms');
const { sendEmail } = require('../utils/email');

// GET /auth/register
router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// POST /auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const db = getDB();

  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  stmt.bind([username]);

  if (stmt.step()) {
    const row = stmt.getAsObject();
    if (bcrypt.compareSync(password, row.password)) {
      req.session.user = {
        id: row.id,
        username: row.username,
        name: row.name,
        role: row.role
      };
      stmt.free();
      if (row.role === 'admin' || row.role === 'teacher') {
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
  const { name, name_en, birth_date, grade, school, parent_phone, email, gender, password, password_confirm } = req.body;
  const db = getDB();

  if (!name || !name_en || !password) {
    return res.render('register', { error: '필수 항목을 모두 입력해주세요.' });
  }

  if (password !== password_confirm) {
    return res.render('register', { error: '비밀번호가 일치하지 않습니다.' });
  }

  // 가장 작은 빈 4자리 번호 찾기
  const usedStmt = db.prepare("SELECT username FROM users WHERE username LIKE 'student%' ORDER BY username");
  const usedNums = new Set();
  while (usedStmt.step()) {
    const uname = usedStmt.getAsObject().username;
    const match = uname.match(/^student(\d{4})$/);
    if (match) usedNums.add(parseInt(match[1], 10));
  }
  usedStmt.free();

  let assignedNum = 1;
  while (usedNums.has(assignedNum) && assignedNum <= 9999) {
    assignedNum++;
  }
  const username = `student${String(assignedNum).padStart(4, '0')}`;

  const hashedPassword = bcrypt.hashSync(password, 10);
  const gradeVal = grade ? parseInt(grade, 10) : null;

  db.run(
    `INSERT INTO users (username, name, name_en, birth_date, grade, school, parent_phone, email, gender, password, role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'student')`,
    [username, name, name_en || null, birth_date || null, gradeVal, school || null, parent_phone || null, email || null, gender || null, hashedPassword]
  );
  saveDB();

  if (parent_phone) {
    sendSMS(parent_phone, `[케빈아카데미] ${name} 학생의 회원가입이 완료되었습니다. 학생 아이디: ${username}`);
  }
  if (email) {
    sendEmail(email, '[케빈아카데미] 회원가입 완료', `안녕하세요.\n\n${name} 학생의 회원가입이 완료되었습니다.\n\n학생 아이디: ${username}\n\n이 아이디로 로그인해주세요.\n\n감사합니다.\n케빈아카데미`);
  }

  res.render('register-complete', { studentId: username, name });
});

// GET /auth/logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
