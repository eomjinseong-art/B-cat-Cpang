(function () {
  const $ = id => document.getElementById(id);
  function articleSlug() {
    const last = (location.pathname.split('/').filter(Boolean).pop() || '').replace(/\.html$/, '');
    if (last && last !== 'article' && last !== 'wiki') return last;
    return decodeURIComponent(location.hash.replace(/^#/, ''))
      || new URLSearchParams(location.search).get('slug')
      || '';
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }
  function uniqueProducts(list) {
    const seen = new Set();
    return list.filter(item => {
      const title = item.product?.title || '';
      const key = item.product?.productId
        || (!/^고양이 용품 추천 /.test(title) && title)
        || item.product?.coupangUrl;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function catalogReady(item) {
    return item.product?.imageUrl?.endsWith('.jpg') && !/^고양이 용품 추천 /.test(item.product.title || '');
  }
  function imageSrc(item) {
    const url = item.product.imageUrl || '';
    return url.startsWith('./') ? '../' + url.slice(2) : url;
  }
  function slugify(text) {
    return String(text).trim().replace(/\s+/g, '-').replace(/[^\w가-힣-]/g, '').toLowerCase() || 's';
  }
  function parseMarkdown(raw) {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    return match ? match[2] : raw;
  }
  function rewriteLinks(body, wikiSlugs, blog) {
    return body.replace(/\]\(\/guides\/([a-z0-9-]+)\)/g, (_, dest) => {
      if (wikiSlugs.has(dest)) return `](./${dest}.html)`;
      return `](${blog})`;
    });
  }
  const slug = articleSlug();
  fetch('../data/config.json').then(r => r.json()).then(config => {
    $('headerLink').href = config.featuredLink;
    $('headerLink').textContent = config.featuredLabel;
  }).catch(() => {});
  Promise.all([
    fetch('./guides.json').then(r => r.json()),
    fetch(`./content/${encodeURIComponent(slug)}.md`).then(r => {
      if (!r.ok) throw new Error('missing');
      return r.text();
    })
  ]).then(([data, raw]) => {
    const guide = (data.guides || []).find(item => item.slug === slug);
    if (!guide) throw new Error('unknown');
    const wikiSlugs = new Set((data.guides || []).map(item => item.slug));
    const blog = data.blog || 'https://sumsumvill.blogspot.com/';
    document.title = `${guide.title} | 숨숨위키`;
    const meta = $('metaDesc');
    if (meta) meta.setAttribute('content', guide.description);
    $('crumbCat').textContent = `· ${guide.wikiCategory}`;
    $('pageTitle').textContent = guide.title;
    $('pageDesc').textContent = guide.description;
    $('pageMeta').textContent = `읽는 시간 약 ${guide.readMinutes}분`;
    $('disclaimer').textContent = data.disclaimer || '';
    marked.setOptions({ gfm: true, breaks: false });
    $('content').innerHTML = marked.parse(rewriteLinks(parseMarkdown(raw), wikiSlugs, blog));
    const used = new Set();
    $('content').querySelectorAll('h2, h3').forEach((heading, index) => {
      let id = slugify(heading.textContent);
      if (used.has(id)) id = `${id}-${index}`;
      used.add(id);
      heading.id = id;
    });
    const headings = [...$('content').querySelectorAll('h2, h3')];
    if (!headings.length) {
      $('tocBox').classList.add('hidden');
    } else {
      let h2 = 0, h3 = 0;
      $('toc').innerHTML = headings.map(heading => {
        if (heading.tagName === 'H2') { h2 += 1; h3 = 0; }
        else { h3 += 1; }
        const num = heading.tagName === 'H2' ? `${h2}` : `${h2}.${h3}`;
        const pad = heading.tagName === 'H3' ? 'pl-4 text-stone-500' : 'font-bold text-stone-700';
        return `<a class="block py-0.5 ${pad} hover:text-orange-600" href="#${heading.id}">${num} ${escapeHtml(heading.textContent)}</a>`;
      }).join('');
      $('tocBox').open = window.matchMedia('(min-width: 1024px)').matches;
    }
    return fetch('../data/products.json').then(r => r.json()).then(products => {
      const catalog = uniqueProducts(products).filter(catalogReady);
      const groups = (guide.productCategories || []).map(category => ({
        category,
        items: catalog.filter(item => item.category === category).slice(0, 4)
      })).filter(group => group.items.length);
      if (!groups.length) return;
      $('related').classList.remove('hidden');
      $('relatedGroups').innerHTML = groups.map(group =>
        `<div><h3 class="mb-3 text-sm font-black text-orange-600">#${escapeHtml(group.category)}</h3><div class="grid grid-cols-2 gap-3 sm:grid-cols-4">${group.items.map(item =>
          `<a href="${escapeHtml(item.product.coupangUrl)}" target="_blank" rel="noopener sponsored" class="overflow-hidden rounded-2xl border border-amber-100 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md"><img src="${escapeHtml(imageSrc(item))}" alt="${escapeHtml(item.product.title)}" class="h-40 w-full object-cover" loading="lazy"><div class="p-3"><span class="text-[11px] font-bold text-orange-600">#${escapeHtml(item.category || '추천')}</span><h3 class="mt-1 line-clamp-2 text-sm font-bold">${escapeHtml(item.product.title)}</h3><p class="mt-2 line-clamp-2 text-xs leading-5 text-stone-500">${escapeHtml(item.description || item.product.description || '고양이와 집사를 위한 추천 용품')}</p></div></a>`
        ).join('')}</div></div>`
      ).join('');
    });
  }).catch(() => {
    $('pageTitle').textContent = '글을 찾지 못했습니다';
    $('pageDesc').textContent = '숨숨위키 목록으로 돌아가 다른 글을 골라 주세요.';
    $('content').innerHTML = '<p><a href="./">위키 목록으로</a></p>';
    $('tocBox').classList.add('hidden');
  });
})();
