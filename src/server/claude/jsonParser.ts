/**
 * Best-effort JSON repair for LLM outputs.
 *
 * Local models often truncate JSON when they hit max_tokens, leaving the
 * response unparseable. This module:
 *   1. Strips fences and surrounding prose.
 *   2. Tries direct JSON.parse.
 *   3. If that fails, walks the string char-by-char to find the LAST position
 *      that produces a balanced, parseable JSON object — keeping all complete
 *      array items and dropping the final partial one.
 */

function stripFences(raw: string): string {
  let s = raw.replace(/```json|```/g, "").trim();
  const match = s.match(/\{[\s\S]*\}/);
  if (match) s = match[0];
  return s;
}

function tryParse(s: string): unknown | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Walk the string tracking string/escape state plus brace/bracket depth.
 * For every position where depth returns to a "safe" level (the document is
 * balanced at the top level), record it. The deepest such cut, when we need
 * to recover from truncation, is the one we keep.
 *
 * The repair strategy:
 *  - Find the last fully-closed object/array at any depth before the
 *    truncation point.
 *  - From there, append the necessary closers ("]" or "}") to reach the top
 *    level.
 */
function repairTruncated(input: string): string | null {
  let cleaned = stripFences(input);

  // Quick win: trailing commas
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
  if (tryParse(cleaned)) return cleaned;

  // Walk and remember last index after a balanced top-level prefix
  let inString = false;
  let escape = false;
  const stack: Array<"{" | "["> = [];
  // For each prefix length, also remember the last "complete element boundary"
  // — i.e. the position right after a closing brace/bracket where we could
  // safely cut and add closers to make the doc valid.
  let lastSafeCut = -1;

  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i] as string;

    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (c === "{" || c === "[") {
      stack.push(c);
    } else if (c === "}" || c === "]") {
      stack.pop();
      // After closing, we're at a stable point. Remember the prefix.
      lastSafeCut = i + 1;
    }
  }

  if (lastSafeCut === -1) return null;

  // Build the closer suffix from the stack at lastSafeCut. We need to recompute
  // the stack at that index.
  let depthStack: Array<"{" | "["> = [];
  inString = false;
  escape = false;
  for (let i = 0; i < lastSafeCut; i++) {
    const c = cleaned[i] as string;
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{" || c === "[") depthStack.push(c);
    else if (c === "}" || c === "]") depthStack.pop();
  }

  let prefix = cleaned.slice(0, lastSafeCut);
  // Strip a trailing comma if any
  prefix = prefix.replace(/,\s*$/, "");

  let suffix = "";
  while (depthStack.length > 0) {
    const open = depthStack.pop();
    suffix += open === "{" ? "}" : "]";
  }

  const candidate = prefix + suffix;
  if (tryParse(candidate)) return candidate;

  // Last resort: try walking back through earlier safe cuts.
  // We rescan to collect ALL safe cuts and try them from latest to earliest.
  const safeCuts: number[] = [];
  inString = false;
  escape = false;
  depthStack = [];
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i] as string;
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{" || c === "[") depthStack.push(c);
    else if (c === "}" || c === "]") {
      depthStack.pop();
      safeCuts.push(i + 1);
    }
  }

  for (let idx = safeCuts.length - 1; idx >= 0; idx--) {
    const cut = safeCuts[idx];
    if (cut === undefined) continue;
    const attemptStack: Array<"{" | "["> = [];
    let inS = false;
    let esc = false;
    for (let i = 0; i < cut; i++) {
      const c = cleaned[i] as string;
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') {
        inS = !inS;
        continue;
      }
      if (inS) continue;
      if (c === "{" || c === "[") attemptStack.push(c);
      else if (c === "}" || c === "]") attemptStack.pop();
    }
    const pfx = cleaned.slice(0, cut).replace(/,\s*$/, "");
    let sfx = "";
    while (attemptStack.length > 0) {
      const open = attemptStack.pop();
      sfx += open === "{" ? "}" : "]";
    }
    const cand = pfx + sfx;
    if (tryParse(cand)) return cand;
  }

  return null;
}

function naiveClose(input: string): string | null {
  let s = stripFences(input).replace(/,\s*([}\]])/g, "$1");
  // Strip a dangling comma at the end
  s = s.replace(/,\s*$/, "");

  // If we end mid-token (e.g. `"hola truncad`), drop everything from the last
  // unterminated quote onwards.
  let inString = false;
  let escape = false;
  let lastCleanIdx = s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      if (!inString) lastCleanIdx = i;
      inString = !inString;
    }
  }
  if (inString) {
    s = s.slice(0, lastCleanIdx).replace(/[,:\s]*$/, "");
  }

  // Close brackets/braces
  const opens: string[] = [];
  inString = false;
  escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{" || c === "[") opens.push(c);
    else if (c === "}" || c === "]") opens.pop();
  }

  let suffix = "";
  while (opens.length > 0) {
    const open = opens.pop();
    suffix += open === "{" ? "}" : "]";
  }
  const candidate = s + suffix;
  return tryParse(candidate) ? candidate : null;
}

export function extractJsonObject(raw: string): string {
  let s = stripFences(raw);

  // First-pass cleanups
  s = s.replace(/,\s*([}\]])/g, "$1");
  if (tryParse(s)) return s;

  // Try to repair via balanced-prefix walk (preserves complete array items)
  const repaired = repairTruncated(raw);
  if (repaired) return repaired;

  // Fallback: naive close of any open brackets/braces
  const naive = naiveClose(raw);
  if (naive) return naive;

  return s;
}
