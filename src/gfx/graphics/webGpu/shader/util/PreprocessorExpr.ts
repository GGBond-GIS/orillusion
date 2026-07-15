/**
 * @internal
 * Evaluator for Preprocessor `#if` / `#elseif` conditions.
 *
 * Grammar (recursive descent, no `eval`):
 *   expr    := or
 *   or      := and ('||' and)*
 *   and     := cmp ('&&' cmp)*
 *   cmp     := unary (('==' | '!=' | '<=' | '>=' | '<' | '>') unary)?
 *   unary   := '!' unary | primary
 *   primary := number | string | identifier | 'defined' '(' identifier ')'
 *              | 'true' | 'false' | '(' expr ')'
 *
 * Identifier lookup in `defines`:
 *   - missing key            → 0
 *   - number / boolean       → numeric (booleans map to 0/1)
 *   - empty string           → 0
 *   - numeric string         → Number(value)
 *   - other string           → string (used for `==` / `!=`)
 */

type Value = number | string;

type Token =
    | { k: 'num'; v: number }
    | { k: 'str'; v: string }
    | { k: 'ident'; v: string }
    | { k: 'op'; v: string };

type Node =
    | { k: 'lit'; v: Value }
    | { k: 'ident'; v: string }
    | { k: 'defined'; v: string }
    | { k: 'unary'; op: string; x: Node }
    | { k: 'binary'; op: string; l: Node; r: Node };

function isDigit(c: string): boolean { return c >= '0' && c <= '9'; }
function isIdentStart(c: string): boolean {
    return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
}
function isIdentPart(c: string): boolean { return isIdentStart(c) || isDigit(c); }

function tokenize(src: string): Token[] {
    const tokens: Token[] = [];
    const n = src.length;
    let i = 0;
    while (i < n) {
        const c = src[i];
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
        if (isDigit(c)) {
            let j = i + 1;
            while (j < n && isDigit(src[j])) j++;
            tokens.push({ k: 'num', v: Number(src.substring(i, j)) });
            i = j;
            continue;
        }
        if (isIdentStart(c)) {
            let j = i + 1;
            while (j < n && isIdentPart(src[j])) j++;
            tokens.push({ k: 'ident', v: src.substring(i, j) });
            i = j;
            continue;
        }
        if (c === '"') {
            let j = i + 1;
            while (j < n && src[j] !== '"') j++;
            if (j >= n) throw new Error(`unterminated string in expression: ${src}`);
            tokens.push({ k: 'str', v: src.substring(i + 1, j) });
            i = j + 1;
            continue;
        }
        const two = src.substring(i, i + 2);
        if (two === '&&' || two === '||' || two === '==' || two === '!=' ||
            two === '<=' || two === '>=') {
            tokens.push({ k: 'op', v: two });
            i += 2;
            continue;
        }
        if (c === '!' || c === '<' || c === '>' || c === '(' || c === ')') {
            tokens.push({ k: 'op', v: c });
            i++;
            continue;
        }
        throw new Error(`unexpected char '${c}' at ${i} in expression: ${src}`);
    }
    return tokens;
}

class Parser {
    pos = 0;
    constructor(public tokens: Token[]) {}

    peek(): Token | undefined { return this.tokens[this.pos]; }

    tryOp(v: string): boolean {
        const t = this.tokens[this.pos];
        if (t && t.k === 'op' && t.v === v) { this.pos++; return true; }
        return false;
    }

    expectOp(v: string): void {
        if (!this.tryOp(v)) {
            const t = this.tokens[this.pos];
            throw new Error(`expected '${v}', got ${t ? JSON.stringify(t) : 'EOF'}`);
        }
    }

    parseOr(): Node {
        let l = this.parseAnd();
        while (this.tryOp('||')) {
            const r = this.parseAnd();
            l = { k: 'binary', op: '||', l, r };
        }
        return l;
    }

    parseAnd(): Node {
        let l = this.parseCmp();
        while (this.tryOp('&&')) {
            const r = this.parseCmp();
            l = { k: 'binary', op: '&&', l, r };
        }
        return l;
    }

    parseCmp(): Node {
        const l = this.parseUnary();
        const t = this.tokens[this.pos];
        if (t && t.k === 'op' &&
            (t.v === '==' || t.v === '!=' || t.v === '<' || t.v === '<=' ||
             t.v === '>' || t.v === '>=')) {
            this.pos++;
            const r = this.parseUnary();
            return { k: 'binary', op: t.v, l, r };
        }
        return l;
    }

    parseUnary(): Node {
        if (this.tryOp('!')) return { k: 'unary', op: '!', x: this.parseUnary() };
        return this.parsePrimary();
    }

