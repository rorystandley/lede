import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { pushSubscriptions } from '../db/schema/index.js';
import { getConfig } from '../config.js';
import { getLogger } from './logger.js';

let _initialized = false;

export function initPush(): boolean {
  if (_initialized) return true;
  const config = getConfig();
  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);
  _initialized = true;
  return true;
}

export function isPushConfigured(): boolean {
  const config = getConfig();
  return !!(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string | null {
  const config = getConfig();
  return config.VAPID_PUBLIC_KEY ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const logger = getLogger();
  if (!initPush()) return 0;

  const db = getDb();
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return 0;

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, JSON.stringify(payload));
      sent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Subscription expired or invalid — remove it
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        logger.info({ subId: sub.id }, 'Removed stale push subscription');
      } else {
        logger.error({ subId: sub.id, error: err }, 'Failed to send push notification');
      }
    }
  }
  return sent;
}
