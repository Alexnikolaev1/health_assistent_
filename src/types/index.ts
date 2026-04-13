// src/types/index.ts
// Глобальные типы для всего приложения

// ==========================================
// MAX Bot API Types
// ==========================================

export interface MAXUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface MAXChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
}

export interface MAXMessage {
  message_id: number;
  from?: MAXUser;
  chat: MAXChat;
  date: number;
  text?: string;
  data?: string; // для callback_query
}

export interface MAXCallbackQuery {
  /** Строка или число с платформы — в extract приводим к string */
  id: string | number;
  from: MAXUser;
  message?: MAXMessage;
  data?: string;
}

export interface MAXUpdate {
  update_id: number;
  message?: MAXMessage;
  callback_query?: MAXCallbackQuery;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

// ==========================================
// Database Types
// ==========================================

export interface DBUser {
  id: number;
  max_user_id: number;
  username: string | null;
  first_name: string | null;
  created_at: Date;
  last_active: Date;
  timezone: string;
}

export interface DBMetric {
  id: number;
  user_id: number;
  metric_type: MetricType;
  value: string;
  recorded_at: Date;
  notes: string | null;
}

export type MetricType =
  | 'blood_pressure'
  | 'pulse'
  | 'blood_sugar'
  | 'weight'
  | 'sleep_quality'
  | 'mood'
  | 'temperature';

export interface DBReminder {
  id: number;
  user_id: number;
  text: string;
  reminder_time: string; // HH:MM формат
  days_of_week: number[] | null; // 0=Вс, 1=Пн, ..., 6=Сб. null = каждый день
  active: boolean;
  last_sent_at: Date | null;
  created_at: Date;
}

export interface DBHabit {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  frequency_type: 'interval' | 'daily' | 'challenge';
  frequency_hours: number | null; // для interval
  scheduled_time: string | null; // HH:MM для daily
  challenge_id: string | null;
  active: boolean;
  created_at: Date;
  streak: number;
  total_completions: number;
  last_completed_at: Date | null;
  last_interval_nudge_at: Date | null;
  last_daily_prompt_at: Date | null;
}

export interface DBHabitCompletion {
  id: number;
  habit_id: number;
  user_id: number;
  completed_at: Date;
}

export interface DBConversationContext {
  id: number;
  user_id: number;
  context_type: 'symptom_analysis' | 'metrics_input' | 'reminder_setup' | 'appointment';
  data: Record<string, unknown>;
  expires_at: Date;
  created_at: Date;
}

// ==========================================
// AI Types
// ==========================================

export interface SymptomAnalysisResult {
  diagnosis: string;
  probability: number;
  recommendations: string[];
  doctor_type: string;
  tests_recommended: string[];
  urgency: 'low' | 'medium' | 'high' | 'emergency';
  raw_response: string;
}

export interface YandexGPTMessage {
  role: 'system' | 'user' | 'assistant';
  text: string;
}

export interface YandexGPTRequest {
  modelUri: string;
  completionOptions: {
    stream: boolean;
    temperature: number;
    maxTokens: string;
  };
  messages: YandexGPTMessage[];
}

export interface YandexGPTResponse {
  result: {
    alternatives: Array<{
      message: {
        role: string;
        text: string;
      };
      status: string;
    }>;
    usage: {
      inputTextTokens: string;
      completionTokens: string;
      totalTokens: string;
    };
    modelVersion: string;
  };
}

// ==========================================
// QStash Types
// ==========================================

export interface CronPayload {
  reminder_id?: number;
  habit_id?: number;
  /** id пользователя в БД (users.id); по нему берём max_user_id для MAX API */
  user_id: number;
  type: 'reminder' | 'habit';
  text: string;
}

// ==========================================
// Состояние диалога
// ==========================================

export type DialogState =
  | 'idle'
  | 'waiting_symptom'
  | 'waiting_metric_type'
  | 'waiting_metric_value'
  | 'waiting_reminder_name'
  | 'waiting_reminder_time'
  | 'waiting_physician_specialty_other'
  | 'waiting_habit_name'
  | 'waiting_habit_frequency';

export interface UserSession {
  state: DialogState;
  data: Record<string, unknown>;
  last_updated: number;
}
