/**
 * Подсказка пользователю обратиться к врачу и что сообщить на приёме
 * (без интеграции с внешними API записи).
 */

import { getConversationContext } from '@/lib/db';
import { sendMessage } from '@/lib/max/client';
import type { InlineKeyboardMarkup } from '@/types';

const AFTER_PHYSICIAN_KEYBOARD: InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: '⏰ Напоминание записаться', callback_data: 'action:reminder_start' }],
    [{ text: '🏠 Главное меню', callback_data: 'cmd:main_menu' }],
  ],
};

export async function sendPhysicianReminderToChat(
  chatId: number,
  dbUserId: number,
  specialty: string
): Promise<void> {
  const last = await getConversationContext(dbUserId, 'last_symptom');
  const diagnosis = last?.diagnosis as string | undefined;
  const doctorType = last?.doctor_type as string | undefined;
  const text = buildPhysicianReminderMessage(specialty, { diagnosis, doctorType });
  await sendMessage(chatId, text, {
    reply_markup: AFTER_PHYSICIAN_KEYBOARD,
    parse_mode: 'Markdown',
  });
}

export function buildPhysicianReminderMessage(
  specialty: string,
  opts?: { diagnosis?: string; doctorType?: string }
): string {
  const diagnosis = opts?.diagnosis?.trim();
  const doctorType = opts?.doctorType?.trim();

  let text =
    `👨‍⚕️ *Визит к специалисту*\n\n` +
    `Рекомендуем записаться на приём к *${specialty}*.\n\n` +
    `На приёме расскажите врачу, что эта программа дала *только предварительную оценку* по симптомам — это не диагноз.\n\n`;

  if (diagnosis) {
    text += `*Что можно сказать врачу:* предварительная оценка в приложении — «${diagnosis}».\n`;
  } else {
    text += `*Что можно сказать врачу:* опишите симптомы так, как вы писали здесь.\n`;
  }

  if (doctorType && doctorType !== specialty) {
    text += `\nРанее в анализе фигурировал профиль: _${doctorType}_.\n`;
  }

  text +=
    `\nЗапись в поликлинику — через регистратуру, сайт клиники или приложение «Госуслуги», как вам удобно.`;

  return text;
}

export const SICK_LEAVE_INFO_TEXT =
  `📋 *Электронный листок нетрудоспособности*\n\n` +
  `Оформляет врач в клинике; этот бот не отправляет заявки в ФСС.\n\n` +
  `• Поликлиника по полису ОМС\n` +
  `• Приложение или сайт Госуслуги — раздел «Здоровье»\n\n` +
  `⚠️ _При ухудшении состояния не откладывайте очный визит._`;
