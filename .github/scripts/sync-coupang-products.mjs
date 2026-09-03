import fs from 'node:fs/promises';
import path from 'node:path';

const repo = process.cwd();
const sheetUrl = 'https://docs.google.com/spreadsheets/d/1hUNqA5ywL75YmRH-PwZ4K-_zSIpN75C8SFjgsQ9vtTg/gviz/tq?tqx=out:csv&sheet=%EA%B4%91%EA%B3%A0%EC%9A%A9';
const imageDir = path.join(repo, 'images', 'products');
const productsPath = path.join(repo, 'data', 'products.json');
const sheetExportPath = path.join(repo, 'data', 'sheet-update.csv');
const maxProducts = Number(process.env.MAX_PRODUCTS || 0);
const delayMs = Number(process.env.DELAY_MS || 1200);

await fs.mkdir(imageDir, { recursive: true });

const csv = await (await fetch(sheetUrl)).text();
const rows = parseCsv(csv);
const headers = rows[0].map(value => value.trim().toLowerCase());
const index = name => headers.indexOf(name);
const linkIndex = firstIndex(index, ['쿠팡 파트너스 링크', '쿠팡파트너스 링크', '상품 링크']);
const categoryIndex = firstIndex(index, ['상황 태그', '카테고리']);
const titleIndex = firstIndex(index, ['상품명', '실제 상품명']);
const imageIndex = firstIndex(index, ['상품 이미지 url', '이미지 url']);
const descriptionIndex = firstIndex(index, ['상품 한줄설명', '상품 설명']);

const catalogOnly = process.argv.includes('--catalog-only');
const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbz2LjDNSCMzMrRu_nCXv36VHDaaHBFYXhGqeIZPB2DzxA1F9j8x_NrI09jYTizpPAkG/exec';
const flagsPath = path.join(repo, 'data', 'sheet-flags.json');
const failedPath = path.join(repo, 'data', 'scrape-failed.json');
const existing = await loadExistingProducts();
const failed = await loadFailedIds();

if (catalogOnly) {
  const current = [...existing.values()].sort((a, b) => a.id - b.id);
  await finalizeCatalog(current);
  process.exit(0);
}

const products = [];
const seen = new Set();
let scrapedCount = 0;

