import { NextRequest, NextResponse } from 'next/server';
import type { MAXUpdate } from '@/types';
import { isWebhookRequestAuthorized } from '@/lib/env';
import { processBotUpdate, SERVICE_NAME, SERVICE_VERSION } from '@/lib/bot';
import logger from '@/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secretHeader = req.headers.get('x-webhook-secret');
  if (!isWebhookRequestAuthorized(secretHeader)) {
    logger.warn('Webhook rejected: invalid X-Webhook-Secret');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let update: MAXUpdate;

  try {
    update = (await req.json()) as MAXUpdate;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  logger.debug({ update_id: update.update_id }, 'Received MAX update');

  await processBotUpdate(update);

  return NextResponse.json({ ok: true });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
  });
}
