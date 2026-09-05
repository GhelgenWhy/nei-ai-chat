import fs from 'fs';
import path from 'path';

const translationsPath = path.resolve('src/i18n/translations.ts');

if (!fs.existsSync(translationsPath)) {
    console.error('❌ translations.ts not found!');
    process.exit(1);
}

const content = fs.readFileSync(translationsPath, 'utf8');

/**
 * Extracts direct keys of each base dictionary (`const baseEn: Translations = {…}`).
 * Non-base languages in `translations` are spreads of baseEn, so parity of the
 * base dictionaries implies parity everywhere.
 */
function extractBaseDictionaries(src) {
    const blocks = {};
    const headerRe = /const\s+(base[A-Za-z0-9_]*)\s*:\s*Translations\s*=\s*\{/g;
    let match;

    while ((match = headerRe.exec(src)) !== null) {
        const name = match[1];
        const openIdx = src.indexOf('{', match.index);
        if (openIdx === -1) continue;
        let depth = 0;
        let inStr = null;
        let end = openIdx;
        for (let i = openIdx; i < src.length; i++) {
            const ch = src[i];
            const prev = src[i - 1];
            if (inStr) {
                if (ch === inStr && prev !== '\\') inStr = null;
                continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') {
                inStr = ch;
                continue;
            }
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    end = i;
                    break;
                }
            }
        }
        const blockSrc = src.slice(openIdx + 1, end);
        const keys = new Set();
        const keyRe = /^\s{4}([a-zA-Z0-9_]+)\s*:/gm;
        let keyMatch;
        while ((keyMatch = keyRe.exec(blockSrc)) !== null) {
            keys.add(keyMatch[1]);
        }
        blocks[name] = keys;
    }

    return blocks;
}

const blocks = extractBaseDictionaries(content);
const names = Object.keys(blocks);

if (names.length < 2) {
    console.error(`❌ Expected ≥2 base dictionaries (baseEn/baseRu), found: ${names.join(', ') || 'none'}`);
    process.exit(1);
}

const reference = blocks.baseEn || blocks[names[0]];
let hasErrors = false;

for (const name of names) {
    if (name === (blocks.baseEn ? 'baseEn' : names[0])) continue;
    const missing = [...reference].filter(k => !blocks[name].has(k));
    const extra = [...blocks[name]].filter(k => !reference.has(k));
    if (missing.length > 0) {
        hasErrors = true;
        console.error(`❌ ${name}: missing ${missing.length} key(s) vs reference: ${missing.join(', ')}`);
    }
    if (extra.length > 0) {
        hasErrors = true;
        console.error(`⚠️  ${name}: extra ${extra.length} key(s) not in reference: ${extra.join(', ')}`);
    }
}

console.log(`ℹ️  Checked ${names.length} base dictionaries against ${reference.size} reference keys.`);

if (hasErrors) {
    console.error('❌ i18n validation FAILED.');
    process.exit(1);
}

console.log('✅ i18n validation complete: all dictionaries have identical key sets.');
