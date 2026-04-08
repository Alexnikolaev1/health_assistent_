import { describe, it, expect } from 'vitest';
import {
  parseMetricFromText,
  parseReminderCommand,
  parseHabitCommand,
  isSymptomText,
} from './parsers';

describe('parseMetricFromText', () => {
  it('parses blood pressure', () => {
    const m = parseMetricFromText('давление 120/80');
    expect(m?.type).toBe('blood_pressure');
    expect(m?.value).toBe('120/80');
  });

  it('parses pulse', () => {
    const m = parseMetricFromText('пульс 72');
    expect(m?.type).toBe('pulse');
    expect(m?.value).toBe('72');
  });

  it('returns null for garbage', () => {
    expect(parseMetricFromText('привет как дела')).toBeNull();
  });
});

describe('parseReminderCommand', () => {
  it('parses quoted name with at time', () => {
    const r = parseReminderCommand('"Парацетамол" at 20:30');
    expect(r?.text).toBe('Парацетамол');
    expect(r?.time).toBe('20:30');
  });
});

describe('parseHabitCommand', () => {
  it('parses interval habit', () => {
    const h = parseHabitCommand('"вода" every 2h');
    expect(h?.type).toBe('interval');
    expect(h?.intervalHours).toBe(2);
  });

  it('parses daily habit', () => {
    const h = parseHabitCommand('"зарядка" daily at 07:30');
    expect(h?.type).toBe('daily');
    expect(h?.scheduledTime).toBe('07:30');
  });
});

describe('isSymptomText', () => {
  it('detects symptom keywords', () => {
    expect(isSymptomText('У меня болит голова')).toBe(true);
  });

  it('rejects neutral text', () => {
    expect(isSymptomText('Какая сегодня погода')).toBe(false);
  });
});
