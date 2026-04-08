// src/lib/ai/yandexGPT.ts
// Клиент для YandexGPT API v2 (Foundation Models)

import { YandexGPTRequest, YandexGPTResponse, SymptomAnalysisResult } from '@/types';
import { MEDICAL_DISCLAIMER_FULL } from '@/lib/bot/copy';
import { SYMPTOM_ANALYSIS_SYSTEM_PROMPT, buildSymptomUserPrompt } from './prompts';
import logger from '@/utils/logger';

const YANDEX_GPT_API_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion';

// ==========================================
// Базовый вызов YandexGPT
// ==========================================

async function callYandexGPT(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; text: string }>,
  options: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  } = {}
): Promise<string> {
  const folderId = process.env.YANDEX_CLOUD_FOLDER_ID;
  const apiKey = process.env.YANDEX_GPT_API_KEY;
  const modelId = options.model ?? process.env.YANDEX_GPT_MODEL ?? 'yandexgpt/latest';

  if (!folderId || !apiKey) {
    throw new Error('YANDEX_CLOUD_FOLDER_ID and YANDEX_GPT_API_KEY must be set');
  }

  // Формируем URI модели
  const modelUri = `gpt://${folderId}/${modelId}`;

  const requestBody: YandexGPTRequest = {
    modelUri,
    completionOptions: {
      stream: false,
      temperature: options.temperature ?? 0.3,
      maxTokens: String(options.maxTokens ?? 1500),
    },
    messages,
  };

  logger.debug({ modelUri, messageCount: messages.length }, 'Calling YandexGPT');

  const response = await fetch(YANDEX_GPT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Api-Key ${apiKey}`,
      'x-folder-id': folderId,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error({ status: response.status, error: errorText }, 'YandexGPT API error');
    throw new Error(`YandexGPT API error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as YandexGPTResponse;

  const alternative = data.result?.alternatives?.[0];
  if (!alternative?.message?.text) {
    throw new Error('YandexGPT returned empty response');
  }

  logger.debug({
    tokensUsed: data.result.usage?.totalTokens,
    status: alternative.status,
  }, 'YandexGPT response received');

  return alternative.message.text;
}

// ==========================================
// Анализ симптомов
// ==========================================

export async function analyzeSymptoms(
  symptomText: string,
  userHistory?: string
): Promise<SymptomAnalysisResult> {
  const userPrompt = buildSymptomUserPrompt(symptomText, userHistory);

  const rawResponse = await callYandexGPT([
    { role: 'system', text: SYMPTOM_ANALYSIS_SYSTEM_PROMPT },
    { role: 'user', text: userPrompt },
  ], {
    temperature: 0.3,
    maxTokens: 1000,
  });

  // Парсинг JSON-ответа
  try {
    // Убираем возможные markdown-обёртки вокруг JSON
    const jsonText = rawResponse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(jsonText) as {
      diagnosis: string;
      probability: number;
      urgency: 'low' | 'medium' | 'high' | 'emergency';
      recommendations: string[];
      doctor_type: string;
      tests_recommended: string[];
      when_to_emergency?: string;
    };

    return {
      diagnosis: parsed.diagnosis ?? 'Не определено',
      probability: Math.min(100, Math.max(0, parsed.probability ?? 50)),
      urgency: parsed.urgency ?? 'low',
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      doctor_type: parsed.doctor_type ?? 'Терапевт',
      tests_recommended: Array.isArray(parsed.tests_recommended) ? parsed.tests_recommended : [],
      raw_response: rawResponse,
    };
  } catch (parseError) {
    // Если JSON не распарсился — возвращаем текстовый ответ как есть
    logger.warn({ parseError, rawResponse }, 'Failed to parse YandexGPT JSON response, using text fallback');

    return {
      diagnosis: 'Смотри текст ниже',
      probability: 0,
      urgency: 'low',
      recommendations: [rawResponse],
      doctor_type: 'Терапевт',
      tests_recommended: [],
      raw_response: rawResponse,
    };
  }
}

// ==========================================
// Форматирование ответа для отправки пользователю
// ==========================================

export function formatSymptomAnalysisMessage(result: SymptomAnalysisResult): string {
  const urgencyEmoji = {
    low: '🟢',
    medium: '🟡',
    high: '🔴',
    emergency: '🚨',
  }[result.urgency];

  const urgencyText = {
    low: 'Низкая — плановый визит',
    medium: 'Средняя — сходите к врачу в ближайшие 1-2 дня',
    high: 'Высокая — нужен врач сегодня',
    emergency: 'ЭКСТРЕННАЯ — немедленно вызовите скорую!',
  }[result.urgency];

  let message = `🤖 *Анализ симптомов*\n\n`;
  message += `📋 *Предварительная оценка:* ${result.diagnosis}\n`;

  if (result.probability > 0) {
    message += `📊 *Уверенность:* ${result.probability}%\n`;
  }

  message += `${urgencyEmoji} *Срочность:* ${urgencyText}\n\n`;

  if (result.recommendations.length > 0) {
    message += `💊 *Рекомендации:*\n`;
    result.recommendations.forEach((rec, i) => {
      message += `${i + 1}. ${rec}\n`;
    });
    message += '\n';
  }

  message += `👨‍⚕️ *Рекомендованный врач:* ${result.doctor_type}\n`;

  if (result.tests_recommended.length > 0) {
    message += `🔬 *Анализы:* ${result.tests_recommended.join(', ')}\n`;
  }

  message += MEDICAL_DISCLAIMER_FULL;

  return message;
}

// ==========================================
// Произвольный запрос к YandexGPT (для будущих нужд)
// ==========================================

export async function askYandexGPT(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  return callYandexGPT([
    { role: 'system', text: systemPrompt },
    { role: 'user', text: userMessage },
  ]);
}
