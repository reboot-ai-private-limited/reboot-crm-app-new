import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
  activityMeta,
  eventDetail,
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
import { DealCloseForm } from "@/components/leads/DealCloseForm";
import { MeetingCard } from "@/components/meetings/MeetingCard";
import { MeetingForm } from "@/components/meetings/MeetingForm";
import { dealError, DealForm, dealPayload, newDealForm } from "@/lib/deal";
import { websiteLabel } from "@/lib/website";
import {
  Activity,
  addNote,
  changeStatus,
  CLOSED_STATUSES,
  fetchLead,
  Lead,
  LeadStatus,
  logVisit,
  mapUrl,
  REASON_REQUIRED,
  setNextAction,
  STATUS_HINT,
  statusLabel,
  titleCase,
} from "@/lib/leads";
import {
  cancelMeeting,
  fetchMeetings,
  markMeetingStatus,
  Meeting,
  shouldPoll,
} from "@/lib/meetings";
import { useAuth } from "@/store/auth";
import { ColorName, colors } from "@/theme";

/** Which bottom sheet is open. The status sheet has two steps: the list, then reason / deal value when needed. */
type SheetKind =
  | "note"
  | "visit"
  | "nextAction"
  | "status"
  | "meeting"
  | "reschedule"
  | "cancel"
  | "notHappened"
  | null;

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
  onPress,
  muted,
}: {
  icon: IconName;
  label: string;
  value?: string | null;
  /** Makes the value a tappable link. */
  onPress?: () => void;
  /** Greyed value, for "nothing here" such as No website. */
  muted?: boolean;
}) {
  if (!value) return null;
  const row = (
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
        color={onPress ? "primary" : muted ? "textSubtle" : "text"}
        numberOfLines={1}
        style={{ flex: 1, fontSize: 14, textAlign: "right" }}
      >
        {value}
      </AppText>
    </Row>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="link">
      {row}
    </Pressable>
  ) : (
    row
  );
}

