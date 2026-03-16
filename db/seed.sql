-- Kevin Academy 시드 데이터
-- migration.sql 실행 후 이 파일을 실행하세요
-- 비밀번호: admin→admin1234, teacher→teacher1234, student→password123

-- bcrypt 해시 (미리 생성)
-- admin1234  → $2a$10$8K1p/a0dL1LXMc0RGv5Cge3vWnRBMXKq7kDI5y4MCOZsVJfMA60Xi
-- teacher1234 → $2a$10$8K1p/a0dL1LXMc0RGv5Cge3vWnRBMXKq7kDI5y4MCOZsVJfMA60Xi
-- password123 → $2a$10$8K1p/a0dL1LXMc0RGv5Cge3vWnRBMXKq7kDI5y4MCOZsVJfMA60Xi

-- 참고: 실제 해시는 서버 시작 시 programmatic seeding으로 생성됩니다.
-- 이 파일은 참고용이며, 실제 시드는 db/database.js의 seedIfEmpty()가 수행합니다.

-- 테이블 비우기 (순서 중요 - FK 의존성)
TRUNCATE class_scores, graded_files, submissions, class_enrollments, class_teachers, class_schedules, student_feedbacks, student_consultations, schedule_pages, classes, users RESTART IDENTITY CASCADE;

-- 이후 시드 데이터는 서버 첫 시작 시 자동 삽입됩니다 (db/database.js seedIfEmpty 함수)
