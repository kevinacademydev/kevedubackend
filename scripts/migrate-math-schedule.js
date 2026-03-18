// ============================================================
// 2026 Summer Math Schedule - V2 과목-분반 시스템 마이그레이션
// 실행: node scripts/migrate-math-schedule.js
//
// 기존 schedule_data, syllabus_data를 v2 구조로 변환:
//   - schedule_data.subjects[] 과목 레지스트리 생성
//   - 블록에 subjectId, sectionLabel 추가
//   - syllabus_data.subjects[]에 subjectId 연결
// ============================================================
require('dotenv').config();
const postgres = require('postgres');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const sql = postgres(process.env.DATABASE_URL, {
  ssl: { rejectUnauthorized: false },
  max: 1,
  idle_timeout: 10,
  connect_timeout: 10
});

const TARGET_SLUG = '2026summermath';

// Subject mapping: 블록 과목명(ko) → { subjectName, sectionLabel }
// 실제 블록 데이터에 맞춰 정의
const SUBJECT_MAP = {
  // AMC 10 계열
  'AMC 10 이론수업 A': { subject: 'AMC 10', section: 'A' },
  'AMC 10 Theory A': { subject: 'AMC 10', section: 'A' },
  'AMC 10 이론수업 Zoom': { subject: 'AMC 10', section: 'Zoom' },
  'AMC 10 Theory Zoom': { subject: 'AMC 10', section: 'Zoom' },
  'AMC 10 이론수업 B': { subject: 'AMC 10', section: 'B' },
  'AMC 10 Theory B': { subject: 'AMC 10', section: 'B' },
  // AMC 12 계열
  'AMC 12 이론수업 A': { subject: 'AMC 12', section: 'A' },
  'AMC 12 Theory A': { subject: 'AMC 12', section: 'A' },
  'AMC 12 이론수업 Zoom': { subject: 'AMC 12', section: 'Zoom' },
  'AMC 12 Theory Zoom': { subject: 'AMC 12', section: 'Zoom' },
  'AMC 12 이론수업 B': { subject: 'AMC 12', section: 'B' },
  'AMC 12 Theory B': { subject: 'AMC 12', section: 'B' },
  // AMC 8
  'AMC 8 이론수업': { subject: 'AMC 8', section: '' },
  'AMC 8 Theory': { subject: 'AMC 8', section: '' },
  // AP Calc BC
  'AP Calculus BC': { subject: 'AP Calculus BC', section: '' },
  // AP Stats
  'AP Statistics': { subject: 'AP Statistics', section: '' },
  // Single-session subjects
  'Algebra I': { subject: 'Algebra I', section: '' },
  'Algebra II': { subject: 'Algebra II', section: '' },
  'Geometry': { subject: 'Geometry', section: '' },
  'Precalculus': { subject: 'Precalculus', section: '' },
};

// Subject colors (consistent)
const SUBJECT_COLORS = {
  'AMC 10': '#3498DB',
  'AMC 12': '#E74C3C',
  'AMC 8': '#9B59B6',
  'AP Calculus BC': '#27AE60',
  'AP Statistics': '#F39C12',
  'Algebra I': '#1ABC9C',
  'Algebra II': '#E67E22',
  'Geometry': '#34495E',
  'Precalculus': '#e94560',
};

