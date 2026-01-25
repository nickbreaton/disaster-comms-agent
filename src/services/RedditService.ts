import { Config, Effect, Option, Schema } from "effect";
import { HttpClient, FetchHttpClient } from "@effect/platform";
import { RedditResponse } from "../schema/reddit";

export class RedditServiceError extends Schema.TaggedError<RedditServiceError>()(
  "RedditServiceError",
  { message: Schema.String, cause: Schema.Defect },
) {}

export class RedditService extends Effect.Service<RedditService>()(
  "@services/RedditService",
  {
    effect: Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const userAgentOption = yield* Config.option(Config.string("USER_AGENT"));
      const userAgent = userAgentOption.pipe(
        Option.getOrElse(() => "Disaster Comms Agent/1.0"),
      );

      const getPost = (url: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo("RedditService.getPost").pipe(
            Effect.annotateLogs({ url }),
          );

          let requestUrl = url;

          if (!requestUrl.endsWith(".json")) {
            requestUrl += "/.json?sort=new";
          }

          const res = yield* http.get(requestUrl, {
            acceptJson: true,
            headers: { "User-Agent": userAgent },
          });

          const json = yield* res.json;
          const decoded = yield* Schema.decodeUnknown(RedditResponse)(json);

          return JSON.stringify(decoded);
        }).pipe(
          Effect.mapError(
            (cause) =>
              new RedditServiceError({
                message: "Failed to get reddit post",
                cause,
              }),
          ),
        );

      return { getPost };
    }),
    dependencies: [FetchHttpClient.layer],
  },
) {}
