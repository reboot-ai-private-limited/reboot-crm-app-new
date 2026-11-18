import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { LeadForm } from '@/components/leads/LeadForm';
import { AppText } from '@/components/ui/AppText';
import { DetailSkeleton } from '@/components/ui/Skeleton';
import { fetchLead, Lead, updateLead } from '@/lib/leads';
import { colors } from '@/theme';

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
      <View style={{ flex: 1, justifyContent: error ? 'center' : 'flex-start', backgroundColor: colors.bg, padding: 20, paddingTop: error ? 20 : 60 }}>
        {error ? <AppText color="danger" align="center">{error}</AppText> : <DetailSkeleton />}
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
        countryCode: lead.countryCode ?? '91',
        mobile: lead.mobile ?? '',
        email: lead.email ?? '',
        city: lead.city ?? '',
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
