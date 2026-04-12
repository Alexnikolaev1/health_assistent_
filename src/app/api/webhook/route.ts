import { NextRequest, NextResponse } from 'next/server';
import { isWebhookRequestAuthorized } from '@/lib/env';
import { processBotUpdate, SERVICE_NAME, SERVICE_VERSION } from '@/lib/bot';
import { normalizeIncomingUpdate } from '@/lib/max/normalize-webhook';
import logger from '@/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isWebhookRequestAuthorized(req)) {
    logger.warn('Webhook rejected: invalid X-Webhook-Secret');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const update = normalizeIncomingUpdate(raw);
  if (!update) {
    const ut =
      raw && typeof raw === 'object' && 'update_type' in raw
        ? String((raw as Record<string, unknown>).update_type)
        : undefined;
    logger.warn({ update_type: ut }, 'Webhook body not mapped to update; skipping');
    return NextResponse.json({ ok: true });
  }

  logger.info({ update_id: update.update_id }, 'Received MAX update');

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