function genSubjectId() {
  return 'subj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

async function migrate() {
  // 1. Fetch current page data
  const rows = await sql`
    SELECT id, schedule_data, syllabus_data
    FROM schedule_pages
    WHERE slug = ${TARGET_SLUG}
  `;

  if (!rows.length) {
    console.log(`Page with slug "${TARGET_SLUG}" not found.`);
    process.exit(1);
  }

  const page = rows[0];
  const scheduleData = typeof page.schedule_data === 'string'
    ? JSON.parse(page.schedule_data) : page.schedule_data;
  const syllabusData = typeof page.syllabus_data === 'string'
    ? JSON.parse(page.syllabus_data) : page.syllabus_data;

  console.log(`Found page id=${page.id}, schedules=${(scheduleData.schedules || []).length}`);

  // 2. Build subject registry
  const subjectRegistry = {}; // name -> { id, name, color }
  const subjects = [];

  function ensureSubject(name) {
    if (subjectRegistry[name]) return subjectRegistry[name].id;
    const id = genSubjectId();
    const entry = {
      id,
      name: { ko: name, en: name },
      color: SUBJECT_COLORS[name] || '#3498DB'
    };
    subjectRegistry[name] = entry;
    subjects.push(entry);
    return id;
  }

  // 3. Process all blocks
  let totalBlocks = 0;
  let mappedBlocks = 0;
  let unmappedBlocks = [];

  (scheduleData.schedules || []).forEach((sched, si) => {
    (sched.blocks || []).forEach(block => {
      totalBlocks++;
      const koName = (typeof block.subject === 'object' ? block.subject.ko : block.subject) || '';
      const enName = (typeof block.subject === 'object' ? block.subject.en : '') || '';

      // Try to find mapping
      const mapping = SUBJECT_MAP[koName] || SUBJECT_MAP[enName];

      if (mapping) {
        const subjId = ensureSubject(mapping.subject);
        block.subjectId = subjId;
        block.sectionLabel = mapping.section;
        block.color = SUBJECT_COLORS[mapping.subject] || block.color;
        // Update display name
        const label = mapping.section ? ' ' + mapping.section : '';
        if (typeof block.subject === 'object') {
          // Keep existing ko/en but ensure they're consistent
        } else {
          block.subject = { ko: koName, en: enName };
        }
        mappedBlocks++;
      } else {
        // Fallback: use full name as subject, no section
        const subjName = koName || enName || 'Unknown';
        const subjId = ensureSubject(subjName);
        block.subjectId = subjId;
        block.sectionLabel = '';
        unmappedBlocks.push(koName || enName);
      }
    });
  });

  console.log(`\nBlocks: ${totalBlocks} total, ${mappedBlocks} mapped`);
  if (unmappedBlocks.length) {
    console.log(`Unmapped blocks (used full name as subject):`, [...new Set(unmappedBlocks)]);
  }

  // 4. Update schedule_data
  scheduleData.version = 2;
  scheduleData.subjects = subjects;

  console.log(`\nSubject registry (${subjects.length} subjects):`);
  subjects.forEach(s => console.log(`  - ${s.name.ko} (${s.id}) [${s.color}]`));

  // 5. Link syllabus subjects
  const syllSubjects = syllabusData.subjects || [];
  let linked = 0;
  syllSubjects.forEach(syllSubj => {
    const nameKo = (typeof syllSubj.name === 'object' ? syllSubj.name.ko : syllSubj.name) || '';
    const nameEn = (typeof syllSubj.name === 'object' ? syllSubj.name.en : '') || '';

    // Try exact match in registry
    const match = subjects.find(s =>
      s.name.ko === nameKo || s.name.en === nameEn ||
      s.name.ko === nameKo.replace(/ (이론수업|Theory).*/, '') ||
      s.name.en === nameEn.replace(/ (이론수업|Theory).*/, '')
    );

    if (match) {
      syllSubj.subjectId = match.id;
      linked++;
      console.log(`  Linked syllabus "${nameKo}" → subject "${match.name.ko}"`);
    } else {
      console.log(`  WARNING: No match for syllabus "${nameKo}"`);
    }
  });

  syllabusData.version = 2;

  console.log(`\nSyllabus: ${syllSubjects.length} subjects, ${linked} linked`);

  // 6. Save to DB
  const schedJson = JSON.stringify(scheduleData);
  const syllJson = JSON.stringify(syllabusData);

  await sql`
    UPDATE schedule_pages
    SET schedule_data = ${schedJson}::jsonb,
        syllabus_data = ${syllJson}::jsonb
    WHERE id = ${page.id}
  `;

  console.log(`\nSaved! Page id=${page.id} updated to v2.`);

  await sql.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
