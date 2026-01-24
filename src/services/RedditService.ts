import { Effect, Schema } from "effect";
import { HttpClient, FetchHttpClient } from "@effect/platform";
import { RedditResponse } from "../schema/reddit";

export class RedditService extends Effect.Service<RedditService>()(
  "@services/RedditService",
  {
    effect: Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;

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
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
            },
          });
          const json = yield* res.json;
          const decoded = yield* Schema.decodeUnknown(RedditResponse)(json);
          return JSON.stringify(decoded);
        }).pipe(
          Effect.tapError((error) => Effect.logError(error.cause)),
          Effect.orElse(() => Effect.succeed("Failed to get reddit post")),
        );

      return { getPost };
    }),
    dependencies: [FetchHttpClient.layer],
  },
) {}
