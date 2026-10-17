// Stand-ins for the canvas: a 2D context that accepts every call and remembers what it needs to, and a canvas
// around it. Tests hand these to code that expects the real DOM types.

export type Calls = Record<string, number>;
export type StubContext = CanvasRenderingContext2D & {
  /** how many `save()` calls are not yet matched by `restore()` */
  depth: number;
  lineDash: number[];
};
export type StubCanvas = HTMLCanvasElement & { ctx: StubContext };

/** A 2D context that accepts everything and records how often each method was called. */
export function stubContext(calls: Calls = {}): StubContext {
  const target: Record<string, unknown> & { depth: number; lineDash: number[] } = {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    lineDash: [],
    depth: 0,
  };
  const stack: (typeof target)[] = [];
  return new Proxy(target, {
    get(t, p: string) {
      if (p in t) return t[p];
      if (p === "createLinearGradient" || p === "createRadialGradient") return () => ({ addColorStop() {} });
      return (...a: unknown[]) => {
        calls[p] = (calls[p] || 0) + 1;
        if (p === "save") {
          stack.push({ ...t });
          t.depth++;
        }
        if (p === "restore") Object.assign(t, stack.pop());
        if (p === "setLineDash") t.lineDash = a[0] as number[];
      };
    },
    set(t, p: string, v) {
      t[p] = v;
      return true;
    },
  }) as unknown as StubContext;
}

/** A canvas with a stub context; `css` is the size the layout would give it. */
export function stubCanvas(calls: Calls = {}, css = { width: 880, height: 600 }): StubCanvas {
  const ctx = stubContext(calls);
  return {
    width: 300,
    height: 150,
    getContext: () => ctx,
    getBoundingClientRect: () => css,
    ctx,
  } as unknown as StubCanvas;
}