export default function LeadDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, isAdmin } = useAuth();
  // Log visit is for field staff only; office roles just add notes.
  const isField = session?.role === "FieldSales";

  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [notHappenedNote, setNotHappenedNote] = useState("");
  const [allowed, setAllowed] = useState<LeadStatus[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [target, setTarget] = useState<LeadStatus | null>(null);
  // Status sheet step 2: asking for a reason / deal value for `target`.
  const [detailsStep, setDetailsStep] = useState(false);
  const [text, setText] = useState("");
  const [deal, setDeal] = useState<DealForm>(newDealForm);
  const [date, setDate] = useState(() => defaultNextAction());
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [toast, setToast] = useState("");
  // Time reference for 'overdue' / 'in the future' checks; refreshed on load and when a sheet opens.
  const [now, setNow] = useState(() => new Date().getTime());

  const load = useCallback(async () => {
    try {
      const [leadRes, meetingsRes] = await Promise.allSettled([
        fetchLead(id),
        fetchMeetings(id),
      ]);
      if (leadRes.status === "fulfilled") {
        const r = leadRes.value;
        setLead(r.lead);
        setActivities(r.activities);
        setAllowed(r.allowedNextStatuses ?? []);
        setError("");
      } else {
        setError((leadRes.reason as Error).message);
      }
      if (meetingsRes.status === "fulfilled") {
        setMeetings(meetingsRes.value);
      }
      setNow(new Date().getTime());
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

  // Poll every 30s while a meeting is in progress or starts within 60 minutes
  useEffect(() => {
    if (!shouldPoll(meetings)) return;
    const interval = setInterval(() => {
      load();
    }, 30_000);
    return () => clearInterval(interval);
  }, [meetings, load]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const openSheet = (k: SheetKind, preset?: LeadStatus) => {
    setText(k === "nextAction" ? (lead?.nextActionNote ?? "") : "");
    setDeal(newDealForm());
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
      setDeal(newDealForm());
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
    if (target === "DEAL_CLOSED") {
      const problem = dealError(deal);
      if (problem) return setSheetError(problem);
    }
    run(
      () =>
        changeStatus(lead._id, {
          status: target,
          ...(REASON_REQUIRED.includes(target) ? { reason: text.trim() } : {}),
          ...(target === "DEAL_CLOSED" ? dealPayload(deal) : {}),
        }),
      target === "DEAL_CLOSED"
        ? "Deal closed — customer and invoice created"
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

  const detailsValid =
    target === "DEAL_CLOSED"
      ? true // checked on submit so the form can say what is missing
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.quickRow, { minWidth: "100%", gap: 8 }]}
          >
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
            {isField ? (
              <QuickAction
                icon="pin"
                label="Visit"
                onPress={() => openSheet("visit")}
              />
            ) : null}
            {!closed && canChange ? (
              <QuickAction
                icon="video"
                label="Meeting"
                onPress={() => openSheet("meeting")}
              />
            ) : null}
          </ScrollView>
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

        {/* Scheduled follow-up */}
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
                {overdue ? "Follow-up overdue" : "Follow-up"}
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
            icon="globe"
            label="Website"
            value={lead.website ? websiteLabel(lead.website) : "No website"}
            muted={!lead.website}
            onPress={lead.website ? () => Linking.openURL(lead.website!) : undefined}
          />
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
                label={nextAction ? "Follow-up" : "Add follow-up"}
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
              {"Only the lead owner or an admin can change this lead."}
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

        {/* Meetings */}
        {(!closed || meetings.length > 0) && (
          <View style={{ gap: 10 }}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <AppText variant="section">Meetings ({meetings.length})</AppText>
              {!closed && canChange ? (
                <Button
                  label="Schedule"
                  variant="soft"
                  icon="plus"
                  small
                  onPress={() => openSheet("meeting")}
                />
              ) : null}
            </Row>

            {meetings.length === 0 ? (
              <Card>
                <AppText color="textMuted" align="center" style={{ paddingVertical: 12 }}>
                  No meetings scheduled yet.
                </AppText>
              </Card>
            ) : (
              meetings.map((m) => (
                <MeetingCard
                  key={m._id}
                  meeting={m}
                  canModify={canChange}
                  isAdmin={isAdmin}
                  onReschedule={(targetMeeting) => {
                    setSelectedMeeting(targetMeeting);
                    setSheet("reschedule");
                  }}
                  onCancel={(targetMeeting) => {
                    setSelectedMeeting(targetMeeting);
                    setCancelReason("");
                    setSheetError("");
                    setSheet("cancel");
                  }}
                  onMarkDone={(targetMeeting) => {
                    run(
                      () => markMeetingStatus(targetMeeting._id, { status: "DONE" }),
                      "Meeting marked as done",
                    );
                  }}
                  onNotHappened={(targetMeeting) => {
                    setSelectedMeeting(targetMeeting);
                    setNotHappenedNote("");
                    setSheetError("");
                    setSheet("notHappened");
                  }}
                  onRefresh={load}
                  onToast={flash}
                />
              ))
            )}
          </View>
        )}

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
              const m = activityMeta(a);
              const detail = eventDetail(a);
              const map = mapUrl(a.location);
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
                    <Row gap={8}>
                      <AppText variant="caption" color="textSubtle">
                        {[a.actorId?.fullName, timeAgo(a.createdAt)]
                          .filter(Boolean)
                          .join(" · ")}
                      </AppText>
                      {map ? (
                        <Pressable
                          onPress={() => Linking.openURL(map)}
                          hitSlop={8}
                        >
                          <Row gap={3}>
                            <Icon name="pin" size={12} color="primary" />
                            <AppText variant="caption" color="primary" weight="600">
                              View location
                            </AppText>
                          </Row>
                        </Pressable>
                      ) : null}
                    </Row>
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

      {/* Log visit (field sales): a note saved with the phone's GPS */}
      <Sheet
        visible={sheet === "visit"}
        onClose={() => setSheet(null)}
        title="Log visit"
      >
        <Row gap={8}>
          <Icon name="pin" size={16} color="success" />
          <AppText variant="label" color="textMuted" weight="400" style={{ flex: 1 }}>
            Your current location and time are saved with this visit.
          </AppText>
        </Row>
        <Field
          label="Visit note"
          placeholder="Who did you meet? What was discussed?"
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
          label={saving ? "Getting location…" : "Save visit"}
          loading={saving}
          disabled={!text.trim()}
          onPress={() => run(() => logVisit(lead._id, text), "Visit logged")}
        />
      </Sheet>

      {/* Schedule a follow-up (date + time) */}
      <Sheet
        visible={sheet === "nextAction"}
        onClose={() => setSheet(null)}
        title="Schedule follow-up"
      >
        <AppText variant="label" color="textMuted" weight="400">
          When should you follow up? A new lead becomes Contacted; its status
          does not change to Follow-up (that status means a meeting happened).
        </AppText>
        <DateTimeField
          label="Follow up on"
          value={date}
          onChange={setDate}
          minimumDate={new Date(now)}
        />
        <Field
          label="Note (optional)"
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
          label={saving ? "Saving…" : "Save follow-up"}
          loading={saving}
          disabled={date.getTime() <= now}
          onPress={() =>
            run(() => setNextAction(lead._id, date, text), "Follow-up scheduled")
          }
        />
      </Sheet>

      {/* Status: step 1 lists only the moves the backend allows; step 2 asks for a reason / deal value. */}
      <Sheet
        visible={sheet === "status"}
        onClose={() => setSheet(null)}
        title={detailsStep && target === "DEAL_CLOSED" ? "Close deal" : detailsStep && target ? statusLabel(target) : "Change status"}
        fullHeight={detailsStep && target === "DEAL_CLOSED"}
      >
        {detailsStep ? (
          <>
            {target === "DEAL_CLOSED" ? (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <DealCloseForm value={deal} onChange={setDeal} />
                <AppText variant="caption" color="textSubtle">
                  Closing the deal creates the customer, attaches these services
                  and issues one final invoice.
                </AppText>
              </ScrollView>
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
                            ? "Asks for services and amounts"
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

      {/* Schedule Meeting Sheet */}
      <Sheet
        visible={sheet === "meeting"}
        onClose={() => setSheet(null)}
        title="Schedule Meeting"
        fullHeight
      >
        {lead ? (
          <MeetingForm
            mode="schedule"
            leadId={lead._id}
            lead={lead}
            onSuccess={async () => {
              setSheet(null);
              await load();
            }}
            onToast={flash}
          />
        ) : null}
      </Sheet>

      {/* Reschedule Meeting Sheet */}
      <Sheet
        visible={sheet === "reschedule"}
        onClose={() => setSheet(null)}
        title="Reschedule Meeting"
      >
        {lead && selectedMeeting ? (
          <MeetingForm
            mode="reschedule"
            leadId={lead._id}
            lead={lead}
            meetingToReschedule={selectedMeeting}
            onSuccess={async () => {
              setSheet(null);
              await load();
            }}
            onToast={flash}
          />
        ) : null}
      </Sheet>

      {/* Cancel Meeting Sheet */}
      <Sheet
        visible={sheet === "cancel"}
        onClose={() => setSheet(null)}
        title="Cancel Meeting"
      >
        <AppText variant="caption" color="textMuted">
          The Google Meet event will be removed and invitees will get a cancellation email. This cannot be undone.
        </AppText>
        <Field
          label="Reason (optional)"
          placeholder="Why is this meeting cancelled?"
          value={cancelReason}
          onChangeText={setCancelReason}
          maxLength={500}
        />
        {sheetError ? (
          <AppText variant="label" color="danger">
            {sheetError}
          </AppText>
        ) : null}
        <Button
          label={saving ? "Cancelling…" : "Cancel meeting"}
          variant="danger"
          loading={saving}
          onPress={() =>
            run(
              () => cancelMeeting(selectedMeeting!._id, cancelReason.trim() || undefined),
              "Meeting cancelled",
            )
          }
        />
      </Sheet>

      {/* Mark Not Happened Sheet */}
      <Sheet
        visible={sheet === "notHappened"}
        onClose={() => setSheet(null)}
        title="Mark Not Happened"
      >
        <AppText variant="caption" color="textMuted">
          A reason is required to mark a meeting as not happened.
        </AppText>
        <Field
          label="Reason"
          placeholder="e.g. Lead did not show up, asked to postpone"
          value={notHappenedNote}
          onChangeText={setNotHappenedNote}
          maxLength={1000}
        />
        {sheetError ? (
          <AppText variant="label" color="danger">
            {sheetError}
          </AppText>
        ) : null}
        <Button
          label={saving ? "Saving…" : "Mark not happened"}
          variant="danger"
          loading={saving}
          disabled={notHappenedNote.trim().length < 2}
          onPress={() =>
            run(
              () =>
                markMeetingStatus(selectedMeeting!._id, {
                  status: "NOT_HAPPENED",
                  note: notHappenedNote.trim(),
                }),
              "Meeting marked as not happened",
            )
          }
        />
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
