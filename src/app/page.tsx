/**
 * Корневая страница — статус сервиса (бот обслуживается через /api/webhook).
 */
export default function HomePage() {
  return (
    <main>
      <h1>Твой здоровый MAX</h1>
      <p>Персональный AI-помощник для здоровья в мессенджере MAX.</p>
      <p>
        <a href="/api/webhook">Проверка API (GET)</a>
      </p>
    </main>
  );
}
