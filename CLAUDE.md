# CLAUDE.md — vibetrip-web

Guía operativa para trabajar en este repo. **El README es la descripción del producto; este fichero es para no romperlo.** Lee el README primero si nunca has visto el proyecto, luego este.

## Comandos que importan

```bash
npm run dev          # Next dev en :3000
npm run typecheck    # tsc --noEmit. Rápido. Correr SIEMPRE antes de declarar terminada una tarea.
npm run test         # vitest. Los .live.test.ts se saltan a no ser que pongas RUN_LIVE=1
npm run build        # smoke test de producción
npm run lint
```

Cuando edites código del servidor (`src/server/**`), `typecheck` no basta para detectar fallos del agente: prueba con `RUN_LIVE=1 npm run test -- itinerary-agent.live` (consume cuota LLM real). Para cambios de UI, `npm run dev` y verifica en el navegador.

## Layout mental del proyecto

```
src/
├── app/[locale]/          Pages (RSC + Server Actions). Toda página vive bajo [locale].
├── app/api/               API routes. SIN localización ([locale] no aplica).
├── app/auth/              Magic-link callback + logout. Sin localización.
├── proxy.ts               MIDDLEWARE de Next (nombre por la migración de codemod).
├── i18n/                  next-intl: routing.ts (locales), request.ts.
├── lib/supabase/          Clientes Supabase (server cookie-bound, server bearer-token, browser, middleware).
├── lib/sse{,Client}.ts    Encoder SSE servidor + parser SSE cliente.
├── server/                ⚠️ TODO bajo `import "server-only"`. Nunca importar desde Client Components.
│   ├── env.ts             Whitelist de env vars + provider routing (default LLM)
│   ├── llm/config.ts      LlmConfig por-petición (BYOK) + defaults desde env
│   ├── orchestrator.ts    async generator: yield PlanEvent
│   ├── llm/agentLoop.ts   ReAct loop OpenAI-compat + Anthropic
│   ├── agents/            consensus + budget (puros) | itinerary + accommodation (agénticos) | shared, validators
│   ├── tools/searchPlaces Nominatim/OSM, único tool externo
│   └── claude/jsonParser  reparador de JSON truncado
├── domain/                Zod schemas. ⚠️ COMPARTIDOS con el cliente iOS (JSON wire format).
├── features/              UI por flujo (create-trip, generating, results, export-pdf)
├── hooks/useTripPlanner   useReducer + SSE consumer
└── ui/                    Componentes neutros (Button, Card, Navbar, ThemeProvider…)

messages/<locale>.json     Strings UI por idioma
supabase/sharing.sql       SQL para correr en el SQL editor de Supabase
public/.well-known/apple-app-site-association   AASA (Universal Links)
tests/                     vitest. *.live.test.ts → requieren RUN_LIVE=1
```

## Cómo funciona el planificador

El input que entra al orquestador es siempre el mismo:

```ts
{
  destinations: DestinationSegment[]    // 1..5 destinos encadenados
  members: Member[]                     // 1..N viajeros con preferencias
  locale: "es" | "en" | "fr" | "de" | "it" | "pt"
}
```

Y produce un `PlanResult`:

```ts
{
  consensus: Consensus                  // global, una vez por viaje
  destinations: Array<{
    itinerary: Itinerary                // por destino
    accommodation: Accommodation | null // omitible si dest.includeAccommodation === false
    budget: Budget                      // por destino, suma del itinerario
  }>
}
```

El orquestador (`src/server/orchestrator.ts`) es un `async function*`. Yieldea eventos SSE tipados (`PlanEvent`) según va resolviendo agentes; el cliente los pinta en vivo. Nada se devuelve al final — todo es streaming.

### Los cuatro agentes

| Agente          | Tipo         | Llama a LLM | Tool      | Donde vive                              |
| --------------- | ------------ | ----------- | --------- | --------------------------------------- |
| `consensus`     | Función pura | NO          | —         | `src/server/agents/consensus.ts`        |
| `itinerary`     | Agente ReAct | SÍ          | `search_places` | `src/server/agents/itinerary.ts`  |
| `accommodation` | Agente ReAct | SÍ          | `search_places` | `src/server/agents/accommodation.ts` |
| `budget`        | Función pura | NO          | —         | `src/server/agents/budget.ts`           |

El principio de diseño es **"no usar LLM cuando lo determinista hace el trabajo"**:

- **Consenso** = intersección de conjuntos. Mediana del ritmo, intereses con frecuencia ≥ ⌈N/2⌉, unión de restricciones alimentarias estrictas, detección de conflictos (ritmo dispar ≥ 2 niveles, mezcla "Sin restricciones" + "Vegano"/"Halal"). Las frases finales salen de la tabla `TEXTS` por locale dentro del propio fichero — sin LLM. Coste: ~0 ms.
- **Presupuesto** = suma de `coste_persona` de cada actividad del itinerario. Eso es. **No incluye vuelos, comidas no listadas, transporte local ni alojamiento** porque no hay fuente fiable gratuita y inventar precios desinforma al usuario.

