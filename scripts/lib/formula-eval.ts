// ---------------------------------------------------------------------------
// Safe offline arithmetic evaluator for ability formulas (Stage 3).
//
// Claude (or a hand-written seed) supplies the STRUCTURE of an ability as a
// plain arithmetic `expression` over the ability's variable names — e.g.
// Sona's "(4*DebrisDamage + DebrisRipDamage + SlamDamage) / NumCasts". This
// module does the ARITHMETIC: parse the expression once, then evaluate it at
// every star level by substituting each variable's value[star].
//
// Deliberately tiny grammar — numeric literals, variable identifiers, the four
// binary operators, parentheses, and unary minus. No exponent, no function
// calls, no member access, no comparison. It can parse arithmetic and NOTHING
// else, so an expression string can never execute code. This runs OFFLINE in
// the formula generator; the baked output is plain numbers the runtime reads.
// ---------------------------------------------------------------------------

export type FormulaNode =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; x: FormulaNode }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; a: FormulaNode; b: FormulaNode };

type Tok =
  | { k: 'num'; v: number }
  | { k: 'ident'; v: string }
  | { k: 'op'; v: '+' | '-' | '*' | '/' | '(' | ')' };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function tokenize(expr: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '(' || c === ')') {
      toks.push({ k: 'op', v: c });
      i++;
      continue;
    }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i + 1;
      while (j < expr.length && ((expr[j] >= '0' && expr[j] <= '9') || expr[j] === '.')) j++;
      const num = Number(expr.slice(i, j));
      if (!Number.isFinite(num)) throw new Error(`bad number "${expr.slice(i, j)}" in "${expr}"`);
      toks.push({ k: 'num', v: num });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j])) j++;
      toks.push({ k: 'ident', v: expr.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`unexpected character "${c}" in "${expr}"`);
  }
  return toks;
}

/** Parse an expression string into an AST. Throws on any syntax error. */
export function parseFormula(expr: string): FormulaNode {
  const toks = tokenize(expr);
  let pos = 0;
  const peek = (): Tok | undefined => toks[pos];
  const eat = (): Tok => {
    const t = toks[pos];
    if (!t) throw new Error(`unexpected end of expression in "${expr}"`);
    pos++;
    return t;
  };

  // expr := term (('+'|'-') term)*
  const parseExpr = (): FormulaNode => {
    let node = parseTerm();
    for (let t = peek(); t && t.k === 'op' && (t.v === '+' || t.v === '-'); t = peek()) {
      eat();
      node = { t: 'bin', op: t.v, a: node, b: parseTerm() };
    }
    return node;
  };
  // term := factor (('*'|'/') factor)*
  const parseTerm = (): FormulaNode => {
    let node = parseFactor();
    for (let t = peek(); t && t.k === 'op' && (t.v === '*' || t.v === '/'); t = peek()) {
      eat();
      node = { t: 'bin', op: t.v, a: node, b: parseFactor() };
    }
    return node;
  };
  // factor := '-' factor | '(' expr ')' | number | ident
  const parseFactor = (): FormulaNode => {
    const t = eat();
    if (t.k === 'op' && t.v === '-') return { t: 'neg', x: parseFactor() };
    if (t.k === 'op' && t.v === '(') {
      const inner = parseExpr();
      const close = eat();
      if (!(close.k === 'op' && close.v === ')')) throw new Error(`expected ")" in "${expr}"`);
      return inner;
    }
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'ident') return { t: 'var', name: t.v };
    throw new Error(`unexpected token "${'v' in t ? t.v : t.k}" in "${expr}"`);
  };

  const ast = parseExpr();
  if (pos !== toks.length) throw new Error(`trailing tokens in "${expr}"`);
  return ast;
}

/** All variable identifiers referenced by an expression. */
export function collectVars(node: FormulaNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: FormulaNode): void => {
    if (n.t === 'var') out.add(n.name);
    else if (n.t === 'neg') walk(n.x);
    else if (n.t === 'bin') {
      walk(n.a);
      walk(n.b);
    }
  };
  walk(node);
  return out;
}

/** Evaluate a parsed expression against a variable→value map. Throws if a
 *  referenced variable is missing or the result isn't finite (e.g. /0). */
export function evalNode(node: FormulaNode, vars: Record<string, number>): number {
  switch (node.t) {
    case 'num':
      return node.v;
    case 'var': {
      const v = vars[node.name];
      if (v === undefined) throw new Error(`unknown variable "${node.name}"`);
      return v;
    }
    case 'neg':
      return -evalNode(node.x, vars);
    case 'bin': {
      const a = evalNode(node.a, vars);
      const b = evalNode(node.b, vars);
      const r = node.op === '+' ? a + b : node.op === '-' ? a - b : node.op === '*' ? a * b : a / b;
      if (!Number.isFinite(r)) throw new Error(`non-finite result (${node.op} on ${a}, ${b})`);
      return r;
    }
  }
}

/** Parse + check that every identifier in `expr` is one of `available`. Returns
 *  the missing identifiers (empty = valid). Used to reject a hallucinated
 *  expression that references variables the unit doesn't actually have. */
export function validateFormula(expr: string, available: readonly string[]): { ok: boolean; missing: string[] } {
  const ast = parseFormula(expr); // throws on syntax error
  const have = new Set(available);
  const missing = [...collectVars(ast)].filter((v) => !have.has(v));
  return { ok: missing.length === 0, missing };
}

/** A unit ability variable as stored in unit-math (value indexed by star). */
export interface StarVariable {
  name: string;
  value: number[];
}

/** Evaluate `expr` at every star index, substituting each variable's
 *  value[index]. Mirrors AbilityVariable indexing (perCastBase[1]=1★,
 *  [2]=2★, …; index 0 and high indices are cdragon placeholders/junk, carried
 *  through unchanged so the array lines up positionally). Indices past a
 *  variable's array clamp to its last element. */
export function evaluatePerStar(expr: string, variables: readonly StarVariable[]): number[] {
  const ast = parseFormula(expr);
  const need = collectVars(ast);
  for (const name of need) {
    if (!variables.some((v) => v.name === name)) throw new Error(`expression references missing variable "${name}"`);
  }
  const maxLen = variables.reduce((m, v) => Math.max(m, v.value.length), 0);
  const out: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    const env: Record<string, number> = {};
    for (const v of variables) env[v.name] = v.value[Math.min(i, v.value.length - 1)] ?? 0;
    out.push(r3(evalNode(ast, env)));
  }
  return out;
}
