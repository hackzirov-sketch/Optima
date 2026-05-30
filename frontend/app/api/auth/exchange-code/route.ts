import { NextResponse } from 'next/server';

const BACKEND_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('code' in body)) {
    return NextResponse.json({ message: 'code is required' }, { status: 400 });
  }

  const backendRes = await fetch(`${BACKEND_BASE}/auth/exchange-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const contentType = backendRes.headers.get('content-type') || 'application/json';
  const responseBody = await backendRes.text();

  return new Response(responseBody, {
    status: backendRes.status,
    headers: { 'Content-Type': contentType },
  });
}