El LLM solo entra donde hace falta creatividad anclada a datos reales (qué actividad encaja por la mañana en el barrio X, qué hotel céntrico es coherente con el grupo). Resultado: el coste y la latencia del plan se concentran solo donde el LLM aporta valor.

### Flujo dentro de un destino

```
yield "consensus running" → computeConsensus() → yield consensus data + "done"
para cada destino i:
  yield "itinerary running"
  runItineraryAgent() → tool calls van yieldeando "tool_call"/"tool_result" en vivo
  yield itinerary data + "itinerary done"

  if dest.includeAccommodation:
    yield "accommodation running"
    runAccommodationAgent() → mismo patrón con tool calls
    yield accommodation data + "accommodation done"

  budget = runBudgetAgent(dest, members, itinerary)   // pura
  yield budget data + "budget done"
yield "done" + result final
```

**Itinerario y alojamiento corren en SERIE, no en paralelo.** Lo intentamos en paralelo y los free tiers (Mistral 1 req/s, Groq con bursts limitados) nos comían 429 garantizados. Hoy es serial dentro del destino. Multi-destino también es serial entre destinos. Si algún día quitas esto, prepárate para gestionar backoffs.

### Estrategia de prompting (itinerario y alojamiento)

Ambos agentes siguen el mismo patrón de prompt:

1. **`localizedSystem(locale)`** inyecta como primera línea: *"IMPORTANT: Reply and fill the ENTIRE JSON in `<English language name>`"*. Esto va arriba para que ningún modelo ignore la instrucción al ver el ejemplo JSON en español/inglés más abajo. Solo `nombre_ejemplo` y los nombres de actividad mantienen el idioma original (vienen de OSM).
2. **System prompt = reglas + ejemplo JSON.** El ejemplo es estructural; el modelo lo usa de plantilla pero lo rellena en el idioma indicado arriba.
3. **User prompt** lleva los datos concretos del viaje: destino, fechas, número de viajeros, perfil del grupo, intereses comunes, restricciones, ritmo, notas individuales. Construido por `buildPrompt()`.
4. **Output: JSON estricto sin backticks ni prosa.** El parser tiene rescate (`extractJsonObject`) para cuando el modelo cierra con explicación.

#### Itinerario: las 5 fases del prompt

El system prompt de `src/server/agents/itinerary.ts` está diseñado en 5 fases para forzar al modelo a **planear antes de buscar y revisar antes de cerrar**:

- **PHASE 1 — THINK.** Lista mental de 10-12 lugares emblemáticos del destino (plazas/puertas, palacios, catedrales, museos, parques, barrios históricos, miradores, mercados). Filtro de calidad: *"si un viajero se fuese sin ver X, X tiene que estar en la lista"*. Este paso evita queries genéricas.
- **PHASE 2 — SEARCH BY NAME.** Una `search_places` por must-see, con su nombre exacto. Para comida: el término que usaría un local (`tapas`, `izakaya`, `trattoria`, `bistrot`), nunca "traditional restaurant" — devuelve basura mezclada. ~8-12 búsquedas + 2-3 de comida.
- **PHASE 3 — CLUSTER.** Mirar las direcciones devueltas y agrupar por proximidad. Cada día = ruta lógica en una zona contigua, sin cruzar la ciudad varias veces.
- **PHASE 4 — DENSITY.** 6-8 actividades/día (incluyendo las 2 comidas). Plantilla horaria de referencia con bloques mañana (5h) / tarde (4h). Composición ideal: 1-2 culturales + 1-2 walks/parques/miradores + lunch + dinner + 1 opcional según preferencias.
- **PHASE 5 — REVIEW.** Antes de cerrar el JSON: ¿algún icono universal del destino quedó fuera? Si sí, búscalo y añádelo, sacrificando algo menor.

#### Reglas duras embebidas en el prompt (HARD RULES)

Aparecen literalmente en el system y el modelo las cumple razonablemente; los validators de `src/server/agents/validators.ts` cazan las que se escapan:

