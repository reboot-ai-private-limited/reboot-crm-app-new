import { useRouter } from 'expo-router';

import { LeadForm } from '@/components/leads/LeadForm';
import { createLead } from '@/lib/leads';

// POST /leads — the lead is assigned to the employee who creates it; GPS is attached.
export default function AddLead() {
  const router = useRouter();
  return (
    <LeadForm
      title="Add lead"
      subtitle="Saved with your current location"
      submitLabel="Save lead"
      initial={{ companyName: '', contactName: '', mobile: '', email: '', city: '', category: '', address: '' }}
      onSubmit={async (v) => {
        const lead = await createLead(v);
        router.replace({ pathname: '/lead/[id]', params: { id: lead._id } });
      }}
    />
  );
}
