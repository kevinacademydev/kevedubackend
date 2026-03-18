require('dotenv').config();
const postgres = require('postgres');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, max: 1 });

(async () => {
  const rows = await sql`SELECT id, slug, schedule_data, syllabus_data FROM schedule_pages`;
  for (const r of rows) {
    const sd = r.schedule_data || {};
    const syll = r.syllabus_data || {};
    const schedules = sd.schedules || [];
    let blockCount = 0;
    schedules.forEach(s => { blockCount += (s.blocks || []).length; });
    console.log(`\nid=${r.id} slug=${r.slug} version=${sd.version} subjects=${(sd.subjects||[]).length} schedules=${schedules.length} blocks=${blockCount} syllabus=${(syll.subjects||[]).length}`);
    schedules.forEach((s, i) => {
      console.log(`  schedule[${i}]: ${(s.blocks||[]).length} blocks, days=${(s.days||[]).join(',')}`);
      (s.blocks || []).forEach(b => {
        const subj = typeof b.subject === 'object' ? b.subject.ko : b.subject;
        console.log(`    ${b.day} ${b.start}-${b.end} | "${subj}" | subjId=${b.subjectId || 'none'} sec=${b.sectionLabel || ''}`);
      });
    });
  }
  await sql.end();
})();
