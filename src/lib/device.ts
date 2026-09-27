/**
 * The device label for a session, from the user agent.
 *
 * A session list that shows raw user-agent strings is a list nobody reads. This turns
 * one into "Chrome on Windows" - the two facts a person needs to recognise the phone
 * in their pocket versus the laptop on the desk - and it is a PURE function, so the
 * awkward cases (an empty header, a bot, an unknown browser) are testable without a
 * browser anywhere near them.
 *
 * It is deliberately a rough instrument: recognising "the device I am holding" does
 * not need a fingerprinting engine, and building one would be worse than the problem
 * it solves.
 */

const BROWSERS: [RegExp, string][] = [
  // Order matters: Edge and Opera both announce Chrome, and Chrome announces Safari.
  [/Edg[A-Za-z]*\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\//, "Firefox"],
  [/CriOS\//, "Chrome"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
  [/curl\//i, "curl"],
];

const PLATFORMS: [RegExp, string][] = [
  [/Android/i, "Android"],
  [/iPhone|iPad|iPod/i, "iOS"],
  [/Windows NT/i, "Windows"],
  [/Macintosh|Mac OS X/i, "macOS"],
  [/CrOS/i, "ChromeOS"],
  [/Linux/i, "Linux"],
];

export function describeUserAgent(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? "").trim();
  if (ua.length === 0) {
    return "Unknown device";
  }

  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? "Browser";
  const platform = PLATFORMS.find(([pattern]) => pattern.test(ua))?.[1] ?? "unknown platform";

  return `${browser} on ${platform}`;
}

/** "3 minutes ago", "2 days ago" - for the list's secondary line. */
export function describeRecency(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return "unknown";
  }
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
