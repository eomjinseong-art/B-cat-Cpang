const PLACEHOLDER_CATEGORY_TITLES = [
  '고양이 용품',
  '고양이 모래',
  '고양이 사료',
  '고양이 간식',
  '스크래처 및 캣타워',
  '스크래쳐 및 캣타워',
  '위생 및 화장실 용품',
  '장난감',
  '그루밍',
  '기타'
];

export function isPlaceholderTitle(value, id) {
  const title = String(value || '').replace(/\s+/g, ' ').trim();
  if (!title) return true;
  if (id != null && title === `고양이 용품 추천 ${id}`) return true;
  if (/^고양이 용품 추천(?:\s+\d+)?$/.test(title)) return true;
  if (/^추천\s*\d+$/.test(title)) return true;
  if (PLACEHOLDER_CATEGORY_TITLES.some(category => title === `${category} 추천`)) return true;
  if (/찾으시는 상품과 유사한 상품을 노출합니다/.test(title)) return true;
  if (/상호명 및 호스팅 서비스 제공/.test(title)) return true;
  if (/^에서 구매하기/.test(title)) return true;
  return false;
}

export function isClearlyNonCatTitle(value) {
  const title = String(value || '');
  const mentionsCat = /고양이|반려묘|캣닢|캣타워|냥이|냥/.test(title);
  const automotive = /스마트키|차키|자동차|와이퍼|에어필터|에어리얼|도어록|글로브\s*박스|휠아치|스포티지|싼타페|베라크루즈|쉐보레|캐딜락|에스컬레이드|벤츠|BMW|기아\s*K\d|오일필터|풋등|도어\s*가니쉬|도어\s*스커프|가니쉬|커넥터\s*배선|순정품|순정\s*부품|안테나\s*어셈블리/;
  if (automotive.test(title) && !mentionsCat) return true;
  if (/스니커즈|\bPuma\b|푸마\s*스니커즈/.test(title)) return true;
  if (/미니칫솔|무드등/.test(title) && !/고양이|반려|펫|강아지|애견|냥/.test(title)) return true;
  if (/\(1개 단품\)/.test(title) && /[A-Z0-9]{6,}/.test(title) && !mentionsCat) return true;
  return false;
}

export function shouldOmitFromCatalog(item) {
  const title = item?.product?.title || '';
  return isPlaceholderTitle(title, item?.id) || isClearlyNonCatTitle(title);
}
