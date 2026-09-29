import { Stack } from 'expo-router';

// Always open the auth flow on the mobile-number screen; OTP is pushed on top of it.
export const unstable_settings = { initialRouteName: 'login' };

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} initialRouteName="login">
      <Stack.Screen name="login" />
      <Stack.Screen name="otp" />
    </Stack>
  );
}
