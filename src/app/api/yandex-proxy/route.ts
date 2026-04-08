// src/app/api/yandex-proxy/route.ts
// Прокси для вызовов YandexGPT — используется если фронтенд обращается напрямую
// В текущей архитектуре все вызовы идут из server-side кода, прокси опционален

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const folderId = process.env.YANDEX_CLOUD_FOLDER_ID;
  const apiKey = process.env.YANDEX_GPT_API_KEY;

  if (!folderId || !apiKey) {
    return NextResponse.json(
      { error: 'YandexGPT credentials not configured' },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const response = await fetch(
      'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Api-Key ${apiKey}`,
          'x-folder-id': folderId,
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      logger.error({ status: response.status, data }, 'YandexGPT proxy error');
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    logger.error({ error }, 'YandexGPT proxy request failed');
    return NextResponse.json(
      { error: 'Upstream request failed' },
      { status: 502 }
    );
  }
}
