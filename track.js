(function () {
  var UTM_KEY = 'utm_src';
  var SENT_KEY = 'va_landing';

  function storageGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (error) {}
  }

  function param(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || '';
    } catch (error) {
      return '';
    }
  }

  function referrerHost() {
    if (!document.referrer) return '';
    try {
      return new URL(document.referrer).hostname || '';
    } catch (error) {
      return '';
    }
  }

  var utmSource = param('utm_source');
  var utmCampaign = param('utm_campaign');
  if (utmSource) storageSet(UTM_KEY, utmSource);

  if (!storageGet(SENT_KEY)) {
    storageSet(SENT_KEY, '1');
    if (typeof window.va === 'function') {
      window.va('event', {
        name: 'landing',
        data: {
          src: utmSource || referrerHost() || 'none',
          campaign: utmCampaign || 'none'
        }
      });
    }
  }

  document.addEventListener('click', function (event) {
    var node = event.target;
    if (node && node.nodeType !== 1) node = node.parentElement;
    var link = node && node.closest ? node.closest('a') : null;
    if (!link || !link.href) return;

    var url;
    try {
      url = new URL(link.href);
    } catch (error) {
      return;
    }
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return;
    if (url.hostname === window.location.hostname) return;
    if (typeof window.va !== 'function') return;

    window.va('event', {
      name: 'cta_click',
      data: {
        dest: url.hostname,
        src: storageGet(UTM_KEY) || 'none'
      }
    });
  }, true);
})();
