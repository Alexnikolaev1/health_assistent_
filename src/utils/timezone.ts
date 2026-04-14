// Разбор ввода часового пояса: IANA (как в телефоне) или смещение от UTC.

import { DateTime } from 'luxon';

export type ParseTimezoneResult =
  | { ok: true; iana: string }
  | { ok: false; message: string };

/** POSIX-имена Etc/GMT*: UTC+3 → Etc/GMT-3 (как в базе tz). */
export function etcGmtFromUtcOffsetHours(offsetHours: number): string {
  if (offsetHours === 0) return 'Etc/UTC';
  if (offsetHours < -12 || offsetHours > 14) {
    throw new RangeError('offset out of range');
  }
  const inner = -offsetHours;
  return `Etc/GMT${inner > 0 ? '+' : ''}${inner}`;
}

/**
 * IANA (Europe/Samara), смещение «+3» / «-5» (UTC±), «UTC+4».
 */
export function parseTimezoneInput(raw: string): ParseTimezoneResult {
  const s = raw.trim();
  if (!s) {
    return {
      ok: false,
      message:
        'Укажите пояс. Примеры: /timezone Europe/Kaliningrad или /timezone +3 (если в телефоне UTC+3).',
    };
  }

  const utcWord = s.match(/^UTC\s*([+-])(\d{1,2})$/i);
  if (utcWord) {
    const sign = utcWord[1] === '+' ? 1 : -1;
    const h = sign * parseInt(utcWord[2], 10);
    try {
      const iana = etcGmtFromUtcOffsetHours(h);
      const z = DateTime.now().setZone(iana);
      if (!z.isValid) return { ok: false, message: 'Не удалось применить это смещение от UTC.' };
      return { ok: true, iana };
    } catch {
      return { ok: false, message: 'Смещение от UTC должно быть от −12 до +14 часов.' };
    }
  }

  const signed = s.match(/^([+-])(\d{1,2})$/);
  if (signed) {
    const sign = signed[1] === '-' ? -1 : 1;
    const h = sign * parseInt(signed[2], 10);
    try {
      const iana = etcGmtFromUtcOffsetHours(h);
      const z = DateTime.now().setZone(iana);
      if (!z.isValid) return { ok: false, message: 'Не удалось применить это смещение от UTC.' };
      return { ok: true, iana };
    } catch {
      return { ok: false, message: 'Смещение от UTC должно быть от −12 до +14 часов.' };
    }
  }

  const z = DateTime.now().setZone(s);
  if (z.isValid) {
    return { ok: true, iana: s };
  }

  return {
    ok: false,
    message:
      `Неизвестная зона «${s}». Укажите IANA (например Europe/Samara) или смещение: +3, -5. Список: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones`,
  };
}
