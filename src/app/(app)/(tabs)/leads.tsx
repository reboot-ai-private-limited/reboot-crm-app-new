import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Avatar, Card, Field, FilterChips, Header, IconButton, Row } from '@/components/ui/layout';
import { FilterOption, MultiSelectFilter } from '@/components/ui/MultiSelectFilter';
import { Sheet } from '@/components/ui/Sheet';
import { PRIORITY_TONE, statusTone } from '@/components/leads/meta';
import { fetchAllLeads, Lead, LEAD_STATUSES, reassignLeads, statusLabel, titleCase } from '@/lib/leads';
import { dialDigits } from '@/lib/phone';
import { EmployeeOption, fetchEmployees } from '@/lib/reporting';
import { useAuth } from '@/store/auth';
import { ColorName, colors } from '@/theme';

const PRIORITIES = ['HOT', 'WARM', 'COLD'] as const;
const NO_USERS: string[] = [];

/** One option per distinct value found in the leads, with how many leads have it. */
function optionsFrom(values: (string | undefined | null)[], label: (v: string) => string, order?: readonly string[]): FilterOption[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  const keys = [...counts.keys()];
  keys.sort(order ? (a, b) => order.indexOf(a) - order.indexOf(b) : (a, b) => label(a).localeCompare(label(b)));
  return keys.map((value) => ({ value, label: label(value), count: counts.get(value) }));
}

/** Id and name of the employee a lead is assigned to (the API populates `assignedTo` with the name). */
function ownerOf(l: Lead): { id: string; name: string } | null {
  const a = l.assignedTo;
  if (!a) return null;
  if (typeof a === 'string') return { id: a, name: 'Unknown user' };
  return { id: a._id, name: a.fullName || 'Unknown user' };
}

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const ROLE_LABEL: Record<string, string> = { Admin: 'Admin', BusinessAdvisor: 'Business Advisor', FieldSales: 'Field Sales' };

/**
 * `now` is captured when the list loads (render must stay pure). In selection mode (Admin) a tick circle shows first and
 * `owner` (Admin → All leads) names who holds the lead.
 */
function LeadRow({ lead, now, onPress, onLongPress, selecting, selected, owner }: { lead: Lead; now: number; onPress: () => void; onLongPress?: () => void; selecting?: boolean; selected?: boolean; owner?: string }) {
  const [fg, bg] = statusTone(lead.status);
  const name = lead.companyName || lead.contactName || 'Unnamed lead';
  const sub = [lead.contactName, titleCase(lead.city), owner ? `Owner: ${owner}` : ''].filter(Boolean).join(' · ');
  const nextAction = formatDate(lead.nextActionDate);
  const overdue = !!lead.nextActionDate && new Date(lead.nextActionDate).getTime() < now;
  const [pfg, pbg]: [ColorName, ColorName] = lead.priority ? PRIORITY_TONE[lead.priority] : ['slate', 'slateSoft'];

  return (
    <Card style={{ gap: 10, ...(selected ? { borderColor: colors.primary, backgroundColor: colors.primarySoft } : null) }} onPress={onPress} onLongPress={onLongPress}>
      <Row>
        {selecting ? (
          <View style={[styles.tick, selected ? { backgroundColor: colors.primary, borderColor: colors.primary } : null]}>{selected ? <Icon name="check" size={14} color="surface" /> : null}</View>
        ) : null}
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
        {lead.mobile ? (
          <Pressable onPress={() => Linking.openURL(`tel:+${dialDigits(lead)}`)} style={styles.call} hitSlop={8}>
            <Icon name="phone" size={16} color="success" />
          </Pressable>
        ) : null}
      </Row>
      <Row gap={8}>
        <View style={[styles.chip, { backgroundColor: colors[bg] }]}>
          <AppText variant="caption" weight="500" color={fg}>
            {statusLabel(lead.status)}
          </AppText>
        </View>
        {lead.priority ? (
          <View style={[styles.chip, { backgroundColor: colors[pbg] }]}>
            <AppText variant="caption" weight="600" color={pfg}>
              {lead.priority}
            </AppText>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {nextAction ? (
          <>
            <Icon name="clock" size={14} color={overdue ? 'danger' : 'textSubtle'} />
            <AppText variant="caption" color={overdue ? 'danger' : 'textMuted'} weight={overdue ? '600' : '400'}>
              {nextAction}
            </AppText>
          </>
        ) : lead.category ? (
          <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ maxWidth: 140 }}>
            {lead.category}
          </AppText>
        ) : null}
      </Row>
    </Card>
  );
}

