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

  it('maps message_created like official MAX Message (body.text, body.mid)', () => {
    const u = normalizeIncomingUpdate({
      update_type: 'message_created',
      timestamp: 1700000000000,
      message: {
        sender: { user_id: 99, name: 'U', username: 'u', is_bot: false, last_activity_time: 0 },
        recipient: { chat_id: 99, chat_type: 'dialog' },
        timestamp: 1700000000000,
        body: { mid: 'mid-1', seq: 1, text: '/start', attachments: null },
      },
    });
    expect(u?.message?.text).toBe('/start');
    expect(u?.message?.chat.id).toBe(99);
    expect(u?.message?.from?.id).toBe(99);
  });

  it('accepts camelCase userId / chatId', () => {
    const u = normalizeIncomingUpdate({
      update_type: 'message_created',
      timestamp: 1700000000001,
      message: {
        sender: { userId: 5, name: 'U' },
        recipient: { chatId: 5 },
        body: { mid: 'x', seq: 0, text: 'hi', attachments: null },
      },
    });
    expect(u?.message?.text).toBe('hi');
    expect(u?.message?.chat.id).toBe(5);
  });
});
