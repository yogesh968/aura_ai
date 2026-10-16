/**
 * Safe arithmetic evaluator (recursive descent). No eval/Function — only the
 * grammar below is accepted:
 *
 *   expr    := term (('+' | '-') term)*
 *   term    := power (('*' | '/' | 'mod') power)*
 *   power   := unary ('^' power)?
 *   unary   := ('-' | '+') unary | postfix
 *   postfix := primary '%'*            (percent: x% = x / 100)
 *   primary := number | constant | func '(' args ')' | '(' expr ')'
 *
 * "15% of 2400" is rewritten to "(15/100)*2400" before parsing.
 */

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export class CalcError extends Error {}

type Token = { kind: 'num'; value: number } | { kind: 'id'; value: string } | { kind: 'op'; value: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new CalcError(`Invalid number at position ${i + 1}`);
      tokens.push({ kind: 'num', value: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-z_]/i.test(c)) {
      const m = /^[a-z_][a-z0-9_]*/i.exec(src.slice(i))!;
      tokens.push({ kind: 'id', value: m[0].toLowerCase() });
      i += m[0].length;
    } else if ('+-*/^%(),×÷'.includes(c)) {
      tokens.push({ kind: 'op', value: c === '×' ? '*' : c === '÷' ? '/' : c });
      i++;
    } else {
      throw new CalcError(`Unexpected character "${c}"`);
    }
  }
  return tokens;
}

export function evaluateExpression(input: string): number {
  if (input.length > 500) throw new CalcError('Expression too long');
  const normalized = input
    .replace(/,(?=\d{3}\b)/g, '') // thousands separators
    .replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*/gi, '($1/100)*')
    .replace(/\*\*/g, '^');
  const tokens = tokenize(normalized);
  let pos = 0;
  let depth = 0;

  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.kind === 'op' && peek()!.value === v;
  const expectOp = (v: string) => {
    if (!isOp(v)) throw new CalcError(`Expected "${v}"`);
    pos++;
  };

  function expr(): number {
    if (++depth > 100) throw new CalcError('Expression too deeply nested');
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++]!.value;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    depth--;
    return v;
  }
  function term(): number {
    let v = power();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = tokens[pos++]!.value;
        const r = power();
        if (op === '/' && r === 0) throw new CalcError('Division by zero');
        v = op === '*' ? v * r : v / r;
      } else if (peek()?.kind === 'id' && peek()!.value === 'mod') {
        pos++;
        const r = power();
        if (r === 0) throw new CalcError('Division by zero');
        v = v % r;
      } else if (peek()?.kind === 'num' || isOp('(') || (peek()?.kind === 'id' && peek()!.value !== 'mod')) {
        // implicit multiplication: 2(3+4), 2pi
        v = v * power();
      } else {
        return v;
      }
    }
  }
  function power(): number {
    const base = unary();
    if (isOp('^')) {
      pos++;
      return Math.pow(base, power());
    }
    return base;
  }
  function unary(): number {
    if (isOp('-')) {
      pos++;
      return -unary();
    }
    if (isOp('+')) {
      pos++;
      return unary();
    }
    return postfix();
  }
  function postfix(): number {
    let v = primary();
    while (isOp('%')) {
      pos++;
      v = v / 100;
    }
    return v;
  }
  function primary(): number {
    const t = peek();
    if (!t) throw new CalcError('Unexpected end of expression');
    if (t.kind === 'num') {
      pos++;
      return t.value;
    }
    if (t.kind === 'op' && t.value === '(') {
      pos++;
      const v = expr();
      expectOp(')');
      return v;
    }
    if (t.kind === 'id') {
      pos++;
      if (t.value in CONSTANTS) return CONSTANTS[t.value]!;
      const fn = FUNCTIONS[t.value];
      if (!fn) throw new CalcError(`Unknown function or constant "${t.value}"`);
      expectOp('(');
      const args: number[] = [];
      if (!isOp(')')) {
        args.push(expr());
        while (isOp(',')) {
          pos++;
          args.push(expr());
        }
      }
      expectOp(')');
      return fn(...args);
    }
    throw new CalcError(`Unexpected "${t.value}"`);
  }

  const result = expr();
  if (pos < tokens.length) throw new CalcError(`Unexpected "${tokens[pos]!.value}"`);
  if (!Number.isFinite(result)) throw new CalcError('Result is not a finite number');
  return result;
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return Number(n.toPrecision(12)).toString();
}