- **Cada día ≥1 cultura + ≥1 naturaleza/ocio.** Las inclinaciones del grupo (gastro, fiesta, naturaleza) **modulan** la selección, no excluyen los iconos del destino. Sin esto, un grupo "gastro" acaba con un itinerario 100% restaurantes.
- **Máximo 2 actividades de tipo "comida" por día** (lunch + dinner). Prohibido añadir un tercer plato o un bar como actividad de mañana/tarde.
- **Cada comida en un restaurante distinto.** Sin repetir entre slots ni entre días.
- **Si una actividad no es cocina LOCAL del destino** (e.g. restaurante americano en Madrid) → fuera, otro lugar.
- **Cada `nombre` y `direccion` se copia LITERALMENTE de un resultado de `search_places`.** El validador rechaza nombres parafraseados o inventados.

#### Reglas culturales horarias

El prompt instruye al modelo a variar horas por país: España/Portugal cenan 20:30-21:30, Italia 20:00-21:00, Francia 19:30-20:30, UK/Alemania/USA 18:30-19:30, Asia 18:00-19:00. Almuerzo análogo. Museos típicamente abren 09:00-10:00 y cierran 17:30-19:00. Miradores ~1 h antes de la puesta de sol. Sin estas guías, los modelos te plantan cenas a las 18:00 en Sevilla.

### El validador semántico (`validators.ts`)

Después de que el agente devuelve JSON válido (Zod-wise), `findItineraryIssues()` corre estas comprobaciones:

1. **Lugares duplicados** entre slots (mismo museo en mañana y tarde de días distintos).
2. **Nombres no encontrados en `search_places`** — el agente parafraseó o inventó. Permite matches parciales (el modelo a veces acorta "Museu Nacional de Arte Antiguo" → "Museu Nacional"). Si no hay match, el validador exige búsqueda nueva o reemplazo.
3. **Balance por día**: ≥1 cultura + ≥1 naturaleza/ocio + ≤2 comidas.
4. **Variedad de restaurantes**: cada comida en un restaurante diferente.

Si encuentra issues y aún quedan correcciones (`MAX_CORRECTIONS = 1`), el agent loop devuelve un mensaje correctivo al modelo y le da una iteración más. Si vuelve a fallar, throw — preferimos abortar a entregar un plan inconsistente.

`findAccommodationIssues()` hace lo análogo: exactamente 3 opciones, cada nombre del search cache, sin duplicados.

### `search_places`: la única tool

Es nuestra superficie externa para anclar al modelo en datos reales. Vive en `src/server/tools/searchPlaces.ts`. Backend: Nominatim de OpenStreetMap (gratis, sin API key, política de 1 req/s).

Diseñada con **tres capas de filtro geográfico** porque sin ellas Nominatim devuelve mezcla de ciudades:

1. **Resolución city → country + viewbox**: una llamada previa por ciudad obtiene `country_code` ISO, centroide y bounding box. Cacheado por proceso (`cityInfoCache`).
2. **`countrycodes` + `viewbox` + `bounded=1`** en cada búsqueda: Nominatim filtra a nivel servidor.
3. **Filtro Haversine post-fetch**: cualquier resultado a más de 30 km del centroide cae aquí. Cubre el caso real de "park, Marrakech" devolviendo parques de Essaouira (mismo país, fuera de la ciudad).

El JSON-Schema de `parametersSchema` que ve el modelo **omite deliberadamente `limit`** aunque el `inputSchema` Zod lo acepte: Groq + Llama serializa enteros como strings ("3" en vez de 3), y el server-side validator de Groq rechaza el call. Internamente siempre usamos limit=3.

### Enriquecimiento de coordenadas (truco crítico)

**No confiamos en lat/lon que devuelva el modelo.** GPT-4o, Claude Sonnet, Gemini Flash — todos plantan coordenadas inventadas con frecuencia, y acabas con hoteles fantasma en mitad del mar.

Por eso `makeRecordingSearchTool()` envuelve `searchPlaces` y guarda cada resultado en un `Map<normalizedName, PlaceResult>` durante el run del agente. Cuando el agente termina, `enrichWithCoords()` recorre cada actividad, normaliza su `nombre`, y busca en el cache. Si hay match (exacto o parcial — el modelo a veces acorta nombres), añade `lat`/`lon` desde OSM. Si no hay match, la actividad se queda sin coordenadas y simplemente no aparece en el mapa, pero sí en la lista textual.

Resultado: el mapa solo muestra puntos verificados; las paráfrasis del modelo no producen pins falsos.

### `alternativa_lluvia` heurística

Cosa pequeña pero útil: el campo "qué hacer si llueve" solo tiene sentido para actividades al aire libre. Después de generar, `stripPointlessRainAlternatives()` borra el campo cuando:

- La actividad es `tipo === "comida"` (un restaurante no necesita plan B por lluvia), o
- La categoría OSM está en `INDOOR_OSM_TYPES` (museum, gallery, place_of_worship, theatre, library, restaurant, etc.), o
- Si no hay categoría OSM, fallback regex multilingüe: museo|cathedral|palacio|biblioteca|… 