export default function LeadsScreen() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [statusSel, setStatusSel] = useState<string[]>([]);
  const [prioritySel, setPrioritySel] = useState<string[]>([]);
  const [citySel, setCitySel] = useState<string[]>([]);
  // 'yes' = has a website, 'no' = none. Ticking both is the same as no filter.
  const [websiteSel, setWebsiteSel] = useState<string[]>([]);
  // Admin → All leads only: show the leads of the selected users.
  const [userSel, setUserSel] = useState<string[]>([]);
  // Admin: My leads (assigned to the admin), All leads (everyone's), Pool. Employees: My leads, Pool.
  const [scope, setScope] = useState<string>(isAdmin ? 'All leads' : 'My leads');
  const pool = scope === 'Pool';
  const allScope = isAdmin && scope === 'All leads';
  const scopes = isAdmin ? ['My leads', 'All leads', 'Pool'] : ['My leads', 'Pool'];

  // Every lead of the current scope (search + pool/mine); the three dropdown filters are applied on top.
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // Reference time for 'overdue', refreshed with each response.
  const [now, setNow] = useState(() => new Date().getTime());
  const requestId = useRef(0);
  // The list is 'loading' until a response for the current search/role has arrived.
  const key = `${scope}|${query}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== key;

  // Admin only: pick leads, then give them to an employee (or back to the pool).
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  // undefined = nothing chosen yet, null = the lead pool, otherwise an employee id.
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [notice, setNotice] = useState('');

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
        const res = await fetchAllLeads({ admin: allScope, pool, search: query });
        if (id !== requestId.current) return; // a newer search superseded this one
        setAllLeads(res);
        setNow(new Date().getTime());
      } catch (e) {
        if (id === requestId.current) setError((e as Error).message);
      } finally {
        if (id === requestId.current) {
          setLoadedKey(key);
          setRefreshing(false);
        }
      }
    },
    [allScope, pool, query, key],
  );

  // (Re)load whenever the search or role changes. State is only set after the await.
  useEffect(() => {
    const id = ++requestId.current;
    fetchAllLeads({ admin: allScope, pool, search: query })
      .then((res) => {
        if (id !== requestId.current) return;
        setAllLeads(res);
        setNow(new Date().getTime());
        setError('');
      })
      .catch((e: Error) => {
        if (id === requestId.current) setError(e.message);
      })
      .finally(() => {
        if (id === requestId.current) setLoadedKey(key);
      });
  }, [allScope, pool, query, key]);

  // Coming back from Add / Details: quietly refresh page 1 so new or changed leads show up.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      load('refresh');
    }, [load]),
  );

  // Dropdown options come from the leads that are actually there.
  const statusOptions = useMemo(() => optionsFrom(allLeads.map((l) => l.status), statusLabel, LEAD_STATUSES), [allLeads]);
  const priorityOptions = useMemo(() => optionsFrom(allLeads.map((l) => l.priority), (v) => v, PRIORITIES), [allLeads]);
  const cityOptions = useMemo(() => optionsFrom(allLeads.map((l) => l.city?.trim().toLowerCase()), titleCase), [allLeads]);
  const websiteOptions = useMemo<FilterOption[]>(() => {
    const withSite = allLeads.filter((l) => !!l.website).length;
    return [
      { value: 'yes', label: 'Has website', count: withSite },
      { value: 'no', label: 'No website', count: allLeads.length - withSite },
    ];
  }, [allLeads]);
  const userOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const l of allLeads) {
      const o = ownerOf(l);
      if (o) names.set(o.id, o.name);
    }
    return optionsFrom(allLeads.map((l) => ownerOf(l)?.id), (id) => names.get(id) ?? id);
  }, [allLeads]);

  // The user filter only exists (and only applies) in Admin → All leads.
  const activeUserSel = allScope ? userSel : NO_USERS;

  // Within a dropdown any ticked value matches; across dropdowns all must match.
  const leads = useMemo(
    () =>
      allLeads.filter(
        (l) =>
          (statusSel.length === 0 || statusSel.includes(l.status)) &&
          (prioritySel.length === 0 || (!!l.priority && prioritySel.includes(l.priority))) &&
          (citySel.length === 0 || citySel.includes(l.city?.trim().toLowerCase() ?? '')) &&
          (websiteSel.length === 0 || websiteSel.includes(l.website ? 'yes' : 'no')) &&
          (activeUserSel.length === 0 || activeUserSel.includes(ownerOf(l)?.id ?? '')),
      ),
    [allLeads, statusSel, prioritySel, citySel, websiteSel, activeUserSel],
  );
  const total = leads.length;
  const filtering = statusSel.length + prioritySel.length + citySel.length + websiteSel.length + activeUserSel.length > 0;

  // --- reassign (Admin) ---
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // A long press starts selecting with that lead ticked.
  const startWith = (id: string) => {
    setSelecting(true);
    setSelected(new Set([id]));
  };
  const allShownSelected = leads.length > 0 && leads.every((l) => selected.has(l._id));
  const changeScope = (v: string) => {
    setScope(v);
    stopSelecting();
  };

  // The notice goes away by itself.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const openReassign = () => {
    setTarget(undefined);
    setSheetError('');
    setSheetOpen(true);
    if (employees.length === 0) {
      fetchEmployees()
        .then((list) => setEmployees(list.filter((e) => e.status === 'Active')))
        .catch((e: Error) => setSheetError(e.message));
    }
  };

  const confirmReassign = async () => {
    if (target === undefined) return;
    setSaving(true);
    setSheetError('');
    try {
      const { count } = await reassignLeads([...selected], target);
      const who = target === null ? 'the lead pool' : (employees.find((e) => e.id === target)?.fullName ?? 'the employee');
      setSheetOpen(false);
      stopSelecting();
      setNotice(`${count} ${count === 1 ? 'lead' : 'leads'} moved to ${who}`);
      await load('refresh');
    } catch (e) {
      setSheetError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header
        title={pool ? 'Lead pool' : scope}
        subtitle={selecting ? `${selected.size} selected` : loading ? 'Loading…' : `${total} ${total === 1 ? 'lead' : 'leads'}`}
        right={
          <Row gap={8}>
            {isAdmin ? <IconButton icon={selecting ? 'x' : 'check'} onPress={() => (selecting ? stopSelecting() : setSelecting(true))} /> : null}
            <IconButton icon="clock" onPress={() => router.push('/followups')} />
          </Row>
        }
      />
      {notice ? (
        <View style={styles.notice}>
          <Icon name="check" size={16} color="success" />
          <AppText variant="label" color="success" weight="600" style={{ flex: 1 }}>
            {notice}
          </AppText>
        </View>
      ) : null}
      <View style={styles.controls}>
        <FilterChips items={scopes} value={scope} onChange={changeScope} />
        <Field icon="search" placeholder="Search name, company or phone" value={search} onChangeText={setSearch} />
        {/* One row, side by side. Compact buttons so Status, Priority, City and Website fit; swipe sideways for more (User). */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <MultiSelectFilter compact label="Status" options={statusOptions} selected={statusSel} onChange={setStatusSel} />
          <MultiSelectFilter compact label="Priority" options={priorityOptions} selected={prioritySel} onChange={setPrioritySel} />
          <MultiSelectFilter compact label="City" options={cityOptions} selected={citySel} onChange={setCitySel} />
          <MultiSelectFilter compact label="Website" options={websiteOptions} selected={websiteSel} onChange={setWebsiteSel} />
          {allScope ? <MultiSelectFilter compact label="User" options={userOptions} selected={userSel} onChange={setUserSel} /> : null}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(l) => l._id}
          extraData={selected}
          renderItem={({ item }) => (
            <LeadRow
              lead={item}
              now={now}
              selecting={selecting}
              selected={selected.has(item._id)}
              owner={allScope ? (ownerOf(item)?.name ?? 'Not assigned') : undefined}
              onPress={() => (selecting ? toggle(item._id) : router.push({ pathname: '/lead/[id]', params: { id: item._id } }))}
              onLongPress={isAdmin && !selecting ? () => startWith(item._id) : undefined}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name={error ? 'alert' : 'users'} size={32} color={error ? 'danger' : 'textSubtle'} />
              <AppText color={error ? 'danger' : 'textMuted'} align="center">
                {error || (query || filtering ? 'No leads match your search.' : pool ? 'The lead pool is empty.' : allScope ? 'No leads assigned yet.' : 'No leads assigned to you yet.')}
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

      {selecting ? (
        <View style={styles.bar}>
          <Pressable onPress={() => setSelected(allShownSelected ? new Set() : new Set(leads.map((l) => l._id)))} hitSlop={8}>
            <AppText variant="label" color="primary" weight="600">
              {allShownSelected ? 'Clear' : `Select all ${total}`}
            </AppText>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Button label={selected.size ? `Reassign ${selected.size}` : 'Reassign'} icon="users" small disabled={selected.size === 0} onPress={openReassign} />
        </View>
      ) : (
        <Pressable onPress={() => router.push('/lead/new')} style={styles.fab} accessibilityLabel="Add lead">
          <Icon name="plus" size={26} color="surface" />
        </Pressable>
      )}

      {/* Who gets the leads: an employee, or the pool (nobody). */}
      <Sheet visible={sheetOpen} title="Reassign leads" onClose={() => !saving && setSheetOpen(false)}>
        <AppText variant="caption" color="textMuted">
          Move {selected.size} {selected.size === 1 ? 'lead' : 'leads'} to:
        </AppText>
        <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
          {[{ id: null as string | null, name: 'Lead pool', sub: 'No owner: anyone can claim it' }, ...employees.map((e) => ({ id: e.id as string | null, name: e.fullName, sub: ROLE_LABEL[e.role] ?? e.role }))].map((o) => {
            const on = target === o.id;
            return (
              <Pressable key={o.id ?? 'pool'} onPress={() => setTarget(o.id)} style={[styles.option, on ? { borderColor: colors.primary, backgroundColor: colors.primarySoft } : null]}>
                <View style={[styles.radio, on ? { borderColor: colors.primary } : null]}>{on ? <View style={styles.radioDot} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <AppText weight="600">{o.name}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {o.sub}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        {sheetError ? (
          <AppText variant="label" color="danger">
            {sheetError}
          </AppText>
        ) : null}
        <Button label={saving ? 'Saving…' : `Reassign ${selected.size} ${selected.size === 1 ? 'lead' : 'leads'}`} loading={saving} disabled={target === undefined} onPress={confirmReassign} />
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  controls: { paddingHorizontal: 20, gap: 12, paddingBottom: 12 },  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, elevation: 4, shadowColor: '#0F172A', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  list: { paddingHorizontal: 20, paddingBottom: 96, gap: 12, flexGrow: 1 },
  call: { padding: 9, borderRadius: 10, backgroundColor: colors.successSoft },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.successSoft },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