for (const row of rows.slice(1)) {
  const id = Number(row[0]);
  const link = (row[linkIndex] || '').trim().replace(/\/+$/, '');
  if (!id || !link || seen.has(link)) continue;
  seen.add(link);

  const previous = existing.get(id);
  let title = (row[titleIndex] || '').trim() || previous?.product?.title || '';
  let remoteImageUrl = (row[imageIndex] || '').trim();
  const sheetCategory = (row[categoryIndex] || '').replace(/^#/, '').trim();
  const sheetDescription = (row[descriptionIndex] || '').trim();
  const jpgPath = path.join(imageDir, `product-${String(id).padStart(3, '0')}.jpg`);
  const hasJpg = await fileExists(jpgPath);
  const needsTitle = !title || isFallbackTitle(title, id) || isWeakTitle(title);
  const needsImage = !hasJpg;

  let didScrape = false;
  if ((needsImage || (needsTitle && !hasJpg)) && !failed.has(id)) {
    if (maxProducts && scrapedCount >= maxProducts) break;
    scrapedCount += 1;
    didScrape = true;
    const scraped = await scrapeProduct(id, link);
    if (scraped.title && !isBlockedTitle(scraped.title) && !isWeakTitle(scraped.title)) title = scraped.title;
    if (scraped.imageUrl) remoteImageUrl = scraped.imageUrl;
    else failed.add(id);
  }

  if (!title || isBlockedTitle(title)) {
    title = previous?.product?.title && !isFallbackTitle(previous.product.title, id)
      ? previous.product.title
      : `고양이 용품 추천 ${id}`;
  }

  let imageUrl = hasJpg
    ? `./images/products/product-${String(id).padStart(3, '0')}.jpg`
    : `./images/products/product-${String(id).padStart(3, '0')}.svg`;

  if (needsImage && remoteImageUrl && !remoteImageUrl.startsWith('./')) {
    const saved = await downloadImage(remoteImageUrl, jpgPath, id);
    if (saved) imageUrl = `./images/products/product-${String(id).padStart(3, '0')}.jpg`;
    else failed.add(id);
  }

  if (imageUrl.endsWith('.svg')) {
    const svgPath = path.join(imageDir, `product-${String(id).padStart(3, '0')}.svg`);
    if (!(await fileExists(svgPath))) await fs.writeFile(svgPath, fallbackImage(id));
  }

  const category = classifyCategory(sheetCategory || previous?.category || '', title);
  const description = sheetDescription || previous?.description || categoryDescription(category);
  products.push({
    id,
    category,
    description,
    product: {
      title,
      coupangUrl: link,
      imageUrl,
      sourceImageUrl: remoteImageUrl.startsWith('http') ? remoteImageUrl : ''
    }
  });

  await saveOutputs(products);
  const status = imageUrl.endsWith('.jpg') ? '사진' : '임시그림';
  console.log(`[${products.length}] ${id} ${status} ${title}`);
  if (didScrape) await sleep(delayMs);
}

await saveOutputs(products);
await fs.writeFile(failedPath, `${JSON.stringify([...failed].sort((a, b) => a - b), null, 2)}\n`);
const merged = new Map(existing);
for (const item of products) merged.set(item.id, item);
const finalized = await finalizeCatalog([...merged.values()].sort((a, b) => a.id - b.id));
const jpgCount = finalized.filter(item => item.product.imageUrl.endsWith('.jpg')).length;
console.log(`상품 ${finalized.length}개 동기화 완료. 실제 사진 ${jpgCount}개, 임시 그림 ${finalized.length - jpgCount}개.`);
console.log(`시트 붙여넣기 파일: ${path.relative(repo, sheetExportPath)}`);

async function finalizeCatalog(list) {
  const classified = list.map(item => {
    const category = classifyCategory('', item.product.title);
    return {
      ...item,
      category,
      description: categoryDescription(category)
    };
  });

  for (const item of classified) {
    if (item.product.productId) continue;
    item.product.productId = await resolveProductId(item.product.coupangUrl);
    await sleep(120);
  }

  const { kept, duplicates } = dedupeProducts(classified);
  const missing = kept
    .filter(item => !item.product.imageUrl.endsWith('.jpg'))
    .map(item => item.id);
  await saveSiteProducts(kept, missing, duplicates);
  await notifyGoogleSheet(missing, duplicates);
  console.log(`중복 ${duplicates.length}개 삭제, 이미지 없음 ${missing.length}개 표시`);
  return kept;
}

function dedupeProducts(list) {
  const kept = [];
  const duplicates = [];
  const seenProduct = new Map();
  const seenTitle = new Map();

  for (const item of list) {
    const productId = item.product.productId || '';
    const title = item.product.title || '';
    const titleKey = /^고양이 용품 추천 /.test(title) ? '' : title;
    const prev = (productId && seenProduct.get(productId)) || (titleKey && seenTitle.get(titleKey));
    if (!prev) {
      kept.push(item);
      if (productId) seenProduct.set(productId, item);
      if (titleKey) seenTitle.set(titleKey, item);
      continue;
    }
    const prevHasPhoto = prev.product.imageUrl.endsWith('.jpg');
    const currHasPhoto = item.product.imageUrl.endsWith('.jpg');
    if (!prevHasPhoto && currHasPhoto) {
      duplicates.push(prev.id);
      const index = kept.indexOf(prev);
      if (index >= 0) kept[index] = item;
      if (productId) seenProduct.set(productId, item);
      if (titleKey) seenTitle.set(titleKey, item);
    } else {
      duplicates.push(item.id);
    }
  }
  return { kept, duplicates };
}

async function saveSiteProducts(list, missing, duplicates) {
  const siteProducts = list.map(({ id, category, description, product }) => ({
    id,
    category,
    description,
    product: {
      title: product.title,
      coupangUrl: product.coupangUrl,
      imageUrl: product.imageUrl,
      productId: product.productId || ''
    }
  }));
  await fs.writeFile(productsPath, `${JSON.stringify(siteProducts, null, 2)}\n`);
  await fs.writeFile(flagsPath, `${JSON.stringify({ missing, duplicates }, null, 2)}\n`);
  const duplicateSet = new Set(duplicates);
  const missingSet = new Set(missing);
  const csvLines = [
    ['NO', '쿠팡 파트너스 링크', '상황 태그', '상품명', '상품 한줄설명', '상품 이미지 URL', '이미지 상태']
      .map(csvCell).join(','),
    ...list.map(item => [
      item.id,
      item.product.coupangUrl,
      item.category,
      item.product.title,
      item.description,
      item.product.sourceImageUrl || '',
      duplicateSet.has(item.id)
        ? '중복 상품 - 다른 링크로 교체 필요'
        : missingSet.has(item.id)
          ? '이미지 없음 - 링크 교체 필요'
          : '정상'
    ].map(csvCell).join(','))
  ];
  await fs.writeFile(sheetExportPath, `\ufeff${csvLines.join('\n')}\n`);
}

async function notifyGoogleSheet(missing, duplicates) {
  const url = `${appsScriptUrl}?action=mark&missing=${missing.join(',')}&duplicates=${duplicates.join(',')}`;
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    const text = await response.text();
    console.log(`구글 시트 표시 결과: ${text.slice(0, 300)}`);
  } catch (error) {
    console.warn(`구글 시트 표시 실패: ${error.message}`);
  }
}

