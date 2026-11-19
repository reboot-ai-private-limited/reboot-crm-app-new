import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
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

// Loaded only where push works: in Expo Go merely importing expo-notifications crashes ("Cannot find native module
// 'ExpoTopicSubscriptionModule'"), so the module is required here instead of imported at the top.
const Notifications: typeof NotificationsModule | null =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  isExpoGo || Platform.OS === 'web' ? null : (require('expo-notifications') as typeof NotificationsModule);

// While the app is open, still show the banner (the Alerts list refreshes on its own).
Notifications?.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// iOS: getDevicePushTokenAsync returns a raw APNs token, which FCM (the backend sender) rejects. Firebase Messaging swaps it for
// an FCM token. Android keeps the expo-notifications token, which already is an FCM token. Same Expo Go guard as above.
// Loaded defensively: if the native Firebase module is missing or not configured, push is skipped instead of crashing the app.
function loadFirebaseMessaging(): typeof import('@react-native-firebase/messaging') | null {
  if (!Notifications || Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-firebase/messaging');
  } catch (e) {
    console.warn('[Push] Firebase Messaging is not available:', (e as Error).message);
    return null;
  }
}
const firebaseMessaging = loadFirebaseMessaging();

/** The token the backend can send to: FCM on both platforms. */
async function getPushToken(): Promise<string | null> {
  if (firebaseMessaging) {
    const messaging = firebaseMessaging.getMessaging();
    await firebaseMessaging.registerDeviceForRemoteMessages(messaging);
    return (await firebaseMessaging.getToken(messaging)) || null;
  }
  const { data } = await Notifications!.getDevicePushTokenAsync();
  return typeof data === 'string' && data ? data : null;
}

async function sendToken(token: string) {
  await api('/notifications/devices', { method: 'POST', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/** Asks for permission (once) and registers this phone. Never throws: without push the app works as before. */
export async function registerForPush() {
  if (!Notifications) return;
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

    const token = await getPushToken();
    if (token) await sendToken(token);
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
function pushData(response: NotificationsModule.NotificationResponse): PushData {
  const { content, trigger } = response.notification.request;
  const remote = (trigger as { remoteMessage?: { data?: Record<string, string> } } | null)?.remoteMessage?.data;
  return { ...(remote ?? {}), ...((content.data ?? {}) as PushData) };
}

// The last tap handled, so a remount (or the stored last response) never opens the same screen twice.
let handledTap: string | null = null;

function openFromPush(response: NotificationsModule.NotificationResponse) {
  if (response.actionIdentifier !== Notifications?.DEFAULT_ACTION_IDENTIFIER) return;
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
  useEffect(() => {
    if (!Notifications) return;
    registerForPush();
    // The tap that opened the app from a closed state.
    const opened = Notifications.getLastNotificationResponse();
    if (opened) openFromPush(opened);
    // FCM can replace the token at any time; send the new one.
    let tokenSub: { remove: () => void } = { remove: () => {} };
    try {
      tokenSub = firebaseMessaging
        ? { remove: firebaseMessaging.onTokenRefresh(firebaseMessaging.getMessaging(), (token) => sendToken(token).catch(() => {})) }
        : Notifications.addPushTokenListener(({ data }) => {
            if (typeof data === 'string' && data) sendToken(data).catch(() => {});
          });
    } catch (e) {
      console.warn('[Push] could not watch for token changes:', (e as Error).message);
    }
    // A push arrived while the app is open: update the badge now.
    const receivedSub = Notifications.addNotificationReceivedListener(() => refreshUnreadCount());
    // A push tapped while the app is running.
    const tapSub = Notifications.addNotificationResponseReceivedListener(openFromPush);
    return () => {
      tokenSub.remove();
      receivedSub.remove();
      tapSub.remove();
    };
  }, []);
}
