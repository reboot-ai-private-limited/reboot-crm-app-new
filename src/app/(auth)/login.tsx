import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Field, Screen } from '@/components/ui/layout';
import { useAuth } from '@/store/auth';

const logo = require('@/assets/images/logoIcon.jpg');

// Opened in an in-app browser. The Privacy Policy must match the URL entered in App Store Connect.
const TERMS_URL = 'https://rebootai.in/terms-and-conditions';
const PRIVACY_URL = 'https://rebootai.in/privacy-policy';

export default function LoginScreen() {
  const router = useRouter();
  const { requestOtp } = useAuth();
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const valid = /^\d{10}$/.test(mobile);

  const onSend = async () => {
    setError('');
    setSending(true);
    try {
      await requestOtp(mobile);
      router.push('/otp');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll={false}>
        <View style={styles.wrap}>
          <Image source={logo} style={styles.logo} contentFit="cover" />
          <View style={{ gap: 8, alignItems: 'center' }}>
            <AppText variant="title" align="center">
              Welcome back
            </AppText>
            <AppText color="textMuted" align="center">
              Enter your mobile number. We will send a 6-digit OTP on WhatsApp.
            </AppText>
          </View>
          <Field
            large
            label="Mobile number"
            required
            icon="phone"
            placeholder="10-digit number"
            value={mobile}
            onChangeText={(t) => setMobile(t.replace(/\D/g, ''))}
            keyboardType="phone-pad"
            maxLength={10}
          />
          {error ? (
            <AppText variant="label" color="danger">
              {error}
            </AppText>
          ) : null}
          <Button label={sending ? 'Sending…' : 'Send OTP'} icon="send" onPress={valid && !sending ? onSend : undefined} />
          <AppText variant="caption" color="textSubtle" align="center">
            By continuing you agree to the{' '}
            <AppText variant="caption" color="primary" weight="600" accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}>
              Terms
            </AppText>{' '}
            and{' '}
            <AppText variant="caption" color="primary" weight="600" accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}>
              Privacy Policy
            </AppText>
            .
          </AppText>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', gap: 24, paddingBottom: 48 },
  logo: { width: 76, height: 76, borderRadius: 22, alignSelf: 'center' },
});
