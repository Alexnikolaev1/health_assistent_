// src/lib/habits/engine.ts
// Логика управления привычками и предустановленные челленджи

import { DBHabit } from '@/types';

// ==========================================
// Предустановленные челленджи
// ==========================================

export interface ChallengeDefinition {
  id: string;
  name: string;
  description: string;
  durationDays: number;
  goalPerDay: number;
  unit: string;
  emoji: string;
}

export const CHALLENGES: ChallengeDefinition[] = [
  {
    id: 'steps_10k',
    name: '10 000 шагов в день',
    description: 'Ходите не менее 10 000 шагов каждый день',
    durationDays: 30,
    goalPerDay: 10000,
    unit: 'шагов',
    emoji: '👟',
  },
  {
    id: 'no_sugar_7',
    name: '7 дней без сахара',
    description: 'Полный отказ от сладкого и сахара на 7 дней',
    durationDays: 7,
    goalPerDay: 1,
    unit: 'дней',
    emoji: '🚫🍬',
  },
  {
    id: 'water_8glasses',
    name: '8 стаканов воды',
    description: 'Пейте 8 стаканов воды ежедневно',
    durationDays: 21,
    goalPerDay: 8,
    unit: 'стаканов',
    emoji: '💧',
  },
  {
    id: 'meditation_10min',
    name: '10 минут медитации',
    description: 'Медитируйте каждый день по 10 минут',
    durationDays: 21,
    goalPerDay: 1,
    unit: 'сеансов',
    emoji: '🧘',
  },
  {
    id: 'early_sleep',
    name: 'Ложиться до 23:00',
    description: 'Здоровый сон — ключ к здоровью. Отбой до 23:00',
    durationDays: 14,
    goalPerDay: 1,
    unit: 'ночей',
    emoji: '😴',
  },
  {
    id: 'no_alcohol_30',
    name: '30 дней без алкоголя',
    description: 'Полный отказ от алкоголя на 30 дней',
    durationDays: 30,
    goalPerDay: 1,
    unit: 'дней',
    emoji: '🚫🍺',
  },
];

export function getChallengeById(id: string): ChallengeDefinition | undefined {
  return CHALLENGES.find((c) => c.id === id);
}

// ==========================================
// Форматирование статистики привычек
// ==========================================

export function formatHabitStats(
  habit: DBHabit,
  stats: { total: number; completed: number; percentage: number }
): string {
  const bar = buildProgressBar(stats.percentage);
  const emoji = stats.percentage >= 80 ? '🌟' : stats.percentage >= 50 ? '✨' : '💪';

  let text = `${emoji} *${habit.name}*\n`;
  text += `${bar} ${stats.percentage}%\n`;
  text += `За 7 дней: ${stats.completed}/${stats.total}\n`;
  text += `🔥 Серия: ${habit.streak} дн.\n`;
  text += `📊 Всего выполнений: ${habit.total_completions}`;

  return text;
}

function buildProgressBar(percentage: number, length: number = 10): string {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ==========================================
// Форматирование списка привычек
// ==========================================

export function formatHabitsList(habits: DBHabit[]): string {
  if (habits.length === 0) {
    return '📋 У вас пока нет активных привычек.\n\nДобавьте первую командой /habits или нажмите «Добавить привычку»';
  }

  let text = '💪 *Ваши привычки:*\n\n';
  habits.forEach((habit, i) => {
    const frequencyText = habit.frequency_type === 'interval'
      ? `каждые ${habit.frequency_hours}ч`
      : habit.frequency_type === 'daily'
      ? `ежедневно в ${habit.scheduled_time}`
      : 'челлендж';

    text += `${i + 1}. ${habit.name}\n`;
    text += `   ⏱ ${frequencyText} | 🔥 серия: ${habit.streak} дн.\n\n`;
  });

  return text;
}

// ==========================================
// Проверка, нужно ли отправить напоминание о привычке
// ==========================================

export function shouldSendHabitReminder(habit: DBHabit): boolean {
  if (!habit.active) return false;

  if (habit.frequency_type === 'daily' && habit.scheduled_time) {
    const now = new Date();
    const [hours, minutes] = habit.scheduled_time.split(':').map(Number);
    const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
    return currentTime === `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  if (habit.frequency_type === 'interval' && habit.frequency_hours) {
    return shouldSendIntervalCronNudge(habit);
  }

  return false;
}

/** Следующее напоминание: от последнего nudge или от (последнего выполнения / создания) + период */
export function shouldSendIntervalCronNudge(habit: DBHabit): boolean {
  if (habit.frequency_type !== 'interval' || !habit.frequency_hours) return false;
  const periodMs = habit.frequency_hours * 3600000;
  const anchorMs = habit.last_interval_nudge_at
    ? new Date(habit.last_interval_nudge_at).getTime()
    : new Date(habit.last_completed_at ?? habit.created_at).getTime();
  const nextDue = anchorMs + periodMs;
  return Date.now() >= nextDue;
}