Ahorra ruido visual y el modelo ya no se preocupa de inventar planes B coherentes para cada museo.

### Domain model — qué viaja en JSON

Schemas en `src/domain/`. **Estos son contratos compartidos con iOS** — el cliente nativo deserializa el mismo JSON. Cuidado con cambiar shapes.

**`Member`**: id, name, interests[], food (`Sin restricciones | Vegetariano | Vegano | Sin gluten | Halal | Sin lactosa`), pace (`Tranquilo | Moderado | Intenso`), notes.

**`DestinationSegment`**: destination, startDate (ISO), endDate (ISO), budget (€/persona), includeAccommodation. Refine: `endDate >= startDate`. Helper `nightsBetween()` con `Math.max(0, ...)` — same-day trip = 0 noches, 1 día.

**`Itinerary.itinerario[].actividades[]`**:
- `hora` "HH:MM" (normalizada, acepta `9.30`, `9h30`, `09:30`).
- `bloque` derivado del horario si el modelo no lo da: `<12 manana, <16 almuerzo, <20 tarde, ≥20 cena`.
- `tipo` enum con aliases multilingües (`gastronomia → comida`, `museum → cultura`, etc.). Default fallback: `ocio`.
- `nombre`, `direccion`, `barrio` (literales del search), `descripcion`, `tip`, `transporte`, `reserva`, `web`, `alternativa_lluvia` (strings; `null`/missing → `""`).
- `coste_persona` (€), `duracion_min` (minutos). `null` → 0.
- `lat`, `lon` opcionales — los pone el servidor.

El schema es **resiliente a cuirks de modelos pequeños**: acepta `null` donde se esperaría string vacío, parsea horas con varios formatos, normaliza tipo y bloque con preprocess.

**`Accommodation.opciones`**: array de `{ tipo, nombre_ejemplo, zona, pros[], contras[] }`. Schema acepta `opciones` como string JSON-stringificado o anidado en `{opciones: [...]}` — modelos locales lo rompen así.

**`Consensus`**: `{ consenso: { ritmo_ideal, intereses_comunes, restricciones_alimentarias, conflictos, recomendacion }, perfil_grupo }`. El schema fallea hacia un objeto mínimo si un modelo pequeño devuelve `consenso` como string suelto. Lo generamos nosotros (función pura) así que esta resiliencia es defensa en profundidad.

**`Budget`**: `{ presupuesto: { actividades_total_persona, total_persona, total_grupo, dentro_presupuesto } }`. Solo costes de actividades; nada más.

### Reglas de negocio que NO están en código pero conviene saber

- **Booking.com es deeplink**, no API. Construimos URL con nombre del hotel + fechas + `BOOKING_AFFILIATE_ID`. Si el hotel está en OSM pero no en Booking, el deeplink puede no resolver al hotel concreto — lo señalamos en la UI.
- **No hay merge guest → user**. Si un invitado genera un viaje y luego se registra, ese primer viaje no se asocia retroactivamente a su cuenta. Decisión consciente: la complejidad de migrar rows entre `auth.users` no compensa el caso de uso.
- **Compartir un viaje crea un alias público al row del dueño**, no una copia. Si el dueño edita el viaje (futuro), el enlace compartido reflejará la nueva versión. La acción "Guardar a mis viajes" del receptor sí copia: crea una fila independiente.
- **El AASA (Universal Links) hace que iOS reclame `https://<host>/<locale>/shared/<token>`** y abra la app si está instalada. Sin instalación → cae en la web normalmente. Por eso el path `/<locale>/shared/<token>` lo tiene que ver el invitado sin login (ya está en `PUBLIC_PAGES`).

### Chat asistente de viajes (`/api/chat`)

Endpoint independiente del orquestador, **no es agéntico** (sin tools, sin loop ReAct): es un passthrough directo al LLM con streaming SSE. Vive en `src/app/api/chat/route.ts` y delega en `src/server/chat.ts`, que rutea por provider igual que `runAgentLoop` (Anthropic SDK / OpenAI-compatible).

**Constraint del prompt**: el system prompt limita el asistente a **viajes, turismo y planificación**. El modelo debe rehusar cualquier cosa fuera de scope (mates, código, news no-viaje, filosofía, ayuda personal, etc.) con una respuesta corta que (1) explique que solo ayuda con viajes, (2) invite a preguntar algo del dominio. Casos borde explícitamente in-scope: visados, divisas, clima del viaje, etiqueta cultural, tips de idioma, jet lag, seguros, viaje sostenible.

**Regla anti-itinerario**: el chat NO genera itinerarios día a día. Para eso existe el planner (multi-agente con tools, OSM real y validadores). Implementación en **dos capas** porque Llama 3.3 ignora la instrucción del system prompt en producción:

