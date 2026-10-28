import { MeetingsList } from '@/components/meetings/MeetingsList';

// Admin: every employee's meetings, with an employee filter. Opened from the Dashboard's "Meetings today".
export default function AllMeetingsScreen() {
  return <MeetingsList back />;
}
