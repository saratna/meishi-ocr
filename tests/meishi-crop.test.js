const test = require('node:test');
const assert = require('node:assert/strict');
const crop = require('../lib/meishi-crop.js');

function solidCardImage(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bg = 230;
      let r = bg;
      let g = bg;
      let b = bg;
      const margin = Math.min(w, h) * 0.06;
      const inCard = x > margin && y > margin && x < w - margin && y < h - margin;
      if (inCard) {
        r = 250;
        g = 248;
        b = 240;
        if (x < margin + 4 || y < margin + 4 || x > w - margin - 4 || y > h - margin - 4) {
          r = 40;
          g = 40;
          b = 40;
        }
        if (y > h * 0.72) {
          r = 20;
          g = 20;
          b = 20;
        }
      }
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

test('outsetQuad expands away from center', () => {
  const pts = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 150 },
    { x: 100, y: 150 }
  ];
  const out = crop.outsetQuad(pts, 0.05, { width: 300, height: 200 });
  assert.ok(out[0].x < 100);
  assert.ok(out[2].x > 200);
});

test('detectCardCornersFromData keeps generous bounds (outset vs inset)', () => {
  const w = 400;
  const h = 240;
  const corners = crop.detectCardCornersFromData(w, h, function (sw, sh) {
    return solidCardImage(sw, sh);
  });
  assert.equal(corners.length, 4);
  assert.ok(corners[0].x < w * 0.08, '左上が十分内側に留まりつつ外縁寄り');
  assert.ok(corners[2].x > w * 0.92, '右下が外縁近くまで拡張');
});
