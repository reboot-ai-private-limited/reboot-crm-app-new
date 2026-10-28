import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { api } from './api';
import { markNotificationRead, refreshUnreadCount } from './notifications';

/**
 * Push notifications (Firebase Cloud Messaging). The backend sends a push for the alerts that matter on the phone (new lead,
 * follow-up due, meeting starting...; see PUSH_TYPES in the backend). This file registers the phone's FCM token after login,
 * removes it on log out, and opens the lead or customer when a push is tapped.
 *
 * Push needs a development or release build: Expo Go on Android has no remote push, so there it quietly does nothing.
 */

const TOKEN_KEY = 'pushToken';
const CHANNEL_ID = 'default'; // the same id the backend sends and app.json sets as the default channel

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// While the app is open, still show the banner (the Alerts list refreshes on its own).
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function sendToken(token: string) {
  await api('/notifications/devices', { method: 'POST', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/** Asks for permission (once) and registers this phone. Never throws: without push the app works as before. */
export async function registerForPush() {
  if (isExpoGo || Platform.OS === 'web') return;
  try {
    // Android 13+: the channel must exist before asking, or the permission prompt never shows.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return;

    const { data } = await Notifications.getDevicePushTokenAsync();
    if (typeof data === 'string' && data) await sendToken(data);
  } catch (e) {
    console.warn('[Push] could not register this phone:', (e as Error).message);
  }
}

/** Log out: this phone stops getting the person's pushes. Call it while still signed in (the API needs the token). */
export async function unregisterPush() {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;
    await api('/notifications/devices/remove', { method: 'POST', body: { token } }).catch(() => undefined);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Nothing to do: the backend drops tokens it can't deliver to.
  }
}

type PushData = { notificationId?: string; leadId?: string; customerId?: string };

/** The data the backend put on the push. On Android a tap on a background push can carry it on the FCM message instead. */
function pushData(response: Notifications.NotificationResponse): PushData {
  const { content, trigger } = response.notification.request;
  const remote = (trigger as { remoteMessage?: { data?: Record<string, string> } } | null)?.remoteMessage?.data;
  return { ...(remote ?? {}), ...((content.data ?? {}) as PushData) };
}

// The last tap handled, so a remount (or the hook's stored value) never opens the same screen twice.
let handledTap: string | null = null;

function openFromPush(response: Notifications.NotificationResponse) {
  const id = response.notification.request.identifier;
  if (handledTap === id) return;
  handledTap = id;

  const data = pushData(response);
  if (data.notificationId) markNotificationRead(data.notificationId).then(refreshUnreadCount).catch(() => {});
  if (data.leadId) router.push({ pathname: '/lead/[id]', params: { id: data.leadId } });
  else if (data.customerId) router.push({ pathname: '/customers/[id]', params: { id: data.customerId } });
  else router.push('/alerts');
}

/** Mounted once while signed in: registers the phone, keeps the token fresh, and handles taps (also the tap that opened the app). */
export function usePushNotifications() {
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    registerForPush();
    if (isExpoGo) return;
    // FCM can replace the token at any time; send the new one.
    const tokenSub = Notifications.addPushTokenListener(({ data }) => {
      if (typeof data === 'string' && data) sendToken(data).catch(() => {});
    });
    // A push arrived while the app is open: update the badge now.
    const receivedSub = Notifications.addNotificationReceivedListener(() => refreshUnreadCount());
    return () => {
      tokenSub.remove();
      receivedSub.remove();
    };
  }, []);

  useEffect(() => {
    if (lastResponse && lastResponse.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) openFromPush(lastResponse);
  }, [lastResponse]);
}
