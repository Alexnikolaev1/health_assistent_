// src/lib/gosuslugi/mock.ts
// Мок-интеграция с Госуслугами
// Для подключения реального API см. real.ts и документацию:
// https://partners.gosuslugi.ru/catalog/api_gu

import type { AppointmentSlot, AppointmentRequest, SickLeaveRequest } from '@/types';

// ==========================================
// Мок: получение слотов для записи к врачу
// ==========================================

export async function getAppointmentSlotsMock(
  request: AppointmentRequest
): Promise<AppointmentSlot[]> {
  // Имитируем задержку API
  await new Promise((resolve) => setTimeout(resolve, 500));

  const today = new Date();
  const slots: AppointmentSlot[] = [];

  // Генерируем 6 слотов на ближайшие 3 дня
  for (let dayOffset = 1; dayOffset <= 3; dayOffset++) {
    const slotDate = new Date(today);
    slotDate.setDate(today.getDate() + dayOffset);

    const dateStr = slotDate.toISOString().split('T')[0];
    const times = ['09:00', '10:30', '14:00'];
    const timesToday = dayOffset === 1 ? times.slice(1) : times;

    timesToday.forEach((time, i) => {
      slots.push({
        id: `slot_${dayOffset}_${i}`,
        date: dateStr,
        time,
        doctor_name: getDoctorName(request.specialty),
        specialty: request.specialty,
        clinic: request.clinic ?? getDefaultClinic(request.city ?? 'Москва'),
        address: getClinicAddress(request.city ?? 'Москва'),
        available: true,
      });
    });
  }

  return slots;
}

// ==========================================
// Мок: подтверждение записи
// ==========================================

export async function confirmAppointmentMock(slotId: string): Promise<{
  success: boolean;
  confirmation_number: string;
  message: string;
}> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const confirmationNumber = `GU-${Date.now().toString().slice(-8)}`;

  return {
    success: true,
    confirmation_number: confirmationNumber,
    message: `Запись подтверждена. Номер записи: ${confirmationNumber}`,
  };
}

// ==========================================
// Мок: оформление больничного листа
// ==========================================

export async function createSickLeaveMock(request: SickLeaveRequest): Promise<{
  success: boolean;
  application_id: string;
  instructions: string;
  json_payload: Record<string, unknown>;
}> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const applicationId = `SL-${Date.now().toString().slice(-8)}`;

  // Формируем JSON-заявление
  const jsonPayload = {
    application_id: applicationId,
    type: 'sick_leave',
    period: {
      start_date: request.start_date,
      end_date: request.end_date,
    },
    reason: request.reason,
    diagnosis_code: request.diagnosis_code ?? 'Z00.0',
    created_at: new Date().toISOString(),
    status: 'pending_signature',
    note: 'Требуется подпись с помощью УКЭП (квалифицированная электронная подпись)',
  };

  return {
    success: true,
    application_id: applicationId,
    instructions: getSickLeaveInstructions(),
    json_payload: jsonPayload,
  };
}

// ==========================================
// Вспомогательные функции
// ==========================================

function getDoctorName(specialty: string): string {
  const doctors: Record<string, string[]> = {
    'Терапевт': ['Иванова А.П.', 'Петров В.С.', 'Смирнова Е.Н.'],
    'Кардиолог': ['Сердечкин Д.И.', 'Волкова М.А.'],
    'Невролог': ['Мозгов С.П.', 'Черепанова Т.В.'],
    'Хирург': ['Резников А.В.', 'Скальпелев Г.Н.'],
    'Офтальмолог': ['Зрячева О.К.', 'Линзин П.А.'],
  };

  const list = doctors[specialty] ?? ['Иванов А.А.'];
  return list[Math.floor(Math.random() * list.length)];
}

function getDefaultClinic(city: string): string {
  return `Поликлиника №${Math.floor(Math.random() * 10) + 1} г. ${city}`;
}

function getClinicAddress(city: string): string {
  const streets: Record<string, string> = {
    'Москва': 'ул. Ленина, 42',
    'Санкт-Петербург': 'пр. Невский, 100',
    'Новосибирск': 'ул. Красный проспект, 55',
  };
  return streets[city] ?? 'ул. Центральная, 1';
}

export function getSickLeaveInstructions(): string {
  return `📋 Инструкция по оформлению электронного больничного:

1. Установите приложение «Госуслуги» на телефон
2. Перейдите в раздел «Здоровье» → «Электронный листок нетрудоспособности»
3. Введите данные заявления (уже подготовлены в JSON выше)
4. Подпишите документ с помощью УКЭП или через биометрию в приложении
5. Отправьте заявление работодателю через ГИС ЭПД

⚙️ Для подключения реального API Госуслуг:
• Документация: https://partners.gosuslugi.ru/catalog/api_gu
• СМЭВ API: https://smev3.gosuslugi.ru/portal/
• Требуется: аккредитация разработчика, тестовый и боевой контуры`;
}

// ==========================================
// Форматирование слотов для отображения пользователю
// ==========================================

export function formatAppointmentSlots(slots: AppointmentSlot[]): {
  message: string;
  keyboard: Array<Array<{ text: string; callback_data: string }>>;
} {
  if (slots.length === 0) {
    return {
      message: '😕 К сожалению, свободных слотов не найдено. Попробуйте другую дату или поликлинику.',
      keyboard: [],
    };
  }

  let message = '📅 *Доступные слоты для записи:*\n\n';
  message += `👨‍⚕️ ${slots[0].specialty} — ${slots[0].doctor_name}\n`;
  message += `🏥 ${slots[0].clinic}\n`;
  message += `📍 ${slots[0].address}\n\n`;
  message += 'Выберите удобное время:';

  // Группируем по датам
  const byDate = slots.reduce<Record<string, AppointmentSlot[]>>((acc, slot) => {
    if (!acc[slot.date]) acc[slot.date] = [];
    acc[slot.date].push(slot);
    return acc;
  }, {});

  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

  Object.entries(byDate).forEach(([date, dateSlots]) => {
    const dateObj = new Date(date);
    const dateLabel = dateObj.toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

    // Добавляем кнопки по 3 в ряд
    const row: Array<{ text: string; callback_data: string }> = [];
    dateSlots.forEach((slot) => {
      row.push({
        text: `${dateLabel} ${slot.time}`,
        callback_data: `appt:${slot.id}:${date}:${slot.time}:${slot.doctor_name}`,
      });
    });
    keyboard.push(row);
  });

  keyboard.push([{ text: '❌ Отмена', callback_data: 'appt:cancel' }]);

  return { message, keyboard };
}
