export type CalendarSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  location: string;
  topics: { id: string; title: string }[];
  viewerState: "green" | "yellow" | "red" | null;
  counts: { green: number; yellow: number; red: number };
  perUser: { userId: string; name: string | null; state: string }[] | null;
  commentCount: number;
};

export type TopicOption = { id: string; title: string };
