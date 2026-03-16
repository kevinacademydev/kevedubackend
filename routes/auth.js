const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sql } = require('../db/database');
const { sendSMS } = require('../utils/sms');
const { sendEmail } = require('../utils/email');

// ── 헬퍼 함수 ──

function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}

async function checkRateLimit(target, purpose) {
  const rows = await sql`
    SELECT COUNT(*) as cnt FROM verification_codes
    WHERE target = ${target} AND purpose = ${purpose}
      AND created_at > NOW() - INTERVAL '10 minutes'
  `;
  return parseInt(rows[0].cnt, 10) >= 3;
}

async function sendVerificationCode(target, targetType, code) {
  const message = `[케빈아카데미] 인증번호: ${code} (5분 내 입력해주세요)`;
  if (targetType === 'phone') {
    return sendSMS(target, message);
  } else {
    return sendEmail(target, '[케빈아카데미] 인증번호', message);
  }
}

// ── 회원가입 ──

// GET /auth/register
router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// POST /auth/register/send-code
router.post('/register/send-code', async (req, res) => {
  try {
    const { name, name_en, birth_date, grade, school, parent_phone, email, gender, password, password_confirm, verify_method } = req.body;

    // 폼 검증
    if (!name || !name_en || !password) {
      return res.json({ success: false, message: '필수 항목을 모두 입력해주세요.' });
    }
    if (password !== password_confirm) {
      return res.json({ success: false, message: '비밀번호가 일치하지 않습니다.' });
    }
    if (!verify_method || (verify_method !== 'phone' && verify_method !== 'email')) {
      return res.json({ success: false, message: '인증 방법을 선택해주세요.' });
    }

    const target = verify_method === 'phone' ? parent_phone : email;
    if (!target) {
      return res.json({ success: false, message: verify_method === 'phone' ? '학부모 연락처를 입력해주세요.' : '이메일을 입력해주세요.' });
    }

    // 발송 제한 확인
    const rateLimited = await checkRateLimit(target, 'register');
    if (rateLimited) {
      return res.json({ success: false, message: '인증번호 발송 횟수를 초과했습니다. 10분 후 다시 시도해주세요.' });
    }

    // 폼 데이터 임시 저장 (비밀번호 포함 - 5분 뒤 만료)
    const formData = JSON.stringify({ name, name_en, birth_date, grade, school, parent_phone, email, gender, password });
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await sql`
      INSERT INTO verification_codes (target, target_type, code, purpose, form_data, expires_at)
      VALUES (${target}, ${verify_method}, ${code}, 'register', ${formData}, ${expiresAt})
    `;

    // 발송
    await sendVerificationCode(target, verify_method, code);

    res.json({ success: true, message: '인증번호가 발송되었습니다.' });
  } catch (err) {
    console.error('Register send-code error:', err);
    res.json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// POST /auth/register/verify-code
router.post('/register/verify-code', async (req, res) => {
  try {
    const { target, target_type, code } = req.body;

    if (!target || !code) {
      return res.json({ success: false, message: '인증번호를 입력해주세요.' });
    }

    // 가장 최근 코드 조회
    const rows = await sql`
      SELECT * FROM verification_codes
      WHERE target = ${target} AND target_type = ${target_type} AND purpose = 'register'
        AND verified = FALSE AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 1
    `;

    if (rows.length === 0) {
      return res.json({ success: false, message: '인증번호가 만료되었거나 존재하지 않습니다. 다시 발송해주세요.' });
    }

    const record = rows[0];

    // 오입력 횟수 초과
    if (record.attempts >= 5) {
      return res.json({ success: false, message: '인증번호 입력 횟수를 초과했습니다. 다시 발송해주세요.' });
    }

    // 코드 비교
    if (record.code !== code) {
      await sql`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ${record.id}`;
      const remaining = 4 - record.attempts;
      return res.json({ success: false, message: `인증번호가 올바르지 않습니다. (${remaining}회 남음)` });
    }

    // 인증 성공 → 유저 생성
    await sql`UPDATE verification_codes SET verified = TRUE WHERE id = ${record.id}`;

    const formData = JSON.parse(record.form_data);
    const { name, name_en, birth_date, grade, school, parent_phone, email, gender, password } = formData;

    // 가장 작은 빈 4자리 번호 찾기
    const usedRows = await sql`SELECT username FROM users WHERE username LIKE 'student%' ORDER BY username`;
    const usedNums = new Set();
    for (const r of usedRows) {
      const match = r.username.match(/^student(\d{4})$/);
      if (match) usedNums.add(parseInt(match[1], 10));
    }
    let assignedNum = 1;
    while (usedNums.has(assignedNum) && assignedNum <= 9999) {
      assignedNum++;
    }
    const username = `student${String(assignedNum).padStart(4, '0')}`;

    const hashedPassword = bcrypt.hashSync(password, 10);
    const gradeVal = grade ? parseInt(grade, 10) : null;

    await sql`INSERT INTO users (username, name, name_en, birth_date, grade, school, parent_phone, email, gender, password, role)
      VALUES (${username}, ${name}, ${name_en || null}, ${birth_date || null}, ${gradeVal}, ${school || null}, ${parent_phone || null}, ${email || null}, ${gender || null}, ${hashedPassword}, 'student')`;

    // 가입 완료 알림
    if (parent_phone) {
      sendSMS(parent_phone, `[케빈아카데미] ${name} 학생의 회원가입이 완료되었습니다. 학생 아이디: ${username}`);
    }
    if (email) {
      sendEmail(email, '[케빈아카데미] 회원가입 완료', `안녕하세요.\n\n${name} 학생의 회원가입이 완료되었습니다.\n\n학생 아이디: ${username}\n\n이 아이디로 로그인해주세요.\n\n감사합니다.\n케빈아카데미`);
    }

    res.json({ success: true, studentId: username, name });
  } catch (err) {
    console.error('Register verify-code error:', err);
    res.json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ── 로그인 ──

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const rows = await sql`SELECT * FROM users WHERE username = ${username}`;

    if (rows.length > 0) {
      const row = rows[0];
      if (bcrypt.compareSync(password, row.password)) {
        req.session.user = {
          id: row.id,
          username: row.username,
          name: row.name,
          role: row.role
        };
        if (row.role === 'admin' || row.role === 'subadmin' || row.role === 'teacher') {
          return res.redirect('/admin');
        }
        return res.redirect('/student');
      }
    }
    res.render('login', { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { error: '서버 오류가 발생했습니다.' });
  }
});

// ── 비밀번호 찾기 ──

// GET /auth/forgot-password
router.get('/forgot-password', (req, res) => {
  res.render('forgot-password');
});

// POST /auth/forgot-password/send-code
router.post('/forgot-password/send-code', async (req, res) => {
  try {
    const { target, target_type } = req.body;

    if (!target || !target_type) {
      return res.json({ success: false, message: '연락처 또는 이메일을 입력해주세요.' });
    }

    // 유저 조회
    let rows;
    if (target_type === 'phone') {
      rows = await sql`SELECT id, name FROM users WHERE parent_phone = ${target}`;
    } else {
      rows = await sql`SELECT id, name FROM users WHERE email = ${target}`;
    }

    if (rows.length === 0) {
      return res.json({ success: false, message: '해당 정보로 등록된 계정을 찾을 수 없습니다.' });
    }

    // 발송 제한
    const rateLimited = await checkRateLimit(target, 'password_reset');
    if (rateLimited) {
      return res.json({ success: false, message: '인증번호 발송 횟수를 초과했습니다. 10분 후 다시 시도해주세요.' });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await sql`
      INSERT INTO verification_codes (target, target_type, code, purpose, expires_at)
      VALUES (${target}, ${target_type}, ${code}, 'password_reset', ${expiresAt})
    `;

    await sendVerificationCode(target, target_type, code);

    res.json({ success: true, message: '인증번호가 발송되었습니다.' });
  } catch (err) {
    console.error('Forgot password send-code error:', err);
    res.json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// POST /auth/forgot-password/verify-code
router.post('/forgot-password/verify-code', async (req, res) => {
  try {
    const { target, target_type, code } = req.body;

    if (!target || !code) {
      return res.json({ success: false, message: '인증번호를 입력해주세요.' });
    }

    const rows = await sql`
      SELECT * FROM verification_codes
      WHERE target = ${target} AND target_type = ${target_type} AND purpose = 'password_reset'
        AND verified = FALSE AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 1
    `;

    if (rows.length === 0) {
      return res.json({ success: false, message: '인증번호가 만료되었거나 존재하지 않습니다.' });
    }

    const record = rows[0];

    if (record.attempts >= 5) {
      return res.json({ success: false, message: '인증번호 입력 횟수를 초과했습니다. 다시 발송해주세요.' });
    }

    if (record.code !== code) {
      await sql`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ${record.id}`;
      const remaining = 4 - record.attempts;
      return res.json({ success: false, message: `인증번호가 올바르지 않습니다. (${remaining}회 남음)` });
    }

    await sql`UPDATE verification_codes SET verified = TRUE WHERE id = ${record.id}`;

    // reset_token 생성
    const resetToken = crypto.randomBytes(32).toString('hex');

    // form_data에 reset_token 저장
    await sql`UPDATE verification_codes SET form_data = ${JSON.stringify({ reset_token: resetToken })} WHERE id = ${record.id}`;

    res.json({ success: true, reset_token: resetToken });
  } catch (err) {
    console.error('Forgot password verify-code error:', err);
    res.json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// POST /auth/forgot-password/reset
router.post('/forgot-password/reset', async (req, res) => {
  try {
    const { target, target_type, reset_token, new_password, new_password_confirm } = req.body;

    if (!new_password || new_password.length < 4) {
      return res.json({ success: false, message: '비밀번호는 4자 이상이어야 합니다.' });
    }
    if (new_password !== new_password_confirm) {
      return res.json({ success: false, message: '비밀번호가 일치하지 않습니다.' });
    }

    // reset_token 검증
    const rows = await sql`
      SELECT * FROM verification_codes
      WHERE target = ${target} AND target_type = ${target_type} AND purpose = 'password_reset'
        AND verified = TRUE AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 1
    `;

    if (rows.length === 0) {
      return res.json({ success: false, message: '인증이 만료되었습니다. 처음부터 다시 시도해주세요.' });
    }

    const record = rows[0];
    const storedData = JSON.parse(record.form_data || '{}');
    if (storedData.reset_token !== reset_token) {
      return res.json({ success: false, message: '유효하지 않은 요청입니다.' });
    }

    // 비밀번호 변경
    const hashedPassword = bcrypt.hashSync(new_password, 10);
    if (target_type === 'phone') {
      await sql`UPDATE users SET password = ${hashedPassword} WHERE parent_phone = ${target}`;
    } else {
      await sql`UPDATE users SET password = ${hashedPassword} WHERE email = ${target}`;
    }

    // 사용한 코드 만료 처리
    await sql`UPDATE verification_codes SET expires_at = NOW() WHERE id = ${record.id}`;

    res.json({ success: true, message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.' });
  } catch (err) {
    console.error('Forgot password reset error:', err);
    res.json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ── 로그아웃 ──

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

module.exports = router;
