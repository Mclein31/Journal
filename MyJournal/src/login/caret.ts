/* Approximate on-screen caret position inside a single-line input (phones have no cursor to follow). */
let ctx: CanvasRenderingContext2D | null | undefined;

export function caretPoint(input: HTMLInputElement): { x: number; y: number } {
  const rect = input.getBoundingClientRect();
  const style = getComputedStyle(input);
  const before = input.value.slice(0, input.selectionStart ?? input.value.length);
  const text = input.type === 'password' ? '•'.repeat(before.length) : before;
  if (ctx === undefined) ctx = document.createElement('canvas').getContext?.('2d') ?? null;
  let width = text.length * (parseFloat(style.fontSize) || 16) * 0.55;
  if (ctx) { ctx.font = style.font || `${style.fontSize} ${style.fontFamily}`; width = ctx.measureText(text).width; }
  const left = rect.left + (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.borderLeftWidth) || 0);
  const x = Math.min(rect.right - 8, Math.max(rect.left + 8, left + width - input.scrollLeft));
  return { x, y: rect.top + rect.height / 2 };
}
