import { test, expect, end } from '../util'
import { Preprocessor, evalCondition, expand } from '@orillusion/core';

await test('evalCondition equality / relational', async () => {
    expect(evalCondition('A == 1', { A: 1 })).toEqual(true);
    expect(evalCondition('A == 1', { A: 2 })).toEqual(false);
    expect(evalCondition('A != 0', { A: 1 })).toEqual(true);
    expect(evalCondition('A != 0', { A: 0 })).toEqual(false);
    expect(evalCondition('A < 2', { A: 1 })).toEqual(true);
    expect(evalCondition('A < 2', { A: 2 })).toEqual(false);
    expect(evalCondition('A >= B', { A: 5, B: 5 })).toEqual(true);
    expect(evalCondition('A >= B', { A: 4, B: 5 })).toEqual(false);

    // Numeric strings coerce
    expect(evalCondition('A == 3', { A: '3' })).toEqual(true);
    expect(evalCondition('A == 3', { A: ' 3' })).toEqual(true);  // Number(' 3') === 3
});

await test('evalCondition defined(X) vs bare identifier', async () => {
    // Defined but 0 → bare check is false, defined() is true
    expect(evalCondition('A', { A: 0 })).toEqual(false);
    expect(evalCondition('defined(A)', { A: 0 })).toEqual(true);

    // Not defined → both false
    expect(evalCondition('A', {})).toEqual(false);
    expect(evalCondition('defined(A)', {})).toEqual(false);

    // Defined with truthy
    expect(evalCondition('A', { A: 1 })).toEqual(true);
    expect(evalCondition('defined(A)', { A: 1 })).toEqual(true);

    // Empty-string value: legacy behavior treats as 0/falsy
    expect(evalCondition('A', { A: '' })).toEqual(false);
    expect(evalCondition('defined(A)', { A: '' })).toEqual(true);
});

await test('evalCondition logical precedence + grouping', async () => {
    // (A || B) && !C
    expect(evalCondition('(A || B) && !C', { A: 1, B: 0, C: 0 })).toEqual(true);
    expect(evalCondition('(A || B) && !C', { A: 0, B: 0, C: 0 })).toEqual(false);
    expect(evalCondition('(A || B) && !C', { A: 1, B: 0, C: 1 })).toEqual(false);

    // && binds tighter than ||
    expect(evalCondition('A || B && C', { A: 1, B: 0, C: 0 })).toEqual(true);
    expect(evalCondition('A || B && C', { A: 0, B: 1, C: 0 })).toEqual(false);
    expect(evalCondition('A || B && C', { A: 0, B: 1, C: 1 })).toEqual(true);

    // ! binds tightest
    expect(evalCondition('!A && B', { A: 0, B: 1 })).toEqual(true);
    expect(evalCondition('!A && B', { A: 1, B: 1 })).toEqual(false);
});

await test('evalCondition unknown identifier is 0', async () => {
    expect(evalCondition('UNKNOWN', {})).toEqual(false);
    expect(evalCondition('UNKNOWN == 0', {})).toEqual(true);
    expect(evalCondition('UNKNOWN < 5', {})).toEqual(true);
});

await test('evalCondition string equality', async () => {
    // Explicit string literals on both sides
    expect(evalCondition('"high" == "high"', {})).toEqual(true);
    expect(evalCondition('"high" == "low"', {})).toEqual(false);
    expect(evalCondition('"high" != "low"', {})).toEqual(true);

    // Identifier resolving to a non-numeric string compared against a literal
    expect(evalCondition('MODE == "high"', { MODE: 'high' })).toEqual(true);
    expect(evalCondition('MODE == "high"', { MODE: 'low' })).toEqual(false);
});

await test('evalCondition true / false keywords', async () => {
    expect(evalCondition('true', {})).toEqual(true);
    expect(evalCondition('false', {})).toEqual(false);
    expect(evalCondition('true && !false', {})).toEqual(true);
});

await test('Preprocessor handles #elseif xif (previously misparsed)', async () => {
    // 'xif' contains 'if' as a substring — the old code's
    // command.indexOf('if') landed inside 'xif' and produced a garbage
    // condition. With prefix stripping it now parses correctly.
    const src =
        '#if false\n' +
        'A\n' +
        '#elseif xif == 1\n' +
        'B\n' +
        '#else\n' +
        'C\n' +
        '#endif\n';

    // xif = 1 → branch B
    let out = Preprocessor.parse(src, { xif: 1 });
    expect(out.includes('B')).toEqual(true);
    expect(out.includes('A')).toEqual(false);
    expect(out.includes('C')).toEqual(false);

    // xif ≠ 1 → fall through to else
    out = Preprocessor.parse(src, { xif: 0 });
    expect(out.includes('C')).toEqual(true);
    expect(out.includes('A')).toEqual(false);
    expect(out.includes('B')).toEqual(false);
});

