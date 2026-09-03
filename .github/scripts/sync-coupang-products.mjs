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
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
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
      if (page) {
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(500);
        title = (await page.title()).replace(/\s*\|\s*쿠팡\s*$/, '').trim() || title;
        imageUrl = await page.locator('meta[property="og:image"]').getAttribute('content') || imageUrl;
      }
    } catch (error) {
      console.warn(`상품 ${id} 자동 조회 실패: ${error.message}`);
    }
    const localImage = `./images/products/product-${String(id).padStart(3, '0')}.svg`;
    if (!title) title = `고양이 용품 추천 ${id}`;
    if (!imageUrl) imageUrl = localImage;
    if (imageUrl && !imageUrl.startsWith('./')) {
      try {
        const imageResponse = await fetch(imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl);
        if (imageResponse.ok) {
          await fs.writeFile(path.join(imageDir, `product-${String(id).padStart(3, '0')}.jpg`), Buffer.from(await imageResponse.arrayBuffer()));
          imageUrl = `./images/products/product-${String(id).padStart(3, '0')}.jpg`;
        }
      } catch (error) {
        console.warn(`상품 ${id} 이미지 저장 실패: ${error.message}`);
      }
    }
    if (imageUrl === localImage) {
      await fs.writeFile(path.join(imageDir, `product-${String(id).padStart(3, '0')}.svg`), fallbackImage(id));
    }
    products.push({
      id,
      category: (row[categoryIndex] || '').replace(/^#/, '').trim() || '추천',
      product: {
        title,
        coupangUrl: link,
        imageUrl: imageUrl.startsWith('./') ? imageUrl : imageUrl
      }
    });
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
