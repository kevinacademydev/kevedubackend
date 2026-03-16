// ============================================================
// Supabase (PostgreSQL) 데이터베이스 연결 및 초기화
// ============================================================
//
// ▶ 연결 정보:
//   DATABASE_URL 형식: postgresql://유저:비밀번호@호스트:포트/DB명
//   Supabase Transaction Pooler (port 6543) 사용 권장 (IPv6 이슈 방지)
//
// ▶ 테이블 생성:
//   최초 1회 Supabase SQL Editor에서 db/migration.sql 실행 필요
//   (11개 테이블: users, classes, class_teachers, class_enrollments,
//    class_schedules, submissions, graded_files, class_scores,
//    student_feedbacks, student_consultations, schedule_pages)
//
// ▶ 시드 데이터:
//   빈 DB 감지 시 자동 삽입 (원장1 + 강사3 + 학생30 + 수업7 + 성적24 + 시간표2)
// ============================================================

const postgres = require('postgres');
const bcrypt = require('bcryptjs');

// Supabase Direct Connection이 IPv6만 반환하는 경우 대비
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

// postgres.js 클라이언트 설정
// - ssl: Supabase 연결 시 필수
// - max: 최대 커넥션 수 (Cloud Run 인스턴스당)
// - idle_timeout: 유휴 커넥션 제거 시간(초)
// - connect_timeout: 연결 시도 제한 시간(초)
const sql = postgres(process.env.DATABASE_URL, {
  ssl: { rejectUnauthorized: false },
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10
});

