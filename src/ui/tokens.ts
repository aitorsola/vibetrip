import type { ActivityType } from "@/domain/itinerary";

// Friendly category palette — works in both light and dark.
// Brand green is reserved for vibetrip itself; categories use complementary colors.
export const ACTIVITY_TYPE_COLOR: Record<ActivityType, string> = {
  cultura: "#7C4DFF",
  comida: "#FF6B35",
  naturaleza: "#00B8D9", // teal — to differentiate from brand green
  ocio: "#E91E63",
  transporte: "#5C6F7E",
};

export const ACCOMMODATION_ACCENTS = ["#00AC00", "#7C4DFF", "#FF6B35"];
