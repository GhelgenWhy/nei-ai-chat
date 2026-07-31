import fs from 'fs';
import path from 'path';

const translationsPath = path.resolve('src/i18n/translations.ts');

if (!fs.existsSync(translationsPath)) {
    console.error('❌ translations.ts not found!');
    process.exit(1);
}

const content = fs.readFileSync(translationsPath, 'utf8');

// Simple key count validator
const keysMatch = content.match(/([a-zA-Z0-9_]+):\s*["`']/g);

console.log(`✅ i18n validation complete. Loaded translations file with ${keysMatch ? keysMatch.length : 0} translation pairs.`);
process.exit(0);
