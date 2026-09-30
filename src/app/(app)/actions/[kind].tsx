import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { Card, Header, Row } from '@/components/ui/layout';
import { ACTION_INFO, ACTION_KINDS, ACTION_LOADERS, ActionKind, ActionResult } from '@/lib/actions';
import { colors } from '@/theme';

// One "Action required" list; each row opens the lead, customer or employee to act on.
export default function ActionList() {
  const router = useRouter();
  const { kind: raw } = useLocalSearchParams<{ kind: string }>();
  const kind = (ACTION_KINDS as readonly string[]).includes(raw) ? (raw as ActionKind) : 'followups';
  const info = ACTION_INFO[kind];

  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let stale = false;
    ACTION_LOADERS[kind]()
      .then((r) => {
        if (stale) return;
        setResult(r);
        setError('');
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message);
      })
      .finally(() => {
        if (!stale) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      stale = true;
    };
  }, [kind, reloadKey]);

  const reload = () => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
  };

  const items = result?.items ?? [];
  const more = result ? result.total - items.length : 0;
  const subtitle = loading ? 'Loading…' : [info.hint, result?.note].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header title={info.title} subtitle={subtitle} back />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />}>
          {error ? (
            <Card borderColor="danger">
              <Row>
                <Icon name="alert" size={18} color="danger" />
                <AppText color="danger" style={{ flex: 1 }}>
                  {error}
                </AppText>
                <AppText color="primary" weight="600" onPress={reload}>
                  Retry
                </AppText>
              </Row>
            </Card>
          ) : items.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="check" size={32} color="success" />
              <AppText color="textMuted" align="center">
                All clear. Nothing needs action here.
              </AppText>
            </View>
          ) : (
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {items.map((it, i) => (
                <Pressable key={it.id} onPress={() => router.push(it.target)} style={[styles.row, i > 0 && styles.divider]}>
                  <Row>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText weight="600" numberOfLines={1}>
                      {it.title}
                    </AppText>
                    {it.subtitle ? (
                      <AppText variant="caption" color="textMuted" numberOfLines={2}>
                        {it.subtitle}
                      </AppText>
                    ) : null}
                  </View>
                  {it.meta ? (
                    <AppText variant="label" weight="600" color={it.metaTone ?? 'textMuted'}>
                      {it.meta}
                    </AppText>
                  ) : null}
                  <Icon name="chevR" size={16} color="textSubtle" />
                  </Row>
                </Pressable>
              ))}
            </Card>
          )}
          {more > 0 ? (
            <AppText variant="caption" color="textSubtle" align="center">
              Showing the first {items.length} of {result?.total}. Open Leads on the web for the full list.
            </AppText>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 8, paddingBottom: 40, gap: 12, flexGrow: 1 },
  row: { paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
});
