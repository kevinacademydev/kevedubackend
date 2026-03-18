require('dotenv').config();
const postgres = require('postgres');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, max: 1 });

(async () => {
  const rows = await sql`SELECT id, slug, schedule_data, syllabus_data FROM schedule_pages`;
  for (const r of rows) {
    console.log(`\n=== id=${r.id} slug=${r.slug} ===`);
    console.log('schedule_data type:', typeof r.schedule_data);
    console.log('schedule_data:', JSON.stringify(r.schedule_data).substring(0, 500));
    console.log('syllabus_data type:', typeof r.syllabus_data);
    console.log('syllabus_data:', JSON.stringify(r.syllabus_data).substring(0, 500));
  }
  await sql.end();
})();
