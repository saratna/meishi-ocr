/**
 * 撮影ガイド枠（名刺 91×55mm 比率）— ブラウザ・Node 共通
 */
(function (factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (typeof globalThis !== 'undefined') globalThis.MeishiCaptureGuide = lib;
  if (typeof self !== 'undefined') self.MeishiCaptureGuide = lib;
})(function () {
  'use strict';

  var RATIO_LANDSCAPE = 91 / 55;
  var RATIO_PORTRAIT = 55 / 91;

  function aspectForOrientation(orientation) {
    return orientation === 'portrait' ? RATIO_PORTRAIT : RATIO_LANDSCAPE;
  }

  /**
   * ガイド枠（表示座標・枠左上原点）
   * @param {string} orientation landscape | portrait
   */
  function layoutGuideRect(displayW, displayH, orientation, marginRatio) {
    var margin = marginRatio != null ? marginRatio : 0.07;
    var ratio = aspectForOrientation(orientation);
    var maxW = displayW * (1 - 2 * margin);
    var maxH = displayH * (1 - 2 * margin);
    var gw;
    var gh;
    if (maxW / maxH > ratio) {
      gh = maxH;
      gw = gh * ratio;
    } else {
      gw = maxW;
      gh = gw / ratio;
    }
    return {
      left: (displayW - gw) / 2,
      top: (displayH - gh) / 2,
      width: gw,
      height: gh
    };
  }

  function getObjectFitCoverTransform(intrinsicW, intrinsicH, displayW, displayH) {
    var scale = Math.max(displayW / intrinsicW, displayH / intrinsicH);
    var renderedW = intrinsicW * scale;
    var renderedH = intrinsicH * scale;
    return {
      scale: scale,
      offsetX: (displayW - renderedW) / 2,
      offsetY: (displayH - renderedH) / 2,
      renderedW: renderedW,
      renderedH: renderedH
    };
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /**
   * 表示上のガイド矩形 → 原画像ピクセル切り出し（object-fit: cover 前提）
   */
  function mapGuideRectToSourceCrop(guideRect, intrinsicW, intrinsicH, displayW, displayH) {
    var t = getObjectFitCoverTransform(intrinsicW, intrinsicH, displayW, displayH);
    var sx = (guideRect.left - t.offsetX) / t.scale;
    var sy = (guideRect.top - t.offsetY) / t.scale;
    var sw = guideRect.width / t.scale;
    var sh = guideRect.height / t.scale;
    sx = clamp(sx, 0, intrinsicW - 1);
    sy = clamp(sy, 0, intrinsicH - 1);
    if (sw < 8 || sh < 8) {
      return centerGuideCropRect(intrinsicW, intrinsicH, 'landscape');
    }
    sw = Math.min(sw, intrinsicW - sx);
    sh = Math.min(sh, intrinsicH - sy);
    return {
      x: Math.round(sx),
      y: Math.round(sy),
      width: Math.max(8, Math.round(sw)),
      height: Math.max(8, Math.round(sh))
    };
  }

  /** アルバム取り込み用: 画像中央に名刺比率の最大矩形 */
  function centerGuideCropRect(intrinsicW, intrinsicH, orientation, marginRatio) {
    var margin = marginRatio != null ? marginRatio : 0.08;
    var guide = layoutGuideRect(intrinsicW, intrinsicH, orientation, margin);
    return {
      x: Math.round(guide.left),
      y: Math.round(guide.top),
      width: Math.max(8, Math.round(guide.width)),
      height: Math.max(8, Math.round(guide.height))
    };
  }

  return {
    RATIO_LANDSCAPE: RATIO_LANDSCAPE,
    RATIO_PORTRAIT: RATIO_PORTRAIT,
    aspectForOrientation: aspectForOrientation,
    layoutGuideRect: layoutGuideRect,
    getObjectFitCoverTransform: getObjectFitCoverTransform,
    mapGuideRectToSourceCrop: mapGuideRectToSourceCrop,
    centerGuideCropRect: centerGuideCropRect
  };
});