    parsePrimary(): Node {
        const t = this.tokens[this.pos];
        if (!t) throw new Error('unexpected end of expression');
        if (t.k === 'num') { this.pos++; return { k: 'lit', v: t.v }; }
        if (t.k === 'str') { this.pos++; return { k: 'lit', v: t.v }; }
        if (t.k === 'ident') {
            this.pos++;
            if (t.v === 'true') return { k: 'lit', v: 1 };
            if (t.v === 'false') return { k: 'lit', v: 0 };
            if (t.v === 'defined') {
                this.expectOp('(');
                const nameTok = this.tokens[this.pos];
                if (!nameTok || nameTok.k !== 'ident')
                    throw new Error(`defined() expects an identifier`);
                this.pos++;
                this.expectOp(')');
                return { k: 'defined', v: nameTok.v };
            }
            return { k: 'ident', v: t.v };
        }
        if (t.k === 'op' && t.v === '(') {
            this.pos++;
            const e = this.parseOr();
            this.expectOp(')');
            return e;
        }
        throw new Error(`unexpected token: ${JSON.stringify(t)}`);
    }
}

function resolve(name: string, defines: Record<string, any>): Value {
    if (!(name in defines)) return 0;
    const v = defines[name];
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') {
        if (v === '') return 0;
        const n = Number(v);
        if (!Number.isNaN(n)) return n;
        return v;
    }
    return 0;
}

function toBool(v: Value): boolean {
    if (typeof v === 'number') return v !== 0;
    return v !== '' && v !== '0';
}

function evalNode(node: Node, defines: Record<string, any>): Value {
    switch (node.k) {
        case 'lit': return node.v;
        case 'ident': return resolve(node.v, defines);
        case 'defined': return (node.v in defines) ? 1 : 0;
        case 'unary':
            if (node.op === '!') return toBool(evalNode(node.x, defines)) ? 0 : 1;
            throw new Error(`unknown unary op: ${node.op}`);
        case 'binary': {
            if (node.op === '&&') {
                const l = evalNode(node.l, defines);
                if (!toBool(l)) return 0;
                return toBool(evalNode(node.r, defines)) ? 1 : 0;
            }
            if (node.op === '||') {
                const l = evalNode(node.l, defines);
                if (toBool(l)) return 1;
                return toBool(evalNode(node.r, defines)) ? 1 : 0;
            }
            const l = evalNode(node.l, defines);
            const r = evalNode(node.r, defines);
            switch (node.op) {
                case '==':
                    if (typeof l === 'string' || typeof r === 'string')
                        return String(l) === String(r) ? 1 : 0;
                    return l === r ? 1 : 0;
                case '!=':
                    if (typeof l === 'string' || typeof r === 'string')
                        return String(l) !== String(r) ? 1 : 0;
                    return l !== r ? 1 : 0;
                case '<':  return Number(l) <  Number(r) ? 1 : 0;
                case '<=': return Number(l) <= Number(r) ? 1 : 0;
                case '>':  return Number(l) >  Number(r) ? 1 : 0;
                case '>=': return Number(l) >= Number(r) ? 1 : 0;
            }
            throw new Error(`unknown binary op: ${node.op}`);
        }
    }
}

export function evalCondition(expr: string, defines: Record<string, any>): boolean {
    if (!expr || !expr.trim()) return false;
    const tokens = tokenize(expr);
    if (!tokens.length) return false;
    const parser = new Parser(tokens);
    const ast = parser.parseOr();
    if (parser.pos !== tokens.length)
        throw new Error(`unexpected trailing tokens in expression: ${expr}`);
    return toBool(evalNode(ast, defines));
}

function stringifyDefine(v: any): string {
    if (v === undefined || v === null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (typeof v === 'number') return String(v);
    return String(v);
}

/**
 * Single-pass identifier expansion.
 *
 * Replaces each bare identifier in `text` with its `defines` value.
 *   - arguments of `defined(X)` are preserved (so `defined(FOO)` never
 *     collapses to `defined(1)`).
 *   - `true` / `false` / `defined` keywords are never substituted.
 *   - unknown identifiers pass through unchanged.
 *   - self-referential `#define A A+1` does not loop — only the outer
 *     scan runs, the substituted `A` inside the RHS is not re-expanded.
 *
 * Function-like macros are not supported; prefer `fn` in shader code.
 */
export function expand(text: string, defines: Record<string, any>): string {
    return text.replace(
        /defined\s*\(\s*[A-Za-z_]\w*\s*\)|\b[A-Za-z_]\w*\b/g,
        (match) => {
            if (match.startsWith('defined')) return match;
            if (match === 'true' || match === 'false' || match === 'defined') return match;
            if (!(match in defines)) return match;
            return stringifyDefine(defines[match]);
        }
    );
}
