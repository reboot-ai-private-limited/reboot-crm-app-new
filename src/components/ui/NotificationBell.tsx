import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/Icon';
import {
  AppNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  setUnreadCount,
  timeAgo,
  useUnreadCount,
} from '@/lib/notifications';
import { colors, radius } from '@/theme';

const PREVIEW_LIMIT = 8;

export function NotificationBell() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const unread = useUnreadCount(true);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchNotifications({ unread: false, page: 1 });
      setItems((res.data || []).slice(0, PREVIEW_LIMIT));
      setUnreadCount(res.unread);
    } catch {
      // Keep existing items if fetch fails
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadPreview();
    }
  }, [open, loadPreview]);

  const handleOpenItem = async (n: AppNotification) => {
    if (!n.readAt) {
      setItems((prev) =>
        prev.map((it) => (it._id === n._id ? { ...it, readAt: new Date().toISOString() } : it))
      );
      void markNotificationRead(n._id).catch(() => {});
      setUnreadCount(Math.max(0, unread - 1));
    }
    setOpen(false);

    if (n.leadId?._id) {
      router.push({ pathname: '/lead/[id]', params: { id: n.leadId._id } });
    } else if (n.customerId?._id) {
      router.push({ pathname: '/customers/[id]', params: { id: n.customerId._id } });
    } else if (n.meetingId) {
      router.push('/all-meetings');
    }
  };

  const handleMarkAll = async () => {
    if (markingAll || unread === 0) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((it) => ({ ...it, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      // Ignore
    } finally {
      setMarkingAll(false);
    }
  };

  const handleViewAll = () => {
    setOpen(false);
    router.push('/alerts');
  };

  return (
    <View style={styles.wrapper}>
      {/* Bell Button */}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={styles.bellButton}
        activeOpacity={0.7}
        accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Icon name="bell" size={22} color="textMuted" />
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Dropdown Modal matching Screenshot exactly */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          {/* Backdrop dismiss */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />

          {/* Floating Dropdown Card */}
          <View style={[styles.card, { marginTop: insets.top + (Platform.OS === 'ios' ? 44 : 52) }]}>
            {/* Header: Notifications + Mark all read */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Notifications</Text>
              <TouchableOpacity
                onPress={handleMarkAll}
                disabled={markingAll || unread === 0}
                style={styles.markAllBtn}
                activeOpacity={0.6}
              >
                <Text
                  style={[
                    styles.markAllText,
                    (!unread || markingAll) && styles.markAllDisabled,
                  ]}
                >
                  ✓ Mark all read
                </Text>
              </TouchableOpacity>
            </View>

            {/* Notification Items List */}
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={true}
            >
              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color={colors.primary} size="small" />
                </View>
              ) : items.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>You&apos;re all caught up.</Text>
                </View>
              ) : (
                items.map((item, index) => {
                  const isUnread = !item.readAt;
                  return (
                    <TouchableOpacity
                      key={item._id}
                      onPress={() => void handleOpenItem(item)}
                      activeOpacity={0.7}
                      style={[
                        styles.itemRow,
                        isUnread && styles.itemRowUnread,
                        index === items.length - 1 && styles.itemRowLast,
                      ]}
                    >
                      {/* Red dot for unread notification */}
                      <View style={styles.dotContainer}>
                        {isUnread ? <View style={styles.redDot} /> : <View style={styles.dotPlaceholder} />}
                      </View>

                      {/* Content */}
                      <View style={styles.itemContent}>
                        <Text
                          style={[styles.itemTitle, isUnread && styles.itemTitleUnread]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        {Boolean(item.body) && (
                          <Text style={styles.itemBody} numberOfLines={2}>
                            {item.body}
                          </Text>
                        )}
                        <Text style={styles.itemTime}>{timeAgo(item.createdAt)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {/* Bottom Footer: View all notifications */}
            <TouchableOpacity
              onPress={handleViewAll}
              activeOpacity={0.7}
              style={styles.footer}
            >
              <Text style={styles.footerText}>View all notifications</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    paddingHorizontal: 16,
    alignItems: 'flex-end',
  },
  card: {
    width: '100%',
    maxWidth: 375,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  markAllBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  markAllText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#2F80FF',
  },
  markAllDisabled: {
    color: '#94A3B8',
  },
  list: {
    maxHeight: 380,
  },
  listContent: {
    flexGrow: 1,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  itemRowUnread: {
    backgroundColor: 'rgba(47, 128, 255, 0.02)',
  },
  itemRowLast: {
    borderBottomWidth: 0,
  },
  dotContainer: {
    width: 14,
    paddingTop: 6,
    alignItems: 'flex-start',
  },
  redDot: {
    width: 7.5,
    height: 7.5,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  dotPlaceholder: {
    width: 7.5,
    height: 7.5,
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#334155',
  },
  itemTitleUnread: {
    fontWeight: '700',
    color: '#0F172A',
  },
  itemBody: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginTop: 1,
  },
  itemTime: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  footerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2F80FF',
  },
});