1. **Pre-filter regex en el handler** (`route.ts` → `ITINERARY_TRIGGERS` + `isItineraryRequest`). Si el `content` del usuario hace match de patrones explícitos (`itinerario`, `planifícame`, `armame un plan`, `build me an itinerary`, `day by day`, etc.) y la sesión NO está enfocada en un trip existente, el handler **salta la llamada al LLM** y emite un mensaje fijo localizado (`REDIRECT_MESSAGES`) que dirige al formulario de la home. Ahorra coste, ahorra latencia, garantía 100%.
2. **Instrucción en el system prompt** como segunda red — para los casos que la regex no caza pero suenan a generación nueva.

La regla **no aplica** cuando la sesión tiene `trip_id` (foco en un viaje existente): en ese caso el LLM tiene el plan completo en `USER CONTEXT` y debe contestar libre con los datos inyectados. Si añades nuevos triggers o quieres soportar nuevos idiomas, edita la lista en `route.ts` — los regex actuales cubren es/en/fr/de/it/pt en sus formas verbales más comunes.

**Auth**: requerida. `/api/chat` (y `/api/chat/sessions/*`) están en `PUBLIC_API` para que el middleware no bloquee Bearer tokens, pero los handlers exigen auth explícitamente con `createSupabaseAuthedClient` (cookie web O Bearer iOS) y devuelven 401 a anónimos. Si en el futuro quieres permitir invitados, replica el patrón de `/api/trip/plan` con cookie limit; ten en cuenta que cada turno cuesta una llamada al LLM.

**Persistencia**: las conversaciones se guardan en Postgres en dos tablas (`chat_sessions`, `chat_messages`) con RLS por dueño. SQL en `supabase/chat.sql`. El servidor es **fuente de verdad de la historia**: el cliente envía `{ sessionId?: uuid, tripId?: uuid, content: string }`. Si `sessionId` no llega, se crea sesión nueva con `title` = primeros 80 chars del mensaje. Cap de contexto al LLM: últimas `CHAT_HISTORY_CAP=30` turnos (los más viejos siguen en DB pero no entran al prompt).

**Contexto del usuario inyectado en el system prompt** (`src/server/chatContext.ts`):
- *Siempre*: resumen compacto de los últimos 10 viajes del usuario (destinos, fechas, viajeros). El asistente puede contestar preguntas tipo "¿qué viajes tengo?", "¿cuántos días faltan para el de Roma?".
- *Sesión bound a un trip* (columna `chat_sessions.trip_id`): se inyecta también el plan completo de ese viaje (consenso, itinerario día a día, alojamiento, presupuesto). Se activa pasando `tripId` al crear la sesión nueva — la web tiene un botón "Preguntar al chat sobre este viaje" en `/trips/[id]` que navega a `/chat?trip=<id>`. En sesiones existentes, el `trip_id` guardado manda; el campo del body se ignora.
- RLS de `trips` filtra todo: si el `tripId` no es del usuario, simplemente no se incluye contexto (no se hace fail).

Política de escritura: el turno del usuario se persiste **antes** de llamar al LLM (queda registro aunque el stream falle); el turno del asistente se persiste **después** de completarse el stream (un solo INSERT con el texto completo). Si el stream aborta, no se guarda asistente — el usuario verá su pregunta huérfana y puede reintentar.

**SSE events** (en este orden):
- `{ type: "session", sessionId }` — primero del todo, para que el cliente capture el ID en conversaciones nuevas.
- `{ type: "delta", text }` — chunks incrementales del LLM.
- `{ type: "done" }` ó `{ type: "error", message }` — exactamente uno al final.

Misma plumbing que `/api/trip/plan` (padding 2 KB, heartbeat 10 s) por los mismos motivos: iOS Safari y proxies intermedios.

**Endpoints REST adicionales** (mismo gating de auth):
- `GET /api/chat/sessions` — lista de sesiones del usuario, ordenada por `updatedAt` desc.
- `GET /api/chat/sessions/[id]` — sesión + mensajes en orden cronológico. RLS hace que no-dueños reciban 404 (no leak de existencia).
- `DELETE /api/chat/sessions/[id]` — borra la sesión; el cascade de la FK arrastra los mensajes.

**UI web** (`src/app/[locale]/chat/`):
- `layout.tsx` — RSC, carga la lista de sesiones una sola vez. Sidebar + main en flex.
- `page.tsx` — pantalla de bienvenida (sesión nueva). Tras el primer envío, `router.replace('/chat/<id>')`.
- `[id]/page.tsx` — RSC, carga sesión + mensajes via Supabase con cookie del usuario (RLS hace el filtrado). 404 si no es del dueño.
- `ChatSidebar.tsx` (cliente) — lista, highlight del activo via `usePathname()`, borrado con `ConfirmDialog`.
- `ChatThread.tsx` (cliente) — input + render de mensajes + consumo SSE via `postSseStream`. Auto-scroll al final.
- `actions.ts` — `deleteSessionAction(id)` (Server Action, llama Supabase + `revalidatePath('/chat')`).

