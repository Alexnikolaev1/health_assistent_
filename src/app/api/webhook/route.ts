import { NextRequest, NextResponse } from 'next/server';
import { isWebhookRequestAuthorized } from '@/lib/env';
import { processBotUpdate, SERVICE_NAME, SERVICE_VERSION } from '@/lib/bot';
import { normalizeIncomingUpdate } from '@/lib/max/normalize-webhook';
import logger from '@/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Лимит выполнения на Vercel (App Router — задаётся здесь, не в vercel.json functions) */
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // console.* попадает в Vercel Runtime Logs даже при LOG_LEVEL=error и без pino
  console.info('[webhook] POST /api/webhook');

  if (!isWebhookRequestAuthorized(req)) {
    console.warn('[webhook] 401 missing or wrong X-Max-Bot-Api-Secret / X-Webhook-Secret');
    logger.warn('Webhook rejected: invalid X-Webhook-Secret');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    console.warn('[webhook] 400 invalid JSON body');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const update = normalizeIncomingUpdate(raw);
  if (!update) {
    const ut =
      raw && typeof raw === 'object' && 'update_type' in raw
        ? String((raw as Record<string, unknown>).update_type)
        : undefined;
    console.warn('[webhook] unmapped body', ut ?? '(no update_type)');
    logger.warn({ update_type: ut }, 'Webhook body not mapped to update; skipping');
    return NextResponse.json({ ok: true });
  }

  console.info('[webhook] update', { update_id: update.update_id, has_message: !!update.message });
  logger.info({ update_id: update.update_id }, 'Received MAX update');

  try {
    await processBotUpdate(update);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error('[webhook] processBotUpdate failed', msg, stack ?? '');
    logger.error({ errorMessage: msg, errorStack: stack }, 'processBotUpdate threw');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    timestamp: new Date().toISOString(),
  });
}
