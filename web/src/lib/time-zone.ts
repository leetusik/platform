/**
 * The one time zone (hi2vi Library, the operator's decision 5): every date on a page is in the
 * viewer's own zone, remembered in a cookie the page sets once, and UTC until it is known.
 *
 * - The browser writes the cookie (`TimeZoneCookie`, `time-zone-cookie.tsx`, mounted once in the
 *   root layout) from `Intl.DateTimeFormat().resolvedOptions().timeZone`. A first visit renders in
 *   UTC; the viewer's zone takes over on the next server render (a navigation or a reload). The
 *   setter does not refresh the route after its first write: that would swap every date on the
 *   first page in front of the reader.
 * - The server reads it with `viewerTimeZone(await cookies())` and passes the result as
 *   `timeZone` to `format.ts`'s date functions. A missing, malformed or unknown value is UTC.
 *
 * Deliberately NOT `server-only` and free of `next/headers`: the setter imports the same name and
 * the same validation, so the two sides cannot drift. Nothing here is personal beyond the zone
 * name itself; the cookie is `SameSite=Lax`, not `httpOnly` (the browser writes it), one year.
 */

/** The cookie holding the viewer's IANA zone name (`Asia/Seoul`). */
export const TIME_ZONE_COOKIE = "kb_tz";

/** The zone every date is in until the viewer's is known. */
export const DEFAULT_TIME_ZONE = "UTC";

/** One year: the zone of a device rarely changes, and the setter corrects it when it does. */
export const TIME_ZONE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** No IANA name or offset identifier comes near this; anything longer is not ours. */
const MAX_ZONE_LENGTH = 64;

/**
 * The characters of an IANA name (`America/Argentina/Buenos_Aires`, `Etc/GMT+9`) or of an offset
 * identifier (`+09:00`), which `resolvedOptions().timeZone` may also return. Checked before the
 * formatter sees the value, so a cookie can never carry markup, `;` or whitespace into a page.
 */
const ZONE_SHAPE = /^[A-Za-z0-9_+\-:/]+$/;

/**
 * Whether `value` is a time zone this runtime formats in. `Intl.supportedValuesOf("timeZone")` is
 * not the test: it lists primary identifiers only, so it omits `UTC` and aliases a browser still
 * reports (`Asia/Calcutta`). Constructing a formatter is: it throws `RangeError` on an unknown zone.
 */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_ZONE_LENGTH) return false;
  if (!ZONE_SHAPE.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The zone a raw cookie value names, as given when it is valid; else `UTC`. */
export function resolveTimeZone(raw: string | null | undefined): string {
  return isValidTimeZone(raw) ? raw : DEFAULT_TIME_ZONE;
}

/** The part of a cookie store this reads: `next/headers`' `cookies()` result fits it. */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

/**
 * The viewer's zone on the server: `viewerTimeZone(await cookies())`. Reading a cookie makes the
 * page dynamic, which every page with the viewer's dates already is.
 */
export function viewerTimeZone(store: CookieReader): string {
  return resolveTimeZone(store.get(TIME_ZONE_COOKIE)?.value);
}

/** The cookie's value in a raw `document.cookie` jar, or null. Scans: the jar holds other values. */
export function readTimeZoneCookie(jar: string): string | null {
  for (const part of jar.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== TIME_ZONE_COOKIE) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/**
 * The setter's one decision: the zone to write, or null to leave the cookie alone. It writes when
 * the browser's zone is valid and the jar does not already hold exactly that zone, so a second
 * visit writes nothing.
 */
export function zoneToWrite(
  jar: string,
  browserZone: string | null | undefined,
): string | null {
  if (!isValidTimeZone(browserZone)) return null;
  return readTimeZoneCookie(jar) === browserZone ? null : browserZone;
}

/**
 * The `document.cookie` assignment for a zone. `Secure` only on https: dev serves plain http on
 * 127.0.0.1 (the `readerCookieString` rule).
 */
export function timeZoneCookieString(zone: string, secure: boolean): string {
  return `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; Path=/; Max-Age=${TIME_ZONE_COOKIE_MAX_AGE}; SameSite=Lax${
    secure ? "; Secure" : ""
  }`;
}
