// Noms en kanji des villes japonaises les plus courantes (données fixes, pas d'API).
const CITY_KANJI: Record<string, string> = {
  osaka: "大阪", nara: "奈良", kyoto: "京都", kanazawa: "金沢", nagano: "長野", tokyo: "東京", hiroshima: "広島",
  miyajima: "宮島", nikko: "日光", hakone: "箱根", kobe: "神戸", himeji: "姫路", sapporo: "札幌", fukuoka: "福岡",
  nagoya: "名古屋", takayama: "高山", shirakawago: "白川郷", yokohama: "横浜", kamakura: "鎌倉", kawaguchiko: "河口湖",
  okinawa: "沖縄", naha: "那覇", sendai: "仙台", matsumoto: "松本", nagasaki: "長崎", kumamoto: "熊本", kanagawa: "神奈川",
  koyasan: "高野山", uji: "宇治", ise: "伊勢", kagoshima: "鹿児島", hakodate: "函館", kanazawashi: "金沢",
};

const key = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** Kanji d'une ville connue, ou null (jamais deviné). */
export function cityKanji(name: string): string | null {
  return CITY_KANJI[key(name)] ?? null;
}

export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && key(a) === key(b);
}
