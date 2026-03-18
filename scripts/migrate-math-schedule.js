// ============================================================
// 모든 시간표 페이지 → V3 분반(Section) 시스템 마이그레이션
// 실행: node scripts/migrate-math-schedule.js
//
// - blocks[] → sections[].slots[] 전환
// - 같은 schedule 내에서 subject(ko) + color 동일한 blocks → 하나의 section
// - schedule에서 blocks 필드 제거
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

function genSectionId() {
  return 'sec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

function genSubjectId() {
  return 'subj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

function parseBlockName(name) {
  let base = (name || '').trim();
  let section = '';
  const parenMatch = base.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) { base = parenMatch[1].trim(); section = parenMatch[2].trim(); }
  if (!section) {
    const letterMatch = base.match(/^(.+?)\s+([A-Z])\s*$/);
    if (letterMatch) { base = letterMatch[1].trim(); section = letterMatch[2]; }
  }
  const thMatch = base.match(/^(.+?)\s*(이론수업|Theory)\s*$/i);
  if (thMatch) { base = thMatch[1].trim(); section = section ? thMatch[2] + ' ' + section : ''; }
  return { baseName: base, section };
}

async function migrate() {
  const rows = await sql`
    SELECT id, slug, schedule_data, syllabus_data
    FROM schedule_pages
  `;

  console.log(`Found ${rows.length} schedule pages\n`);

  for (const page of rows) {
    console.log(`=== Page: ${page.slug} (id=${page.id}) ===`);

    const sd = typeof page.schedule_data === 'string'
      ? JSON.parse(page.schedule_data) : (page.schedule_data || {});
    const syllabusData = typeof page.syllabus_data === 'string'
      ? JSON.parse(page.syllabus_data) : (page.syllabus_data || {});

    // Already v3?
    if (sd.version === 3 && sd.sections && sd.sections.length > 0) {
      console.log('  Already v3, skipping.\n');
      continue;
    }

    if (!sd.schedules || !sd.schedules.length) {
      console.log('  No schedules, skipping.\n');
      continue;
    }

    // Step 1: Ensure subjects exist (v1→v2 subject extraction)
    if (!sd.subjects) sd.subjects = [];
    const hasBlocks = sd.schedules.some(s => s.blocks && s.blocks.length > 0);

    if (hasBlocks && (!sd.version || sd.version < 2)) {
      const baseMap = {};
      sd.schedules.forEach(sched => {
        (sched.blocks || []).forEach(b => {
          if (b.subjectId) return;
          const nameKo = (typeof b.subject === 'object' ? b.subject.ko : b.subject) || '';
          const nameEn = (typeof b.subject === 'object' ? b.subject.en : '') || '';
          const parsedKo = parseBlockName(nameKo);
          const parsedEn = parseBlockName(nameEn);
          const baseKey = parsedKo.baseName || parsedEn.baseName;
          if (!baseKey) return;
          if (!baseMap[baseKey]) {
            const id = genSubjectId();
            baseMap[baseKey] = { id, name: { ko: parsedKo.baseName, en: parsedEn.baseName || parsedKo.baseName } };
            sd.subjects.push(baseMap[baseKey]);
          }
          b.subjectId = baseMap[baseKey].id;
          b.sectionLabel = parsedKo.section || parsedEn.section || '';
        });
      });
    }

    // Step 2: Convert blocks → sections
    const sections = [];
    const sectionMap = {}; // key → section
    let totalBlocks = 0;

    sd.schedules.forEach(sched => {
      const schedId = sched.id;
      (sched.blocks || []).forEach(b => {
        totalBlocks++;
        const nameKo = (typeof b.subject === 'object' ? b.subject.ko : b.subject) || '';
        const nameEn = (typeof b.subject === 'object' ? b.subject.en : '') || '';
        const color = b.color || '#3498DB';
        const key = (b.subjectId || '') + '|' + color + '|' + (b.sectionLabel || '') + '|' + nameKo;

        if (!sectionMap[key]) {
          const secId = genSectionId();
          sectionMap[key] = {
            id: secId,
            subjectId: b.subjectId || '',
            name: { ko: nameKo, en: nameEn },
            color: color,
            classId: null,
            slots: []
          };
        }
        sectionMap[key].slots.push({
          scheduleId: schedId,
          day: b.day,
          start: b.start,
          end: b.end
        });
      });

      // Remove blocks from schedule
      delete sched.blocks;
    });

    sd.sections = Object.values(sectionMap);
    sd.version = 3;

    console.log(`  Blocks: ${totalBlocks} → Sections: ${sd.sections.length}`);
    sd.sections.forEach(s => {
      console.log(`    - ${s.name.ko} [${s.color}] (${s.slots.length} slots)`);
    });

    // Link syllabus subjects
    const syllSubjects = syllabusData.subjects || [];
    let linked = 0;
    syllSubjects.forEach(syllSubj => {
      if (syllSubj.subjectId) {
        // Check if subjectId still exists in registry
        if (sd.subjects.find(s => s.id === syllSubj.subjectId)) {
          linked++;
          return;
        }
      }
      syllSubj.subjectId = '';
      const nameKo = (typeof syllSubj.name === 'object' ? syllSubj.name.ko : syllSubj.name) || '';
      const nameEn = (typeof syllSubj.name === 'object' ? syllSubj.name.en : '') || '';
      const match = sd.subjects.find(s =>
        (nameKo && s.name.ko === nameKo) || (nameEn && s.name.en === nameEn)
      );
      if (match) {
        syllSubj.subjectId = match.id;
        linked++;
      }
    });

    // Deduplicate syllabus
    const seenIds = new Set();
    syllabusData.subjects = syllSubjects.filter(s => {
      if (!s.subjectId) return true;
      if (seenIds.has(s.subjectId)) return false;
      seenIds.add(s.subjectId);
      return true;
    });

    syllabusData.version = 2;
    console.log(`  Syllabus: ${syllSubjects.length} → ${syllabusData.subjects.length} (${linked} linked)\n`);

    // Save (TEXT column — no ::jsonb cast)
    const schedJson = JSON.stringify(sd);
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
