const SPREADSHEET_ID = '1hUNqA5ywL75YmRH-PwZ4K-_zSIpN75C8SFjgsQ9vtTg';
const SHEET_NAME = '광고용';
const OUTPUT_SHEET_NAME = '사이트용상품';
const FLAGS_URL = 'https://raw.githubusercontent.com/eomjinseong-art/B-cat-Cpang/main/data/sheet-flags.json';
const MISSING_STATUS = '이미지 없음 - 링크 교체 필요';
const DUPLICATE_STATUS = '중복 상품 - 다른 링크로 교체 필요';
const OK_STATUS = '정상';
const RED = '#FEE2E2';
const WHITE = '#FFFFFF';

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  try {
    if (action === 'mark' || action === 'markMissing') {
      const missing = parseIds(e.parameter.missing || e.parameter.ids);
      const duplicates = parseIds(e.parameter.duplicates);
      const result = missing.length || duplicates.length
        ? markSheetRows(missing, duplicates)
        : markFromGithub();
      return json(result);
    }
    if (action === 'sync') {
      return json(syncProducts());
    }
  } catch (error) {
    return json({ success: false, error: error.message });
  }
  return ContentService.createTextOutput(
    'B-Cat-Cpang Apps Script\n?action=mark - 이미지 없음/중복 행을 빨간색으로 표시\n?action=sync - 사이트용상품 정리'
  );
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('사이트 상품 관리')
    .addItem('이미지 없는 링크 빨간색 표시', 'markFromGithub')
    .addItem('상품 데이터 정리', 'syncProducts')
    .addToUi();
}

function markFromGithub() {
  const response = UrlFetchApp.fetch(FLAGS_URL, { muteHttpExceptions: true, followRedirects: true });
  if (response.getResponseCode() >= 400) {
    throw new Error('sheet-flags.json을 불러오지 못했습니다.');
  }
  const flags = JSON.parse(response.getContentText());
  const result = markSheetRows(flags.missing || [], flags.duplicates || []);
  try {
    SpreadsheetApp.getActive().toast(
      `이미지 없음 ${result.missing}개, 중복 ${result.duplicates}개를 표시했습니다.`,
      '사이트 상품 관리'
    );
  } catch (error) {}
  return result;
}

function markSheetRows(missingIds, duplicateIds) {
  const sheet = getSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`'${SHEET_NAME}' 탭을 찾을 수 없습니다.`);

  const range = sheet.getDataRange();
  const values = range.getDisplayValues();
  if (values.length < 2) throw new Error('광고용 탭에 상품 데이터가 없습니다.');

  const missing = new Set((missingIds || []).map(Number));
  const duplicates = new Set((duplicateIds || []).map(Number));
  const statusIndex = ensureStatusColumn(sheet, values[0]);
  const lastColumn = Math.max(range.getNumColumns(), statusIndex + 1);
  const backgrounds = [];
  const statuses = [];

  for (let i = 1; i < values.length; i++) {
    const id = Number(String(values[i][0] || '').trim());
    if (duplicates.has(id)) {
      backgrounds.push(RED);
      statuses.push(DUPLICATE_STATUS);
    } else if (missing.has(id)) {
      backgrounds.push(RED);
      statuses.push(MISSING_STATUS);
    } else {
      backgrounds.push(WHITE);
      statuses.push(OK_STATUS);
    }
  }

  sheet.getRange(2, 1, backgrounds.length, lastColumn).setBackgrounds(
    backgrounds.map(color => Array(lastColumn).fill(color))
  );
  sheet.getRange(2, statusIndex + 1, statuses.length, 1).setValues(statuses.map(value => [value]));
  sheet.getRange(1, statusIndex + 1).setValue('이미지 상태');
  sheet.setFrozenRows(1);

  return {
    success: true,
    missing: [...missing].length,
    duplicates: [...duplicates].length,
    rows: backgrounds.length
  };
}

function ensureStatusColumn(sheet, headers) {
  const names = headers.map(value => String(value || '').trim());
  const found = names.findIndex(name => name === '이미지 상태' || name === '상태');
  if (found >= 0) return found;
  const column = names.length + 1;
  sheet.getRange(1, column).setValue('이미지 상태');
  return column - 1;
}

function syncProducts() {
  const spreadsheet = getSpreadsheet();
  const source = spreadsheet.getSheetByName(SHEET_NAME);
  if (!source) throw new Error(`'${SHEET_NAME}' 탭을 찾을 수 없습니다.`);
  return { success: true, sheet: SHEET_NAME };
}

function getSpreadsheet() {
  try {
    return SpreadsheetApp.getActive() || SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (error) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
}

function parseIds(value) {
  return String(value || '')
    .split(',')
    .map(item => Number(item.trim()))
    .filter(item => item > 0);
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
