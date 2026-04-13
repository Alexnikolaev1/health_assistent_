/**
 * Точка входа для текстовых сообщений: сначала активный диалог, иначе обычная маршрутизация.
 */

import { clearConversationContext, getConversationContext } from '@/lib/db';
import { sendMessage, MAIN_MENU_KEYBOARD } from '@/lib/max/client';
import { CANCEL_OK } from '@/lib/bot/copy';
import { handleDialogContext } from './dialog';
import { dispatchPlainMessage } from './dispatch';

export async function handleUserTextMessage(
  maxUserId: number,
  dbUserId: number,
  text: string,
  firstName?: string
): Promise<void> {
  if (text.trim().startsWith('/cancel')) {
    await clearConversationContext(dbUserId, 'dialog');
    await sendMessage(maxUserId, CANCEL_OK, { reply_markup: MAIN_MENU_KEYBOARD });
    return;
  }

  const activeContext = await getConversationContext(dbUserId, 'dialog');
  if (activeContext) {
    await handleDialogContext(maxUserId, dbUserId, text, activeContext, firstName);
    return;
  }
  await dispatchPlainMessage(maxUserId, dbUserId, text, firstName);
}
