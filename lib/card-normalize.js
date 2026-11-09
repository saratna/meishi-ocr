/**
 * 名刺フィールドの正規化（ブラウザ・Node 共通）
 * code.gs の normalizeMeishiCard と同期すること
 */
(function (factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (typeof globalThis !== 'undefined') globalThis.MeishiNormalize = lib;
  if (typeof self !== 'undefined') self.MeishiNormalize = lib;
})(function () {
  'use strict';

  function nfkc(value) {
    return String(value == null ? '' : value).normalize('NFKC').trim();
  }

  function normalizePhoneJp(value, kind) {
    var raw = nfkc(value);
    if (!raw) return '';
  var digits = raw.replace(/[^\d+]/g, '');
    if (digits.indexOf('+81') === 0) {
      digits = '0' + digits.slice(3);
    } else if (digits.indexOf('81') === 0 && digits.length >= 11) {
      digits = '0' + digits.slice(2);
    }
    digits = digits.replace(/\D/g, '');
    if (!digits) return raw;
    if (digits.charAt(0) !== '0' && digits.length >= 9 && digits.length <= 10) {
      digits = '0' + digits;
    }
    if (kind === 'mobile' && digits.charAt(0) === '0' && digits.charAt(1) !== '0') {
      if (/^0[5789]0/.test(digits)) {
        return digits.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3')
          .replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
      }
    }
    if (digits.length === 10) {
      return digits.replace(/(\d{2,4})(\d{2,4})(\d{4})/, '$1-$2-$3');
    }
    if (digits.length === 11) {
      return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    }
    return digits;
  }

  function normalizeEmail(value) {
    var email = nfkc(value).toLowerCase();
    if (!email) return '';
    email = email.replace(/\s+/g, '');
    email = email.replace(/[，、]/g, ',').split(',')[0];
    if (email.indexOf('@') > 0 && email.indexOf('.') > email.indexOf('@')) return email;
    return nfkc(value);
  }

  function normalizeWebsite(value) {
    var site = nfkc(value);
    if (!site) return '';
    site = site.replace(/[，、]/g, ',').split(/[\s,]+/)[0];
    if (!/^https?:\/\//i.test(site)) {
      if (/^[a-z0-9][-a-z0-9.]+\.[a-z]{2,}/i.test(site)) {
        site = 'https://' + site;
      }
    }
    return site;
  }

  function normalizePostalDigits(value) {
    return nfkc(value).replace(/[〒\s\-‐‑‒–—―−ー]/g, '').replace(/\D/g, '');
  }

  function formatPostalJp(digits) {
    if (digits.length === 7) {
      return digits.slice(0, 3) + '-' + digits.slice(3);
    }
    return digits;
  }

  function extractPostalFromAddress(address) {
    var addr = nfkc(address);
    if (!addr) return { address: '', postal: '' };
    var m = addr.match(/^〒?\s*([0-9０-９]{3})[\s\-‐‑‒–—―−ー]*([0-9０-９]{4})\s*(.*)$/);
    if (m) {
      var d = normalizePostalDigits(m[1] + m[2]);
      return { postal: formatPostalJp(d), address: nfkc(m[3] || '') };
    }
    return { address: addr, postal: '' };
  }

  function katakanaToHiragana(text) {
    return String(text || '').replace(/[\u30a1-\u30f6]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0x60);
    });
  }

  function normalizeFurigana(value) {
    var f = nfkc(value);
    if (!f) return '';
    f = katakanaToHiragana(f);
    f = f.replace(/[・\s]+/g, ' ').trim();
    if (/[A-Za-z]/.test(f)) return '';
    return f;
  }

  function guessPhoneKind(label, number) {
    var n = normalizePhoneJp(number);
    var d = n.replace(/\D/g, '');
    if (/^0[5789]0/.test(d)) return 'mobile';
    if (label && /(携帯|mobile|cell)/i.test(label)) return 'mobile';
  if (label && /(fax|ＦＡＸ)/i.test(label)) return 'fax';
    if (label && /(tel|電話|代表)/i.test(label)) return 'phone';
    return 'phone';
  }

  function normalizeMeishiCard(card) {
    var out = Object.assign({}, card || {});
    out.name = nfkc(out.name);
    out.company = nfkc(out.company);
    out.department = nfkc(out.department);
    out.title = nfkc(out.title);
    out.memo = nfkc(out.memo);
    out.furigana = normalizeFurigana(out.furigana);

    out.mobile1 = normalizePhoneJp(out.mobile1, 'mobile');
    out.mobile2 = normalizePhoneJp(out.mobile2, 'mobile');
    out.phone = normalizePhoneJp(out.phone, 'phone');
    out.fax = normalizePhoneJp(out.fax, 'fax');

    out.email1 = normalizeEmail(out.email1);
    out.email2 = normalizeEmail(out.email2);
    if (out.email2 && out.email2 === out.email1) out.email2 = '';

    var addrParts = extractPostalFromAddress(out.address || '');
    out.address = addrParts.address;
    if (addrParts.postal && !out.postalCode) {
      out.postalCode = addrParts.postal;
      if (out.address && out.address.indexOf(addrParts.postal) !== 0) {
        out.address = '〒' + addrParts.postal + ' ' + out.address;
      }
    }

    out.website = normalizeWebsite(out.website);
    return out;
  }

  return {
    nfkc: nfkc,
    normalizePhoneJp: normalizePhoneJp,
    normalizeEmail: normalizeEmail,
    normalizeWebsite: normalizeWebsite,
    normalizePostalDigits: normalizePostalDigits,
    formatPostalJp: formatPostalJp,
    extractPostalFromAddress: extractPostalFromAddress,
    normalizeFurigana: normalizeFurigana,
    guessPhoneKind: guessPhoneKind,
    normalizeMeishiCard: normalizeMeishiCard
  };
});
