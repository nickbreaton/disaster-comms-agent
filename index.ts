import { Effect, Schema, Layer, Config, Redacted } from "effect";
import {
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
  HttpApp,
  FetchHttpClient,
  HttpClientRequest,
  HttpClient,
} from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Chat, Tool, Toolkit } from "@effect/ai";
import {
  OpenRouterLanguageModel,
  OpenRouterClient,
} from "@effect/ai-openrouter";
import { RedditService } from "./src/services/RedditService";

const WebhookPayload = Schema.Struct({ query: Schema.String });

const GetRedditPostBody = Tool.make("get_reddit_post", {
  description: "Get the contents of a reddit post",
  parameters: {
    url: Schema.String.annotations({
      description:
        "Full URL of the reddit post (i.e. https://www.reddit.com/r/{{subreddit}}/)",
    }),
  },
  success: Schema.String,
});

const toolkit = Toolkit.make(GetRedditPostBody);
const toolHandlersLayer = toolkit
  .toLayer(
    Effect.gen(function* () {
      const reddit = yield* RedditService;

      return toolkit.of({
        get_reddit_post: ({ url }) => reddit.getPost(url),
      });
    }),
  )
  .pipe(Layer.provide(RedditService.Default));

const LATEST_MEGATHREAD =
  "https://www.reddit.com/r/asheville/comments/1qjvkuh/jan_23_2026_wnc_weekend_winter_weather_megathread";

const disasterAgent = (userQuery: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const chat = yield* Chat.empty;
      const maxTurns = 10;
      const initialPrompt = `You are an emergency SMS assistant for  disasters. Answer the user's question using ONLY information found in the provided megathreads.

Start with the latest megathread: ${LATEST_MEGATHREAD}
If it links to a newer megathread, follow it and prefer the newest dated information.

Tooling:
- Use get_reddit_post to fetch megathread JSON.
- Read post body and the newest comments for actionable updates.
- Keep searching until you can answer or there is no relevant info.

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
      }

      if (response.finishReason === "tool-calls" && turn >= maxTurns) {
        yield* Effect.logWarning("Tool-call loop hit max turns");
      }

      return response;
    }),
  ).pipe(Effect.catchAll(() => Effect.dieMessage("Agent error occurred")));

const WebhookHandler = Effect.gen(function* () {
  yield* Effect.logInfo("Receiving message");

  const request = yield* HttpServerRequest.HttpServerRequest;
  const webhookSecret = yield* Config.redacted("WEBHOOK_SECRET");
  const responseUrl = yield* Config.url("SMS_RESPONSE_URL");

  if (request.method !== "POST") {
    return yield* HttpServerResponse.text("Method not allowed", {
      status: 405,
    });
  }

  if (!request.url.includes(Redacted.value(webhookSecret))) {
    return yield* HttpServerResponse.text("Unauthorized", {
      status: 401,
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

  yield* Effect.logInfo(`Received SMS request from  ${decoded.query}`);

  const response = yield* disasterAgent(decoded.query);

  yield* Effect.logInfo(`Agent completed`);

  // TODO: need to break down into multiple messages
  yield* HttpClientRequest.make("GET")(responseUrl).pipe(
    HttpClientRequest.appendUrlParam("value1", response.text),
    HttpClient.execute,
  );

  yield* Effect.logInfo("Response SMS sent");

  return yield* HttpServerResponse.text(`Response: ${response.text}`);
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
const WebhookHandlerWithDeps = WebhookHandler.pipe(Effect.provide(appLayer));
const handler = HttpApp.toWebHandler(WebhookHandlerWithDeps);

export default handler;
export { handler };

if (import.meta.main) {
  // Server layer for standalone execution
  const serverLayer = HttpServer.serve(WebhookHandlerWithDeps).pipe(
    Layer.provide(BunHttpServer.layer({ port: 3000 })),
  );

  BunRuntime.runMain(
    Effect.logInfo("Server started on port 3000").pipe(
      Effect.flatMap(() => Layer.launch(serverLayer)),
    ),
  );
}