async function scrapeProduct(id, link) {
  try {
    const productId = await resolveProductId(link);
    if (!productId) {
      console.warn(`상품 ${id}: 쿠팡 상품번호를 찾지 못했습니다.`);
      return { title: '', imageUrl: '' };
    }
    const html = await fetchText(`https://search.naver.com/search.naver?query=${encodeURIComponent(`${productId} 쿠팡`)}`);
    const parsed = parseNaverResult(html, productId);
    console.log(`상품 ${id} productId=${productId} 제목=${parsed.title || '-'} 이미지=${parsed.imageUrl ? '있음' : '없음'}`);
    return parsed;
  } catch (error) {
    console.warn(`상품 ${id} 수집 실패: ${error.message}`);
    return { title: '', imageUrl: '' };
  }
}

async function resolveProductId(link) {
  let url = link;
  for (let i = 0; i < 8; i++) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: requestHeaders(),
      signal: AbortSignal.timeout(15000)
    });
    const location = response.headers.get('location');
    if (!location) break;
    url = new URL(location, url).href;
    const productId = url.match(/\/vp\/products\/(\d+)/)?.[1] || url.match(/[?&]ctag=(\d+)/)?.[1];
    if (productId) return productId;
  }
  return '';
}

function parseNaverResult(html, productId) {
  const decoded = html
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');

  let imageUrl = '';
  for (const match of decoded.matchAll(/[?&]src=(https?[^"'&]+)/g)) {
    const src = decodeURIComponent(match[1]);
    if (/coupangcdn\.com/i.test(src)) {
      imageUrl = src.split('&')[0];
      break;
    }
  }
  if (!imageUrl) {
    const encoded = decoded.match(/https%3A%2F%2Fthumbnail\.coupangcdn\.com[^"'&]+/i);
    if (encoded) imageUrl = decodeURIComponent(encoded[0]).split('&')[0];
  }
  if (!imageUrl) {
    const direct = decoded.match(/https:\/\/thumbnail\.coupangcdn\.com\/[^"'\s<>]+/i);
    if (direct) imageUrl = decodeURIComponent(direct[0]).split('&')[0];
  }

  const chunks = decoded.split(`products/${productId}`);
  const skip = /네이버|검색|새 창|쿠팡!|로그인|열림|더보기|블로그|카페|뉴스|Access Denied|http|쿠스피|추세|가격 데이터|총 중량|주원료|대상연령|식품 기능|도착 보장|광고|판매자|리뷰|찜하기|장바구니/i;
  const weak = /^(고양이 용품|쇼핑|쿠팡|상품|추천|인기)$/;
  const all = [];
  for (const chunk of chunks.slice(1, 6)) {
    const candidates = [...chunk.matchAll(/>([^<]{6,120})</g)]
      .map(match => match[1].replace(/\s+/g, ' ').trim())
      .map(text => text.replace(/할인\d[\s\S]*$/, '').replace(/내일\([^)]*\)[\s\S]*$/, '').trim())
      .filter(text => text.length >= 10 && text.length <= 80 && /[가-힣]{2,}/.test(text) && !skip.test(text) && !weak.test(text) && !/Keep에 저장|공유하기|링크 복사/.test(text));
    all.push(...candidates);
  }
  return { title: all[0] || '', imageUrl };
}

async function downloadImage(imageUrl, jpgPath, id) {
  try {
    const absoluteImageUrl = imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl;
    const response = await fetch(absoluteImageUrl, {
      headers: { ...requestHeaders(), Referer: 'https://www.coupang.com/' },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) return false;
    const imageBody = Buffer.from(await response.arrayBuffer());
    if (!imageBody || imageBody.length < 2000) return false;
    await fs.writeFile(jpgPath, imageBody);
    return true;
  } catch (error) {
    console.warn(`상품 ${id} 이미지 저장 실패: ${error.message}`);
    return false;
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: requestHeaders(),
    signal: AbortSignal.timeout(15000)
  });
  return response.text();
}

function requestHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
  };
}

async function saveOutputs(list) {
  const merged = new Map(existing);
  for (const item of list) merged.set(item.id, item);
  const ordered = [...merged.values()].sort((a, b) => a.id - b.id);
  const siteProducts = ordered.map(({ id, category, description, product }) => ({
    id,
    category,
    description,
    product: {
      title: product.title,
      coupangUrl: product.coupangUrl,
      imageUrl: product.imageUrl
    }
  }));
  await fs.writeFile(productsPath, `${JSON.stringify(siteProducts, null, 2)}\n`);
  const csvLines = [
    ['NO', '쿠팡 파트너스 링크', '상황 태그', '상품명', '상품 한줄설명', '상품 이미지 URL', '이미지 상태']
      .map(csvCell).join(','),
    ...ordered.map(item => [
      item.id,
      item.product.coupangUrl,
      item.category,
      item.product.title,
      item.description,
      item.product.sourceImageUrl || '',
      item.product.imageUrl.endsWith('.jpg') ? 'GitHub 저장 완료' : '사진 수집 실패'
    ].map(csvCell).join(','))
  ];
  await fs.writeFile(sheetExportPath, `\ufeff${csvLines.join('\n')}\n`);
}

async function loadExistingProducts() {
  try {
    const parsed = JSON.parse(await fs.readFile(productsPath, 'utf8'));
    return new Map(parsed.map(item => [item.id, item]));
  } catch {
    return new Map();
  }
}

async function loadFailedIds() {
  try {
    const parsed = JSON.parse(await fs.readFile(failedPath, 'utf8'));
    return new Set(parsed);
  } catch {
    return new Set([7, 20, 24, 28]);
  }
}

function isBlockedTitle(value) {
  return /access denied|error|쿠팡이 추천하는|접근이 거부|blocked/i.test(value || '');
}

function isFallbackTitle(value, id) {
  return value === `고양이 용품 추천 ${id}`;
}

function isWeakTitle(value) {
  return /^(고양이 용품|쇼핑|쿠팡|상품|캣타워\/스크래쳐)$/.test(value || '')
    || /쿠스피|가격 데이터|총 중량|주원료|도착 보장|^Keep에/.test(value || '');
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function firstIndex(indexer, names) {
  for (const name of names) {
    const value = indexer(name.toLowerCase());
    if (value >= 0) return value;
  }
  return -1;
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"' && quoted && input[i + 1] === '"') {
      value += '"';
      i++;
    } else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(value);
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }

  row.push(value);
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

function fallbackImage(id) {
  const hue = (id * 37) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue},75%,88%)"/><stop offset="1" stop-color="hsl(${(hue + 35) % 360},80%,65%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="400" cy="300" r="150" fill="#fff" opacity=".45"/><path d="M315 270l-35-95 85 50 35-12 35 12 85-50-35 95c0 75-40 115-85 115s-85-40-85-115z" fill="#6b4f3b"/><circle cx="360" cy="285" r="10" fill="#fff"/><circle cx="440" cy="285" r="10" fill="#fff"/><path d="M390 320q10 10 20 0M270 325l-75-10m75 35l-75 15m530-40l75-10m-75 35l75 15" stroke="#6b4f3b" stroke-width="7" fill="none"/><text x="400" y="535" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="bold" fill="#5b4030">CAT GOODS ${id}</text></svg>`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function classifyCategory(value, title) {
  if (value) return value;
  const text = title.toLowerCase();
  if (/사료|키튼|로얄캐닌|습식|건식|식품/.test(text)) return '고양이 사료';
  if (/모래|벤토나이트|실리카겔|두부/.test(text)) return '고양이 모래';
  if (/간식|츄르|트릿|캔|스낵|비스킷|젤리/.test(text)) return '고양이 간식';
  if (/스크래쳐|스크래처|스크래치|캣타워|하우스|숨숨집|방석|쿠션/.test(text)) {
    return '스크래처 및 캣타워';
  }
  if (/화장실|배변|탈취|위생|리터락커|분변통|매트|트레이/.test(text)) {
    return '위생 및 화장실 용품';
  }
  if (/장난감|낚싯대|공|터널|캣닢|볼링|인형/.test(text)) return '장난감';
  if (/브러시|빗|샴푸|발톱|그루밍|목욕|티슈/.test(text)) return '그루밍';
  return '기타';
}

function categoryDescription(category) {
  return {
    '고양이 사료': '고양이의 건강한 식사를 위한 추천 사료입니다.',
    '고양이 모래': '쾌적한 배변 환경을 위한 고양이 모래입니다.',
    '고양이 간식': '맛있는 간식으로 건강한 보상 시간을 만들어 주세요.',
    '스크래처 및 캣타워': '휴식과 발톱 관리를 돕는 공간입니다.',
    '위생 및 화장실 용품': '쾌적한 위생과 배변 환경을 위한 용품입니다.',
    장난감: '지루함을 덜어 주는 즐거운 놀이 용품입니다.',
    그루밍: '고양이의 위생과 털 관리를 위한 용품입니다.',
    기타: '고양이와 집사에게 유용한 생활 추천 용품입니다.'
  }[category] || '고양이와 집사를 위한 추천 용품입니다.';
}
