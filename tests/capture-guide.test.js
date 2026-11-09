const test = require('node:test');
const assert = require('node:assert/strict');
const guide = require('../lib/capture-guide.js');

test('layoutGuideRect keeps 91:55 landscape ratio', () => {
  const r = guide.layoutGuideRect(400, 600, 'landscape', 0.07);
  const ratio = r.width / r.height;
  assert.ok(Math.abs(ratio - guide.RATIO_LANDSCAPE) < 0.01);
  assert.ok(r.left >= 0 && r.top >= 0);
  assert.ok(r.left + r.width <= 400.01);
  assert.ok(r.top + r.height <= 600.01);
});

test('layoutGuideRect portrait swaps aspect', () => {
  const r = guide.layoutGuideRect(400, 600, 'portrait', 0.07);
  const ratio = r.width / r.height;
  assert.ok(Math.abs(ratio - guide.RATIO_PORTRAIT) < 0.01);
});

test('mapGuideRectToSourceCrop maps center guide on square display', () => {
  const display = 300;
  const intrinsic = 1200;
  const layout = guide.layoutGuideRect(display, display, 'landscape', 0.1);
  const crop = guide.mapGuideRectToSourceCrop(layout, intrinsic, intrinsic, display, display);
  assert.ok(crop.width > 100);
  assert.ok(crop.height > 60);
  assert.ok(crop.x >= 0 && crop.y >= 0);
  assert.ok(crop.x + crop.width <= intrinsic);
});
