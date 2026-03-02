const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDB } = require('./db/database');

const app = express();
const PORT = 3000;

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
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24시간
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
    if (req.session.user.role === 'admin') {
      return res.redirect('/admin');
    }
    return res.redirect('/student');
  }
  res.render('login', { error: null });
});

// 회원가입 페이지
app.get('/register', (req, res) => {
  res.render('register', { error: null, success: null });
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
