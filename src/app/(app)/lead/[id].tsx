import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  eventDetail,
  eventMeta,
  PRIORITY_TONE,
  statusTone,
  timeAgo,
} from "@/components/leads/meta";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { DateTimeField, formatDateTime } from "@/components/ui/DateTimeField";
import { Icon, IconName } from "@/components/ui/Icon";
import {
  Avatar,
  Card,
  Field,
  Header,
  IconButton,
  Row,
} from "@/components/ui/layout";
import { Sheet } from "@/components/ui/Sheet";
import {
  Activity,
  addNote,
  changeStatus,
  CLOSED_STATUSES,
  fetchLead,
  Lead,
  LeadStatus,
  REASON_REQUIRED,
  setNextAction,
  STATUS_HINT,
  statusLabel,
  titleCase,
} from "@/lib/leads";
import { ColorName, colors } from "@/theme";

/** Which bottom sheet is open. The status sheet has two steps: the list, then reason / deal value when needed. */
type SheetKind = "note" | "nextAction" | "status" | null;

const needsDetails = (s: LeadStatus) =>
  REASON_REQUIRED.includes(s) || s === "DEAL_CLOSED";

function defaultNextAction(current?: string | null) {
  if (current) {
    const d = new Date(current);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(11, 0, 0, 0);
  return d;
}

function Pill({
  label,
  tone,
}: {
  label: string;
  tone: [ColorName, ColorName];
}) {
  return (
    <View style={[styles.chip, { backgroundColor: colors[tone[1]] }]}>
      <AppText variant="caption" weight="600" color={tone[0]}>
        {label}
      </AppText>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[styles.quick, disabled && { opacity: 0.4 }]}
    >
      <View style={styles.quickIcon}>
        <Icon name={icon} size={20} color="primary" />
      </View>
      <AppText variant="caption" weight="500">
        {label}
      </AppText>
    </Pressable>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <Row style={styles.infoRow}>
      <Icon name={icon} size={18} color="textSubtle" />
      <AppText
        variant="label"
        color="textMuted"
        weight="400"
        style={{ width: 92 }}
      >
        {label}
      </AppText>
      <AppText
        weight="500"
        style={{ flex: 1, fontSize: 14, textAlign: "right" }}
      >
        {value}
      </AppText>
    </Row>
  );
}

