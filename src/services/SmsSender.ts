import { Config, Effect, Layer } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";

export class SmsSender extends Effect.Service<SmsSender>()(
  "@services/SmsSender",
  {
    effect: Effect.gen(function* () {
      const send = (message: string) =>
        Effect.gen(function* () {
          const responseUrl = yield* Config.url("SMS_RESPONSE_URL");

          yield* HttpClientRequest.make("GET")(responseUrl).pipe(
            HttpClientRequest.appendUrlParam("value1", message),
            HttpClient.execute,
            Effect.asVoid,
          );

          yield* Effect.logInfo("Response SMS sent");
        });

      return { send };
    }),
    dependencies: [FetchHttpClient.layer],
  },
) {
  static Local = Layer.succeed(
    SmsSender,
    SmsSender.make({
      send: (message) => Effect.logInfo(`Sent SMS: ${JSON.stringify(message)}`),
    }),
  );
}
