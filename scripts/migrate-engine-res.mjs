#!/usr/bin/env node
// One-shot migration: samples/** Engine3D.res.xxx -> engine.res.xxx.
// Strategy:
//   1. Find the class block that contains `const engine = await Engine3D.init(...)`.
//      That's the "runner class". Its methods all get access to `this.engine`.
//   2. Inject `engine: Engine3D;` field at the top of that class body.
//   3. Rewrite `const engine = await Engine3D.init(...)`
//      to `const engine = this.engine = await Engine3D.init(...)`.
//   4. Inside the runner class body ONLY, rewrite `Engine3D.res` -> `this.engine.res`.
//      (Not in sibling classes — they have their own `this`.)
//   5. For files with no class wrapper (module-level run()), just `Engine3D.res` -> `engine.res`.

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../samples/', import.meta.url).pathname;

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const s = statSync(full);
        if (s.isDirectory()) walk(full, out);
        else if (name.endsWith('.ts')) out.push(full);
    }
    return out;
}

// Find the enclosing class block (open-brace..matching close-brace) around
// the given offset. Returns [openBraceIdx, closeBraceIdx, classHeaderStart].
// Very approximate — skips string literals and /* */ comments so braces in
// content don't confuse the matcher; good enough for this codebase.
function findEnclosingClass(src, offset) {
    const classHdrRe = /\bclass\s+\w+[^{]*\{/g;
    const candidates = [];
    let m;
    while ((m = classHdrRe.exec(src))) {
        const openIdx = m.index + m[0].length - 1; // the '{'
        const close = findMatchingBrace(src, openIdx);
        if (close < 0) continue;
        if (openIdx < offset && offset < close) {
            candidates.push({ headerStart: m.index, open: openIdx, close });
        }
    }
    // Nested: pick the innermost that contains offset.
    candidates.sort((a, b) => b.open - a.open);
    return candidates[0] ?? null;
}

function findMatchingBrace(src, openIdx) {
    let depth = 0;
    let i = openIdx;
    let inSingle = false, inDouble = false, inTick = false;
    let inBlock = false, inLine = false;
    for (; i < src.length; i++) {
        const c = src[i], n = src[i + 1];
        if (inLine) { if (c === '\n') inLine = false; continue; }
        if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
        if (inSingle) { if (c === '\\') { i++; continue; } if (c === "'") inSingle = false; continue; }
        if (inDouble) { if (c === '\\') { i++; continue; } if (c === '"') inDouble = false; continue; }
        if (inTick) { if (c === '\\') { i++; continue; } if (c === '`') inTick = false; continue; }
        if (c === '/' && n === '/') { inLine = true; i++; continue; }
        if (c === '/' && n === '*') { inBlock = true; i++; continue; }
        if (c === "'") { inSingle = true; continue; }
        if (c === '"') { inDouble = true; continue; }
        if (c === '`') { inTick = true; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
}

const CREATE_RE = /const\s+engine\s*=\s*await\s+Engine3D\.create\b/;
const RES_RE = /\bEngine3D\.res\b/g;

let changed = 0, skipped = 0;
const notes = [];

for (const file of walk(ROOT)) {
    let src = readFileSync(file, 'utf8');
    if (!/\bEngine3D\.res\b/.test(src)) { skipped++; continue; }

    const createMatch = src.match(CREATE_RE);
    if (!createMatch) {
        notes.push(`SKIP (no Engine3D.init — helper class): ${file.replace(ROOT, '')}`);
        skipped++;
        continue;
    }
    const createIdx = createMatch.index;

    const cls = findEnclosingClass(src, createIdx);

    let next = src;

    if (cls) {
        // Inject field at top of class body if not already present.
        const classBody = src.slice(cls.open + 1, cls.close);
        const fieldExists = /\bengine\s*:\s*Engine3D\b/.test(classBody);
        if (!fieldExists) {
            const insertPos = cls.open + 1;
            next = next.slice(0, insertPos) + '\n    engine: Engine3D;' + next.slice(insertPos);
        }

        // Recompute offsets after injection.
        const offsetDelta = next.length - src.length;
        const newOpen = cls.open;
        const newClose = cls.close + offsetDelta;

        // Rewrite the create line within the class body.
        next = next.replace(
            /const\s+engine\s*=\s*await\s+Engine3D\.create\(/,
            'const engine = this.engine = await Engine3D.init(',
        );

        // Rewrite Engine3D.res -> this.engine.res ONLY within the class body.
        const head = next.slice(0, newOpen + 1);
        const body = next.slice(newOpen + 1, newClose + (next.length - src.length === offsetDelta ? 0 : 0));
        // Note: after the previous replace, offsets may have shifted further.
        // Redo the class boundary lookup on the mutated string to be safe.
        const recluredIdx = next.indexOf('this.engine = await Engine3D.init');
        const cls2 = findEnclosingClass(next, recluredIdx);
        if (!cls2) {
            notes.push(`ERROR: lost class boundary after edit: ${file.replace(ROOT, '')}`);
            continue;
        }
        const before = next.slice(0, cls2.open + 1);
        const inside = next.slice(cls2.open + 1, cls2.close);
        const after = next.slice(cls2.close);
        const insideNew = inside.replace(RES_RE, 'this.engine.res');
        next = before + insideNew + after;
    } else {
        // Module-level function scope.
        next = next.replace(RES_RE, 'engine.res');
    }

    if (next !== src) {
        writeFileSync(file, next);
        changed++;
        notes.push(`CHANGE: ${file.replace(ROOT, '')}`);
    }
}

console.log(`Changed: ${changed}   Skipped: ${skipped}`);
for (const n of notes) console.log(`  ${n}`);
