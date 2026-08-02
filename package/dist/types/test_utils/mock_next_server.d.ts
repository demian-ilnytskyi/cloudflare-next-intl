import { NextRequest } from 'next/server';
export declare function makeTestRequest(url: string, init?: {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
}): NextRequest;