await test('Preprocessor handles #else if with space', async () => {
    const src =
        '#if A\n' +
        'X\n' +
        '#else if B\n' +
        'Y\n' +
        '#endif\n';

    let out = Preprocessor.parse(src, { A: 0, B: 1 });
    expect(out.includes('Y')).toEqual(true);
    expect(out.includes('X')).toEqual(false);

    out = Preprocessor.parse(src, { A: 1, B: 0 });
    expect(out.includes('X')).toEqual(true);
    expect(out.includes('Y')).toEqual(false);
});

await test('Preprocessor honors rich #if expressions end-to-end', async () => {
    const src =
        '#if QUALITY >= 2 && !LOW_END\n' +
        'HIGH_PATH\n' +
        '#else\n' +
        'LOW_PATH\n' +
        '#endif\n';

    let out = Preprocessor.parse(src, { QUALITY: 2, LOW_END: 0 });
    expect(out.includes('HIGH_PATH')).toEqual(true);
    expect(out.includes('LOW_PATH')).toEqual(false);

    out = Preprocessor.parse(src, { QUALITY: 2, LOW_END: 1 });
    expect(out.includes('LOW_PATH')).toEqual(true);
    expect(out.includes('HIGH_PATH')).toEqual(false);

    out = Preprocessor.parse(src, { QUALITY: 1 });
    expect(out.includes('LOW_PATH')).toEqual(true);
    expect(out.includes('HIGH_PATH')).toEqual(false);
});

await test('expand replaces bare identifiers with define values', async () => {
    expect(expand('let x = A + 1;', { A: '5' })).toEqual('let x = 5 + 1;');
    expect(expand('let x = A + 1;', { A: 5 })).toEqual('let x = 5 + 1;');
    expect(expand('let x = A + 1;', { A: true })).toEqual('let x = 1 + 1;');
    expect(expand('let x = A + 1;', { A: false })).toEqual('let x = 0 + 1;');
});

await test('expand respects \\b word boundaries', async () => {
    // Only the exact identifier 'A' should be replaced — MyA / A1 / A_ stay
    expect(expand('let v = MyA + A + A1 + A_ + A;', { A: 'X' })).toEqual(
        'let v = MyA + X + A1 + A_ + X;'
    );
});

await test('expand leaves unknown identifiers alone', async () => {
    expect(expand('unknown + KNOWN', { KNOWN: '42' })).toEqual('unknown + 42');
});

await test('expand preserves true/false/defined keywords', async () => {
    // Even if a caller accidentally puts 'true' into defines, the keyword stays.
    expect(expand('true && false', { true: '99', false: '77' })).toEqual('true && false');
    // defined() argument is not substituted (expand must not turn defined(A) into defined(5))
    expect(expand('defined(A) && A', { A: 5 })).toEqual('defined(A) && 5');
    expect(expand('defined( A ) && A', { A: 5 })).toEqual('defined( A ) && 5');
});

await test('expand does not recurse (self-referential #define is safe)', async () => {
    // Single-pass: A → A+1 verbatim, the inner A is NOT re-expanded, so no loop.
    expect(expand('A', { A: 'A+1' })).toEqual('A+1');
});

await test('Preprocessor: #define A 1 then #if A == 1 takes the branch', async () => {
    const src =
        '#define A 1\n' +
        '#if A == 1\n' +
        'MATCH\n' +
        '#else\n' +
        'MISS\n' +
        '#endif\n';

    const out = Preprocessor.parse(src, {});
    expect(out.includes('MATCH')).toEqual(true);
    expect(out.includes('MISS')).toEqual(false);
});

await test('Preprocessor: chained #define (A → B → 1) resolves at use site', async () => {
    // With #define A B + #define B 1, writing `#if A == 1`: expand A to 'B'
    // once, then evalCondition's identifier resolution turns B into 1.
    const src =
        '#define A B\n' +
        '#define B 1\n' +
        '#if A == 1\n' +
        'HIT\n' +
        '#else\n' +
        'NO\n' +
        '#endif\n';

    const out = Preprocessor.parse(src, {});
    expect(out.includes('HIT')).toEqual(true);
    expect(out.includes('NO')).toEqual(false);
});

await test('Preprocessor: define injected via external defines expands in body', async () => {
    const src =
        'const LIMIT : u32 = MAX_LIGHTS;\n' +
        '#if MAX_LIGHTS > 0\n' +
        'HAS_LIGHTS\n' +
        '#endif\n';

    const out = Preprocessor.parse(src, { MAX_LIGHTS: 4 });
    // Body identifier got substituted
    expect(out.includes('const LIMIT : u32 = 4;')).toEqual(true);
    // Directive branch taken
    expect(out.includes('HAS_LIGHTS')).toEqual(true);
});

setTimeout(end, 500);
