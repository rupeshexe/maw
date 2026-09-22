import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FORWARD_HEADERS = ["authorization", "content-type", "idempotency-key", "x-demo-user", "x-signature", "x-webhook-signature"];

async function proxy(request: NextRequest, { params }: { params: { path: string[] } }) {
  const base = (process.env.API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
  const target = `${base}/${params.path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = !["GET", "HEAD"].includes(request.method);
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: "no-store"
    });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" }
    });
  } catch {
    return NextResponse.json({ error: { code: "upstream_unreachable", message: "The MAW API is unreachable", details: null } }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
