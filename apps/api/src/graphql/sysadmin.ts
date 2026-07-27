import { listAllForums, type SysadminForum } from "@timetable/core";

import { isSysadmin } from "../auth/sysadmin";
import { builder } from "./builder";

/** "Active" on the dashboard = opened the forum's feed in the last 30
 * days (lastSeenFeedAt) — the closest thing to a login the app tracks. */
const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const SysadminForumType = builder
  .objectRef<SysadminForum>("SysadminForum")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      slug: t.exposeString("slug"),
      name: t.exposeString("name"),
      privacy: t.exposeString("privacy"),
      createdAt: t.string({ resolve: (f) => f.createdAt.toISOString() }),
      memberCount: t.exposeInt("memberCount"),
      activeMemberCount: t.exposeInt("activeMemberCount"),
      topicCount: t.exposeInt("topicCount"),
      ownerName: t.exposeString("ownerName", { nullable: true }),
      ownerEmail: t.exposeString("ownerEmail", { nullable: true }),
    }),
  });

builder.queryFields((t) => ({
  /** Every forum in the deployment, with activity and owner contact.
   * Sysadmins only (SYSADMIN_EMAILS); everyone else gets []. */
  sysadminForums: t.field({
    type: [SysadminForumType],
    resolve: async (_p, _a, ctx) => {
      if (!isSysadmin(ctx.user)) return [];
      return listAllForums(new Date(Date.now() - ACTIVE_WINDOW_MS));
    },
  }),
}));
