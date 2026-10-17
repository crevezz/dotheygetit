/* Get It? cookie consent.
 *
 * Google Analytics (GA4) and the Meta pixel are NOT loaded until the visitor
 * clicks Accept. Google Consent Mode v2 is set to "denied" by default in the
 * inline bootstrap in each page's <head>, before this file runs.
 *
 * Choice is stored in localStorage under "getit_cookie_consent" as
 * "granted" or "denied". A "Cookie settings" link can reopen the banner.
 */
(function () {
  'use strict';

  var GA_ID = 'G-HT4BJ8KBY1';
  var PIXEL_ID = '1200765335594050';
  var KEY = 'getit_cookie_consent';

  var choice = null;
  try { choice = localStorage.getItem(KEY); } catch (e) {}
  if (choice !== 'granted' && choice !== 'denied') choice = null;

  window.dataLayer = window.dataLayer || [];
  var gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag = gtag;

  // Consent Mode v2 defaults. The inline bootstrap sets these too; setting
  // them again is harmless and keeps this file safe to include on its own.
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted'
  });
  gtag('set', 'ads_data_redaction', true);
  gtag('set', 'url_passthrough', true);

  var loaded = { ga: false, fb: false };
  var pending = [];

  function setConsent(state) {
    var v = state === 'granted' ? 'granted' : 'denied';
    gtag('consent', 'update', {
      ad_storage: v,
      ad_user_data: v,
      ad_personalization: v,
      analytics_storage: v
    });
  }

  function loadGA() {
    if (loaded.ga) return;
    loaded.ga = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  function loadPixel() {
    if (loaded.fb) return;
    loaded.fb = true;
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function flush() {
    while (pending.length) {
      var item = pending.shift();
      track(item[0], item[1]);
    }
  }

  function track(name, params) {
    if (choice === 'granted') {
      if (window.fbq) window.fbq('track', name, params || {});
      if (window.gtag) gtag('event', name, params || {});
    } else if (choice === null) {
      pending.push([name, params]);
    }
    // denied: drop it — nothing is sent.
  }

  function grant() {
    setConsent('granted');
    loadGA();
    loadPixel();
    flush();
  }

  function clearCookies() {
    var host = location.hostname;
    var parts = host.split('.');
    var domains = ['', host, '.' + host];
    // also clear on the registrable parent where sensible (dotheygetit.app)
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    var names = ['_ga', '_gid', '_gat', '_fbp', '_fbc'];
    try {
      document.cookie.split(';').forEach(function (c) {
        var name = c.split('=')[0].trim();
        if (names.indexOf(name) === -1 && name.indexOf('_ga_') !== 0 && name.indexOf('_gat_') !== 0) return;
        domains.forEach(function (d) {
          document.cookie = name + '=; Path=/; Max-Age=0' + (d ? '; Domain=' + d : '') + '; SameSite=Lax';
        });
      });
    } catch (e) {}
  }

  function save(value) {
    var previous = choice;
    choice = value;
    try { localStorage.setItem(KEY, value); } catch (e) {}
    if (value === 'granted') {
      grant();
    } else {
      setConsent('denied');
      clearCookies();
      // Scripts already fetched cannot be un-run. Reload so the page comes
      // back with nothing loaded — the honest way to enforce a "no".
      if (previous === 'granted') { location.reload(); return; }
    }
    hide();
  }

  /* ------------------------------- banner ------------------------------- */
  var banner = null;

  function build() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'getit-cookie';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookies and tracking');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML =
      '<div class="getit-cookie__inner">' +
        '<p class="getit-cookie__text"><strong>Cookies and tracking.</strong> ' +
        'We use Google Analytics to understand how the site is used, and the Meta pixel to measure advertising. ' +
        'They only run if you say yes. <a href="/privacy">Read the privacy notice</a>.</p>' +
        '<div class="getit-cookie__actions">' +
          '<button type="button" class="getit-cookie__btn getit-cookie__btn--accept" data-getit-consent="granted">Accept</button>' +
          '<button type="button" class="getit-cookie__btn getit-cookie__btn--reject" data-getit-consent="denied">Reject</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(banner);
    banner.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-getit-consent]');
      if (!btn) return;
      save(btn.getAttribute('data-getit-consent'));
    });
    return banner;
  }

  function show() {
    build().classList.add('is-open');
  }
  function hide() {
    if (banner) banner.classList.remove('is-open');
  }

  function init() {
    bindFooterLinks();
    if (choice === null) {
      show();
    } else if (choice === 'granted') {
      grant();
    }
  }

  function bindFooterLinks() {
    document.querySelectorAll('[data-cookie-settings]').forEach(function (el) {
      if (el.getAttribute('data-getit-bound')) return;
      el.setAttribute('data-getit-bound', '1');
      el.addEventListener('click', function (e) {
        e.preventDefault();
        open();
      });
    });
  }

  function open() {
    bindFooterLinks();
    build();
    // Reflect the current choice on the banner for clarity when reopening.
    banner.setAttribute('data-current', choice || 'none');
    show();
  }

  window.getitTrack = track;
  window.getitConsent = { open: open, get: function () { return choice; } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-bind if the footer is injected later.
  document.addEventListener('DOMContentLoaded', bindFooterLinks);
})();
