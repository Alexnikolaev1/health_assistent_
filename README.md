# 🏥 Твой здоровый MAX

Персональный AI Health Assistant для мессенджера MAX с предиктивным анализом симптомов, дневником метрик, напоминаниями о лекарствах, конструктором привычек и интеграцией с Госуслугами.

## ✨ Возможности

| Функция | Описание |
|---|---|
| 🤒 **Анализ симптомов** | YandexGPT анализирует симптомы и даёт предварительную оценку |
| 📊 **Дневник здоровья** | Давление, пульс, сахар, вес, сон, настроение, температура |
| ⏰ **Напоминания** | Лекарства, процедуры — с точным временем |
| 💪 **Привычки** | Конструктор привычек с трекингом серий и статистикой |
| 🏆 **Челленджи** | 10 000 шагов, без сахара, медитация и другие |
| 📅 **Запись к врачу** | Через Госуслуги (мок + заглушка для реального API) |
| 📋 **Больничный лист** | Формирует заявление с инструкцией по ЭЛН |

## 🛠 Технический стек

- **Платформа:** Vercel (Serverless Functions)
- **Фреймворк:** Next.js 14 (App Router)
- **Язык:** TypeScript
- **База данных:** Vercel Postgres
- **AI:** YandexGPT v2 (Foundation Models API)
- **Планировщик:** Upstash QStash + Vercel Cron
- **Логирование:** pino

## 📋 Требования

- Node.js 20+
- Аккаунт Vercel (бесплатный план подходит)
- Токен бота MAX
- API-ключ Yandex Cloud (YandexGPT)
- Аккаунт Upstash (бесплатный план)

---

## 🚀 Деплой за 10 минут

### Шаг 1: Клонирование репозитория

```bash
git clone https://github.com/your-username/max-health-assistant.git
cd max-health-assistant
npm install
```

### Шаг 2: Создание базы данных

