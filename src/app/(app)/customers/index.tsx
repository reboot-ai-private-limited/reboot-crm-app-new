import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { Avatar, Card, Field, Header, Row } from '@/components/ui/layout';
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter';
import { CustomerRow, fetchAllCustomers, rmName, rupees } from '@/lib/customers';
import { titleCase } from '@/lib/leads';
import { dialDigits } from '@/lib/phone';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

function CustomerCard({ customer, onPress }: { customer: CustomerRow; onPress: () => void }) {
  const name = customer.businessName || customer.contactName;
  const sub = [customer.contactName, titleCase(customer.city)].filter(Boolean).join(' · ');
  const services = customer.services.map((s) => s.name).join(', ');
  const due = customer.totalReceivable > 0;

  return (
    <Card style={{ gap: 10 }} onPress={onPress}>
      <Row>
        <Avatar name={name} size={40} />
        <View style={{ flex: 1 }}>
          <AppText variant="section" numberOfLines={1}>
            {name}
          </AppText>
          {sub ? (
            <AppText variant="label" color="textMuted" weight="400" numberOfLines={1}>
              {sub}
            </AppText>
          ) : null}
        </View>
        {customer.mobile ? (
          <Pressable onPress={() => Linking.openURL(`tel:+${dialDigits(customer)}`)} style={styles.call} hitSlop={8}>
            <Icon name="phone" size={16} color="success" />
          </Pressable>
        ) : null}
      </Row>
      {services ? (
        <AppText variant="label" color="textMuted" weight="400" numberOfLines={1}>
          {services}
        </AppText>
      ) : null}
      <Row gap={8}>
        <View style={[styles.chip, { backgroundColor: colors.successSoft }]}>
          <AppText variant="caption" weight="600" color="success">
            Paid {rupees(customer.totalPaid)}
          </AppText>
        </View>
        <View style={[styles.chip, { backgroundColor: due ? colors.warningSoft : colors.slateSoft }]}>
          <AppText variant="caption" weight="600" color={due ? 'warning' : 'slate'}>
            Due {rupees(customer.totalReceivable)}
          </AppText>
        </View>
      </Row>
    </Card>
  );
}

export default function CustomersScreen() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  // Admin: filter by the employee(s) the customers belong to.
  const [employeeSel, setEmployeeSel] = useState<string[]>([]);

  // Every customer matching the search; the employee filter is applied on top.
  const [allCustomers, setAllCustomers] = useState<CustomerRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  // The list is 'loading' until a response for the current search has arrived.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== query;

  // Debounce typing so we don't hit the API on every key.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const id = ++requestId.current;
      if (mode === 'refresh') setRefreshing(true);
      setError('');
      try {
        const res = await fetchAllCustomers({ search: query });
        if (id !== requestId.current) return; // a newer search superseded this one
        setAllCustomers(res);
      } catch (e) {
        if (id === requestId.current) setError((e as Error).message);
      } finally {
        if (id === requestId.current) {
          setLoadedKey(query);
          setRefreshing(false);
        }
      }
    },
    [query],
  );

  // (Re)load whenever the search changes. State is only set after the await.
  useEffect(() => {
    const id = ++requestId.current;
    fetchAllCustomers({ search: query })
      .then((res) => {
        if (id !== requestId.current) return;
        setAllCustomers(res);
        setError('');
      })
      .catch((e: Error) => {
        if (id === requestId.current) setError(e.message);
      })
      .finally(() => {
        if (id === requestId.current) setLoadedKey(query);
      });
  }, [query]);

  // Employee options come from the customers that are actually there.
  const employeeOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of allCustomers) if (c.assignedRM) names.set(c.assignedRM._id, rmName(c.assignedRM));
    const counts = new Map<string, number>();
    for (const c of allCustomers) if (c.assignedRM) counts.set(c.assignedRM._id, (counts.get(c.assignedRM._id) ?? 0) + 1);
    return [...names.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label, count: counts.get(value) }));
  }, [allCustomers]);

  const customers = useMemo(
    () => (employeeSel.length === 0 ? allCustomers : allCustomers.filter((c) => !!c.assignedRM && employeeSel.includes(c.assignedRM._id))),
    [allCustomers, employeeSel],
  );
  const total = customers.length;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header
        title={isAdmin ? 'All customers' : 'My customers'}
        subtitle={loading ? 'Loading…' : `${total} ${total === 1 ? 'customer' : 'customers'}`}
        back
      />
      <View style={styles.controls}>
        <Field icon="search" placeholder="Search name, business or phone" value={search} onChangeText={setSearch} />
        {isAdmin ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <MultiSelectFilter label="Employee" options={employeeOptions} selected={employeeSel} onChange={setEmployeeSel} />
          </ScrollView>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c) => c._id}
          renderItem={({ item }) => (
            <CustomerCard customer={item} onPress={() => router.push({ pathname: '/customers/[id]', params: { id: item._id } })} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name={error ? 'alert' : 'briefcase'} size={32} color={error ? 'danger' : 'textSubtle'} />
              <AppText color={error ? 'danger' : 'textMuted'} align="center">
                {error || (query || employeeSel.length > 0 ? 'No customers match your search.' : 'No customers yet. Close a deal on a lead to create one.')}
              </AppText>
              {error ? (
                <AppText color="primary" weight="600" onPress={() => load('initial')}>
                  Try again
                </AppText>
              ) : null}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  controls: { paddingHorizontal: 20, gap: 12, paddingBottom: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 12, flexGrow: 1 },
  call: { padding: 9, borderRadius: 10, backgroundColor: colors.successSoft },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
});
