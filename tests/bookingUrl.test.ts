import { describe, expect, it } from "vitest";
import { buildBookingSearchUrl } from "../src/domain/booking";

describe("buildBookingSearchUrl", () => {
  it("encodes destination and dates correctly", () => {
    const url = buildBookingSearchUrl({
      destination: "Roma",
      checkin: "2026-06-01",
      checkout: "2026-06-05",
      adults: 4,
      affiliateId: "TEST",
    });
    const parsed = new URL(url);
    expect(parsed.host).toBe("www.booking.com");
    expect(parsed.searchParams.get("ss")).toBe("Roma");
    expect(parsed.searchParams.get("checkin")).toBe("2026-06-01");
    expect(parsed.searchParams.get("checkout")).toBe("2026-06-05");
    expect(parsed.searchParams.get("group_adults")).toBe("4");
    expect(parsed.searchParams.get("aid")).toBe("TEST");
  });

  it("omits aid when affiliateId not provided", () => {
    const url = buildBookingSearchUrl({
      destination: "Lisboa",
      checkin: "2026-06-01",
      checkout: "2026-06-03",
      adults: 2,
    });
    expect(new URL(url).searchParams.has("aid")).toBe(false);
  });
});
