import {
  Effect,
  Schema,
  Layer,
  Config,
  Redacted,
  ConfigProvider,
} from "effect";
import {
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
  HttpApp,
  FetchHttpClient,
  HttpClient,
} from "@effect/platform";
import { Chat, Tool, Toolkit } from "@effect/ai";
import {
  OpenRouterLanguageModel,
  OpenRouterClient,
} from "@effect/ai-openrouter";
import { RedditService } from "./services/RedditService";
import { SmsSender } from "./services/SmsSender";

const WebhookPayload = Schema.Struct({ query: Schema.String });

const GetRedditPostBody = Tool.make("get_reddit_post", {
  description: "Get the contents of a reddit post",
  parameters: {
    url: Schema.String.annotations({
      description:
        "Full URL of the reddit post: https://www.reddit.com/r/(subreddit)/(comment_id)/[post_description]). Query parameters or additional path segments not accepted.",
    }),
  },
  success: Schema.String,
});

const SmsMessage = Schema.String.pipe(Schema.maxLength(150));

const SendSmsMessages = Tool.make("send_sms", {
  description: "Send one or more SMS response messages",
  parameters: {
    messages: Schema.Array(SmsMessage).pipe(Schema.maxItems(9)).annotations({
      description: "Up to 9 SMS message bodies, each max 150 characters",
    }),
  },
  success: Schema.Struct({ sent: Schema.Number }),
});

const toolkit = Toolkit.make(GetRedditPostBody, SendSmsMessages);
const toolHandlersLayer = toolkit
  .toLayer(
    Effect.gen(function* () {
      const reddit = yield* RedditService;
      const smsSender = yield* SmsSender;
      const httpClient = yield* HttpClient.HttpClient;

      return toolkit.of({
        get_reddit_post: ({ url }) => reddit.getPost(url),
        send_sms: ({ messages }) =>
          Effect.gen(function* () {
            const total = messages.length;
            let index = 0;

            for (const message of messages) {
              index += 1;
              yield* smsSender.send(`${message} (${index}/${total})`).pipe(
                Effect.provideService(HttpClient.HttpClient, httpClient),
                Effect.catchAll((error) =>
                  Effect.logError(error).pipe(Effect.asVoid),
                ),
              );
              yield* Effect.sleep(500);
            }

            return { sent: total };
          }),
      });
    }),
  )
  .pipe(
    Layer.provide(RedditService.Default),
    Layer.provide(SmsSender.Default),
    Layer.provide(FetchHttpClient.layer),
  );

const LATEST_MEGATHREAD =
  "https://www.reddit.com/r/asheville/comments/1qjvkuh/jan_23_2026_wnc_weekend_winter_weather_megathread";

const disasterAgent = (userQuery: string) =>
  Effect.gen(function* () {
    yield* Effect.log("Agent starting");

    const chat = yield* Chat.empty;
    const maxTurns = 10;
    const initialPrompt = `You are an emergency SMS assistant for  disasters. Answer the user's question using ONLY information found in the provided megathreads.

Start with the latest megathread: ${LATEST_MEGATHREAD}
If it links to a newer megathread, follow it and prefer the newest dated information.

Tooling:
- Use get_reddit_post to fetch megathread JSON.
- Read post body and the newest comments for actionable updates.
- Keep searching until you can answer or there is no relevant info.
- When you have the final SMS-ready response, call send_sms with an array of message bodies. Each message must be 150 characters or less, and you may send up to 9 messages. Do not add numbering; it will be appended automatically.
- After calling send_sms, stop.

Output requirements:
- Return the most critical, actionable facts first (road closures, shelters, power, water, medical, supplies, emergency services).
- Be concise: fit in 1-2 SMS segments (~160-320 chars total).
- Plain text only. No links, no citations, no metadata, no preambles.
- Never mention "megathread", "Reddit", or sources.
- Do not add tips, advice, or safety guidance unless explicitly stated in the source content.
- Do not guess or infer. If nothing relevant is found, say so briefly.

User query: ${userQuery}`;

    let turn = 1;
    let response = yield* chat.generateText({
      prompt: initialPrompt,
      toolkit,
    });

    while (response.finishReason === "tool-calls" && turn < maxTurns) {
      turn += 1;
      response = yield* chat.generateText({
        prompt:
          "Continue and respond directly to the user with the final SMS-ready answer.",
        toolkit,
      });

      if (response.toolResults.some((result) => result.name === "send_sms")) {
        return;
      }
    }

    if (response.finishReason === "tool-calls" && turn >= maxTurns) {
      yield* Effect.logWarning("Tool-call loop hit max turns");
    }

    return;
  }).pipe(
    Effect.scoped,
    Effect.catchAll(() => Effect.dieMessage("Agent error occurred")),
  );

const WebhookHandler = Effect.gen(function* () {
  yield* Effect.logInfo("Receiving message");

  const request = yield* HttpServerRequest.HttpServerRequest;
  const webhookSecret = yield* Config.redacted("WEBHOOK_SECRET");

  if (!request.url.includes(Redacted.value(webhookSecret))) {
    return yield* HttpServerResponse.text("Unauthorized", {
      status: 401,
    });
  }

  if (request.method !== "POST") {
    return yield* HttpServerResponse.text("Method not allowed", {
      status: 405,
    });
  }

  const body = yield* request.json.pipe(
    Effect.catchTag("RequestError", () =>
      Effect.dieMessage("Failed to decode request"),
    ),
  );

  const decoded = yield* Schema.decodeUnknown(WebhookPayload)(body).pipe(
    Effect.catchTag("ParseError", (error) =>
      Effect.dieMessage("Failed to parse JSON" + error.message),
    ),
  );

  yield* Effect.logInfo(
    `Received SMS request ${JSON.stringify(decoded.query)}`,
  );
  yield* disasterAgent(decoded.query);
  yield* Effect.logInfo(`Agent completed`);

  return yield* HttpServerResponse.text("Ok");
}).pipe(Effect.tapErrorCause(Effect.logError));

// Layer: OpenRouterClient depends on HttpClient and gets API key from Config
const openRouterClientLayer = OpenRouterClient.layerConfig({
  apiKey: Config.redacted("OPENROUTER_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer));

// Layer: OpenRouterLanguageModel depends on OpenRouterClient
const openRouterLanguageModelLayer = OpenRouterLanguageModel.layer({
  model: "openai/gpt-5.2",
}).pipe(Layer.provide(openRouterClientLayer));

// Combined layer for the webhook handler
const appLayer = Layer.mergeAll(
  toolHandlersLayer,
  openRouterLanguageModelLayer,
  FetchHttpClient.layer,
);

// Provide dependencies to webhook handler for Bun export
export const WebhookHandlerWithDeps = WebhookHandler.pipe(
  Effect.provide(appLayer),
);

export default {
  async fetch(request: Request, env: Record<string, string>) {
    const configLayer = Layer.setConfigProvider(ConfigProvider.fromJson(env));

    const handler = HttpApp.toWebHandler(
      WebhookHandlerWithDeps.pipe(Effect.provide(configLayer)),
    );

    return handler(request);
  },
};