**Вариант A — Vercel Postgres (рекомендуется):**
1. Откройте [vercel.com/dashboard](https://vercel.com/dashboard)
2. Перейдите в Storage → Create Database → Postgres
3. Скопируйте `POSTGRES_URL` из настроек
4. Запустите схему:

```bash
# Установите psql или используйте Vercel Dashboard → Query
psql $POSTGRES_URL -f src/lib/db/schema.sql
```

**Вариант B — Supabase:**
1. Создайте проект на [supabase.com](https://supabase.com)
2. Откройте SQL Editor и выполните `src/lib/db/schema.sql`
3. Скопируйте `SUPABASE_URL` и `SUPABASE_ANON_KEY`

### Шаг 3: Настройка YandexGPT

1. Откройте [console.cloud.yandex.ru](https://console.cloud.yandex.ru)
2. Создайте сервисный аккаунт с ролью `ai.languageModels.user`
3. Создайте API-ключ для сервисного аккаунта
4. Скопируйте `folder_id` из настроек облака

> Документация: https://cloud.yandex.ru/docs/yandexgpt/quickstart

### Шаг 4: Настройка Upstash QStash

1. Зарегистрируйтесь на [upstash.com](https://upstash.com)
2. Создайте QStash → скопируйте токены

### Шаг 5: Заполнение переменных окружения

```bash
cp .env.example .env.local
```

Отредактируйте `.env.local`:

```env
MAX_BOT_TOKEN=ваш_токен_бота_MAX
MAX_API_URL=https://botapi.max.ru

YANDEX_CLOUD_FOLDER_ID=b1g...
YANDEX_GPT_API_KEY=AQVN...
YANDEX_GPT_MODEL=yandexgpt/latest

POSTGRES_URL=postgres://...

QSTASH_TOKEN=qstash_...
QSTASH_CURRENT_SIGNING_KEY=sig_cur_...
QSTASH_NEXT_SIGNING_KEY=sig_nxt_...

CRON_SECRET=случайная_строка_32_символа
APP_URL=https://your-app.vercel.app
```

### Шаг 6: Деплой на Vercel

```bash
# Установите Vercel CLI
npm install -g vercel

# Деплой
vercel --prod

# Добавьте переменные окружения (или через Dashboard)
vercel env add MAX_BOT_TOKEN
# ... повторите для каждой переменной
```

### Шаг 7: Установка вебхука MAX

```bash
# Замените YOUR_TOKEN и YOUR_DOMAIN на реальные значения
curl -X POST "https://botapi.max.ru/botYOUR_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://YOUR_DOMAIN.vercel.app/api/webhook"}'
```

### Шаг 8: Проверка работоспособности

```bash
# Проверить что вебхук отвечает
curl https://YOUR_DOMAIN.vercel.app/api/webhook

# Тестовый запрос симптомов (имитация сообщения от MAX)
curl -X POST https://YOUR_DOMAIN.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 1,
    "message": {
      "message_id": 1,
      "from": {"id": 123456, "first_name": "Тест", "username": "testuser"},
      "chat": {"id": 123456, "type": "private"},
      "date": 1700000000,
      "text": "/start"
    }
  }'
```

---

## 📁 Структура проекта

```
max-health-assistant/
├── .env.example                    # Шаблон переменных окружения
├── vercel.json                     # Конфиг Vercel + Cron
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Корневой layout
│   │   ├── page.tsx                # Статус-сервис (корень сайта)
│   │   └── api/
│   │       ├── webhook/route.ts    # Тонкий слой: JSON → processBotUpdate
│   │       ├── cron/route.ts       # Напоминания (Vercel Cron + QStash)
│   │       └── yandex-proxy/       # Прокси для YandexGPT
│   ├── lib/
│   │   ├── bot/                    # Логика бота MAX (слой приложения)
│   │   │   ├── index.ts            # processBotUpdate, обработка ошибок
│   │   │   ├── dispatch.ts         # Команды и свободный текст без диалога
│   │   │   ├── dialog.ts           # Многошаговые сценарии (контекст БД)
│   │   │   ├── messages.ts         # Вход: диалог или dispatch
│   │   │   ├── callbacks.ts        # Inline-кнопки
│   │   │   └── constants.ts        # Версия сервиса
│   │   ├── db/
│   │   │   ├── index.ts            # CRUD операции с БД
│   │   │   └── schema.sql          # SQL-схема
│   │   ├── max/client.ts           # MAX Bot API клиент
│   │   ├── ai/
│   │   │   ├── yandexGPT.ts        # Анализ симптомов
│   │   │   └── prompts.ts          # Промпты для YandexGPT
│   │   ├── reminders/scheduler.ts  # QStash планировщик
│   │   ├── habits/engine.ts        # Привычки и челленджи
│   │   └── gosuslugi/
│   │       ├── mock.ts             # Мок-интеграция Госуслуг
│   │       └── real.ts             # Заглушка реального API
│   ├── types/index.ts              # TypeScript типы
│   └── utils/
│       ├── parsers.ts              # Парсинг текстовых команд
│       └── logger.ts               # Логгер
```

---

## 💬 Команды бота

| Команда | Описание |
|---|---|
| `/start` | Приветствие и главное меню |
| `/help` | Справка по командам |
| `/symptom [текст]` | Анализ симптомов через YandexGPT |
| `/metrics` | Дневник здоровья |
| `/reminder` | Управление напоминаниями |
| `/reminder add "Парацетамол" at 20:00` | Быстрое добавление напоминания |
| `/habits` | Управление привычками |
| `/habit add "пить воду" every 2h` | Добавить интервальную привычку |
| `/habit add "зарядка" daily at 07:00` | Добавить ежедневную привычку |
| `/appointment` | Записаться к врачу |
| `/sickleave` | Оформить больничный |

### Быстрый ввод метрик (без команды)

Просто напишите в чат:
- `давление 120/80`
- `пульс 75`
- `сахар 5.4`
- `вес 72.5`
- `температура 36.7`

---

## 🔧 Разработка

```bash
# Локальный запуск
npm run dev

# Юнит-тесты (парсеры и утилиты)
npm test

# Открыть http://localhost:3000
# Тестировать вебхук через ngrok:
npx ngrok http 3000
# Установить временный вебхук на ngrok URL
```

**Обновление БД с существующего деплоя:** выполните SQL из `src/lib/db/migrations/001_ops_timezone_habits.sql` (идемпотентность вебхука, rate limit, поля привычек).

---

## 🔐 Безопасность

- Все вызовы QStash верифицируются подписью
- Cron эндпоинт защищён `CRON_SECRET`
- Опционально: `WEBHOOK_SECRET` — заголовок `X-Webhook-Secret` на `POST /api/webhook`
- Дедупликация входящих апдейтов по `update_id`, ограничение частоты запросов на пользователя
- Данные пользователей изолированы по `user_id`
- API-ключи только в переменных окружения (не в коде)

---

## 📊 Масштабирование

При росте нагрузки:
1. Перейдите с Vercel Postgres на Neon/PlanetScale
2. Добавьте Redis (Upstash) для кэширования контекстов
3. Увеличьте `maxDuration` в `vercel.json` до 60с для тяжёлых запросов

---

## 📝 Лицензия

MIT

---

## ❓ Вопросы

Создайте Issue в репозитории или напишите напрямую через MAX.
