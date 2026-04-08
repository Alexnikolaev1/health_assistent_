// src/utils/parsers.ts
// Парсеры для обработки текстовых команд пользователя

import { MetricType } from '@/types';

// ==========================================
// Парсинг метрик здоровья
// ==========================================

export interface ParsedMetric {
  type: MetricType;
  value: string;
  normalized: string;
}

const METRIC_PATTERNS: Array<{
  patterns: RegExp[];
  type: MetricType;
  normalize: (match: RegExpMatchArray) => string;
}> = [
  {
    patterns: [
      /давление\s+(\d{2,3})[\/\\\-](\d{2,3})/i,
      /ад\s+(\d{2,3})[\/\\\-](\d{2,3})/i,
      /(\d{2,3})[\/\\\-](\d{2,3})\s+давление/i,
    ],
    type: 'blood_pressure',
    normalize: (m) => `${m[1]}/${m[2]}`,
  },
  {
    patterns: [
      /пульс\s+(\d{2,3})/i,
      /чсс\s+(\d{2,3})/i,
      /(\d{2,3})\s+пульс/i,
      /(\d{2,3})\s+уд[./]?мин/i,
    ],
    type: 'pulse',
    normalize: (m) => m[1],
  },
  {
    patterns: [
      /сахар\s+(\d+[.,]\d+|\d+)/i,
      /глюкоза\s+(\d+[.,]\d+|\d+)/i,
      /(\d+[.,]\d+|\d+)\s+сахар/i,
      /(\d+[.,]\d+)\s+ммоль/i,
    ],
    type: 'blood_sugar',
    normalize: (m) => m[1].replace(',', '.'),
  },
  {
    patterns: [
      /вес\s+(\d{2,3}(?:[.,]\d+)?)/i,
      /(\d{2,3}(?:[.,]\d+)?)\s+кг/i,
      /весь?\s+(\d{2,3}(?:[.,]\d+)?)/i,
    ],
    type: 'weight',
    normalize: (m) => m[1].replace(',', '.'),
  },
  {
    patterns: [
      /температура\s+(\d{2}[.,]\d)/i,
      /темп[.,]?\s+(\d{2}[.,]\d)/i,
      /(\d{2}[.,]\d)\s+температура/i,
      /(\d{2}[.,]\d)\s+гр[ад.]*/i,
    ],
    type: 'temperature',
    normalize: (m) => m[1].replace(',', '.'),
  },
  {
    patterns: [
      /сон\s+(\d+(?:[.,]\d+)?)/i,
      /спал[а]?\s+(\d+)/i,
      /sleep\s+(\d+(?:[.,]\d+)?)/i,
    ],
    type: 'sleep_quality',
    normalize: (m) => m[1],
  },
  {
    patterns: [
      /настроение\s+(\d+(?:[.,]\d+)?(?:\/10)?)/i,
      /mood\s+(\d+)/i,
    ],
    type: 'mood',
    normalize: (m) => m[1].replace('/10', ''),
  },
];

export function parseMetricFromText(text: string): ParsedMetric | null {
  const lowerText = text.toLowerCase();

  for (const { patterns, type, normalize } of METRIC_PATTERNS) {
    for (const pattern of patterns) {
      const match = lowerText.match(pattern);
      if (match) {
        const value = normalize(match);
        return {
          type,
          value,
          normalized: formatMetricValue(type, value),
        };
      }
    }
  }

  return null;
}

export function formatMetricValue(type: MetricType, value: string): string {
  const units: Record<MetricType, string> = {
    blood_pressure: 'мм рт.ст.',
    pulse: 'уд/мин',
    blood_sugar: 'ммоль/л',
    weight: 'кг',
    sleep_quality: 'ч',
    mood: '/10',
    temperature: '°C',
  };
  return `${value} ${units[type]}`;
}

export function getMetricDisplayName(type: MetricType): string {
  const names: Record<MetricType, string> = {
    blood_pressure: '🩺 Давление',
    pulse: '❤️ Пульс',
    blood_sugar: '🩸 Сахар в крови',
    weight: '⚖️ Вес',
    sleep_quality: '😴 Качество сна',
    mood: '😊 Настроение',
    temperature: '🌡️ Температура',
  };
  return names[type];
}

// ==========================================
// Парсинг команды /reminder add
// ==========================================

export interface ParsedReminder {
  text: string;
  time: string; // HH:MM
  days?: number[]; // дни недели (0-6)
}

export function parseReminderCommand(input: string): ParsedReminder | null {
  // Формат: "Название лекарства" at HH:MM
  // или: Название at 20:00
  const match = input.match(/["']?(.+?)["']?\s+at\s+(\d{1,2}):(\d{2})/i);
  if (!match) return null;

  const text = match[1].trim();
  const hours = match[2].padStart(2, '0');
  const minutes = match[3];

  if (parseInt(hours) > 23 || parseInt(minutes) > 59) return null;

  return { text, time: `${hours}:${minutes}` };
}

// ==========================================
// Парсинг команды /habit add
// ==========================================

export interface ParsedHabit {
  name: string;
  type: 'interval' | 'daily';
  intervalHours?: number;
  scheduledTime?: string; // HH:MM
}

export function parseHabitCommand(input: string): ParsedHabit | null {
  // Формат: "название" every Xh или "название" daily at HH:MM
  const intervalMatch = input.match(/["']?(.+?)["']?\s+every\s+(\d+)h/i);
  if (intervalMatch) {
    return {
      name: intervalMatch[1].trim(),
      type: 'interval',
      intervalHours: parseInt(intervalMatch[2]),
    };
  }

  const dailyMatch = input.match(/["']?(.+?)["']?\s+(?:daily|ежедневно)\s+at\s+(\d{1,2}):(\d{2})/i);
  if (dailyMatch) {
    const hours = dailyMatch[2].padStart(2, '0');
    const minutes = dailyMatch[3];
    return {
      name: dailyMatch[1].trim(),
      type: 'daily',
      scheduledTime: `${hours}:${minutes}`,
    };
  }

  return null;
}

// ==========================================
// Определение симптомов в произвольном тексте
// ==========================================

const SYMPTOM_KEYWORDS = [
  'болит', 'боль', 'болею', 'температура', 'градус', 'кашель', 'насморк',
  'голова', 'живот', 'горло', 'тошнота', 'рвота', 'понос', 'диарея',
  'слабость', 'усталость', 'давление', 'головокружение', 'сыпь', 'зуд',
  'отёк', 'отек', 'колет', 'жжение', 'онемение', 'судороги', 'озноб',
  'потливость', 'бессонница', 'одышка', 'кашляю', 'чихаю', 'заложен',
];

export function isSymptomText(text: string): boolean {
  const lower = text.toLowerCase();
  return SYMPTOM_KEYWORDS.some((kw) => lower.includes(kw));
}

// ==========================================
// Утилиты форматирования
// ==========================================

export function formatDate(date: Date): string {
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
