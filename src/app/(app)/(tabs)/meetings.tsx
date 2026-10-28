import { MeetingsList } from '@/components/meetings/MeetingsList';

// Employee Meetings tab. Admin has no Meetings tab: the Dashboard opens the same list at /all-meetings.
export default function MeetingsScreen() {
  return <MeetingsList />;
}
