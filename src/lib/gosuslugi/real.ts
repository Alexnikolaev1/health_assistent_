// src/lib/gosuslugi/real.ts
// Заглушка для реального API Госуслуг
// Документация: https://partners.gosuslugi.ru/catalog/api_gu
// СМЭВ 3: https://smev3.gosuslugi.ru/portal/

import type { AppointmentRequest, AppointmentSlot } from '@/types';
import logger from '@/utils/logger';

const GOSUSLUGI_BASE_URL = process.env.GOSUSLUGI_BASE_URL ?? 'https://esia-portal1.test.gosuslugi.ru';
const CLIENT_ID = process.env.GOSUSLUGI_CLIENT_ID;
const CLIENT_SECRET = process.env.GOSUSLUGI_CLIENT_SECRET;

// ==========================================
// OAuth2 авторизация через ЕСИА (Госуслуги)
// ==========================================

/**
 * Получение токена доступа через OAuth2 ЕСИА
 * Требует: CLIENT_ID, CLIENT_SECRET, сертификат ЭЦП для подписи запроса
 */
export async function getEsiaToken(authCode: string): Promise<string | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    logger.warn('GOSUSLUGI_CLIENT_ID and GOSUSLUGI_CLIENT_SECRET are not set');
    return null;
  }

  try {
    const response = await fetch(`${GOSUSLUGI_BASE_URL}/aas/oauth2/te`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: `${process.env.APP_URL}/api/gosuslugi/callback`,
      }),
    });

    if (!response.ok) {
      logger.error({ status: response.status }, 'ESIA OAuth error');
      return null;
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  } catch (error) {
    logger.error({ error }, 'Failed to get ESIA token');
    return null;
  }
}

// ==========================================
// Запись к врачу через РМИС/МИС (реальный API)
// ==========================================

/**
 * Поиск доступных записей к врачу
 * 
 * В реальной интеграции использует СЕРВП (Сервис Электронной Записи на Приём)
 * или РМИС регионального значения.
 * 
 * Документация РМИС: https://nsi.rosminzdrav.ru/page/HL7_RMIS
 * ФРМР (федеральный реестр медработников): https://nsi.rosminzdrav.ru/
 */
export async function getAppointmentSlotsReal(
  _request: AppointmentRequest,
  _esiaToken: string
): Promise<AppointmentSlot[]> {
  logger.warn('Real Gosuslugi appointment API is not implemented. Using mock instead.');
  
  // TODO: Реализовать интеграцию с РМИС:
  // 1. GET /api/appointments/specialties — список специальностей
  // 2. GET /api/appointments/doctors?specialty={specialty}&city={city} — список врачей
  // 3. GET /api/appointments/slots?doctor_id={id}&date={date} — доступные слоты
  // 4. POST /api/appointments/book — бронирование слота
  
  return [];
}

// ==========================================
// Электронный больничный лист (ЭЛН)
// ==========================================

/**
 * Создание электронного листка нетрудоспособности
 * 
 * Требует:
 * - Авторизация через ЕСИА с правами на медицинские данные
 * - УКЭП (усиленная квалифицированная электронная подпись) врача
 * - Интеграция с ФСС через СЭДО
 * 
 * Документация ФСС ЭЛН: https://fss.ru/ru/fund/For_Insurant/electronic_sick_leave/index.shtml
 * СЭДО API: https://sedo.fss.ru/
 */
export async function createElectronicSickLeave(
  _userId: number,
  _esiaToken: string,
  _period: { start: string; end: string },
  _reason: string
): Promise<{ success: false; error: string; instructions: string }> {
  return {
    success: false,
    error: 'Реальный API ЭЛН не настроен',
    instructions: `
Для реальной интеграции с ЭЛН необходимо:

1. **Аккредитация** в ФСС как медицинская организация
2. **УКЭП врача** для подписания больничного листа
3. **Настройка СЭДО** (система электронного документооборота ФСС)
4. **API ФСС:** https://sedo.fss.ru/
5. **Тестовый контур:** https://sedo-beta.fss.ru/

Переменные окружения для реальной интеграции:
- FSS_CERTIFICATE_PATH — путь к сертификату УКЭП
- FSS_API_URL — URL боевого или тестового контура ФСС
- FSS_API_KEY — API-ключ аккредитованной организации
    `,
  };
}

// Ссылка для авторизации через ЕСИА (OAuth2)
export function buildEsiaAuthUrl(state: string): string {
  if (!CLIENT_ID) return '';

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid profile medical',
    state,
    redirect_uri: `${process.env.APP_URL}/api/gosuslugi/callback`,
    access_type: 'offline',
  });

  return `${GOSUSLUGI_BASE_URL}/aas/oauth2/ac?${params.toString()}`;
}
