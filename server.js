const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { initDB, getDB } = require('./db/database');

const app = express();
const PORT = 3000;

// Ensure upload directories exist
['uploads/homework', 'uploads/graded'].forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  secret: 'chanwoo-math-academy-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// 템플릿에 세션 유저 정보 전달
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const adminRoutes = require('./routes/admin');

app.use('/auth', authRoutes);
app.use('/student', studentRoutes);
app.use('/admin', adminRoutes);

// 메인 페이지 → 로그인
app.get('/', (req, res) => {
  if (req.session.user) {
    if (req.session.user.role === 'admin' || req.session.user.role === 'teacher') {
      return res.redirect('/admin');
    }
    return res.redirect('/student');
  }
  res.render('login', { error: null });
});

// 회원가입 페이지
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// Public schedule page (no auth)
app.get('/p/:slug', (req, res) => {
  const db = getDB();
  const stmt = db.prepare("SELECT * FROM schedule_pages WHERE slug = ? AND status = 'published'");
  stmt.bind([req.params.slug]);
  if (!stmt.step()) {
    stmt.free();
    return res.render('schedule-public-404');
  }
  const page = stmt.getAsObject();
  stmt.free();

  res.render('schedule-public', {
    page: {
      title: page.title,
      slug: page.slug,
      header_data: JSON.parse(page.header_data || '{}'),
      schedule_data: JSON.parse(page.schedule_data || '{}'),
      syllabus_data: JSON.parse(page.syllabus_data || '{}'),
      theme_data: JSON.parse(page.theme_data || '{}')
    }
  });
});

// DB 초기화 후 서버 시작
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  });
}).catch(err => {
  console.error('DB 초기화 실패:', err);
  process.exit(1);
});
