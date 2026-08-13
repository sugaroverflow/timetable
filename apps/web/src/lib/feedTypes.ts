export type TopicStatus =
  | "submitted"
  | "published"
  | "unpublished"
  | "archived";
type CommentVisibility = "public" | "host_only" | "admin_only";

export type FeedComment = {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  /** The author's roles in this forum (role pill); empty for ex-members
   * and tombstones. */
  authorRoles: string[];
  body: string;
  visibility: CommentVisibility;
  hidden: boolean;
  /** Author-deleted tombstone: body/author arrive blanked from the API. */
  deleted: boolean;
  editedAt: string | null;
  createdAt: string;
  replies: FeedComment[];
};

export type WeightedHeart = {
  electorId: string;
  electorName: string | null;
  electorImage: string | null;
  /** L1 contribution (1/n). */
  weight: number;
  /** L2 contribution (1/√n). */
  l2Weight: number;
  /** Share of the topic's devotion score; column-sums to it. */
  devotionWeight: number;
  /** ISO timestamp of when the elector hearted the topic. */
  heartedAt: string;
};

/** One attributed 💙 in the host-only thread's "💙 Sarah, Amir" row. */
export type HostHearter = {
  userId: string;
  name: string | null;
  image: string | null;
  slug: string | null;
};

export type FeedTopic = {
  id: string;
  timetableId: string;
  hostId: string;
  hostName: string | null;
  hostImage: string | null;
  hostSlug: string | null;
  title: string;
  slug: string | null;
  bodyMd: string;
  bodyHtml: string;
  coverImageUrl: string | null;
  status: TopicStatus;
  heartCount: number;
  weightedScore: number | null;
  viewerHasHearted: boolean;
  /** The viewer's own 💙 (host-non-electors; false for everyone else). */
  viewerHasHostHearted: boolean;
  /** Attributed 💙s — hosts/admins only, null while the forum's host-only
   * thread is off (💙s are then admin-analysis bookmarks). */
  hostHearters: HostHearter[] | null;
  commentCount: number;
  /** The viewer's per-topic comments-seen watermark (teaser "new"
   * previews) — null when they never engaged with this discussion. */
  viewerCommentsSeenAt: string | null;
  publishedAt: string | null;
  contentUpdatedAt: string | null;
  createdAt: string;
  comments: FeedComment[];
  /** Drafting thread — the API serves it only to the topic's owner and
   * admins; selected by the permalink page alone. */
  adminComments?: FeedComment[];
};

export type ManagedTopic = {
  id: string;
  title: string;
  slug?: string | null;
  /** Owner id — selected where the card shows the admin Reassign control. */
  hostId?: string;
  hostSlug?: string | null;
  status: TopicStatus;
  bodyMd: string;
  bodyHtml: string;
  coverImageUrl: string | null;
  updatedAt: string;
  /** Host's "Ready to publish" signal — null/absent while still drafting
   * (only meaningful on submitted topics; 2026-08-06). */
  readyAt?: string | null;
  hostName?: string | null;
  hostImage?: string | null;
  /** Public thread — My Topics renders feed-identical cards (QA #59). */
  comments?: FeedComment[];
  /** Faculty-only thread on published topics. */
  hostOnlyComments?: FeedComment[];
  /** 💙s received — the host-only box shows them to the topic's owner on
   * My Topics too (host hearts, QA 2026-08-04). */
  hostHearters?: HostHearter[] | null;
  /** Drafting thread — admins + topic owner only (QA #59 round 3). */
  adminComments?: FeedComment[];
};

export type ActivityEvent = {
  id: string;
  action: string;
  note: string | null;
  actorId: string | null;
  actorName: string | null;
  actorImage: string | null;
  actorRoles: string[];
  createdAt: string;
  topicTitle: string | null;
  topicSlug: string | null;
  topicHostSlug: string | null;
  topicHostName: string | null;
  snippet: string | null;
  commentId: string | null;
  invitedEmail: string | null;
  invitedRoles: string[];
};
