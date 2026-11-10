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

/**
 * Centre et rayon (km) des villes connues, pour le téléchargement des cartes hors ligne.
 * Données fixes ; les lieux enregistrés dans la ville élargissent la zone si besoin.
 */
const CITY_AREA: Record<string, { lat: number; lng: number; km: number }> = {
  tokyo: { lat: 35.6812, lng: 139.7671, km: 9 },
  osaka: { lat: 34.6937, lng: 135.5023, km: 6 },
  kyoto: { lat: 35.0116, lng: 135.7681, km: 6 },
  nara: { lat: 34.6851, lng: 135.8048, km: 3 },
  kanazawa: { lat: 36.5613, lng: 136.6562, km: 3 },
  nagano: { lat: 36.6485, lng: 138.195, km: 3 },
  hiroshima: { lat: 34.3853, lng: 132.4553, km: 4 },
  miyajima: { lat: 34.2959, lng: 132.3199, km: 2 },
  hakone: { lat: 35.2324, lng: 139.1069, km: 5 },
  kobe: { lat: 34.6901, lng: 135.1955, km: 4 },
  himeji: { lat: 34.8394, lng: 134.6939, km: 2 },
  nikko: { lat: 36.7199, lng: 139.6982, km: 3 },
  takayama: { lat: 36.1461, lng: 137.2522, km: 2 },
  kamakura: { lat: 35.3192, lng: 139.5467, km: 3 },
  yokohama: { lat: 35.4437, lng: 139.638, km: 5 },
  nagoya: { lat: 35.1815, lng: 136.9066, km: 5 },
  matsumoto: { lat: 36.238, lng: 137.972, km: 2 },
  sapporo: { lat: 43.0618, lng: 141.3545, km: 5 },
  fukuoka: { lat: 33.5904, lng: 130.4017, km: 5 },
};

export function cityArea(name: string): { lat: number; lng: number; km: number } | null {
  return CITY_AREA[key(name)] ?? null;
}
