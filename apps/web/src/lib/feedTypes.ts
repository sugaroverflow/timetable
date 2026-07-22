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
  body: string;
  visibility: CommentVisibility;
  hidden: boolean;
  createdAt: string;
  replies: FeedComment[];
};

export type WeightedHeart = {
  electorId: string;
  electorName: string | null;
  /** L1 contribution (1/n). */
  weight: number;
  /** L2 contribution (1/√n). */
  l2Weight: number;
  /** Share of the topic's devotion score; column-sums to it. */
  devotionWeight: number;
  /** ISO timestamp of when the elector hearted the topic. */
  heartedAt: string;
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
  commentCount: number;
  publishedAt: string | null;
  contentUpdatedAt: string | null;
  createdAt: string;
  comments: FeedComment[];
};

export type ManagedTopic = {
  id: string;
  title: string;
  slug?: string | null;
  hostSlug?: string | null;
  status: TopicStatus;
  bodyMd: string;
  bodyHtml: string;
  coverImageUrl: string | null;
  updatedAt: string;
  hostName?: string | null;
  /** Public thread — My Topics renders feed-identical cards (QA #59). */
  comments?: FeedComment[];
  /** Faculty-only thread on published topics. */
  hostOnlyComments?: FeedComment[];
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
