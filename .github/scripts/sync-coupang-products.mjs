import fs from 'node:fs/promises';
import path from 'node:path';
const repo = process.cwd();
const sheetUrl = 'https://docs.google.com/spreadsheets/d/1hUNqA5ywL75YmRH-PwZ4K-_zSIpN75C8SFjgsQ9vtTg/gviz/tq?tqx=out:csv&sheet=%EA%B4%91%EA%B3%A0%EC%9A%A9';
const csv = await (await fetch(sheetUrl)).text();
const rows = parseCsv(csv);
const headers = rows[0].map(value => value.trim().toLowerCase());
const index = name => headers.indexOf(name);
const linkIndex = firstIndex(index, ['쿠팡 파트너스 링크', '쿠팡파트너스 링크', '상품 링크']);
const categoryIndex = firstIndex(index, ['상황 태그', '카테고리']);
const titleIndex = firstIndex(index, ['상품명', '실제 상품명']);
const imageIndex = firstIndex(index, ['상품 이미지 url', '이미지 url']);
const products = [];
const seen = new Set();
const imageDir = path.join(repo, 'images', 'products');
await fs.mkdir(imageDir, { recursive: true });
let browser;
let page;
try {
  const { chromium } = await import('playwright');
  browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: ['--disable-blink-features=AutomationControlled']
  });
  page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36'
  });
} catch (error) {
  console.warn(`Playwright를 사용할 수 없어 시트 데이터만 동기화합니다: ${error.message}`);
}

try {
  for (const row of rows.slice(1)) {
    const id = Number(row[0]);
    const link = (row[linkIndex] || '').trim().replace(/\/+$/, '');
    if (!id || !link || seen.has(link)) continue;
    seen.add(link);
    let title = (row[titleIndex] || '').trim();
    let imageUrl = (row[imageIndex] || '').trim();
    try {
      if (!page || page.isClosed()) {
        const { chromium } = await import('playwright');
        browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
        page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36' });
      }
      if (page) {
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1200);
        let pageTitle = (await page.title()).replace(/\s*\|\s*쿠팡\s*$/, '').trim();
        if (/access denied/i.test(pageTitle)) {
          await page.waitForTimeout(5000);
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(1200);
          pageTitle = (await page.title()).replace(/\s*\|\s*쿠팡\s*$/, '').trim();
        }
        if (pageTitle && !/access denied|error|쿠팡이 추천하는/i.test(pageTitle)) title = pageTitle;
        imageUrl = await page.evaluate(() => {
          const metaImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
          const twitterImage = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
          const productImage = [...document.images].map(image => image.currentSrc || image.src)
            .find(src => /coupangcdn|thumbnail/i.test(src));
          return metaImage || twitterImage || productImage || '';
        }) || imageUrl;
      }
    } catch (error) {
      console.warn(`상품 ${id} 자동 조회 실패: ${error.message}`);
      if (page && page.isClosed()) {
        page = null;
        if (browser) await browser.close().catch(() => {});
        browser = null;
      }
    }
    const imageFile = `product-${String(id).padStart(3, '0')}`;
    const jpgPath = path.join(imageDir, `${imageFile}.jpg`);
    const hasExistingImage = await fileExists(jpgPath);
    const localImage = hasExistingImage ? `./images/products/${imageFile}.jpg` : `./images/products/${imageFile}.svg`;
    if (!title || /access denied|error/i.test(title)) title = `고양이 용품 추천 ${id}`;
    if (!imageUrl) imageUrl = localImage;
    if (imageUrl && !imageUrl.startsWith('./')) {
      try {
        const absoluteImageUrl = imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl;
        const imageResponse = page
          ? await page.request.get(absoluteImageUrl, {
            headers: { Referer: 'https://www.coupang.com/' }
            , timeout: 15000
          })
          : await fetch(absoluteImageUrl);
        const imageOk = typeof imageResponse.ok === 'function' ? imageResponse.ok() : imageResponse.ok;
        if (imageOk) {
        const imageBody = typeof imageResponse.body === 'function'
          ? await imageResponse.body()
          : Buffer.from(await imageResponse.arrayBuffer());
        await fs.writeFile(path.join(imageDir, `product-${String(id).padStart(3, '0')}.jpg`), imageBody);
        imageUrl = `./images/products/product-${String(id).padStart(3, '0')}.jpg`;
        } else {
        imageUrl = absoluteImageUrl;
        }
      } catch (error) {
        console.warn(`상품 ${id} 이미지 저장 실패: ${error.message}`);
      }
    }
    if (imageUrl === localImage && localImage.endsWith('.svg')) {
      await fs.writeFile(path.join(imageDir, `product-${String(id).padStart(3, '0')}.svg`), fallbackImage(id));
    }
    products.push({
      id,
      category: classifyCategory((row[categoryIndex] || '').replace(/^#/, '').trim(), title),
      description: categoryDescription(classifyCategory((row[categoryIndex] || '').replace(/^#/, '').trim(), title)),
      product: {
        title,
        coupangUrl: link,
        imageUrl: imageUrl.startsWith('./') ? imageUrl : imageUrl
      }
    });
    if (page && !page.isClosed()) await page.waitForTimeout(1200);
  }
} finally {
  if (browser) await browser.close();
}

await fs.writeFile(path.join(repo, 'data', 'products.json'), `${JSON.stringify(products, null, 2)}\n`);
console.log(`상품 ${products.length}개를 동기화했습니다.`);

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
  if (/간식|츄르|트릿|캔|스낵/.test(text)) return '고양이 간식';
  if (/사료|키튼|로얄캐닌|습식|건식/.test(text)) return '고양이 사료';
  if (/모래/.test(text)) return '고양이 모래';
  if (/화장실|배변|탈취/.test(text)) return '위생 및 화장실 용품';
  if (/스크래쳐|스크래치|캣타워|하우스|숨숨집/.test(text)) return '스크래처 및 캣타워';
  if (/장난감|낚싯대|공|터널|캣닢/.test(text)) return '장난감';
  if (/브러시|빗|샴푸|발톱|그루밍/.test(text)) return '그루밍';
  return '기타';
}

function categoryDescription(category) {
  return {
    '고양이 간식': '맛있는 간식으로 건강한 보상 시간을 만들어 주세요.',
    '고양이 사료': '고양이의 건강한 식사를 위한 추천 사료입니다.',
    '고양이 모래': '쾌적한 배변 환경을 위한 고양이 모래입니다.',
    '위생 및 화장실 용품': '쾌적한 위생과 배변 환경을 위한 필수 용품입니다.',
    '스크래처 및 캣타워': '휴식과 발톱 관리를 동시에 돕는 공간입니다.',
    장난감: '지루함을 덜어 주는 즐거운 놀이 용품입니다.',
    그루밍: '고양이의 위생과 털 관리를 위한 용품입니다.',
    기타: '고양이와 집사에게 유용한 생활 추천 용품입니다.'
  }[category] || '고양이와 집사를 위한 추천 용품입니다.';
}