// DB 초기화: 테이블 존재 확인 + 시드 데이터 삽입
// Cloud Run 배포 후 컨테이너 시작 시 자동 실행됨
async function initDB() {
  const tables = await sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users'
  `;
  if (tables.length === 0) {
    console.log('[DB] 테이블이 없습니다. migration.sql을 먼저 Supabase SQL Editor에서 실행해주세요.');
    process.exit(1);
  }
  await seedIfEmpty();
  console.log('[DB] 연결 완료');
}

async function seedIfEmpty() {
  const users = await sql`SELECT id FROM users LIMIT 1`;
  if (users.length > 0) return;

  console.log('빈 DB 감지 - 시드 데이터 생성 중...');

  const adminHash = bcrypt.hashSync('admin1234', 10);
  const teacherHash = bcrypt.hashSync('teacher1234', 10);
  const studentHash = bcrypt.hashSync('password123', 10);

  // admin
  await sql`INSERT INTO users (username, name, password, role) VALUES ('admin', '원장', ${adminHash}, 'admin')`;

  // 3 teachers
  const teachers = [
    { username: 'teacher1', name: '김선생' },
    { username: 'teacher2', name: '이선생' },
    { username: 'teacher3', name: '박선생' },
  ];
  for (const t of teachers) {
    await sql`INSERT INTO users (username, name, password, role) VALUES (${t.username}, ${t.name}, ${teacherHash}, 'teacher')`;
  }

  // 30 students
  const schools = [
    'Seoul International School', 'Korea International School', 'Seoul Foreign School',
    'Dulwich College Seoul', 'Yongsan International School', 'Chadwick International',
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
  const genders = ['남','여','남','여','남','여','남','여','남','여',
                   '남','여','남','여','남','여','남','여','남','여',
                   '남','여','남','여','남','여','여','남','여','남'];

  for (let i = 0; i < 30; i++) {
    const username = `student${String(i + 1).padStart(4, '0')}`;
    const email = `${username}@email.com`;
    const school = schools[i % schools.length];
    const grade = 7 + (i % 6);
    const birthYear = 2012 - (i % 6);
    const birthMonth = String((i % 12) + 1).padStart(2, '0');
    const birthDay = String((i % 28) + 1).padStart(2, '0');
    const birth = `${birthYear}-${birthMonth}-${birthDay}`;
    const phone = `010-1234-${String(i + 1).padStart(4, '0')}`;

    await sql`INSERT INTO users (username, name, name_en, password, role, birth_date, school, gender, grade, parent_phone, email)
      VALUES (${username}, ${studentNames[i]}, ${studentNamesEn[i]}, ${studentHash}, 'student', ${birth}, ${school}, ${genders[i]}, ${grade}, ${phone}, ${email})`;
  }

  // 7 classes
  const classData = [
    { name: '수학 심화반 A', type: 'regular' },
    { name: '수학 심화반 B', type: 'regular' },
    { name: '수학 기초반', type: 'regular' },
    { name: 'SAT Math', type: 'team' },
    { name: '개인 지도 A', type: 'private' },
    { name: '개인 지도 B', type: 'private' },
    { name: '개인 지도 C', type: 'private' },
  ];
  for (const c of classData) {
    await sql`INSERT INTO classes (name, type) VALUES (${c.name}, ${c.type})`;
  }

  // Teacher assignments
  const teacherClassMap = [
    { teacherId: 2, classId: 1 }, { teacherId: 2, classId: 2 },
    { teacherId: 3, classId: 3 }, { teacherId: 3, classId: 4 },
    { teacherId: 4, classId: 5 }, { teacherId: 4, classId: 6 }, { teacherId: 4, classId: 7 },
  ];
  for (const tc of teacherClassMap) {
    await sql`INSERT INTO class_teachers (class_id, teacher_id) VALUES (${tc.classId}, ${tc.teacherId})`;
  }

  // Enrollments
  for (let classId = 1; classId <= 4; classId++) {
    const startIdx = (classId - 1) * 6;
    for (let j = 0; j < 6; j++) {
      const studentId = 5 + startIdx + j;
      await sql`INSERT INTO class_enrollments (class_id, student_id) VALUES (${classId}, ${studentId})`;
    }
  }
  await sql`INSERT INTO class_enrollments (class_id, student_id) VALUES (5, 29)`;
  await sql`INSERT INTO class_enrollments (class_id, student_id) VALUES (6, 30)`;
  await sql`INSERT INTO class_enrollments (class_id, student_id) VALUES (7, 31)`;
  await sql`INSERT INTO class_enrollments (class_id, student_id) VALUES (2, 5)`;
  await sql`INSERT INTO class_enrollments (class_id, student_id) VALUES (2, 6)`;

  // Schedules
  const schedules = [
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
  for (const s of schedules) {
    await sql`INSERT INTO class_schedules (class_id, schedule_date, start_time, end_time, description)
      VALUES (${s.classId}, ${s.date}, ${s.start}, ${s.end}, ${s.desc})`;
  }

  // Mock scores
  const mockScores = [
    { classId: 1, studentId: 5, scheduleId: 1, score: 92 },
    { classId: 1, studentId: 5, scheduleId: 2, score: 88 },
    { classId: 1, studentId: 5, scheduleId: 3, score: 95 },
    { classId: 1, studentId: 5, scheduleId: 4, score: 90 },
    { classId: 1, studentId: 6, scheduleId: 1, score: 85 },
    { classId: 1, studentId: 6, scheduleId: 2, score: 90 },
    { classId: 1, studentId: 6, scheduleId: 3, score: 94 },
    { classId: 1, studentId: 6, scheduleId: 4, score: 98 },
    { classId: 1, studentId: 7, scheduleId: 1, score: 78 },
    { classId: 1, studentId: 7, scheduleId: 2, score: 85 },
    { classId: 1, studentId: 7, scheduleId: 3, score: 72 },
    { classId: 1, studentId: 7, scheduleId: 4, score: 80 },
    { classId: 1, studentId: 8, scheduleId: 1, score: 65 },
    { classId: 1, studentId: 8, scheduleId: 2, score: 70 },
    { classId: 1, studentId: 8, scheduleId: 3, score: 75 },
    { classId: 1, studentId: 8, scheduleId: 4, score: 78 },
    { classId: 1, studentId: 9, scheduleId: 1, score: 95 },
    { classId: 1, studentId: 9, scheduleId: 2, score: 72 },
    { classId: 1, studentId: 9, scheduleId: 3, score: 88 },
    { classId: 1, studentId: 9, scheduleId: 4, score: 93 },
    { classId: 1, studentId: 10, scheduleId: 1, score: 55 },
    { classId: 1, studentId: 10, scheduleId: 2, score: 62 },
    { classId: 1, studentId: 10, scheduleId: 3, score: 68 },
    { classId: 1, studentId: 10, scheduleId: 4, score: 74 },
  ];
  for (const s of mockScores) {
    await sql`INSERT INTO class_scores (class_id, student_id, schedule_id, score)
      VALUES (${s.classId}, ${s.studentId}, ${s.scheduleId}, ${s.score})`;
  }

  // Schedule pages
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
      { day: '월', start: '09:00', end: '10:30', subject: 'SAT Math', color: '#3498DB' },
      { day: '월', start: '10:45', end: '12:15', subject: 'AP Calculus', color: '#E74C3C' },
      { day: '월', start: '13:15', end: '14:45', subject: 'Competition', color: '#27AE60' },
      { day: '월', start: '15:00', end: '16:30', subject: 'Review', color: '#F39C12' },
      { day: '화', start: '09:00', end: '10:30', subject: 'AP Calculus', color: '#E74C3C' },
      { day: '화', start: '10:45', end: '12:15', subject: 'SAT Math', color: '#3498DB' },
      { day: '화', start: '13:15', end: '14:45', subject: 'SAT Math', color: '#3498DB' },
      { day: '화', start: '15:00', end: '16:30', subject: 'Competition', color: '#27AE60' },
      { day: '수', start: '09:00', end: '10:30', subject: 'Competition', color: '#27AE60' },
      { day: '수', start: '10:45', end: '12:15', subject: 'Review', color: '#F39C12' },
      { day: '수', start: '14:00', end: '15:30', subject: 'AP Calculus', color: '#E74C3C' },
      { day: '수', start: '16:00', end: '17:00', subject: 'Office Hours', color: '#1ABC9C' },
      { day: '목', start: '09:00', end: '10:30', subject: 'SAT Math', color: '#3498DB' },
      { day: '목', start: '10:45', end: '12:15', subject: 'Competition', color: '#27AE60' },
      { day: '목', start: '13:15', end: '14:45', subject: 'Review', color: '#F39C12' },
      { day: '목', start: '15:00', end: '16:30', subject: 'AP Calculus', color: '#E74C3C' },
      { day: '금', start: '09:00', end: '10:30', subject: 'Review', color: '#F39C12' },
      { day: '금', start: '10:45', end: '12:15', subject: 'AP Calculus', color: '#E74C3C' },
      { day: '금', start: '14:00', end: '16:00', subject: 'Weekly Test', color: '#9B59B6' }
    ]
  });
  const sampleSyllabusData1 = JSON.stringify({
    subjects: [
      {
        name: 'SAT Math', description: 'SAT 수학 섹션 완벽 대비 과정',
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
        name: 'AP Calculus', description: 'AP Calculus AB/BC 대비 과정',
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
        name: 'Competition Math', description: 'AMC/AIME 수학 경시대회 대비',
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
  const sampleThemeData1 = JSON.stringify({ heroBg: '#1a1a2e', accent: '#e94560' });

  await sql`INSERT INTO schedule_pages (owner_id, slot_number, title, slug, status, header_data, schedule_data, syllabus_data, theme_data)
    VALUES (1, 1, '2026 Summer Math Bootcamp', 'summer-bootcamp-2026', 'published',
      ${sampleHeaderData1}, ${sampleScheduleData1}, ${sampleSyllabusData1}, ${sampleThemeData1})`;

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

  await sql`INSERT INTO schedule_pages (owner_id, slot_number, title, slug, status, header_data, schedule_data, syllabus_data, theme_data)
    VALUES (1, 2, '2026 가을학기 정규반', 'fall-2026-regular', 'draft',
      ${sampleHeaderData2}, '{}', '{}', ${sampleThemeData2})`;

  console.log('시드 데이터 생성 완료: 원장 1명 + 강사 3명 + 학생 30명 + 수업 7개 + 모의 성적 24건 + 시간표 페이지 2개');
}

// Helper: check if user can access a class
async function canAccessClass(userId, role, classId) {
  if (role === 'admin' || role === 'subadmin') return true;
  const rows = await sql`SELECT id FROM class_teachers WHERE class_id = ${classId} AND teacher_id = ${userId}`;
  return rows.length > 0;
}

// Helper: get teacher's class IDs
async function getTeacherClassIds(teacherId) {
  const rows = await sql`SELECT class_id FROM class_teachers WHERE teacher_id = ${teacherId}`;
  return rows.map(r => r.class_id);
}

// Helper: get student IDs from teacher's classes
async function getTeacherStudentIds(teacherId) {
  const classIds = await getTeacherClassIds(teacherId);
  if (classIds.length === 0) return [];
  const rows = await sql`
    SELECT DISTINCT student_id FROM class_enrollments
    WHERE class_id = ANY(${classIds}) AND status = 'active'
  `;
  return rows.map(r => r.student_id);
}

module.exports = { sql, initDB, canAccessClass, getTeacherClassIds, getTeacherStudentIds };