La web no usa los endpoints REST `GET /api/chat/sessions[...]` — los Server Components leen directos de Supabase. Esos endpoints son **para iOS**.

## Reglas duras (no romper)

1. **`src/server/**` es server-only.** El primer `import` casi siempre es `"server-only"`. No lo importes desde nada con `"use client"` — explota el build y filtraría secrets.
2. **`src/domain/**` es contrato compartido con iOS.** El cliente nativo deserializa estos JSON. Cambiar nombres, tipos o nullability es **breaking**: actualiza el repo `vibetrip-ios` o usa campos opcionales con defaults.
3. **`src/proxy.ts`** es el middleware Next. Si añades una página pública sin sesión, **añádela a `PUBLIC_PAGES`** o el middleware la redirige a `/login`. Misma lógica con `PUBLIC_API` para endpoints. El matcher excluye `.well-known/` (Apple's CDN no sigue redirects al validar el AASA).
4. **`[locale]` segment es obligatorio** para toda página. APIs NO se localizan (no van debajo de `[locale]`). El locale efectivo en `/api/trip/plan` se infiere del `Referer` (ver `detectLocale()`).
5. **Leaflet necesita `window`** en el import → todo lo que lo use va con `next/dynamic({ ssr: false })`. Patrón actual: `MapView.client.tsx`.
6. **Auth dual.** Web va por cookies (`createSupabaseServerClient()`), iOS por bearer JWT (`createSupabaseAuthedClient(req)`). Usa el segundo solo en API routes que reciben `NextRequest`. Ambos exponen la misma superficie (`.auth.getUser()`, `.from(...)`); RLS ve `auth.uid()` igual.
7. **Las RLS de Supabase no se aflojan**: lectura de viajes ajenos pasa por las RPCs `SECURITY DEFINER` en `supabase/sharing.sql`, nunca por `SELECT * FROM trips`.
8. **Función pura > agente.** Antes de añadir un "agente" nuevo, pregúntate si el problema es determinista. Consenso (intersección de conjuntos) y presupuesto (suma) son TS puro. Solo se gasta LLM en lo que necesita creatividad anclada a datos reales.
9. **Coordenadas nunca confiar en el modelo.** El agente devuelve nombres; el servidor cruza por nombre normalizado con `knownPlaces` (cache poblada por las tool calls del propio agente) y añade lat/lon. Modelos como GPT-4o y Claude Sonnet inventan coordenadas con frecuencia.

## Quirks del agent loop (`src/server/llm/agentLoop.ts`)

Cosas que descubrimos a fuerza de fallar y que **no están en la documentación de OpenAI/Anthropic**:

- **Primera vuelta `tool_choice: "required"`**: muchos modelos con conocimiento del destino (Mistral Large, Gemini 2.0 Flash, GPT-4o) **se saltan tools y responden de memoria**. Forzar la primera llamada a `search_places` los obliga a anclar en datos reales.
- **Groq + Llama 4 Scout** revientan con `tool_use_failed` cuando se les fuerza una tool. Detectamos el 400 y bajamos a `tool_choice: "auto"` para el resto del run (`providerSupportsForcedTool`).
- **Dedup por fingerprint estable** (`stableStringify` ordena keys): mismas args → respuesta `duplicate_call` SIN gastar tool budget.
- **Una única corrección permitida** (`MAX_CORRECTIONS = 1`): si falla schema o el validador semántico, mensaje correctivo; si vuelve a fallar, throw. Evita bucles.
- **JSON tolerante**: `extractJsonObject` rescata el primer objeto bien formado del texto cuando `JSON.parse` falla (modelos cierran con backticks o prosa explicativa).
- **Mistral y muchos OpenAI-compat rechazan terminar con assistant turn** sin follow-up. Defensiva: empujamos un user "Continue." si el último mensaje es asistente.
- **Endpoints locales** (LM Studio, Ollama) reciben `enable_thinking: false` + sufijo `/no_think` en el system para apagar chain-of-thought oculta.
- **Tool `search_places`** NO expone `limit` en su `parametersSchema` aunque el `inputSchema` Zod lo acepte, porque Groq/Llama serializa ints como strings y su validador rechaza el call.

## BYOK — modelo por usuario (`src/server/llm/config.ts`)

El proveedor/modelo/key ya **no se leen del singleton `env` dentro de las funciones LLM**: se pasa un `LlmConfig` por-petición. `runAgentLoop`, `streamChat`, `orchestratePlan` y los agentes (`itinerary`/`accommodation`) reciben `llm: LlmConfig` y enrutan por `llm.provider`. `env` sigue existiendo y es el **default** (`defaultLlmConfig()`).

- **Origen del config**: el cliente (web) guarda su elección BYOK en `localStorage["vibetrip-llm-config"]` (`src/lib/llmConfig.ts` + `LlmConfigProvider`) y la adjunta como campo opcional `llm` en el body de `/api/trip/plan` y `/api/chat`. Schema `ByokSchema` en `src/domain/llm.ts` (`{provider:"openai"|"anthropic", model, apiKey}`); `"openai"` mapea a openai-compatible con `baseURL=api.openai.com/v1`. Es **opcional** → iOS y peticiones sin `llm` caen al default del servidor.
- **Pastilla del navbar** (`src/ui/Navbar.tsx` → `ModelSwitcher`): dropdown para elegir "default de vibetrip" o meter key de OpenAI/Anthropic. Valida la key con `POST /api/llm/validate` (test call de 1 token) antes de guardar.
- **Guest gate + BYOK**: un invitado con su propia key **se salta** el límite de 1-viaje (`vt_guest_used`) y no consume la cookie — paga su propio LLM, no abusa de nuestra cuota (`plan/route.ts`).
- **Seguridad**: la key viaja en el body (HTTPS) y en headers del SDK; **nunca se loguea**. `debugFetch` loguea response bodies, no headers. Los errores del proveedor se mapean a códigos estables vía `llmErrorCode` (`src/server/llm/index.ts`): `byok_invalid_key` (401/403), `model_unavailable` (404), `model_rate_limited` / `model_quota` (413/429, con sufijo `:<segundos>` si el proveedor dijo cuánto esperar).

## Pipelines multi-fichero (cuando edites X, recuerda Y)

### Añadir un evento SSE

1. Tipo en `src/domain/plan.ts` (unión `PlanEvent`).
2. Emitir desde `src/server/orchestrator.ts` con `yield`.
3. Handlear en el reducer de `src/hooks/useTripPlanner.ts`.
4. Renderizar en `src/features/generating/*` o donde aplique.

### Añadir un idioma → ver skill `add-locale`

### Añadir un campo a Itinerary/Accommodation

1. Schema Zod en `src/domain/itinerary.ts` o `accommodation.ts`.
2. Mencionarlo en el SYSTEM prompt del agente correspondiente y en el ejemplo JSON dentro del prompt.
3. (Opcional) regla en `src/server/agents/validators.ts` si requiere consistencia.
4. UI en `src/features/results/ItineraryView.tsx` o `AccommodationView.tsx`.
5. Mensaje i18n en los 6 `messages/<loc>.json` si añade label.
6. **iOS**: avisar en el repo hermano. Cambios opcionales (defaults) no rompen; obligatorios sí.

### Añadir una página pública (sin login)

1. Página bajo `src/app/[locale]/<ruta>/page.tsx`.
2. Añadir `<ruta>` a `PUBLIC_PAGES` en `src/proxy.ts`. Sin esto el middleware redirige.

### Cambiar el schema de la BD

1. Editar `supabase/sharing.sql` (o un nuevo `.sql`).
2. Correr el bloque NUEVO en el SQL editor del proyecto Supabase. **No hay migrations runner.** El SQL es idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`).
3. Si añades una RPC pensada para invitados: `GRANT EXECUTE ... TO anon, authenticated` y omitir `user_id` en el output.
4. Si añades una columna: comprobar que las RLS siguen siendo correctas y los inserts del cliente envían el campo (o tiene DEFAULT).

## Estado de auth/sesión

- **PUBLIC_PAGES** (`proxy.ts:9`): `/`, `/login`, `/shared`. Cualquier otra ruta sin sesión → redirect a `/[locale]/login?next=...`.
- **PUBLIC_API** (`proxy.ts:11`): `/api/trip/config`, `/api/auth/me`, `/api/trip/plan`, `/api/chat` (cubre `/api/chat/*` por el `startsWith`), `/api/llm/validate`. Cualquier otra → 401. **Importante**: estar en `PUBLIC_API` no significa "sin auth" — significa "el middleware no hace cookie-auth"; el handler hace la comprobación explícita con `createSupabaseAuthedClient` (cookie web + Bearer iOS). Si añades un endpoint que necesita aceptar Bearer, va aquí; si solo cookie web vale, déjalo fuera y el middleware lo gateará.
- **Guest gate**: `/api/trip/plan` permite a invitados generar **un solo viaje** por navegador, gateado con cookie `vt_guest_used` HttpOnly. Si necesitas re-deshabilitarlo para testing, comenta el bloque `guestAlreadyUsed` y el `headers.append(Set-Cookie)` final en `route.ts` (no estés mucho tiempo así — es la única defensa contra abuso del LLM).
- **Bearer token (iOS)**: `Authorization: Bearer <jwt>` en `/api/trip/plan` y `/api/auth/me`. Pasa por `createSupabaseAuthedClient` en `src/lib/supabase/server.ts:46`.

## Convenciones de código

- **TypeScript estricto** con `noUncheckedIndexedAccess`. `arr[0]` ya devuelve `T | undefined`.
- Path alias `@/*` → `src/*`.
- Fechas como **ISO `YYYY-MM-DD`** end-to-end (string, no Date). El cliente y la BD las guardan así.
- Horas como **`HH:MM` 24h**.
- Dinero en **EUR enteros**, sin conversión de divisa.
- Comentarios solo cuando expliquen el **porqué** no obvio (un workaround, una decisión sutil), nunca el qué.
- `console.log` con prefijo `[<scope> <id>]` para que sea filtrable en Vercel logs.

## Tests

- `tests/*.test.ts` corren con `npm run test`. Vitest, env `node`.
- `tests/*.live.test.ts` se saltan con un guard al principio del archivo (chequea `process.env.RUN_LIVE`); para correrlos: `RUN_LIVE=1 npm run test`. Hacen llamadas reales al LLM y a Nominatim, gastan cuota.
- `tests/server-only-stub.ts` está aliasado en `vitest.config.ts` para que los `import "server-only"` no fallen en Vitest.
- Los validators tienen tests unitarios (`itinerary-validators.test.ts`, `accommodation-validators.test.ts`); reuse `makeItinerary`/`makeAccommodation` factories.

## Producción

- Hosting: **Vercel**. Build estándar `next build`.
- Secrets reales en el panel de Vercel (`Environment Variables`). El `.env.local` solo es para local; está gitignored.
- DB: **Supabase managed** (un proyecto). El SQL de `supabase/sharing.sql` se corre **a mano** en el SQL editor.
- iOS: usa los mismos endpoints. Universal Links validados contra el AASA en `public/.well-known/apple-app-site-association` (servido como JSON sin redirects, ver `next.config.mjs`).
- **Sin rate limit** todavía. La cookie de guest es la única protección de `/api/trip/plan` contra abuso de LLM por anónimos. Considera Upstash Redis si añades visibilidad pública.
- Antes de cualquier deploy nuevo, ver skill `pre-prod-check`.

## Limitaciones / cosas a saber

- **Itinerario y alojamiento corren en serie**, NO en paralelo (aunque el README sugiera lo contrario en alguna versión). Razón: tight rate limits del free tier (Mistral 1 req/s); con paralelo nos comíamos 429 garantizados. Ver comentario en `orchestrator.ts:34-36`.
- **Multi-destino también es serial**: itera destinos, cada uno hace itinerario→alojamiento→presupuesto.
- **Universal Links**: el dominio en el AASA debe coincidir con el `Associated Domains` del bundle iOS (`SK4CMEFH7T.com.vibetrip.ios`). Si cambias el bundleID, actualiza ambos sitios.
- **Theme bootstrap**: hay un `<script>` inline en `layout.tsx` que aplica `dark` antes del primer paint usando `localStorage["vibetrip-theme"]`. No es Supabase cookie; no lo confundas.

## Mantener este documento al día

`CLAUDE.md` solo es útil mientras refleje el código. **Cuando un cambio toque alguna de las áreas documentadas aquí, edita la sección correspondiente en el mismo PR.** Triggers típicos:

- SYSTEM prompts en `src/server/agents/{itinerary,accommodation}.ts` (las 5 fases, HARD RULES, reglas culturales horarias).
- `src/server/agents/validators.ts` (cambia qué se considera output válido).
- Schemas en `src/domain/**` — recuerda: contrato compartido con iOS.
- Flujo del orquestador (paralelización, orden de agentes, eventos SSE).
- Tools del agent loop o cambios en `search_places` (filtros geográficos, parámetros expuestos al modelo).
- `src/proxy.ts` (PUBLIC_PAGES / PUBLIC_API).
- Migraciones `supabase/*.sql` (RPCs, RLS, columnas nuevas).
- Locales o providers LLM nuevos.

Editar la sección concreta, no rehacer el doc. Si el cambio NO afecta a nada de lo documentado, no toques `CLAUDE.md` — sobre-documentar también es ruido.

## Skills disponibles

Los skills concretos para este repo viven en `.claude/skills/`:

- **`add-locale`** — pipeline para añadir un nuevo idioma (5 ficheros).
- **`pre-prod-check`** — checklist antes de hacer deploy a producción.
