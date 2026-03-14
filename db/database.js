const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data.db');

let db = null;

async function initDB() {
  const SQL = await initSqlJs();

  // v2: 항상 새로 시작 (기존 DB 삭제)
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('기존 data.db 삭제 완료');
  }

  db = new SQL.Database();
  createTables();
  await seedData();
  saveDB();

  return db;
}

function getDB() {
  return db;
}

function saveDB() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      birth_date TEXT,
      school TEXT,
      gender TEXT,
      grade INTEGER,
      parent_phone TEXT,
      email TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'regular',
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS class_teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      teacher_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(class_id, teacher_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS class_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      student_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'active',
      enrolled_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(class_id, student_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      student_id INTEGER NOT NULL REFERENCES users(id),
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      submitted_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS graded_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      student_id INTEGER NOT NULL REFERENCES users(id),
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_at TEXT DEFAULT (datetime('now','localtime')),
      is_new INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS class_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      student_id INTEGER NOT NULL REFERENCES users(id),
      schedule_id INTEGER NOT NULL REFERENCES class_schedules(id),
      score INTEGER,
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(class_id, student_id, schedule_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS student_feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id),
      author_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS student_consultations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id),
      author_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS class_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      schedule_date TEXT NOT NULL,
      start_time TEXT DEFAULT '',
      end_time TEXT DEFAULT '',
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS schedule_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      slot_number INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      slug TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      header_data TEXT DEFAULT '{}',
      schedule_data TEXT DEFAULT '{}',
      syllabus_data TEXT DEFAULT '{}',
      theme_data TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(owner_id, slot_number)
    )
  `);
}

async function seedData() {
  const adminHash = bcrypt.hashSync('admin1234', 10);
  const teacherHash = bcrypt.hashSync('teacher1234', 10);
  const studentHash = bcrypt.hashSync('password123', 10);

  // 1 admin
  db.run(
    `INSERT INTO users (username, name, password, role) VALUES (?, ?, ?, ?)`,
    ['admin', '원장', adminHash, 'admin']
  );

  // 3 teachers
  const teachers = [
    { username: 'teacher1', name: '김선생' },
    { username: 'teacher2', name: '이선생' },
    { username: 'teacher3', name: '박선생' },
  ];
  teachers.forEach(t => {
    db.run(
      `INSERT INTO users (username, name, password, role) VALUES (?, ?, ?, ?)`,
      [t.username, t.name, teacherHash, 'teacher']
    );
  });

  // 30 students
  const schools = [
    'Seoul International School',
    'Korea International School',
    'Seoul Foreign School',
    'Dulwich College Seoul',
    'Yongsan International School',
    'Chadwick International',
  ];
  const studentNames = [
    '김민준', '이서연', '박지호', '최수아', '정현우',
    '강하은', '조민서', '윤지유', '임도현', '한소율',
    '오준서', '서예린', '신우진', '권나은', '황시우',
    '송지아', '문건우', '배서현', '류태윤', '장하린',
    '양서준', '홍채원', '전도윤', '고은서', '남시현',
    '천유나', '하지안', '백승현', '구하영', '노윤호',
  ];
  const studentNamesEn = [
    'James Kim', 'Emily Lee', 'Daniel Park', 'Sophia Choi', 'Ryan Jung',
    'Grace Kang', 'Kevin Jo', 'Olivia Yoon', 'Ethan Im', 'Chloe Han',
    'Jason Oh', 'Rachel Seo', 'Brian Shin', 'Hannah Kwon', 'Alex Hwang',
    'Ashley Song', 'David Moon', 'Jessica Bae', 'Chris Ryu', 'Sarah Jang',
    'Eric Yang', 'Michelle Hong', 'Justin Jeon', 'Angela Go', 'Samuel Nam',
    'Victoria Cheon', 'Jennifer Ha', 'Andrew Baek', 'Amy Gu', 'William Noh',
  ];
  const genders = ['남', '여', '남', '여', '남', '여', '남', '여', '남', '여',
                   '남', '여', '남', '여', '남', '여', '남', '여', '남', '여',
                   '남', '여', '남', '여', '남', '여', '여', '남', '여', '남'];

  for (let i = 0; i < 30; i++) {
    const username = `student${String(i + 1).padStart(4, '0')}`;
    const email = `${username}@email.com`;
    const school = schools[i % schools.length];
    const grade = 7 + (i % 6); // grades 7~12
    const birthYear = 2012 - (i % 6);
    const birthMonth = String((i % 12) + 1).padStart(2, '0');
    const birthDay = String((i % 28) + 1).padStart(2, '0');
    const birth = `${birthYear}-${birthMonth}-${birthDay}`;
    const phone = `010-1234-${String(i + 1).padStart(4, '0')}`;

    db.run(
      `INSERT INTO users (username, name, name_en, password, role, birth_date, school, gender, grade, parent_phone, email)
       VALUES (?, ?, ?, ?, 'student', ?, ?, ?, ?, ?, ?)`,
      [username, studentNames[i], studentNamesEn[i], studentHash, birth, school, genders[i], grade, phone, email]
    );
  }

  // 7 sample classes
  const classData = [
    { name: '수학 심화반 A', type: 'regular' },
    { name: '수학 심화반 B', type: 'regular' },
    { name: '수학 기초반', type: 'regular' },
    { name: 'SAT Math', type: 'team' },
    { name: '개인 지도 A', type: 'private' },
    { name: '개인 지도 B', type: 'private' },
    { name: '개인 지도 C', type: 'private' },
  ];
  classData.forEach(c => {
    db.run(`INSERT INTO classes (name, type) VALUES (?, ?)`, [c.name, c.type]);
  });

  // Teacher assignments: teacher1→class1,2  teacher2→class3,4  teacher3(박선생)→class5,6,7
  const teacherClassMap = [
    { teacherId: 2, classId: 1 }, // teacher1 → 수학 심화반 A
    { teacherId: 2, classId: 2 }, // teacher1 → 수학 심화반 B
    { teacherId: 3, classId: 3 }, // teacher2 → 수학 기초반
    { teacherId: 3, classId: 4 }, // teacher2 → SAT Math
    { teacherId: 4, classId: 5 }, // teacher3(박선생) → 개인 지도 A
    { teacherId: 4, classId: 6 }, // teacher3(박선생) → 개인 지도 B
    { teacherId: 4, classId: 7 }, // teacher3(박선생) → 개인 지도 C
  ];
  teacherClassMap.forEach(tc => {
    db.run(`INSERT INTO class_teachers (class_id, teacher_id) VALUES (?, ?)`, [tc.classId, tc.teacherId]);
  });

  // Enroll students: 6 students per regular/team class, 1 student per private class
  // Students 5~34 (user IDs), classes 1~7
  // Class 1: students 1-6, Class 2: 7-12, Class 3: 13-18, Class 4: 19-24
  for (let classId = 1; classId <= 4; classId++) {
    const startIdx = (classId - 1) * 6;
    for (let j = 0; j < 6; j++) {
      const studentId = 5 + startIdx + j; // user IDs start at 5 (admin=1, teachers=2,3,4)
      db.run(`INSERT INTO class_enrollments (class_id, student_id) VALUES (?, ?)`, [classId, studentId]);
    }
  }
  // 개인 지도 A/B/C: 각 1명씩
  db.run(`INSERT INTO class_enrollments (class_id, student_id) VALUES (?, ?)`, [5, 29]); // 개인 지도 A
  db.run(`INSERT INTO class_enrollments (class_id, student_id) VALUES (?, ?)`, [6, 30]); // 개인 지도 B
  db.run(`INSERT INTO class_enrollments (class_id, student_id) VALUES (?, ?)`, [7, 31]); // 개인 지도 C

  // 수학 심화반 A의 학생 2명을 수학 심화반 B에도 등록 (겹치는 학생 예시)
  db.run(`INSERT INTO class_enrollments (class_id, student_id) VALUES (?, ?)`, [2, 5]);  // 김민준 → 수학 심화반 B
  db.run(`INSERT INTO class_enrollments (class_id, student_id) VALUES (?, ?)`, [2, 6]);  // 이서연 → 수학 심화반 B

  // Sample class schedules
  // teacher1(김선생) 담당: class 1(수학 심화반 A), class 2(수학 심화반 B)
  // 오늘: 2026-03-06(금), 이번 주: 3/2(월)~3/8(일)
  const schedules = [
    // === 수학 심화반 A (class 1) - 매주 월/목 ===
    { classId: 1, date: '2026-03-02', start: '19:00', end: '22:00', desc: '집합과 명제' },
    { classId: 1, date: '2026-03-05', start: '19:00', end: '22:00', desc: '함수의 극한' },
    { classId: 1, date: '2026-03-06', start: '10:00', end: '12:00', desc: '보충 수업' },
    { classId: 1, date: '2026-03-09', start: '19:00', end: '22:00', desc: '미분 기초' },
    { classId: 1, date: '2026-03-12', start: '19:00', end: '22:00', desc: '미분 응용' },
    { classId: 1, date: '2026-03-16', start: '19:00', end: '22:00', desc: '적분 기초' },
    { classId: 1, date: '2026-03-19', start: '19:00', end: '22:00', desc: '적분 응용' },
    { classId: 1, date: '2026-03-23', start: '19:00', end: '22:00', desc: '종합 복습' },
    { classId: 1, date: '2026-03-26', start: '19:00', end: '22:00', desc: '진도 평가' },
    { classId: 1, date: '2026-03-30', start: '19:00', end: '22:00', desc: '월말 테스트' },

    // === 수학 심화반 B (class 2) - 매주 화/금 ===
    { classId: 2, date: '2026-03-03', start: '17:00', end: '19:00', desc: '수열의 극한' },
    { classId: 2, date: '2026-03-06', start: '15:00', end: '17:00', desc: '급수 정리' },
    { classId: 2, date: '2026-03-06', start: '17:00', end: '19:00', desc: '급수' },
    { classId: 2, date: '2026-03-10', start: '17:00', end: '19:00', desc: '지수와 로그' },
    { classId: 2, date: '2026-03-13', start: '17:00', end: '19:00', desc: '지수함수' },
    { classId: 2, date: '2026-03-17', start: '17:00', end: '19:00', desc: '로그함수' },
    { classId: 2, date: '2026-03-20', start: '17:00', end: '19:00', desc: '진단 평가' },
    { classId: 2, date: '2026-03-24', start: '17:00', end: '19:00', desc: '삼각함수' },
    { classId: 2, date: '2026-03-27', start: '17:00', end: '19:00', desc: '삼각함수 응용' },
    { classId: 2, date: '2026-03-31', start: '17:00', end: '19:00', desc: '월말 테스트' },
  ];
  schedules.forEach(s => {
    db.run('INSERT INTO class_schedules (class_id, schedule_date, start_time, end_time, description) VALUES (?, ?, ?, ?, ?)',
      [s.classId, s.date, s.start, s.end, s.desc || '']);
  });

  // === 수학 심화반 A 모의 성적 데이터 ===
  // class_id=1, students: 5(김민준),6(이서연),7(박지호),8(최수아),9(정현우),10(강하은)
  // 지난 수업 schedule IDs: 1(3/2 집합과 명제), 2(3/5 함수의 극한), 3(3/6 보충수업), 4(3/9 미분기초)
  const mockScores = [
    // 김민준 - 상위권, 꾸준한 성적
    { classId: 1, studentId: 5, scheduleId: 1, score: 92 },
    { classId: 1, studentId: 5, scheduleId: 2, score: 88 },
    { classId: 1, studentId: 5, scheduleId: 3, score: 95 },
    { classId: 1, studentId: 5, scheduleId: 4, score: 90 },
    // 이서연 - 최상위권, 점점 오르는 추세
    { classId: 1, studentId: 6, scheduleId: 1, score: 85 },
    { classId: 1, studentId: 6, scheduleId: 2, score: 90 },
    { classId: 1, studentId: 6, scheduleId: 3, score: 94 },
    { classId: 1, studentId: 6, scheduleId: 4, score: 98 },
    // 박지호 - 중상위권, 약간 들쭉날쭉
    { classId: 1, studentId: 7, scheduleId: 1, score: 78 },
    { classId: 1, studentId: 7, scheduleId: 2, score: 85 },
    { classId: 1, studentId: 7, scheduleId: 3, score: 72 },
    { classId: 1, studentId: 7, scheduleId: 4, score: 80 },
    // 최수아 - 중위권, 서서히 향상
    { classId: 1, studentId: 8, scheduleId: 1, score: 65 },
    { classId: 1, studentId: 8, scheduleId: 2, score: 70 },
    { classId: 1, studentId: 8, scheduleId: 3, score: 75 },
    { classId: 1, studentId: 8, scheduleId: 4, score: 78 },
    // 정현우 - 상위권인데 가끔 실수
    { classId: 1, studentId: 9, scheduleId: 1, score: 95 },
    { classId: 1, studentId: 9, scheduleId: 2, score: 72 },
    { classId: 1, studentId: 9, scheduleId: 3, score: 88 },
    { classId: 1, studentId: 9, scheduleId: 4, score: 93 },
    // 강하은 - 기초부터 차근차근 오르는 중
    { classId: 1, studentId: 10, scheduleId: 1, score: 55 },
    { classId: 1, studentId: 10, scheduleId: 2, score: 62 },
    { classId: 1, studentId: 10, scheduleId: 3, score: 68 },
    { classId: 1, studentId: 10, scheduleId: 4, score: 74 },
  ];
  mockScores.forEach(s => {
    db.run('INSERT INTO class_scores (class_id, student_id, schedule_id, score) VALUES (?, ?, ?, ?)',
      [s.classId, s.studentId, s.scheduleId, s.score]);
  });

  // === Schedule Pages seed data ===
  const sampleHeaderData1 = JSON.stringify({
    programTitle: '2026 Summer Math Bootcamp',
    subtitle: 'Intensive 8-Week Program',
    description: 'Kevin Academy의 여름 집중 수학 프로그램입니다. SAT, AP Calculus, Competition Math를 체계적으로 학습합니다.',
    cards: [
      { title: '8주 집중', desc: '체계적 커리큘럼' },
      { title: '소수 정예', desc: '반별 최대 6명' },
      { title: '매일 테스트', desc: '학습 성과 확인' }
    ],
    highlights: ['SAT Math 800점 목표', 'AP Calculus AB/BC 대비', '수학 경시대회 준비']
  });
  const sampleScheduleData1 = JSON.stringify({
    days: ['월', '화', '수', '목', '금'],
    blocks: [
      // 월
      { day: '월', start: '09:00', end: '10:30', subject: 'SAT Math', color: '#3498DB' },
      { day: '월', start: '10:45', end: '12:15', subject: 'AP Calculus', color: '#E74C3C' },
      { day: '월', start: '13:15', end: '14:45', subject: 'Competition', color: '#27AE60' },
      { day: '월', start: '15:00', end: '16:30', subject: 'Review', color: '#F39C12' },
      // 화
      { day: '화', start: '09:00', end: '10:30', subject: 'AP Calculus', color: '#E74C3C' },
      { day: '화', start: '10:45', end: '12:15', subject: 'SAT Math', color: '#3498DB' },
      { day: '화', start: '13:15', end: '14:45', subject: 'SAT Math', color: '#3498DB' },
      { day: '화', start: '15:00', end: '16:30', subject: 'Competition', color: '#27AE60' },
      // 수
      { day: '수', start: '09:00', end: '10:30', subject: 'Competition', color: '#27AE60' },
      { day: '수', start: '10:45', end: '12:15', subject: 'Review', color: '#F39C12' },
      { day: '수', start: '14:00', end: '15:30', subject: 'AP Calculus', color: '#E74C3C' },
      { day: '수', start: '16:00', end: '17:00', subject: 'Office Hours', color: '#1ABC9C' },
      // 목
      { day: '목', start: '09:00', end: '10:30', subject: 'SAT Math', color: '#3498DB' },
      { day: '목', start: '10:45', end: '12:15', subject: 'Competition', color: '#27AE60' },
      { day: '목', start: '13:15', end: '14:45', subject: 'Review', color: '#F39C12' },
      { day: '목', start: '15:00', end: '16:30', subject: 'AP Calculus', color: '#E74C3C' },
      // 금
      { day: '금', start: '09:00', end: '10:30', subject: 'Review', color: '#F39C12' },
      { day: '금', start: '10:45', end: '12:15', subject: 'AP Calculus', color: '#E74C3C' },
      { day: '금', start: '14:00', end: '16:00', subject: 'Weekly Test', color: '#9B59B6' }
    ]
  });
  const sampleSyllabusData1 = JSON.stringify({
    subjects: [
      {
        name: 'SAT Math',
        description: 'SAT 수학 섹션 완벽 대비 과정',
        promo: '체계적인 문제 유형 분석과 실전 연습으로 800점을 목표로 합니다.',
        highlights: ['Problem Solving & Data Analysis', 'Heart of Algebra', 'Passport to Advanced Math'],
        placement: 'SAT 모의고사 600점 이상 권장',
        weeklyPlan: [
          { week: 'Week 1-2', topic: 'Heart of Algebra 집중' },
          { week: 'Week 3-4', topic: 'Problem Solving & Data Analysis' },
          { week: 'Week 5-6', topic: 'Passport to Advanced Math' },
          { week: 'Week 7-8', topic: '실전 모의고사 & 리뷰' }
        ]
      },
      {
        name: 'AP Calculus',
        description: 'AP Calculus AB/BC 대비 과정',
        promo: '미적분의 핵심 개념부터 AP 시험 대비까지 완벽하게 준비합니다.',
        highlights: ['Limits & Continuity', 'Differentiation', 'Integration', 'Series (BC)'],
        placement: 'Pre-Calculus 이수자',
        weeklyPlan: [
          { week: 'Week 1-2', topic: 'Limits & Continuity' },
          { week: 'Week 3-4', topic: 'Differentiation' },
          { week: 'Week 5-6', topic: 'Integration' },
          { week: 'Week 7-8', topic: 'AP 실전 문제 풀이' }
        ]
      },
      {
        name: 'Competition Math',
        description: 'AMC/AIME 수학 경시대회 대비',
        promo: '창의적 문제 해결 능력을 기르고 경시대회에서 높은 성적을 목표로 합니다.',
        highlights: ['Number Theory', 'Combinatorics', 'Geometry', 'Algebra'],
        placement: 'AMC 10 기준 100점 이상 권장',
        weeklyPlan: [
          { week: 'Week 1-2', topic: 'Number Theory & Combinatorics' },
          { week: 'Week 3-4', topic: 'Geometry & Algebra' },
          { week: 'Week 5-6', topic: '고난도 문제 풀이' },
          { week: 'Week 7-8', topic: '모의 경시대회' }
        ]
      }
    ]
  });
  const sampleThemeData1 = JSON.stringify({
    heroBg: '#1a1a2e',
    accent: '#e94560'
  });

  db.run(`INSERT INTO schedule_pages (owner_id, slot_number, title, slug, status, header_data, schedule_data, syllabus_data, theme_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [1, 1, '2026 Summer Math Bootcamp', 'summer-bootcamp-2026', 'published',
      sampleHeaderData1, sampleScheduleData1, sampleSyllabusData1, sampleThemeData1]);

  const sampleHeaderData2 = JSON.stringify({
    programTitle: '2026 가을학기 정규반',
    subtitle: '9월~12월 정규 프로그램',
    description: '기초부터 심화까지 체계적인 수학 학습 프로그램입니다.',
    cards: [
      { title: '16주 과정', desc: '정규 커리큘럼' },
      { title: '주 3회', desc: '월/수/금 수업' }
    ],
    highlights: ['수학 기초 다지기', '내신 대비', '수능 수학 준비']
  });
  const sampleThemeData2 = JSON.stringify({ heroBg: '#0f3460', accent: '#e94560' });

  db.run(`INSERT INTO schedule_pages (owner_id, slot_number, title, slug, status, header_data, schedule_data, syllabus_data, theme_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [1, 2, '2026 가을학기 정규반', 'fall-2026-regular', 'draft',
      sampleHeaderData2, '{}', '{}', sampleThemeData2]);

  console.log('시드 데이터 생성 완료: 원장 1명 + 강사 3명 + 학생 30명 + 수업 7개 + 모의 성적 24건 + 시간표 페이지 2개');
}

// Helper: check if user can access a class
function canAccessClass(db, userId, role, classId) {
  if (role === 'admin') return true;
  const stmt = db.prepare('SELECT id FROM class_teachers WHERE class_id = ? AND teacher_id = ?');
  stmt.bind([classId, userId]);
  const has = stmt.step();
  stmt.free();
  return has;
}

// Helper: get teacher's class IDs
function getTeacherClassIds(db, teacherId) {
  const stmt = db.prepare('SELECT class_id FROM class_teachers WHERE teacher_id = ?');
  stmt.bind([teacherId]);
  const ids = [];
  while (stmt.step()) {
    ids.push(stmt.getAsObject().class_id);
  }
  stmt.free();
  return ids;
}

// Helper: get student IDs from teacher's classes
function getTeacherStudentIds(db, teacherId) {
  const classIds = getTeacherClassIds(db, teacherId);
  if (classIds.length === 0) return [];
  const ph = classIds.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT DISTINCT student_id FROM class_enrollments WHERE class_id IN (${ph}) AND status = 'active'`);
  stmt.bind(classIds);
  const ids = [];
  while (stmt.step()) {
    ids.push(stmt.getAsObject().student_id);
  }
  stmt.free();
  return ids;
}

module.exports = { initDB, getDB, saveDB, canAccessClass, getTeacherClassIds, getTeacherStudentIds };
