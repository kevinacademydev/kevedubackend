// ============================================================
// 모든 시간표 페이지 → V2 과목-분반 시스템 마이그레이션
// 실행: node scripts/migrate-math-schedule.js
//
// - schedule_data.subjects[] 과목 레지스트리 (재)생성
// - 블록 이름 파싱: "AMC 10 이론수업 A" → 과목 "AMC 10", 분반 "이론수업 A"
// - syllabus_data.subjects[]에 subjectId 연결, 중복 제거
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

const SWATCHES = ['#3498DB','#E74C3C','#27AE60','#F39C12','#9B59B6','#1ABC9C','#E67E22','#34495E','#e94560','#2ECC71'];

function genSubjectId() {
  return 'subj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

// Parse block name → { baseName, section }
function parseBlockName(name) {
  let base = (name || '').trim();
  let section = '';

  // 1) Extract trailing parenthetical: "Algebra I (AOPS)" → base "Algebra I", section "AOPS"
  const parenMatch = base.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    base = parenMatch[1].trim();
    section = parenMatch[2].trim();
  }

  // 2) Extract trailing single uppercase letter: "AMC 10 이론수업 A" → section "A"
  if (!section) {
    const letterMatch = base.match(/^(.+?)\s+([A-Z])\s*$/);
    if (letterMatch) {
      base = letterMatch[1].trim();
      section = letterMatch[2];
    }
  }

  // 3) Extract "이론수업" / "Theory" — move to section prefix
  const thMatch = base.match(/^(.+?)\s*(이론수업|Theory)\s*$/i);
  if (thMatch) {
    const prefix = thMatch[2];
    base = thMatch[1].trim();
    section = section ? prefix + ' ' + section : '';
  }

  return { baseName: base, section };
}

async function migrate() {
  // Fetch ALL schedule pages
  const rows = await sql`
    SELECT id, slug, schedule_data, syllabus_data
    FROM schedule_pages
  `;

  console.log(`Found ${rows.length} schedule pages\n`);

  for (const page of rows) {
    console.log(`=== Page: ${page.slug} (id=${page.id}) ===`);

    const scheduleData = typeof page.schedule_data === 'string'
      ? JSON.parse(page.schedule_data) : (page.schedule_data || {});
    const syllabusData = typeof page.syllabus_data === 'string'
      ? JSON.parse(page.syllabus_data) : (page.syllabus_data || {});

    if (!scheduleData.schedules || !scheduleData.schedules.length) {
      console.log('  No schedules, skipping.\n');
      continue;
    }

    // Reset subjects registry and block linkage for clean re-migration
    scheduleData.subjects = [];
    const baseMap = {}; // baseName → { id, name, color }
    let colorIdx = 0;

    // Process all blocks
    let totalBlocks = 0;
    scheduleData.schedules.forEach(sched => {
      (sched.blocks || []).forEach(block => {
        totalBlocks++;
        const nameKo = (typeof block.subject === 'object' ? block.subject.ko : block.subject) || '';
        const nameEn = (typeof block.subject === 'object' ? block.subject.en : '') || '';

        const parsedKo = parseBlockName(nameKo);
        const parsedEn = parseBlockName(nameEn);
        const baseKey = parsedKo.baseName || parsedEn.baseName;
        if (!baseKey) return;

        if (!baseMap[baseKey]) {
          const id = genSubjectId();
          baseMap[baseKey] = {
            id,
            name: { ko: parsedKo.baseName, en: parsedEn.baseName || parsedKo.baseName },
            color: block.color || SWATCHES[colorIdx % SWATCHES.length]
          };
          scheduleData.subjects.push(baseMap[baseKey]);
          colorIdx++;
        }

        block.subjectId = baseMap[baseKey].id;
        block.sectionLabel = parsedKo.section || parsedEn.section || '';
        block.color = baseMap[baseKey].color;
      });
    });

    scheduleData.version = 2;
    console.log(`  Blocks: ${totalBlocks}, Subjects: ${scheduleData.subjects.length}`);
    scheduleData.subjects.forEach(s => console.log(`    - ${s.name.ko} [${s.color}]`));

    // Link syllabus subjects by name matching
    const syllSubjects = syllabusData.subjects || [];
    let linked = 0;
    syllSubjects.forEach(syllSubj => {
      // Clear old subjectId from bad migration
      syllSubj.subjectId = '';

      const nameKo = (typeof syllSubj.name === 'object' ? syllSubj.name.ko : syllSubj.name) || '';
      const nameEn = (typeof syllSubj.name === 'object' ? syllSubj.name.en : '') || '';

      const match = scheduleData.subjects.find(s =>
        (nameKo && s.name.ko === nameKo) ||
        (nameEn && s.name.en === nameEn)
      );

      if (match) {
        syllSubj.subjectId = match.id;
        linked++;
        console.log(`    Linked syllabus "${nameKo || nameEn}" → "${match.name.ko}"`);
      } else {
        console.log(`    Unlinked syllabus: "${nameKo || nameEn}"`);
      }
    });

    // Remove duplicate syllabus entries (same subjectId)
    const seenIds = new Set();
    syllabusData.subjects = syllSubjects.filter(s => {
      if (!s.subjectId) return true;
      if (seenIds.has(s.subjectId)) return false;
      seenIds.add(s.subjectId);
      return true;
    });

    syllabusData.version = 2;
    console.log(`  Syllabus: ${syllSubjects.length} → ${syllabusData.subjects.length} (${linked} linked)\n`);

    // Save
    const schedJson = JSON.stringify(scheduleData);
    const syllJson = JSON.stringify(syllabusData);

    await sql`
      UPDATE schedule_pages
      SET schedule_data = ${schedJson},
          syllabus_data = ${syllJson}
      WHERE id = ${page.id}
    `;
  }

  console.log('Done!');
  await sql.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
