export type TopicStatus =
  | "draft"
  | "submitted"
  | "published"
  | "unpublished"
  | "archived";
export type CommentVisibility = "public" | "host_only";

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
  weight: number;
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
  weightedBreakdown: WeightedHeart[] | null;
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
  hostName: string | null;
  feedback: string | null;
  /** Threaded admin↔host feedback; fetched where the UI renders it. */
  hostOnlyComments?: FeedComment[];
};

export type ActivityEvent = {
  id: string;
  action: string;
  note: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
  topicTitle: string | null;
  topicSlug: string | null;
  topicHostSlug: string | null;
  snippet: string | null;
};
