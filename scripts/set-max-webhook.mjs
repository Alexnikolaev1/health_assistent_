/**
 * Регистрация Webhook в актуальном MAX Bot API.
 * @see https://dev.max.ru/docs-api/methods/POST/subscriptions
 *
 * 1) npm run dev
 * 2) Туннель: npx ngrok http 3000  (или cloudflared tunnel)
 * 3) npm run webhook:set -- https://ВАШ.ngrok-free.app/api/webhook
 *
 * Токен — из кабинета MAX (Чат-боты → Интеграция → токен), тот же что в MAX_BOT_TOKEN.
 * Опционально в подписку передаётся secret из WEBHOOK_SECRET (5–256 символов, [a-zA-Z0-9_-]).
 * Тогда на сервере проверяйте заголовок X-Max-Bot-Api-Secret (см. isWebhookRequestAuthorized).
 */

const PLATFORM_API = 'https://platform-api.max.ru';

const webhookUrl = process.argv[2];

if (!webhookUrl || !webhookUrl.startsWith('https://')) {
  console.error(`
Укажите полный HTTPS URL вебхука, например:
  npm run webhook:set -- https://abc123.ngrok-free.app/api/webhook

Сначала: npm run dev
Затем туннель на порт 3000: npx ngrok http 3000
`);
  process.exit(1);
}

const token = process.env.MAX_BOT_TOKEN;
if (!token) {
  console.error('MAX_BOT_TOKEN не задан. Запуск: npm run webhook:set (читает .env.local).');
  process.exit(1);
}

const secret = process.env.WEBHOOK_SECRET?.trim();
if (secret && !/^[a-zA-Z0-9_-]{5,256}$/.test(secret)) {
  console.error(
    'WEBHOOK_SECRET должен быть 5–256 символов: только латиница, цифры, _ и - (требование API подписки). Очистите или поправьте .env.local.'
  );
  process.exit(1);
}

const body = {
  url: webhookUrl,
  update_types: ['message_created', 'message_callback', 'bot_started'],
  ...(secret ? { secret } : {}),
};

async function main() {
  const res = await fetch(`${PLATFORM_API}/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text);
  if (!res.ok) process.exit(1);
  console.log('\nПодписка создана. Убедитесь, что сервер отвечает 200 на POST /api/webhook.');
  if (secret) {
    console.log('Проверка: заголовок X-Max-Bot-Api-Secret должен совпадать с WEBHOOK_SECRET.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
