import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { LeadForm } from '@/components/leads/LeadForm';
import { AppText } from '@/components/ui/AppText';
import { CITIES } from '@/constants/cities';
import { fetchLead, Lead, updateLead } from '@/lib/leads';
import { colors } from '@/theme';

// Backend stores city lowercase; map it back to the list spelling for the picker.
const cityFromDb = (c?: string) => CITIES.find((x) => x.toLowerCase() === (c ?? '').toLowerCase()) ?? '';

export default function EditLead() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLead(id)
      .then((r) => setLead(r.lead))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (!lead) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 20 }}>
        {error ? <AppText color="danger" align="center">{error}</AppText> : <ActivityIndicator color={colors.primary} />}
      </View>
    );
  }

  return (
    <LeadForm
      title="Edit lead"
      submitLabel="Save changes"
      initial={{
        companyName: lead.companyName ?? '',
        contactName: lead.contactName ?? '',
        mobile: lead.mobile ?? '',
        email: lead.email ?? '',
        city: cityFromDb(lead.city),
        category: lead.category ?? '',
        address: lead.address ?? '',
        website: lead.website ?? '',
      }}
      onSubmit={async (v) => {
        await updateLead(id, v);
        router.back();
      }}
    />
  );
}
