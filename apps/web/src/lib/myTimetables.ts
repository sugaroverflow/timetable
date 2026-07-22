import { cache } from "react";

import { gqlFetch } from "@/lib/graphql";

export type MyTimetable = {
  slug: string;
  name: string;
  privacy: string;
  settings: string;
};

const QUERY = `
  query MyTimetables {
    myTimetables {
      timetable { slug name privacy settings }
    }
  }
`;

/**
 * The viewer's forums — the superset selection needed by both the topbar
 * brand menu (app layout) and the sidebar switcher (t/[slug] layout).
 * Wrapped in React's cache() so the two layouts share ONE fetch per
 * request instead of each querying myTimetables on every navigation.
 */
export const getMyTimetables = cache(async (): Promise<MyTimetable[]> => {
  const data = await gqlFetch<{ myTimetables: { timetable: MyTimetable }[] }>(
    QUERY,
  );
  return data.myTimetables.map((m) => m.timetable);
});
