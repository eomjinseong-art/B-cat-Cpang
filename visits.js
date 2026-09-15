(function () {
  const BASE = 'https://abacus.jasoncameron.dev';
  const NAMESPACE = 'b-cat-cpang';
  const KEY = 'visits';
  const STORAGE_KEY = 'b-cat-cpang:visits-day';

  function todayLocal() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return now.getFullYear() + '-' + month + '-' + day;
  }

  function readDay() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function writeDay(day) {
    try {
      localStorage.setItem(STORAGE_KEY, day);
    } catch (error) {}
  }

  function hide() {
    const el = document.getElementById('visit-counter');
    if (el) el.remove();
  }

  function show(value) {
    const nav = document.querySelector('header nav');
    if (!nav) return;
    let el = document.getElementById('visit-counter');
    if (!el) {
      el = document.createElement('span');
      el.id = 'visit-counter';
      el.style.cssText = 'margin-left:auto;font-size:0.75rem;font-weight:400;color:#a8a29e;font-variant-numeric:tabular-nums;';
      nav.appendChild(el);
    }
    el.textContent = '👁 ' + Number(value).toLocaleString('en-US');
  }

  function start() {
    const day = todayLocal();
    const counted = readDay() === day;
    fetch(BASE + '/' + (counted ? 'get' : 'hit') + '/' + NAMESPACE + '/' + KEY)
      .then(function (res) {
        if (!res.ok) throw new Error('abacus');
        return res.json();
      })
      .then(function (data) {
        if (typeof data.value !== 'number' || !Number.isFinite(data.value)) throw new Error('abacus');
        if (!counted) writeDay(day);
        show(data.value);
      })
      .catch(hide);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
