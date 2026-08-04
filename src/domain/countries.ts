/**
 * City → ISO 3166-1 alpha-2 country code lookup for the most common
 * destinations. Best-effort: returns null for unknown cities so the UI
 * can render gracefully without a flag.
 */

const CITY_TO_COUNTRY: Record<string, string> = {
  // Spain
  madrid: "ES",
  barcelona: "ES",
  sevilla: "ES",
  valencia: "ES",
  granada: "ES",
  bilbao: "ES",
  san_sebastian: "ES",
  san_sebastián: "ES",
  malaga: "ES",
  málaga: "ES",
  cadiz: "ES",
  cádiz: "ES",
  cordoba: "ES",
  córdoba: "ES",
  toledo: "ES",
  zaragoza: "ES",
  palma: "ES",
  ibiza: "ES",
  mallorca: "ES",
  santiago_de_compostela: "ES",
  oviedo: "ES",
  // Portugal
  lisboa: "PT",
  lisbon: "PT",
  oporto: "PT",
  porto: "PT",
  faro: "PT",
  madeira: "PT",
  // France
  paris: "FR",
  parís: "FR",
  niza: "FR",
  nice: "FR",
  marsella: "FR",
  marseille: "FR",
  lyon: "FR",
  burdeos: "FR",
  bordeaux: "FR",
  cannes: "FR",
  estrasburgo: "FR",
  // Italy
  roma: "IT",
  rome: "IT",
  milan: "IT",
  milán: "IT",
  florencia: "IT",
  firenze: "IT",
  florence: "IT",
  venecia: "IT",
  venice: "IT",
  napoles: "IT",
  nápoles: "IT",
  naples: "IT",
  bolonia: "IT",
  turín: "IT",
  turin: "IT",
  // United Kingdom
  londres: "GB",
  london: "GB",
  edimburgo: "GB",
  edinburgh: "GB",
  manchester: "GB",
  liverpool: "GB",
  glasgow: "GB",
  belfast: "GB",
  dublin: "IE",
  // Netherlands
  amsterdam: "NL",
  ámsterdam: "NL",
  rotterdam: "NL",
  utrecht: "NL",
  // Belgium
  bruselas: "BE",
  brussels: "BE",
  brujas: "BE",
  bruges: "BE",
  amberes: "BE",
  // Germany
  berlin: "DE",
  berlín: "DE",
  munich: "DE",
  múnich: "DE",
  hamburgo: "DE",
  hamburg: "DE",
  colonia: "DE",
  cologne: "DE",
  frankfurt: "DE",
  // Austria / Switzerland / Hungary / Czechia / Poland
  viena: "AT",
  vienna: "AT",
  salzburgo: "AT",
  zurich: "CH",
  ginebra: "CH",
  geneva: "CH",
  basilea: "CH",
  budapest: "HU",
  praga: "CZ",
  prague: "CZ",
  varsovia: "PL",
  warsaw: "PL",
  cracovia: "PL",
  krakow: "PL",
  // Scandinavia
  copenhague: "DK",
  copenhagen: "DK",
  estocolmo: "SE",
  stockholm: "SE",
  oslo: "NO",
  helsinki: "FI",
  reikiavik: "IS",
  reykjavik: "IS",
  // Mediterranean / Balkans
  atenas: "GR",
  athens: "GR",
  santorini: "GR",
  mykonos: "GR",
  rodas: "GR",
  estambul: "TR",
  istanbul: "TR",
  capadocia: "TR",
  cappadocia: "TR",
  dubrovnik: "HR",
  zagreb: "HR",
  split: "HR",
  liubliana: "SI",
  ljubljana: "SI",
  sofia: "BG",
  bucarest: "RO",
  bucharest: "RO",
  sarajevo: "BA",
  belgrado: "RS",
  belgrade: "RS",
  // North Africa / Middle East
  marrakech: "MA",
  fez: "MA",
  casablanca: "MA",
  tanger: "MA",
  tánger: "MA",
  cairo: "EG",
  el_cairo: "EG",
  jerusalen: "IL",
  jerusalén: "IL",
  tel_aviv: "IL",
  petra: "JO",
  amman: "JO",
  dubai: "AE",
  dubái: "AE",
  abu_dhabi: "AE",
  doha: "QA",
  // Americas
  nueva_york: "US",
  "nueva york": "US",
  new_york: "US",
  new_york_city: "US",
  nyc: "US",
  los_angeles: "US",
  "los ángeles": "US",
  miami: "US",
  chicago: "US",
  san_francisco: "US",
  las_vegas: "US",
  boston: "US",
  washington: "US",
  toronto: "CA",
  montreal: "CA",
  vancouver: "CA",
  ciudad_de_mexico: "MX",
  cdmx: "MX",
  cancun: "MX",
  cancún: "MX",
  oaxaca: "MX",
  habana: "CU",
  "la habana": "CU",
  havana: "CU",
  buenos_aires: "AR",
  "buenos aires": "AR",
  mendoza: "AR",
  rio: "BR",
  "rio de janeiro": "BR",
  río_de_janeiro: "BR",
  sao_paulo: "BR",
  "são paulo": "BR",
  lima: "PE",
  cusco: "PE",
  cuzco: "PE",
  santiago: "CL",
  "santiago de chile": "CL",
  bogota: "CO",
  bogotá: "CO",
  cartagena: "CO",
  // Asia
  tokio: "JP",
  tokyo: "JP",
  kioto: "JP",
  kyoto: "JP",
  osaka: "JP",
  pekin: "CN",
  pekín: "CN",
  beijing: "CN",
  shanghai: "CN",
  shanghái: "CN",
  hong_kong: "HK",
  "hong kong": "HK",
  seul: "KR",
  seúl: "KR",
  seoul: "KR",
  bangkok: "TH",
  phuket: "TH",
  chiang_mai: "TH",
  hanoi: "VN",
  "ho chi minh": "VN",
  saigon: "VN",
  bali: "ID",
  jakarta: "ID",
  yakarta: "ID",
  singapur: "SG",
  singapore: "SG",
  kuala_lumpur: "MY",
  manila: "PH",
  taipei: "TW",
  delhi: "IN",
  mumbai: "IN",
  goa: "IN",
  jaipur: "IN",
  // Oceania
  sidney: "AU",
  sydney: "AU",
  melbourne: "AU",
  auckland: "NZ",
  // Sub-Saharan Africa
  ciudad_del_cabo: "ZA",
  "ciudad del cabo": "ZA",
  cape_town: "ZA",
  zanzibar: "TZ",
  zanzíbar: "TZ",
  nairobi: "KE",
};

function normalize(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9 _]/g, "")
    .trim();
}

function flagFromIso(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (c) =>
      String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65),
    );
}

export function flagForDestination(destination: string): string | null {
  if (!destination) return null;
  const stripped = normalize(destination);
  if (!stripped) return null;
  // Try exact match (with spaces)
  if (CITY_TO_COUNTRY[stripped]) return flagFromIso(CITY_TO_COUNTRY[stripped]);
  // Try with underscores
  const underscored = stripped.replace(/\s+/g, "_");
  if (CITY_TO_COUNTRY[underscored])
    return flagFromIso(CITY_TO_COUNTRY[underscored]);
  // Try first token
  const firstToken = stripped.split(/[\s,]+/)[0] ?? "";
  if (firstToken && CITY_TO_COUNTRY[firstToken])
    return flagFromIso(CITY_TO_COUNTRY[firstToken]);
  return null;
}
