export type FeedComment = {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  body: string;
  visibility: string;
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
  title: string;
  bodyHtml: string;
  status: string;
  heartCount: number;
  weightedScore: number | null;
  viewerHasHearted: boolean;
  commentCount: number;
  publishedAt: string | null;
  createdAt: string;
  comments: FeedComment[];
  weightedBreakdown: WeightedHeart[] | null;
};

export type ManagedTopic = {
  id: string;
  title: string;
  status: string;
  bodyMd: string;
  bodyHtml: string;
  updatedAt: string;
  hostName: string | null;
  feedback: string | null;
};

export type ActivityEvent = {
  id: string;
  action: string;
  note: string | null;
  actorName: string | null;
  createdAt: string;
};
