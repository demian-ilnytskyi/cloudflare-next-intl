import { NextRequest } from 'next/server';

export function makeTestRequest(
    url: string,
    init?: { cookies?: Record<string, string>; headers?: Record<string, string> },
): NextRequest {
    const request = new NextRequest(url, { headers: init?.headers });
    if (init?.cookies) {
        for (const [key, value] of Object.entries(init.cookies)) {
            request.cookies.set(key, value);
        }
    }
    return request;
}
