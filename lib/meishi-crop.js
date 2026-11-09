/**
 * 名刺画像の四隅検出（ブラウザ・Node 共通の純粋ロジック）
 * 端の文字切れ対策: 検出後は内側へ縮めず、わずかに外側へ拡張する
 */
(function (factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (typeof globalThis !== 'undefined') globalThis.MeishiCrop = lib;
  if (typeof self !== 'undefined') self.MeishiCrop = lib;
})(function () {
  'use strict';

  var DEFAULT_OUTSET_RATIO = 0.022;
  var DEFAULT_FALLBACK_MARGIN = 0.018;

  function toGray(data, w, h) {
    var g = new Uint8ClampedArray(w * h);
    for (var i = 0, p = 0; i < data.length; i += 4, p++) {
      g[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }
    return g;
  }

  function sobelEdges(gray, w, h) {
    var out = new Float32Array(w * h);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var i = y * w + x;
        var gx = -gray[i - w - 1] + gray[i - w + 1] - 2 * gray[i - 1] + 2 * gray[i + 1] - gray[i + w - 1] + gray[i + w + 1];
        var gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
        out[i] = Math.abs(gx) + Math.abs(gy);
      }
    }
    return out;
  }

  function convexHull(points) {
    if (points.length <= 3) return points.slice();
    points = points.slice().sort(function (a, b) {
      return a.x === b.x ? a.y - b.y : a.x - b.x;
    });
    function cross(o, a, b) {
      return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    }
    var lower = [];
    var upper = [];
    var i;
    for (i = 0; i < points.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0) lower.pop();
      lower.push(points[i]);
    }
    for (i = points.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0) upper.pop();
      upper.push(points[i]);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function quadArea(pts) {
    var a = 0;
    for (var i = 0; i < 4; i++) {
      var j = (i + 1) % 4;
      a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return Math.abs(a) / 2;
  }

  function orderQuadPoints(pts) {
    var tagged = pts.map(function (p) {
      return { p: p, s: p.x + p.y, d: p.x - p.y };
    });
    var tl = tagged.reduce(function (a, b) { return a.s < b.s ? a : b; }).p;
    var br = tagged.reduce(function (a, b) { return a.s > b.s ? a : b; }).p;
    var tr = tagged.reduce(function (a, b) { return a.d > b.d ? a : b; }).p;
    var bl = tagged.reduce(function (a, b) { return a.d < b.d ? a : b; }).p;
    return [tl, tr, br, bl];
  }

  /** 四隅を中心方向へ縮小（旧挙動・テスト用） */
  function insetQuad(pts, ratio) {
    var cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
    var cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
    return pts.map(function (p) {
      return {
        x: p.x + (cx - p.x) * ratio,
        y: p.y + (cy - p.y) * ratio
      };
    });
  }

  /** 四隅を外側へ拡張（端の文字を残す） */
  function outsetQuad(pts, ratio, bounds) {
    var cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
    var cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
    var maxW = bounds && bounds.width != null ? bounds.width : Infinity;
    var maxH = bounds && bounds.height != null ? bounds.height : Infinity;
    return pts.map(function (p) {
      var x = p.x + (p.x - cx) * ratio;
      var y = p.y + (p.y - cy) * ratio;
      return {
        x: Math.max(0, Math.min(maxW, x)),
        y: Math.max(0, Math.min(maxH, y))
      };
    });
  }

  function fallbackRect(w, h, scale, marginRatio) {
    var m = Math.round(Math.min(w, h) * marginRatio);
    return orderQuadPoints([
      { x: m / scale, y: m / scale },
      { x: (w - m) / scale, y: m / scale },
      { x: (w - m) / scale, y: (h - m) / scale },
      { x: m / scale, y: (h - m) / scale }
    ]);
  }

  function refineQuadWithEdges(ordered, edges, gray, w, h, scale) {
    var dirs = [
      { dx: 1, dy: 0, edge: 1 },
      { dx: 0, dy: 1, edge: 2 },
      { dx: -1, dy: 0, edge: 3 },
      { dx: 0, dy: -1, edge: 0 }
    ];
    var out = ordered.map(function (p) { return { x: p.x, y: p.y }; });
    var step = 2;
    var pad = Math.max(4, Math.round(Math.min(w, h) * 0.01));
    for (var d = 0; d < 4; d++) {
      var info = dirs[d];
      var start = ordered[info.edge];
      var end = ordered[(info.edge + 1) % 4];
      var len = Math.hypot(end.x - start.x, end.y - start.y);
      var samples = Math.max(6, Math.floor(len / 24));
      var push = 0;
      for (var s = 0; s <= samples; s++) {
        var t = s / samples;
        var px = start.x + (end.x - start.x) * t;
        var py = start.y + (end.y - start.y) * t;
        for (var k = 0; k < 8; k++) {
          var nx = px + info.dx * (pad + k * step);
          var ny = py + info.dy * (pad + k * step);
          var ix = Math.round(nx);
          var iy = Math.round(ny);
          if (ix < 1 || iy < 1 || ix >= w - 1 || iy >= h - 1) break;
          var ei = iy * w + ix;
          if (edges[ei] > push) push = edges[ei];
        }
      }
      if (push > 0) {
        var p = out[info.edge];
        out[info.edge] = {
          x: p.x - info.dx * step,
          y: p.y - info.dy * step
        };
      }
    }
    return out.map(function (p) {
      return { x: p.x / scale, y: p.y / scale };
    });
  }

  /**
   * @param {{width:number,height:number}} img または ImageData 互換
   * @param {function} sampleImageData  (w,h) => Uint8ClampedArray RGBA
   */
  function detectCardCornersFromData(imgW, imgH, sampleImageData, options) {
    options = options || {};
    var outsetRatio = options.outsetRatio != null ? options.outsetRatio : DEFAULT_OUTSET_RATIO;
    var marginRatio = options.fallbackMargin != null ? options.fallbackMargin : DEFAULT_FALLBACK_MARGIN;

    var maxW = 420;
    var scale = Math.min(1, maxW / imgW);
    var w = Math.max(40, Math.round(imgW * scale));
    var h = Math.max(40, Math.round(imgH * scale));
    var imageData = sampleImageData(w, h);
    var gray = toGray(imageData, w, h);
    var edges = sobelEdges(gray, w, h);

    var border = [];
    var x;
    var y;
    for (x = 0; x < w; x++) {
      border.push(gray[x], gray[(h - 1) * w + x]);
    }
    for (y = 0; y < h; y++) {
      border.push(gray[y * w], gray[y * w + w - 1]);
    }
    border.sort(function (a, b) { return a - b; });
    var bg = border[border.length >> 1];

    var maxE = 0;
    for (var i = 0; i < edges.length; i++) if (edges[i] > maxE) maxE = edges[i];
    var eThr = Math.max(22, maxE * 0.16);
    var dThr = 22;

    var pts = [];
    for (y = 1; y < h - 1; y += 2) {
      for (x = 1; x < w - 1; x += 2) {
        var ii = y * w + x;
        if (Math.abs(gray[ii] - bg) >= dThr || edges[ii] >= eThr) pts.push({ x: x, y: y });
      }
    }
    if (pts.length < 24) return fallbackRect(w, h, scale, marginRatio);

    var stride = Math.max(1, Math.floor(pts.length / 500));
    var sampled = [];
    for (var si = 0; si < pts.length; si += stride) sampled.push(pts[si]);
    var hull = convexHull(sampled);
    if (hull.length < 4) return fallbackRect(w, h, scale, marginRatio);

    var best = null;
    var bestArea = 0;
    var n = hull.length;
    var lim = Math.min(n, 32);
    var idx = [];
    for (var ii = 0; ii < lim; ii++) idx.push(Math.floor(ii * n / lim));
    var a;
    var b;
    var c;
    var d;
    for (a = 0; a < idx.length; a++) {
      for (b = a + 1; b < idx.length; b++) {
        for (c = b + 1; c < idx.length; c++) {
          for (d = c + 1; d < idx.length; d++) {
            var quad = [hull[idx[a]], hull[idx[b]], hull[idx[c]], hull[idx[d]]];
            var area = quadArea(quad);
            if (area > bestArea) {
              bestArea = area;
              best = quad;
            }
          }
        }
      }
    }
    if (!best || bestArea < w * h * 0.1) return fallbackRect(w, h, scale, marginRatio);

    var ordered = orderQuadPoints(best);
    var edgeAdjusted = refineQuadWithEdges(ordered, edges, gray, w, h, scale);
    var fullW = imgW;
    var fullH = imgH;
    var expanded = outsetQuad(
      edgeAdjusted.map(function (p) { return { x: p.x * scale, y: p.y * scale }; }),
      outsetRatio,
      { width: fullW, height: fullH }
    );
    return orderQuadPoints(expanded);
  }

  function detectCardCorners(img) {
    var canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!canvas) {
      throw new Error('detectCardCorners(img) はブラウザ専用です');
    }
    return detectCardCornersFromData(img.width, img.height, function (w, h) {
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      return ctx.getImageData(0, 0, w, h).data;
    });
  }

  return {
    DEFAULT_OUTSET_RATIO: DEFAULT_OUTSET_RATIO,
    DEFAULT_FALLBACK_MARGIN: DEFAULT_FALLBACK_MARGIN,
    toGray: toGray,
    sobelEdges: sobelEdges,
    convexHull: convexHull,
    quadArea: quadArea,
    orderQuadPoints: orderQuadPoints,
    insetQuad: insetQuad,
    outsetQuad: outsetQuad,
    fallbackRect: fallbackRect,
    detectCardCornersFromData: detectCardCornersFromData,
    detectCardCorners: detectCardCorners
  };
});
