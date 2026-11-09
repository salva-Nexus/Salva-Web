import webpush from 'web-push';
import { User } from '../models/Users.js';

export async function sendAlertToUser(safe, title, messageText) {
  const user = await User.findOne({ safeAddress: safe });

  if (user && user.pushSubscription) {
    const payload = JSON.stringify({
      title: title,
      body: messageText,
    });

    try {
      await webpush.sendNotification(user.pushSubscription, payload, {
        TTL: 86400,
        urgency: 'high',
      });
      console.log('Push notification sent!');
    } catch (err) {
      console.error('Failed to send push:', err);
    }
  }
}
