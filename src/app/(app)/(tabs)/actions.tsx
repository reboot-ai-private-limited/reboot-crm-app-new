import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { Card, Header, IconBadge, Row } from '@/components/ui/layout';
import { ACTION_INFO, ACTION_KINDS, ACTION_LOADERS, ActionKind, ActionResult } from '@/lib/actions';
import { colors } from '@/theme';

type Results = Partial<Record<ActionKind, ActionResult | Error>>;

/** Load every check on its own so one failing API only affects its card. */
async function loadAll(): Promise<Results> {
  const settled = await Promise.allSettled(ACTION_KINDS.map((k) => ACTION_LOADERS[k]()));
  return Object.fromEntries(ACTION_KINDS.map((k, i) => [k, settled[i].status === 'fulfilled' ? settled[i].value : (settled[i].reason as Error)]));
}

function ActionCard({ kind, result, onPress }: { kind: ActionKind; result?: ActionResult | Error; onPress: () => void }) {
  const info = ACTION_INFO[kind];
  const failed = result instanceof Error;
  const total = !result || failed ? 0 : result.total;
  const clear = !failed && total === 0;
  return (
    <Card onPress={clear ? undefined : onPress} borderColor={!clear && !failed && info.tone === 'danger' ? 'danger' : undefined}>
      <Row>
        <IconBadge icon={info.icon} tone={clear ? 'success' : info.tone} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="600">{info.title}</AppText>
          <AppText variant="caption" color={failed ? 'danger' : 'textMuted'} numberOfLines={2}>
            {failed ? `Couldn't check: ${result.message}` : clear ? 'All clear' : [info.hint, result && !failed ? result.note : undefined].filter(Boolean).join(' · ')}
          </AppText>
        </View>
        {failed ? (
          <Icon name="alert" size={18} color="danger" />
        ) : clear ? (
          <Icon name="check" size={18} color="success" />
        ) : (
          <Row gap={6}>
            <View style={[styles.count, { backgroundColor: colors[`${info.tone}Soft`] }]}>
              <AppText weight="700" color={info.tone}>
                {total}
              </AppText>
            </View>
            <Icon name="chevR" size={16} color="textSubtle" />
          </Row>
        )}
      </Row>
    </Card>
  );
}

// Admin: only the things that need someone to act. Tap a card for the list.
export default function ActionRequired() {
  const router = useRouter();
  const [results, setResults] = useState<Results>({});
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setResults(await loadAll());
    setLoaded(true);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const open = ACTION_KINDS.reduce((n, k) => {
    const r = results[k];
    return n + (r && !(r instanceof Error) ? r.total : 0);
  }, 0);
  // Cards needing action first (red before amber), then the clear ones.
  const order = [...ACTION_KINDS].sort((a, b) => {
    const score = (k: ActionKind) => {
      const r = results[k];
      if (!r || r instanceof Error || r.total === 0) return 2;
      return ACTION_INFO[k].tone === 'danger' ? 0 : 1;
    };
    return score(a) - score(b);
  });

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header title="Action required" subtitle={!loaded ? 'Checking…' : open === 0 ? 'Nothing needs attention' : `${open} ${open === 1 ? 'item needs' : 'items need'} attention`} />
      {!loaded ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}>
          {order.map((k) => (
            <ActionCard key={k} kind={k} result={results[k]} onPress={() => router.push({ pathname: '/actions/[kind]', params: { kind: k } })} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 8, paddingBottom: 40, gap: 12 },
  count: { minWidth: 32, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, alignItems: 'center' },
});
