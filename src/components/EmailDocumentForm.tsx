import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/layout';
import { emailDocument, isEmail, splitAddresses, type DocumentKind } from '@/lib/documentEmail';

const NOUN: Record<DocumentKind, string> = { invoice: 'invoice', proposal: 'proposal' };
const MAX_CC = 5;

/**
 * "Email this invoice / proposal" in a bottom sheet: To (filled with the customer's address), Cc, and a short note shown above the
 * link. The same fields and rules as the web dialog; the backend's reason is shown when it refuses (not set up, address blocked...).
 */
export function EmailDocumentForm({ kind, id, defaultTo, onSent }: { kind: DocumentKind; id: string; defaultTo?: string; onSent: (text: string) => void }) {
  const [to, setTo] = useState(defaultTo ?? '');
  const [cc, setCc] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<{ to?: string; cc?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    const ccList = splitAddresses(cc);
    const next: typeof errors = {};
    if (!isEmail(to)) next.to = 'Enter a valid email address';
    if (ccList.length > MAX_CC) next.cc = `At most ${MAX_CC} addresses`;
    else if (ccList.some((a) => !isEmail(a))) next.cc = 'One of these is not a valid email address';
    setErrors(next);
    setFailure(null);
    if (next.to || next.cc) return;

    setSending(true);
    try {
      const r = await emailDocument(kind, id, { to, cc: ccList, message });
      onSent(r.duplicate ? `This ${NOUN[kind]} email was already on its way to ${to.trim()}.` : `The ${NOUN[kind]} is being emailed to ${to.trim()}.`);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <Field label="To" required icon="mail" value={to} onChangeText={setTo} placeholder="name@company.com" keyboardType="email-address" autoCapitalize="none" maxLength={254} error={errors.to} />
      <Field label="Cc" icon="users" value={cc} onChangeText={setCc} placeholder="Optional, separated by commas" keyboardType="email-address" autoCapitalize="none" error={errors.cc} />
      <Field label="Message" value={message} onChangeText={setMessage} placeholder={`Shown above the ${NOUN[kind]} link, e.g. "Thank you for your time today."`} multiline maxLength={2000} />
      <AppText variant="caption" color="textMuted">
        The email has a link to the {NOUN[kind]}, so the customer always sees the latest version.
      </AppText>
      {failure ? (
        <AppText variant="caption" color="danger">
          {failure}
        </AppText>
      ) : null}
      <Button label={`Email ${NOUN[kind]}`} icon="send" loading={sending} onPress={send} />
    </View>
  );
}
