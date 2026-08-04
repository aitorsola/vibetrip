import "server-only";
import { z } from "zod";
import type { AgentTool } from "./types";

const QUERY_DESC =
  "A SPECIFIC place name (e.g., 'Museo del Prado', 'Plaza Mayor', 'Palacio Real') OR a local cuisine term (e.g., 'tapas', 'izakaya', 'trattoria'). Avoid generic single-word queries like 'museum', 'monument', 'restaurant' — they return random unrelated results.";

const InputSchema = z.object({
  query: z.string().min(2).describe(QUERY_DESC),
  city: z
    .string()
    .min(2)
    .describe("Destination city, e.g. 'Lisboa', 'Roma'."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .transform((v) => v ?? 3),
});

// `limit` is intentionally NOT exposed: some models (Groq + Llama) sometimes
// serialize integers as strings in tool calls, which Groq's server-side
// schema validator then rejects. Internally we always use the default of 3.
const PARAMETERS_SCHEMA = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: QUERY_DESC,
    },
    city: {
      type: "string",
      description: "Destination city, e.g. 'Lisboa', 'Roma'.",
    },
  },
  required: ["query", "city"],
  additionalProperties: false,
};

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  category: string;
  boundingbox?: [string, string, string, string];
  address?: {
    road?: string;
    house_number?: string;
    suburb?: string;
    neighbourhood?: string;
    city_district?: string;
    city?: string;
    town?: string;
    village?: string;
    country?: string;
    country_code?: string;
    postcode?: string;
  };
  name?: string;
}

const NOMINATIM_HEADERS = {
  "User-Agent": "vibetrip/1.0 (https://github.com/aitorsola/vibetrip)",
  "Accept-Language": "es,en",
};

interface CityInfo {
  countryCode?: string;
  viewbox?: string;
  /** City centroid lat/lon, used as a distance filter against returned results. */
  center?: { lat: number; lon: number };
}

/** Haversine distance in km between two lat/lon points. */
function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Anything farther than this from the city center is treated as "another city". */
const MAX_DISTANCE_FROM_CENTER_KM = 30;

const cityInfoCache = new Map<string, CityInfo>();

/**
 * Resolves a city name to its country code (ISO 3166-1 alpha-2) and a viewbox
 * (lon_left, lat_top, lon_right, lat_bottom). Used to constrain place searches
 * so "park, Lisboa" doesn't accidentally return parks in Lisbon, Iowa.
 *
 * Cached per-process, so we only hit Nominatim once per city.
 */
async function resolveCityInfo(
  city: string,
  signal?: AbortSignal,
): Promise<CityInfo> {
  const key = city.toLowerCase();
  const cached = cityInfoCache.get(key);
  if (cached) return cached;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", city);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", "es,en");

  const info: CityInfo = {};
  try {
    const res = await fetch(url, { signal, headers: NOMINATIM_HEADERS });
    if (res.ok) {
      const raw = (await res.json()) as NominatimResult[];
      const top = raw[0];
      if (top) {
        info.countryCode = top.address?.country_code?.toLowerCase();
        info.center = { lat: parseFloat(top.lat), lon: parseFloat(top.lon) };
        if (top.boundingbox) {
          // Nominatim boundingbox: [south_lat, north_lat, west_lon, east_lon]
          // viewbox parameter expects: lon_left, lat_top, lon_right, lat_bottom
          const [south, north, west, east] = top.boundingbox;
          info.viewbox = `${west},${north},${east},${south}`;
        }
      }
    }
  } catch {
    /* network/abort — fall back to unrestricted search */
  }

  cityInfoCache.set(key, info);
  return info;
}

export interface PlaceResult {
  /** Best human name we could extract (point-of-interest name or shortened display name). */
  name: string;
  /** Full street address: "Calle X, 12, Barrio". Empty if unknown. */
  address: string;
  /** Neighbourhood name if Nominatim returned one. */
  neighbourhood: string;
  /** OSM category and type, e.g. "tourism / museum". */
  category: string;
  /** Latitude in decimal degrees (WGS84). */
  lat: number;
  /** Longitude in decimal degrees (WGS84). */
  lon: number;
}

/**
 * Free, no-API-key place search backed by OpenStreetMap's Nominatim. Subject
 * to a 1 req/sec policy and a User-Agent requirement. We only call this from
 * the server (server-only), one search at a time, so the rate is fine for
 * a planning session.
 *
 * https://nominatim.org/release-docs/develop/api/Search/
 */
export const searchPlacesTool: AgentTool<typeof InputSchema, PlaceResult[]> = {
  name: "search_places",
  description:
    "Look up a SPECIFIC named place (e.g. 'Museo del Prado', 'Plaza Mayor') or a LOCAL CUISINE term (e.g. 'tapas', 'izakaya') in a city. Returns up to 3 results from OpenStreetMap with verified name, address, neighbourhood and coordinates. Avoid generic queries like 'museum' or 'restaurant' — they return random unrelated results. Always call this BEFORE writing an itinerary or accommodation entry, so each activity has a real bookable location instead of a fabricated one.",
  inputSchema: InputSchema,
  parametersSchema: PARAMETERS_SCHEMA,
  async execute({ query, city, limit }, signal) {
    const cityInfo = await resolveCityInfo(city, signal);

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${query}, ${city}`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    // Ask for more than `limit` so we still have candidates after filtering
    // out any results that slipped into the wrong country.
    url.searchParams.set("limit", String(Math.min(10, limit + 5)));
    url.searchParams.set("accept-language", "es,en");
    if (cityInfo.countryCode) {
      url.searchParams.set("countrycodes", cityInfo.countryCode);
    }
    if (cityInfo.viewbox) {
      url.searchParams.set("viewbox", cityInfo.viewbox);
      // Strictly limit results to the city's bounding box. Without this,
      // "park, Marrakech" was returning parks 100+ km away in other cities.
      url.searchParams.set("bounded", "1");
    }

    const res = await fetch(url, { signal, headers: NOMINATIM_HEADERS });
    if (!res.ok) {
      throw new Error(`Nominatim ${res.status}: ${res.statusText}`);
    }
    const raw = (await res.json()) as NominatimResult[];

    return raw
      .filter((r) => r.name && r.name.trim().length > 0)
      // Defensive country filter: even with countrycodes set, occasionally a
      // result without an address.country_code slips through. If we know the
      // expected country, drop anything that doesn't match.
      .filter((r) => {
        if (!cityInfo.countryCode) return true;
        const cc = r.address?.country_code?.toLowerCase();
        return !cc || cc === cityInfo.countryCode;
      })
      // Belt-and-braces distance filter: even with viewbox+bounded, Nominatim
      // sometimes returns hits from neighbouring cities. Anything farther
      // than 30 km from the city centroid is dropped.
      .filter((r) => {
        if (!cityInfo.center) return true;
        const lat = parseFloat(r.lat);
        const lon = parseFloat(r.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
        return (
          haversineKm(cityInfo.center, { lat, lon }) <=
          MAX_DISTANCE_FROM_CENTER_KM
        );
      })
      .slice(0, limit)
      .map((r): PlaceResult => {
        const a = r.address ?? {};
        const addressParts = [
          a.road && a.house_number ? `${a.road}, ${a.house_number}` : a.road,
          a.suburb ?? a.neighbourhood ?? a.city_district,
        ].filter(Boolean);
        return {
          name: r.name!,
          address: addressParts.join(", "),
          neighbourhood: a.suburb ?? a.neighbourhood ?? a.city_district ?? "",
          category: `${r.category}/${r.type}`,
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
        };
      });
  },
};
