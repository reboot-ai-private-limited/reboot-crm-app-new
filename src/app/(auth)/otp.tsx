import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Header, Screen } from '@/components/ui/layout';
import { useAuth } from '@/store/auth';
import { colors, radius } from '@/theme';

const LENGTH = 6;

export default function OtpScreen() {
  const { pendingMobile, verifyOtp, requestOtp } = useAuth();
  const router = useRouter();
  const [otp, setOtp] = useState('');
  const [seconds, setSeconds] = useState(30);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  // OTP only makes sense after a number was entered.
  if (!pendingMobile) return <Redirect href="/login" />;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/login'));

  const onVerify = async () => {
    setError('');
    setBusy(true);
    try {
      await verifyOtp(otp);
    } catch (e) {
      setError((e as Error).message);
      setOtp('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    try {
      await requestOtp(pendingMobile);
      setSeconds(30);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <Header title="" back onBack={goBack} />
      <View style={{ gap: 24 }}>
        <View style={{ gap: 8 }}>
          <AppText variant="title">Verify OTP</AppText>
          <AppText color="textMuted">Enter the code sent to +91 {pendingMobile} on WhatsApp.</AppText>
        </View>

        {/* The boxes are only a display; one real, invisible input sits on top and takes the taps. */}
        <View>
          <View style={styles.boxes}>
            {Array.from({ length: LENGTH }).map((_, i) => {
              const active = i === Math.min(otp.length, LENGTH - 1);
              return (
                <View key={i} style={[styles.box, active && styles.boxActive]}>
                  <Text style={styles.digit}>{otp[i] ?? ''}</Text>
                </View>
              );
            })}
          </View>
          <TextInput
            value={otp}
            onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, LENGTH))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={LENGTH}
            autoFocus
            caretHidden
            style={styles.input}
          />
        </View>

        {error ? (
          <AppText variant="label" color="danger">
            {error}
          </AppText>
        ) : null}

        <View style={styles.resend}>
          {seconds > 0 ? (
            <>
              <AppText color="textMuted">Resend code in</AppText>
              <AppText weight="600" color="primary">{`00:${String(seconds).padStart(2, '0')}`}</AppText>
            </>
          ) : (
            <AppText weight="600" color="primary" onPress={resend}>
              Resend code
            </AppText>
          )}
        </View>
        <Button label={busy ? 'Verifying…' : 'Verify & continue'} onPress={otp.length === LENGTH && !busy ? onVerify : undefined} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', gap: 8 },
  box: {
    flex: 1,
    aspectRatio: 0.85,
    maxHeight: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.primary },
  digit: { fontSize: 22, lineHeight: 28, fontWeight: '600', color: colors.text },
  // Covers the boxes so a tap anywhere focuses it; text is transparent so only the boxes show.
  input: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, color: 'transparent', fontSize: 1 },
  resend: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
});
