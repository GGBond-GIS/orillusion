import { test, expect, end } from '../util'
import { Preprocessor } from '@orillusion/core';

// Access protected static methods for unit tests.
const P = Preprocessor as any;

await test('filterComment', async () => {
    // no comments → unchanged
    expect(P.filterComment('struct Foo { a: f32; };')).toEqual('struct Foo { a: f32; };');

    // single-line // strips to end of line; newline preserved
    expect(P.filterComment('let x = 1; // tail\nlet y = 2;')).toEqual('let x = 1; \nlet y = 2;');

    // block /* */ on same line
    expect(P.filterComment('let x = /* mid */ 1;')).toEqual('let x =  1;');

    // block spanning newlines — removed wholesale, surrounding text kept
    expect(P.filterComment('a\n/* foo\nbar */\nb')).toEqual('a\n\nb');

    // // inside /* */ is absorbed by the block
    expect(P.filterComment('a /* // not single */ b')).toEqual('a  b');

    // /* inside // is absorbed by the line comment
    expect(P.filterComment('a // /* not block */ still\nb')).toEqual('a \nb');

    // empty block
    expect(P.filterComment('/**/')).toEqual('');

    // multiple line comments
    expect(P.filterComment('//one\n//two\ncode')).toEqual('\n\ncode');

    // multiple block comments on one line
    expect(P.filterComment('a/*x*/b/*y*/c')).toEqual('abc');
});

await test('parseAutoBindingForAllGroup', async () => {
    // auto increments per group starting from 0
    expect(P.parseAutoBindingForAllGroup(
        '@group(0) @binding(auto) a;\n@group(0) @binding(auto) b;'
    )).toEqual(
        '@group(0) @binding(0) a;\n@group(0) @binding(1) b;'
    );

    // distinct groups each start at 0
    expect(P.parseAutoBindingForAllGroup(
        '@group(0) @binding(auto) a;\n@group(1) @binding(auto) b;\n@group(0) @binding(auto) c;'
    )).toEqual(
        '@group(0) @binding(0) a;\n@group(1) @binding(0) b;\n@group(0) @binding(1) c;'
    );

    // explicit N bumps the counter so next auto = N+1
    expect(P.parseAutoBindingForAllGroup(
        '@group(0) @binding(3) a;\n@group(0) @binding(auto) b;'
    )).toEqual(
        '@group(0) @binding(3) a;\n@group(0) @binding(4) b;'
    );

    // explicit below max doesn't lower the counter (max is sticky)
    expect(P.parseAutoBindingForAllGroup(
        '@group(0) @binding(5) a;\n@group(0) @binding(2) b;\n@group(0) @binding(auto) c;'
    )).toEqual(
        '@group(0) @binding(5) a;\n@group(0) @binding(2) b;\n@group(0) @binding(6) c;'
    );

    // passthrough when no bindings
    expect(P.parseAutoBindingForAllGroup('let x = 1;')).toEqual('let x = 1;');

    // content between @group and @binding is preserved
    expect(P.parseAutoBindingForAllGroup(
        '@group(0)\n  @binding(auto) var x;'
    )).toEqual(
        '@group(0)\n  @binding(0) var x;'
    );
});

await test('parseAutoBindingForGroupX', async () => {
    // only group 1 is rewritten; group 0 passes through verbatim
    expect(P.parseAutoBindingForGroupX(
        '@group(0) @binding(5) a;\n@group(1) @binding(auto) b;\n@group(1) @binding(7) c;',
        1
    )).toEqual(
        '@group(0) @binding(5) a;\n@group(1) @binding(0) b;\n@group(1) @binding(1) c;'
    );

    // matching group: even explicit bindings get overwritten (legacy quirk)
    expect(P.parseAutoBindingForGroupX(
        '@group(2) @binding(9) a;\n@group(2) @binding(9) b;',
        2
    )).toEqual(
        '@group(2) @binding(0) a;\n@group(2) @binding(1) b;'
    );

    // no matching group → unchanged
    expect(P.parseAutoBindingForGroupX(
        '@group(0) @binding(auto) a;',
        5
    )).toEqual(
        '@group(0) @binding(auto) a;'
    );
});

await test('parseAutoLocation', async () => {
    // all auto → 0,1,...
    expect(P.parseAutoLocation(
        '@location(auto) a, @location(auto) b'
    )).toEqual(
        '@location(0) a, @location(1) b'
    );

    // mixed: explicit preserved verbatim, counter independent from explicit values
    expect(P.parseAutoLocation(
        '@location(3) a, @location(auto) b, @location(auto) c'
    )).toEqual(
        '@location(3) a, @location(0) b, @location(1) c'
    );

    // no locations
    expect(P.parseAutoLocation('let x = 1;')).toEqual('let x = 1;');
});

await test('parseAutoLocationBlock', async () => {
    // two separate blocks — counter resets per block (each block is @location..`}`)
    expect(P.parseAutoLocationBlock(
        'struct A { @location(auto) x: f32, @location(auto) y: f32 } struct B { @location(auto) z: f32 }'
    )).toEqual(
        'struct A { @location(0) x: f32, @location(1) y: f32 } struct B { @location(0) z: f32 }'
    );

    // block bounded by `->` when it comes before `}` (function return type list)
    expect(P.parseAutoLocationBlock(
        'fn f() -> @location(auto) vec4<f32> { return vec4<f32>(0.0); }'
    )).toEqual(
        'fn f() -> @location(0) vec4<f32> { return vec4<f32>(0.0); }'
    );
});

await test('parse end-to-end integration', async () => {
    // exercise the public pipeline: comments + #if + auto bindings + auto locations
    const src = `
// header comment
struct VO {
    @location(auto) a: vec2<f32>,
    @location(auto) b: vec4<f32>,
};
/* block
   comment */
#if USE_FOO
@group(0) @binding(auto) var<uniform> u: f32;
#endif
@group(0) @binding(auto) var<uniform> v: f32;
`;

    const withFoo = Preprocessor.parse(src, { USE_FOO: 1 });
    // both uniforms present; first auto=0, second auto=1
    expect(withFoo.includes('@binding(0)')).toEqual(true);
    expect(withFoo.includes('@binding(1)')).toEqual(true);
    // locations: 0 and 1
    expect(withFoo.includes('@location(0) a')).toEqual(true);
    expect(withFoo.includes('@location(1) b')).toEqual(true);
    // comments stripped
    expect(withFoo.includes('header comment')).toEqual(false);
    expect(withFoo.includes('block')).toEqual(false);

    const withoutFoo = Preprocessor.parse(src, {});
    // only v survives; it still gets @binding(0)
    expect(withoutFoo.includes('var<uniform> u')).toEqual(false);
    expect(withoutFoo.includes('var<uniform> v')).toEqual(true);
    expect(withoutFoo.includes('@binding(0)')).toEqual(true);
});

setTimeout(end, 500);
