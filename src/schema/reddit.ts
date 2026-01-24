import { Schema } from "effect";

const RedditPostData = Schema.Struct({
  id: Schema.optional(Schema.String),
  author: Schema.optional(Schema.String),
  selftext: Schema.optional(Schema.String),
  created: Schema.optional(Schema.Unknown),
  edited: Schema.optional(Schema.Unknown),
});

const RedditCommentData = Schema.Struct({
  id: Schema.optional(Schema.String),
  author: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  created: Schema.optional(Schema.Unknown),
  edited: Schema.optional(Schema.Unknown),
});

const RedditPost = Schema.Struct({
  kind: Schema.Literal("t3"),
  data: Schema.optional(RedditPostData),
});

const RedditComment = Schema.Struct({
  kind: Schema.Literal("t1"),
  data: Schema.optional(RedditCommentData),
});

const RedditMore = Schema.Struct({
  kind: Schema.Literal("more"),
  data: Schema.optional(Schema.Unknown),
});

const RedditThing = Schema.Union(RedditPost, RedditComment, RedditMore);

const RedditListingData = Schema.Struct({
  children: Schema.optional(Schema.Array(RedditThing)),
});

const RedditListing = Schema.Struct({
  data: Schema.optional(RedditListingData),
});

export const RedditResponse = Schema.Array(RedditListing);

export type RedditResponse = Schema.Schema.Type<typeof RedditResponse>;
export type RedditThing = Schema.Schema.Type<typeof RedditThing>;
export type RedditPost = Schema.Schema.Type<typeof RedditPost>;
export type RedditComment = Schema.Schema.Type<typeof RedditComment>;
