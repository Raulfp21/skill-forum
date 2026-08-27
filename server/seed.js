import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { processDocument } from './lib/pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const sampleDir = path.join(__dirname, 'sample');
  if (!fs.existsSync(sampleDir)) {
    console.log('No sample directory — seeding skipped.');
    return;
  }
  const files = fs.readdirSync(sampleDir).filter((f) => !f.startsWith('.'));
  for (const f of files) {
    const full = path.join(sampleDir, f);
    const fileLike = { originalname: f, path: full, size: fs.statSync(full).size };
    try {
      const record = await processDocument(fileLike);
      console.log(`Seeded skill: ${record.name} (${record.id})`);
    } catch (e) {
      console.error(`Failed to seed ${f}:`, e.message);
    }
  }
}

main();