export default function LeadDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [allowed, setAllowed] = useState<LeadStatus[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [target, setTarget] = useState<LeadStatus | null>(null);
  // Status sheet step 2: asking for a reason / deal value for `target`.
  const [detailsStep, setDetailsStep] = useState(false);
  const [text, setText] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [date, setDate] = useState(() => defaultNextAction());
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [toast, setToast] = useState("");
  // Time reference for 'overdue' / 'in the future' checks; refreshed on load and when a sheet opens.
  const [now, setNow] = useState(() => new Date().getTime());

  const load = useCallback(async () => {
    try {
      const r = await fetchLead(id);
      setLead(r.lead);
      setActivities(r.activities);
      setAllowed(r.allowedNextStatuses ?? []);
      setNow(new Date().getTime());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  // Reload whenever the screen comes back into view (e.g. after editing).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const openSheet = (k: SheetKind, preset?: LeadStatus) => {
    setText(k === "nextAction" ? (lead?.nextActionNote ?? "") : "");
    setDealValue("");
    setSheetError("");
    setTarget(preset ?? null);
    setDetailsStep(false);
    setDate(
      defaultNextAction(k === "nextAction" ? lead?.nextActionDate : null),
    );
    setNow(new Date().getTime());
    setSheet(k);
  };

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setSaving(true);
    setSheetError("");
    try {
      await fn();
      setSheet(null);
      flash(done);
      await load();
    } catch (e) {
      setSheetError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /** From the status list: simple moves apply now; reason / deal value moves ask first. */
  const pickStatus = (s: LeadStatus) => {
    if (!lead) return;
    if (needsDetails(s)) {
      setTarget(s);
      setText("");
      setDealValue("");
      setSheetError("");
      setDetailsStep(true);
      return;
    }
    setTarget(s);
    run(
      () => changeStatus(lead._id, { status: s }),
      `Status changed to ${statusLabel(s)}`,
    );
  };

  const submitDetails = () => {
    if (!lead || !target) return;
    const value = Number(dealValue);
    run(
      () =>
        changeStatus(lead._id, {
          status: target,
          ...(REASON_REQUIRED.includes(target) ? { reason: text.trim() } : {}),
          ...(target === "DEAL_CLOSED" ? { dealValue: value } : {}),
        }),
      target === "DEAL_CLOSED"
        ? "Deal closed — customer created"
        : `Marked ${statusLabel(target).toLowerCase()}`,
    );
  };

  if (!lead) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <Header title="Lead details" back />
        <View style={styles.center}>
          {error ? (
            <>
              <AppText color="danger" align="center">
                {error}
              </AppText>
              <Button
                label="Try again"
                variant="outline"
                small
                onPress={load}
              />
            </>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const name = lead.companyName || lead.contactName || "Unnamed lead";
  const closed = CLOSED_STATUSES.includes(lead.status);
  const canChange = allowed.length > 0;
  const assignee =
    typeof lead.assignedTo === "object" && lead.assignedTo
      ? lead.assignedTo.fullName
      : undefined;
  const nextAction = lead.nextActionDate ? new Date(lead.nextActionDate) : null;
  const overdue = nextAction ? nextAction.getTime() < now : false;
  const outcome =
    lead.status === "DEAL_CLOSED" && lead.dealValue
      ? {
          tone: "success" as const,
          text: `Deal value ₹${lead.dealValue.toLocaleString("en-IN")}`,
        }
      : lead.status === "NOT_INTERESTED" && lead.lostReason
        ? { tone: "slate" as const, text: `Not interested: ${lead.lostReason}` }
        : lead.status === "INVALID" && lead.invalidReason
          ? { tone: "danger" as const, text: `Invalid: ${lead.invalidReason}` }
          : null;

  const valueNum = Number(dealValue);
  const detailsValid =
    target === "DEAL_CLOSED"
      ? valueNum > 0
      : !!target && REASON_REQUIRED.includes(target)
        ? text.trim().length >= 2
        : false;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <Header
        title="Lead details"
        back
        right={
          <IconButton
            icon="edit"
            onPress={() =>
              router.push({
                pathname: "/lead/edit/[id]",
                params: { id: lead._id },
              })
            }
          />
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        {/* Summary */}
        <Card style={{ gap: 14 }}>
          <Row>
            <Avatar name={name} size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="section" style={{ fontSize: 19 }}>
                {name}
              </AppText>
              <AppText variant="label" color="textMuted" weight="400">
                {[lead.contactName, titleCase(lead.city)]
                  .filter(Boolean)
                  .join(" · ")}
              </AppText>
            </View>
          </Row>
          <Row gap={8} style={{ flexWrap: "wrap" }}>
            {/* Status chip opens the status picker (only allowed moves). */}
            <Pressable
              onPress={canChange ? () => openSheet("status") : undefined}
              style={[
                styles.chip,
                styles.statusChip,
                { backgroundColor: colors[statusTone(lead.status)[1]] },
              ]}
              hitSlop={6}
            >
              <AppText
                variant="caption"
                weight="600"
                color={statusTone(lead.status)[0]}
              >
                {statusLabel(lead.status)}
              </AppText>
              {canChange ? (
                <Icon
                  name="chevD"
                  size={14}
                  color={statusTone(lead.status)[0]}
                />
              ) : null}
            </Pressable>
            {lead.priority ? (
              <Pill label={lead.priority} tone={PRIORITY_TONE[lead.priority]} />
            ) : null}
            {lead.category ? (
              <Pill label={lead.category} tone={["slate", "slateSoft"]} />
            ) : null}
            {lead.source ? (
              <Pill
                label={`Source: ${lead.source.replace("_", " ")}`}
                tone={["slate", "slateSoft"]}
              />
            ) : null}
          </Row>
          <Row gap={0} style={styles.quickRow}>
            <QuickAction
              icon="phone"
              label="Call"
              disabled={!lead.mobile}
              onPress={() => Linking.openURL(`tel:${lead.mobile}`)}
            />
            <QuickAction
              icon="chat"
              label="WhatsApp"
              disabled={!lead.mobile}
              onPress={() => Linking.openURL(`https://wa.me/91${lead.mobile}`)}
            />
            <QuickAction
              icon="mail"
              label="Email"
              disabled={!lead.email}
              onPress={() => Linking.openURL(`mailto:${lead.email}`)}
            />
            <QuickAction
              icon="edit"
              label="Note"
              onPress={() => openSheet("note")}
            />
          </Row>
        </Card>

        {/* Outcome of a closed lead */}
        {outcome ? (
          <Row
            style={[
              styles.banner,
              { backgroundColor: colors[`${outcome.tone}Soft` as ColorName] },
            ]}
          >
            <Icon
              name={outcome.tone === "success" ? "check" : "alert"}
              size={18}
              color={outcome.tone}
            />
            <AppText weight="500" color={outcome.tone} style={{ flex: 1 }}>
              {outcome.text}
            </AppText>
          </Row>
        ) : null}

        {/* Next action */}
        {nextAction && !closed ? (
          <Row
            style={[
              styles.banner,
              {
                backgroundColor: overdue
                  ? colors.dangerSoft
                  : colors.warningSoft,
              },
            ]}
          >
            <Icon
              name="clock"
              size={18}
              color={overdue ? "danger" : "warning"}
            />
            <View style={{ flex: 1 }}>
              <AppText variant="label" color={overdue ? "danger" : "warning"}>
                {overdue ? "Next action overdue" : "Next action"}
              </AppText>
              <AppText weight="600">{formatDateTime(nextAction)}</AppText>
              {lead.nextActionNote ? (
                <AppText variant="label" color="textMuted" weight="400">
                  {lead.nextActionNote}
                </AppText>
              ) : null}
            </View>
            {canChange ? (
              <Button
                label="Change"
                variant="outline"
                small
                onPress={() => openSheet("nextAction")}
              />
            ) : null}
          </Row>
        ) : null}

        {/* Details */}
        <Card style={{ paddingVertical: 4 }}>
          <InfoRow
            icon="phone"
            label="Mobile"
            value={lead.mobile && `+91 ${lead.mobile}`}
          />
          <InfoRow icon="mail" label="Email" value={lead.email} />
          <InfoRow icon="pin" label="City" value={titleCase(lead.city)} />
          <InfoRow icon="home" label="Address" value={lead.address} />
          <InfoRow
            icon="user"
            label="Assigned to"
            value={assignee ?? "Unassigned"}
          />
          <InfoRow
            icon="calendar"
            label="Created"
            value={new Date(lead.createdAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          />
        </Card>

        {/* Actions */}
        {canChange ? (
          <Row gap={10}>
            {!closed ? (
              <Button
                label={nextAction ? "Next action" : "Set next action"}
                icon="clock"
                variant="outline"
                flex
                onPress={() => openSheet("nextAction")}
              />
            ) : null}
            <Button
              label="Change status"
              icon="refresh"
              flex
              onPress={() => openSheet("status")}
            />
          </Row>
        ) : (
          <Card style={{ backgroundColor: colors.slateSoft }}>
            <AppText
              variant="label"
              color="textMuted"
              weight="400"
              align="center"
            >
              {closed
                ? `This lead is ${statusLabel(lead.status).toLowerCase()}. Only an admin can re-open it. You can still add notes.`
                : "Only the lead owner or an admin can change this lead."}
            </AppText>
          </Card>
        )}

        <Card
          onPress={() =>
            router.push({
              pathname: "/lead/proposals/[id]",
              params: { id: lead._id },
            })
          }
        >
          <Row>
            <Icon name="file" size={20} color="primary" />
            <AppText weight="500" style={{ flex: 1 }}>
              Proposals
            </AppText>
            <Icon name="chevR" size={16} color="textSubtle" />
          </Row>
        </Card>

        {/* Activity */}
        <AppText variant="section">Activity</AppText>
        <Card style={{ gap: 0 }}>
          {activities.length === 0 ? (
            <AppText
              color="textMuted"
              align="center"
              style={{ paddingVertical: 12 }}
            >
              No activity yet.
            </AppText>
          ) : (
            activities.map((a, i) => {
              const m = eventMeta(a.eventType);
              const detail = eventDetail(a);
              const last = i === activities.length - 1;
              return (
                <Row key={a._id} gap={12} style={{ alignItems: "flex-start" }}>
                  <View style={{ alignItems: "center" }}>
                    <View
                      style={[styles.dot, { backgroundColor: colors[m.tone] }]}
                    >
                      <Icon name={m.icon} size={13} color="surface" />
                    </View>
                    {!last ? <View style={styles.line} /> : null}
                  </View>
                  <View
                    style={{ flex: 1, paddingBottom: last ? 0 : 16, gap: 2 }}
                  >
                    <AppText weight="600" style={{ fontSize: 14 }}>
                      {m.label}
                    </AppText>
                    {detail ? (
                      <AppText variant="label" color="textMuted" weight="400">
                        {detail}
                      </AppText>
                    ) : null}
                    <AppText variant="caption" color="textSubtle">
                      {[a.actorId?.fullName, timeAgo(a.createdAt)]
                        .filter(Boolean)
                        .join(" · ")}
                    </AppText>
                  </View>
                </Row>
              );
            })
          )}
        </Card>
      </ScrollView>

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Icon name="check" size={16} color="surface" />
          <AppText color="surface" weight="500">
            {toast}
          </AppText>
        </View>
      ) : null}

      {/* Note */}
      <Sheet
        visible={sheet === "note"}
        onClose={() => setSheet(null)}
        title="Add note"
      >
        <Field
          label="Note"
          placeholder="What happened?"
          multiline
          value={text}
          onChangeText={setText}
        />
        {sheetError ? (
          <AppText variant="label" color="danger">
            {sheetError}
          </AppText>
        ) : null}
        <Button
          label={saving ? "Saving…" : "Add note"}
          loading={saving}
          disabled={!text.trim()}
          onPress={() => run(() => addNote(lead._id, text), "Note added")}
        />
      </Sheet>

      {/* Next action */}
      <Sheet
        visible={sheet === "nextAction"}
        onClose={() => setSheet(null)}
        title="Next action"
      >
        <AppText variant="label" color="textMuted" weight="400">
          When should you act next? A new lead becomes Contacted; it never moves
          to Follow-up.
        </AppText>
        <DateTimeField
          label="Act on"
          value={date}
          onChange={setDate}
          minimumDate={new Date(now)}
        />
        <Field
          label="What to do (optional)"
          placeholder="e.g. Call back after Diwali"
          multiline
          value={text}
          onChangeText={setText}
        />
        {date.getTime() <= now ? (
          <AppText variant="caption" color="danger">
            Pick a time in the future.
          </AppText>
        ) : null}
        {sheetError ? (
          <AppText variant="label" color="danger">
            {sheetError}
          </AppText>
        ) : null}
        <Button
          label={saving ? "Saving…" : "Save next action"}
          loading={saving}
          disabled={date.getTime() <= now}
          onPress={() =>
            run(() => setNextAction(lead._id, date, text), "Next action saved")
          }
        />
      </Sheet>

      {/* Status: step 1 lists only the moves the backend allows; step 2 asks for a reason / deal value. */}
      <Sheet
        visible={sheet === "status"}
        onClose={() => setSheet(null)}
        title={detailsStep && target ? statusLabel(target) : "Change status"}
      >
        {detailsStep ? (
          <>
            {target === "DEAL_CLOSED" ? (
              <>
                <Field
                  label="Deal value (₹)"
                  required
                  icon="rupee"
                  placeholder="e.g. 50000"
                  keyboardType="number-pad"
                  value={dealValue}
                  onChangeText={(t) => setDealValue(t.replace(/\D/g, ""))}
                />
                <AppText variant="caption" color="textSubtle">
                  Closing the deal creates the customer and counts this amount
                  towards the owner&apos;s target.
                </AppText>
              </>
            ) : (
              <Field
                label="Reason"
                required
                multiline
                placeholder={
                  target === "INVALID"
                    ? "e.g. Wrong number, duplicate…"
                    : "e.g. Chose another vendor, no budget…"
                }
                value={text}
                onChangeText={setText}
              />
            )}
            {sheetError ? (
              <AppText variant="label" color="danger">
                {sheetError}
              </AppText>
            ) : null}
            <Row gap={10}>
              <Button
                label="Back"
                variant="outline"
                flex
                onPress={() => {
                  setDetailsStep(false);
                  setSheetError("");
                }}
              />
              <Button
                label={
                  saving
                    ? "Saving…"
                    : target === "DEAL_CLOSED"
                      ? "Close deal"
                      : "Confirm"
                }
                variant={
                  target === "INVALID"
                    ? "danger"
                    : target === "DEAL_CLOSED"
                      ? "success"
                      : "primary"
                }
                flex
                loading={saving}
                disabled={!detailsValid}
                onPress={submitDetails}
              />
            </Row>
          </>
        ) : (
          <>
            <Row gap={8}>
              <AppText variant="label" color="textMuted" weight="400">
                Current
              </AppText>
              <Pill
                label={statusLabel(lead.status)}
                tone={statusTone(lead.status)}
              />
            </Row>
            <View style={{ gap: 8 }}>
              {allowed.map((s) => {
                const busy = saving && target === s;
                return (
                  <Pressable
                    key={s}
                    onPress={saving ? undefined : () => pickStatus(s)}
                    style={({ pressed }) => [
                      styles.option,
                      pressed && { backgroundColor: colors.bg },
                    ]}
                  >
                    <Pill label={statusLabel(s)} tone={statusTone(s)} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="label" weight="400" color="textMuted">
                        {STATUS_HINT[s]}
                      </AppText>
                      {needsDetails(s) ? (
                        <AppText variant="caption" color="textSubtle">
                          {s === "DEAL_CLOSED"
                            ? "Asks for deal value"
                            : "Asks for a reason"}
                        </AppText>
                      ) : null}
                    </View>
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Icon name="chevR" size={16} color="textSubtle" />
                    )}
                  </Pressable>
                );
              })}
            </View>
            {sheetError ? (
              <AppText variant="label" color="danger">
                {sheetError}
              </AppText>
            ) : null}
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 4, gap: 14, paddingBottom: 40 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 20,
  },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  quickRow: {
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  quick: { flex: 1, alignItems: "center", gap: 6 },
  quickIcon: {
    padding: 11,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
  },
  banner: { padding: 14, borderRadius: 16 },
  infoRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  line: { width: 2, flex: 1, backgroundColor: colors.border, marginTop: 2 },
  toast: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
  },
});
