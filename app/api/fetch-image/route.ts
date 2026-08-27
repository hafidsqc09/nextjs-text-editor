import dns from "node:dns/promises";
import net from "node:net";

import { NextRequest, NextResponse } from "next/server";

// Pasted rich content (Google Docs, Word Online, Figma, or any other site)
// can reference images by URL, and third-party CDNs don't reliably send
// Access-Control-Allow-Origin — some do, some don't, and it varies by host
// and even by path. A same-origin server-side fetch isn't subject to that
// browser restriction, so this route re-fetches the image on the client's
// behalf.
//
// Since the source can be any site (not a fixed allowlist of document
// CDNs), this is guarded against SSRF by resolving the hostname and
// rejecting anything that points at a private, loopback, or link-local
// address (which also covers cloud metadata endpoints like
// 169.254.169.254) rather than by an allowlist of domains.
function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("::ffff:")) return isPrivateOrReservedIp(lower.slice(7));
    return false;
  }

  return true; // unrecognized -> block
}

async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  try {
    const records = await dns.lookup(hostname, { all: true });
    return records.length > 0 && records.every((record) => !isPrivateOrReservedIp(record.address));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  if (!(await resolvesToPublicAddress(parsed.hostname))) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), { signal: AbortSignal.timeout(10_000) });
  } catch {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "URL did not return an image" }, { status: 415 });
  }

  return new NextResponse(upstream.body, {
    headers: { "Content-Type": contentType },
  });
}
