import { Redirect } from 'expo-router';

import { ComingSoon } from '@/components/ui/ComingSoon';
import { useAuth } from '@/store/auth';

// Employee home. Admins start on the Dashboard tab instead.
export default function Home() {
  const { isAdmin } = useAuth();
  if (isAdmin) return <Redirect href="/dashboard" />;
  return <ComingSoon title="Home" icon="home" />;
}
