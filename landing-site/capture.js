/* Exit-intent / scroll / time popup for the GCSE misconception banks.
   Hidden for 14 days after a dismiss. Hidden for good after any email signup. */
(function () {
  var root = document.getElementById('getit-capture');
  if (!root) return;

  var panel = root.querySelector('.getit-capture-panel');
  var title = document.getElementById('getit-capture-title');
  var form = root.querySelector('form');
  var closeBtn = root.querySelector('.getit-capture-close');
  var started = Date.now();
  var initialY = window.scrollY || 0;
  var opened = false;
  var previous = null;
  var DAY = 24 * 60 * 60 * 1000;

  function suppressed() {
    try {
      if (localStorage.getItem('getit-on-list') === '1') return true;
      var until = parseInt(localStorage.getItem('getit-capture-hide') || '0', 10);
      if (until > Date.now()) return true;
    } catch (err) {}
    return false;
  }

  function desktop() {
    return window.matchMedia('(min-width: 760px) and (hover: hover) and (pointer: fine)').matches;
  }

  function focusable() {
    return Array.prototype.filter.call(
      panel.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'),
      function (el) {
        if (el.closest('.hp')) return false;
        return el.getClientRects().length > 0;
      }
    );
  }

  function openPopup() {
    var narrow = window.matchMedia('(max-width: 759px)').matches;
    previous = document.activeElement;
    root.hidden = false;
    root.classList.toggle('is-modal', !narrow);
    root.classList.toggle('is-banner', narrow);
    root.classList.toggle('is-collapsed', narrow);
    if (panel) panel.setAttribute('aria-modal', narrow ? 'false' : 'true');
    if (!narrow) document.documentElement.classList.add('getit-capture-lock');
    if (title && !narrow) title.focus();
  }

  // Mobile: compact bar first, full form only when tapped.
  if (panel && title) {
    if (!title.querySelector('.long')) {
      title.innerHTML = '<span class="short">Free GCSE misconceptions PDF</span><span class="long">' +
        title.innerHTML + '</span>';
    }
    var openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'getit-capture-open';
    openBtn.textContent = 'Get it';
    title.insertAdjacentElement('afterend', openBtn);
    var expand = function () {
      if (!root.classList.contains('is-collapsed')) return;
      root.classList.remove('is-collapsed');
      var first = panel.querySelector('input[name="first-name"]');
      if (first) first.focus();
    };
    openBtn.addEventListener('click', expand);
    title.addEventListener('click', expand);
  }

  function closePopup() {
    root.hidden = true;
    root.classList.remove('is-modal', 'is-banner', 'is-collapsed');
    document.documentElement.classList.remove('getit-capture-lock');
    if (panel) panel.setAttribute('aria-modal', 'false');
    if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
      previous.focus();
    }
  }

  function dismiss() {
    try {
      localStorage.setItem('getit-capture-hide', String(Date.now() + 14 * DAY));
    } catch (err) {}
    closePopup();
  }

  function tryArm() {
    if (opened) return;
    if (Date.now() - started < 1500) return;
    if (suppressed()) {
      opened = true;
      return;
    }
    if (document.querySelector('.modal.open')) return;
    opened = true;
    openPopup();
  }

  document.addEventListener('scroll', function () {
    var y = window.scrollY || 0;
    if (Math.abs(y - initialY) < 48) return;
    var doc = document.documentElement;
    var height = Math.max(doc.scrollHeight || 0, document.body ? document.body.scrollHeight : 0, 1);
    if ((y + window.innerHeight) / height >= 0.5) tryArm();
  }, { passive: true });

  document.addEventListener('mouseout', function (e) {
    if (!desktop()) return;
    if (e.clientY > 0) return;
    if (e.relatedTarget || e.toElement) return;
    tryArm();
  });

  setTimeout(tryArm, 45000);

  if (closeBtn) closeBtn.addEventListener('click', dismiss);

  root.addEventListener('click', function (e) {
    if (!root.classList.contains('is-modal')) return;
    if (e.target === root) dismiss();
  });

  document.addEventListener('keydown', function (e) {
    if (root.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
      return;
    }
    if (e.key !== 'Tab' || !root.classList.contains('is-modal')) return;
    var items = focusable();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    var active = document.activeElement;
    if (e.shiftKey && (active === first || active === title)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || active === title)) {
      e.preventDefault();
      if (active === title) first.focus();
      else first.focus();
    }
  });

  if (form) {
    form.addEventListener('submit', function () {
      var sel = form.querySelector('[name="subject"]');
      var value = sel && sel.value ? sel.value : '';
      try {
        localStorage.setItem('getit-on-list', '1');
        if (value) localStorage.setItem('getit-toolkit-subject', value);
      } catch (err) {}
      if (value) form.action = '/toolkit-thanks/?subject=' + encodeURIComponent(value);
    });
  }

  document.addEventListener('submit', function (e) {
    var node = e.target;
    if (!node || !node.getAttribute) return;
    var name = node.getAttribute('name');
    if (name === 'newsletter' || name === 'pack-download' || name === 'toolkit-download') {
      try { localStorage.setItem('getit-on-list', '1'); } catch (err) {}
    }
  }, true);
})();
