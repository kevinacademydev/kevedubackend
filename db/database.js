const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data.db');

let db = null;

async function initDB() {
  const SQL = await initSqlJs();

  // 기존 DB 파일이 있으면 로드, 없으면 새로 생성
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    migrateDB();
  } else {
    db = new SQL.Database();
    createTables();
    await seedData();
    saveDB();
  }

  return db;
}

function migrateDB() {
  // 기존 DB에 새 테이블 추가 (CREATE TABLE IF NOT EXISTS)
  db.run(`
    CREATE TABLE IF NOT EXISTS extra_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 1,
      total_amount INTEGER NOT NULL DEFAULT 3000,
      status TEXT NOT NULL DEFAULT 'payment_pending',
      requested_at TEXT DEFAULT (datetime('now', 'localtime')),
      approved_at TEXT,
      admin_note TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS extra_request_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      FOREIGN KEY (request_id) REFERENCES extra_requests(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS student_classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      class_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS class_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_class_id INTEGER NOT NULL,
      session_number INTEGER NOT NULL,
      score INTEGER,
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (student_class_id) REFERENCES student_classes(id)
    )
  `);

  saveDB();
  console.log('DB 마이그레이션 완료: 모든 테이블 확인');
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
      student_id TEXT UNIQUE,
      name TEXT NOT NULL,
      birth_date TEXT,
      classes TEXT,
      school TEXT,
      parent_phone TEXT,
      gender TEXT,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      submitted_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS graded_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_at TEXT DEFAULT (datetime('now', 'localtime')),
      is_new INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS extra_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 1,
      total_amount INTEGER NOT NULL DEFAULT 3000,
      status TEXT NOT NULL DEFAULT 'payment_pending',
      requested_at TEXT DEFAULT (datetime('now', 'localtime')),
      approved_at TEXT,
      admin_note TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS extra_request_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      FOREIGN KEY (request_id) REFERENCES extra_requests(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS student_classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      class_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS class_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_class_id INTEGER NOT NULL,
      session_number INTEGER NOT NULL,
      score INTEGER,
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (student_class_id) REFERENCES student_classes(id)
    )
  `);
}

async function seedData() {
  // 어드민 계정
  const adminHash = bcrypt.hashSync('admin1234', 10);
  db.run(
    `INSERT INTO users (student_id, name, password, role) VALUES (?, ?, ?, ?)`,
    ['admin', '관리자', adminHash, 'admin']
  );

  // 학생 20명 시드 데이터
  const studentHash = bcrypt.hashSync('password123', 10);

  const students = [
    { name: '김민준', birth: '2010-03-15', classes: '수학 기초', school: '한빛중학교', phone: '010-1234-0001', gender: '남' },
    { name: '이서연', birth: '2010-07-22', classes: '수학 심화', school: '푸른중학교', phone: '010-1234-0002', gender: '여' },
    { name: '박지호', birth: '2011-01-10', classes: '수학 기초', school: '한빛중학교', phone: '010-1234-0003', gender: '남' },
    { name: '최수아', birth: '2010-11-05', classes: '수학 심화', school: '새벽중학교', phone: '010-1234-0004', gender: '여' },
    { name: '정현우', birth: '2011-04-18', classes: '수학 기초', school: '푸른중학교', phone: '010-1234-0005', gender: '남' },
    { name: '강하은', birth: '2010-09-30', classes: '수학 심화', school: '한빛중학교', phone: '010-1234-0006', gender: '여' },
    { name: '조민서', birth: '2011-02-14', classes: '수학 기초', school: '새벽중학교', phone: '010-1234-0007', gender: '남' },
    { name: '윤지유', birth: '2010-06-08', classes: '수학 심화', school: '푸른중학교', phone: '010-1234-0008', gender: '여' },
    { name: '임도현', birth: '2011-08-25', classes: '수학 기초', school: '한빛중학교', phone: '010-1234-0009', gender: '남' },
    { name: '한소율', birth: '2010-12-01', classes: '수학 심화', school: '새벽중학교', phone: '010-1234-0010', gender: '여' },
    { name: '오준서', birth: '2011-05-20', classes: '수학 기초', school: '푸른중학교', phone: '010-1234-0011', gender: '남' },
    { name: '서예린', birth: '2010-10-12', classes: '수학 심화', school: '한빛중학교', phone: '010-1234-0012', gender: '여' },
    { name: '신우진', birth: '2011-03-07', classes: '수학 기초', school: '새벽중학교', phone: '010-1234-0013', gender: '남' },
    { name: '권나은', birth: '2010-08-19', classes: '수학 심화', school: '푸른중학교', phone: '010-1234-0014', gender: '여' },
    { name: '황시우', birth: '2011-07-03', classes: '수학 기초', school: '한빛중학교', phone: '010-1234-0015', gender: '남' },
    { name: '송지아', birth: '2010-04-26', classes: '수학 심화', school: '새벽중학교', phone: '010-1234-0016', gender: '여' },
    { name: '문건우', birth: '2011-09-11', classes: '수학 기초', school: '푸른중학교', phone: '010-1234-0017', gender: '남' },
    { name: '배서현', birth: '2010-02-28', classes: '수학 심화', school: '한빛중학교', phone: '010-1234-0018', gender: '여' },
    { name: '류태윤', birth: '2011-06-16', classes: '수학 기초', school: '새벽중학교', phone: '010-1234-0019', gender: '남' },
    { name: '장하린', birth: '2010-05-09', classes: '수학 심화', school: '푸른중학교', phone: '010-1234-0020', gender: '여' },
  ];

  students.forEach((s, i) => {
    const studentId = `student${String(i + 1).padStart(4, '0')}`;
    db.run(
      `INSERT INTO users (student_id, name, birth_date, classes, school, parent_phone, gender, password, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [studentId, s.name, s.birth, s.classes, s.school, s.phone, s.gender, studentHash, 'student']
    );
  });

  console.log('시드 데이터 생성 완료: 어드민 1명 + 학생 20명');
}

module.exports = { initDB, getDB, saveDB };
