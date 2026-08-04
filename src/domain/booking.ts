export interface BookingSearchParams {
  destination: string;
  checkin: string;
  checkout: string;
  adults: number;
  affiliateId?: string;
  /** If provided, the search query targets the specific hotel name in the city. */
  hotelName?: string;
}

export function buildBookingSearchUrl({
  destination,
  checkin,
  checkout,
  adults,
  affiliateId,
  hotelName,
}: BookingSearchParams): string {
  const url = new URL("https://www.booking.com/searchresults.html");
  const ss = hotelName ? `${hotelName}, ${destination}` : destination;
  url.searchParams.set("ss", ss);
  url.searchParams.set("checkin", checkin);
  url.searchParams.set("checkout", checkout);
  url.searchParams.set("group_adults", String(adults));
  if (affiliateId) url.searchParams.set("aid", affiliateId);
  return url.toString();
}
