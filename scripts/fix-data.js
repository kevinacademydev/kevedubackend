// 긴급 데이터 복구: 이중 인코딩된 schedule_data/syllabus_data 복구
require('dotenv').config();
const postgres = require('postgres');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, max: 1 });

function deepParse(val) {
  if (!val) return {};
  let result = val;
  // Keep parsing until we get an object
  for (let i = 0; i < 5; i++) {
    if (typeof result === 'object' && result !== null) return result;
    try { result = JSON.parse(result); } catch(e) { return result; }
  }
  return result;
}

(async () => {
  const rows = await sql`SELECT id, slug, schedule_data, syllabus_data FROM schedule_pages`;

  for (const r of rows) {
    console.log(`\n=== ${r.slug} (id=${r.id}) ===`);

    const sd = deepParse(r.schedule_data);
    const syll = deepParse(r.syllabus_data);

    console.log('schedule_data parsed:', typeof sd, 'schedules:', (sd.schedules||[]).length);
    let blockCount = 0;
    (sd.schedules || []).forEach(s => { blockCount += (s.blocks || []).length; });
    console.log('blocks:', blockCount);
    console.log('syllabus subjects:', (syll.subjects||[]).length);

    if (typeof sd !== 'object' || !sd.schedules) {
      console.log('WARNING: Could not parse schedule_data!');
      continue;
    }

    // Strip any bad v2 fields from failed migration, restore to clean v1
    delete sd.version;
    delete sd.subjects;
    sd.schedules.forEach(sched => {
      (sched.blocks || []).forEach(b => {
        delete b.subjectId;
        delete b.sectionLabel;
      });
    });

    // Same for syllabus
    delete syll.version;
    if (syll.subjects) {
      syll.subjects.forEach(s => {
        delete s.subjectId;
      });
    }

    // Save back as plain text (NO ::jsonb cast!)
    const schedStr = JSON.stringify(sd);
    const syllStr = JSON.stringify(syll);

    await sql`
      UPDATE schedule_pages
      SET schedule_data = ${schedStr},
          syllabus_data = ${syllStr}
      WHERE id = ${r.id}
    `;

    console.log('RESTORED to clean v1 state.');
  }

  // Verify
  console.log('\n=== VERIFICATION ===');
  const check = await sql`SELECT id, slug, schedule_data FROM schedule_pages`;
  for (const r of check) {
    const sd = deepParse(r.schedule_data);
    let blocks = 0;
    (sd.schedules || []).forEach(s => { blocks += (s.blocks || []).length; });
    console.log(`${r.slug}: schedules=${(sd.schedules||[]).length} blocks=${blocks} version=${sd.version || 'none'}`);
  }

  await sql.end();
  console.log('\nDone!');
})();
