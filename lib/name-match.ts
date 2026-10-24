// Pencocokan nama longgar untuk DPT resmi (K6a): cukup satu kata nama yang sama.
// Gelar dan kata kurang dari 3 huruf (dr, ir, sh, se, mm, ...) diabaikan agar alumni tidak
// ditolak karena gelar atau salah ketik kecil.
const TITLES = new Set([
  "drs", "dra", "drg", "prof", "haji", "sip", "msi", "map", "mpa", "spd", "mpd", "ssos", "sos",
  "ssi", "sst", "amd", "mba", "phd", "mhum", "mkes", "skm", "skom", "kom", "mkom", "apt", "dipl",
  "ners", "msc", "llm", "bsc", "mag", "sth", "shi", "sag", "cpa"
]);

export function nameTokens(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !TITLES.has(token));
}

export function namesMatch(officialName: string, typedName: string) {
  const official = new Set(nameTokens(officialName));
  return nameTokens(typedName).some((token) => official.has(token));
}
