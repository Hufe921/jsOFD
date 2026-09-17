import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jsOFD } from '@hufe921/jsofd';

// 1×1 真 PNG，供 canvas 替身输出
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// 万能 no-op 代理：任意属性读取/赋值/调用均可用（模拟 2D 绘图上下文足够）
function anyStub(): unknown {
  const stub: unknown = new Proxy(function () {} as unknown as object, {
    get: (_t, prop) => {
      if (prop === Symbol.toPrimitive) return () => 0;
      return stub;
    },
    set: () => true,
    apply: () => stub,
  });
  return stub;
}

class CanvasStub {
  width = 1;
  height = 1;
  getContext(): unknown {
    return anyStub();
  }
  toDataURL(): string {
    return TINY_PNG;
  }
}

// 预设代码在浏览器测试台运行；Node 下注入最小 DOM 替身使同一份代码可被 CI 验证
if (typeof globalThis.document === 'undefined') {
  (globalThis as Record<string, unknown>).document = {
    createElement: () => new CanvasStub(),
  };
  (globalThis as Record<string, unknown>).HTMLCanvasElement = CanvasStub;
}

// 与 dev-playground 相同的执行方式，保证测试台预设代码始终可用
describe('dev playground presets', () => {
  const src = readFileSync(join(__dirname, '../src/app.ts'), 'utf8');
  const entries = [...src.matchAll(/^ {2}([^:`]+): `([\s\S]*?)^`,/gm)].map(
    (x) => [x[1].trim(), x[2]] as const,
  );
  const names = entries.map((e) => e[0]);
  const blocks = entries.map((e) => e[1]);

  it('找到全部预设', () => {
    expect(names.length).toBeGreaterThanOrEqual(5);
  });

  for (let i = 0; i < names.length; i++) {
    it(`预设可执行: ${names[i]}`, () => {
      const doc = new jsOFD({ unit: 'mm', format: 'a4' });
      const fn = new Function('doc', 'jsOFD', 'log', blocks[i]) as (
        d: jsOFD,
        J: typeof jsOFD,
        l: (msg: string) => void,
      ) => void;
      expect(() => fn(doc, jsOFD, () => {})).not.toThrow();
      expect(doc.pages.length).toBeGreaterThan(0);
      const bytes = doc.output('uint8array') as Uint8Array;
      expect(bytes.length).toBeGreaterThan(100);
    });
  }
});
