import { describe, it, expect } from 'vitest';
import { normalizeIncomingUpdate } from './normalize-webhook';

describe('normalizeIncomingUpdate', () => {
  it('maps bot_started to synthetic /start message', () => {
    const u = normalizeIncomingUpdate({
      update_type: 'bot_started',
      timestamp: 1700000000123,
      chat_id: 42,
      user: {
        user_id: 42,
        name: 'Иван',
        username: 'ivan',
      },
      payload: null,
    });
    expect(u).not.toBeNull();
    expect(u!.message?.text).toBe('/start');
    expect(u!.message?.chat.id).toBe(42);
    expect(u!.message?.from?.id).toBe(42);
    expect(u!.update_id).toBe(1700000000123);
  });

  it('includes deep-link payload in /start text', () => {
    const u = normalizeIncomingUpdate({
      update_type: 'bot_started',
      timestamp: 1,
      chat_id: 1,
      user: { user_id: 1, name: 'A' },
      payload: 'promo',
    });
    expect(u!.message?.text).toBe('/start promo');
  });
});
