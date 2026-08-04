---
name: add-locale
description: Adds a new UI/agent locale to vibetrip-web. Use when the user asks to support a new language (e.g. "add Japanese", "soporta nl"). Touches 5 files in a specific order — missing one breaks either UI rendering, agent JSON output, or the consensus phrasing.
---

# Add a new locale to vibetrip-web

Adding a language is a multi-file pipeline. Follow this order; doing it piecemeal leaves the app half-translated in subtle ways.

## Inputs you need from the user

- **Locale code** (BCP-47 ish): `es`, `en`, `fr`, `de`, `it`, `pt` are taken. Examples to add: `nl`, `ja`, `ca`, `eu`.
- **English name of the language** (used in agent prompts, e.g. "Dutch", "Japanese"). The agents need it in **English** because that's what the prompt header is written in.

## Files to touch (in order)

### 1. `src/i18n/routing.ts`

Add the new locale to the `locales` tuple:

```ts
export const routing = defineRouting({
  locales: ["es", "en", "fr", "de", "it", "pt", "<new>"] as const,
  defaultLocale: "es",
  localePrefix: "always",
});
```

This unlocks `/[<new>]/...` routes and the type `Locale`.

### 2. `messages/<new>.json`

Copy `messages/en.json` (most stable English translation) and translate every key. **Do not skip keys** — `next-intl` will throw at runtime when a missing key is requested. Keep the JSON shape identical; only translate values.

There are namespaces for: navbar, home, login, trips, share, chat, create, results, errors. Some labels are user-visible button text; others are full sentences. Quick check: every value is a string (never an array/object) in the source files.

The `chat` namespace also contains a hard-coded **redirect message** that the server emits when the user asks for a new itinerary (the chat short-circuits to push them to the planner). That string is NOT in `messages/*.json` — it lives in `REDIRECT_MESSAGES` inside `src/app/api/chat/route.ts`. Add a new entry there for the new locale, otherwise the redirect falls back to Spanish for that user.

### 3. `src/server/agents/shared.ts` — `LOCALE_NAMES`

Add the **English** name of the language. This is what we inject into the system prompts so the LLM writes its JSON in that language.

```ts
const LOCALE_NAMES: Record<string, string> = {
  es: "Spanish", en: "English", fr: "French",
  de: "German", it: "Italian", pt: "Portuguese",
  <new>: "<English language name>",
};
```

If the user gives you a locale like `pt-BR`, store under that key but keep the value English ("Portuguese (Brazil)"). The `localeLanguageName()` helper falls back to Spanish for unknown locales — don't rely on the fallback for first-class support.

### 4. `src/server/agents/consensus.ts` — `PACE_LABEL` + `TEXTS`

Consensus is a pure function (no LLM), so its phrasing has to be hand-written. There are two tables:

**`PACE_LABEL`** (3 entries: 1, 2, 3 → "Tranquilo / Moderado / Intenso" translated). Add the new locale as a key inside each rank's record.

**`TEXTS`** is the big one — 13 fields per locale (`pacePrefix`, `paceConflict`, `dietConflict`, `profileSolo`, `profileGroup`, `profileFocus`, `profileFocusVaried`, `recoSolo`, `recoGroup`, `recoFocus`, `recoPace`, `recoDiets`, `recoEnding`, `and`). Some are functions returning strings.

Translate each carefully; users see this verbatim on the "Group" tab of the results. Look at the existing `en` entry as the most idiomatic source and translate from there.

Update the `SupportedLocale` type union if you can't use TS inference.

### 5. (optional) `src/i18n/request.ts`

If the file does any explicit locale check, ensure the new locale is present. Usually it's just `routing.locales` driven, so step 1 covers it.

## Verify

```bash
npm run typecheck
npm run dev
```

Then visit `http://localhost:3000/<new>` and click through:

- Home form → all labels translated
- Plan a tiny trip → consensus tab shows the new language phrasing (no "ritmo / pace" mismatch)
- Generate the plan → the LLM JSON (titles, descriptions, tips) come back in the new language. If they come back in English/Spanish instead, your `LOCALE_NAMES` entry is missing or wrong.

## Rollback if you skip a step

- Skipped step 2 → runtime crash on the page that uses the missing key.
- Skipped step 3 → agent writes the JSON in Spanish (the fallback) instead of the new language.
- Skipped step 4 → consensus tab renders empty fields or in Spanish.
- Skipped step 1 → the route 404s before any of the above matters.

## Don't

- Don't add the language name in your own language ("中文" or "Nederlands"). The prompt header is English; mixed-language headers degrade output quality.
- Don't translate the example JSON inside the itinerary system prompt — keep it Spanish/English (it's only structural). The "reply in <Lang>" injection at the top steers the actual output.
- Don't forget to mention the new locale in the README's stack table if you write a PR.
