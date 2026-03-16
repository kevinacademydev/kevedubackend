// ============================================================
// 케빈아카데미 첨삭 관리 시스템 - 메인 서버
// ============================================================
//
// ▶ 로컬 실행:
//   1. .env 파일에 DATABASE_URL, SESSION_SECRET 등 환경변수 설정
//   2. npm install
//   3. node server.js
//   → http://localhost:3001 에서 접속
//
// ▶ Google Cloud Run 배포:
//   gcloud run deploy chanwoo-academy \
//     --source . \
//     --region asia-northeast3 \
//     --allow-unauthenticated \
//     --set-env-vars "DATABASE_URL=...,SESSION_SECRET=...,GCS_BUCKET_NAME=..."
//   * GOOGLE_SERVICE_ACCOUNT_JSON은 Cloud Console > Variables & Secrets에서 직접 설정
//   * --set-env-vars는 기존 변수를 덮어쓰므로, 추가 시 --update-env-vars 사용
//
// ▶ 배포 후 로그 확인:
//   gcloud run services logs read chanwoo-academy --region asia-northeast3 --limit 50
//   (실시간 스트리밍: --tail 추가)
//
// ============================================================

require('dotenv').config(); // .env 파일에서 환경변수 로드 (로컬 실행 시 필수)
const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const { initDB, sql } = require('./db/database');

const app = express();
// Cloud Run은 PORT 환경변수를 자동 설정 (보통 8080)
// 로컬에서는 .env의 PORT 또는 기본값 3001 사용
const PORT = process.env.PORT || 3001;

// View engine - EJS 템플릿 사용
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Cloud Run 프록시 뒤에서 secure 쿠키 사용을 위해 필요
app.set('trust proxy', 1);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// cookie-session: Cloud Run 다중 인스턴스 스케일링에 안전 (서버 메모리에 의존하지 않음)
app.use(cookieSession({
  name: '__session',
  keys: [process.env.SESSION_SECRET || 'chanwoo-math-academy-secret-key-2024'],
  maxAge: 24 * 60 * 60 * 1000, // 24시간
  signed: false
}));

// Firebase Hosting CDN 캐시 방지 (Set-Cookie 헤더가 무시되지 않도록)
app.use((req, res, next) => {
  res.set('Cache-Control', 'private');
  next();
});

// 템플릿에 세션 유저 정보 전달
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const adminRoutes = require('./routes/admin');

// /management 하위 라우터
const mgmt = express.Router();

// basePath + role 기반 sectionPath 설정
mgmt.use((req, res, next) => {
  res.locals.basePath = '/management';
  if (req.session.user) {
    const role = req.session.user.role;
    res.locals.sectionPath = (role === 'admin' || role === 'subadmin')
      ? '/management/admin' : role === 'teacher'
      ? '/management/teacher' : '/management/student';
  }
  next();
});

// 로그인 페이지
mgmt.get('/', (req, res) => {
  if (req.session.user) {
    const role = req.session.user.role;
    if (role === 'admin' || role === 'subadmin') return res.redirect('/management/admin');
    if (role === 'teacher') return res.redirect('/management/teacher');
    return res.redirect('/management/student');
  }
  res.render('login', { error: null });
});

// 회원가입 페이지
mgmt.get('/register', (req, res) => {
  res.render('register', { error: null });
});

mgmt.use('/auth', authRoutes);
mgmt.use('/admin', adminRoutes);
mgmt.use('/teacher', adminRoutes);
mgmt.use('/student', studentRoutes);

app.use('/management', mgmt);

// 루트: 향후 랜딩페이지용 (리다이렉트 없음)

// Public profile image serving (no auth)
app.get('/schedule-profile-image/:filePath(*)', async (req, res) => {
  try {
    const { downloadFile } = require('./utils/drive');
    const { buffer, mimeType } = await downloadFile(req.params.filePath);
    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    console.error('Public profile image error:', err);
    res.status(404).send('Image not found');
  }
});

// Public schedule page (no auth)
app.get('/p/:slug', async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM schedule_pages WHERE slug = ${req.params.slug} AND status = 'published'`;
    if (rows.length === 0) return res.render('schedule-public-404');

    const page = rows[0];
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
  } catch (err) {
    console.error('Public schedule error:', err);
    res.render('schedule-public-404');
  }
});

// DB 초기화 후 서버 시작
// - initDB()가 Supabase 연결 확인 + 빈 DB면 시드 데이터 자동 삽입
// - Cloud Run 배포 시 이 로그는 gcloud run services logs read 명령으로 확인 가능
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`[서버 시작] http://localhost:${PORT} (환경: ${process.env.NODE_ENV || 'development'})`);
    console.log(`[DB] Supabase 연결 완료`);
    console.log(`[Storage] GCS 버킷: ${process.env.GCS_BUCKET_NAME || '미설정'}`);
  });
}).catch(err => {
  console.error('[서버 시작 실패] DB 초기화 오류:', err);
  process.exit(1);
});
