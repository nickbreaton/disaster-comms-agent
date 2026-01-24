import { Effect, Schema, Layer, Config } from "effect";
import {
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
  HttpApp,
  FetchHttpClient,
} from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { LanguageModel, Tool, Toolkit } from "@effect/ai";
import {
  OpenRouterLanguageModel,
  OpenRouterClient,
} from "@effect/ai-openrouter";

const PhoneNumber = Schema.String.pipe(Schema.brand("PhoneNumber"));
const WebhookPayload = Schema.Struct({
  phone: PhoneNumber,
  query: Schema.String,
});

const SearchMegathread = Tool.make("search_megathread", {
  description:
    "Search r/asheville subreddit megathreads for disaster-related information",
  parameters: {
    query: Schema.String.annotations({
      description: "Search query for finding relevant posts",
    }),
  },
  success: Schema.String,
});

const SummarizeForSMS = Tool.make("summarize_for_sms", {
  description:
    "Summarize findings into SMS-friendly format (max 160 chars, urgent actionable info only)",
  parameters: {
    findings: Schema.String.annotations({
      description: "Findings to summarize",
    }),
  },
  success: Schema.String,
});

const toolkit = Toolkit.make(SearchMegathread, SummarizeForSMS);
const toolHandlersLayer = toolkit.toLayer({
  SearchMegathread: () => Effect.succeed("[]"),
  SummarizeForSMS: () => Effect.succeed("No summary"),
});

const disasterAgent = (userQuery: string) =>
  LanguageModel.generateText({
    prompt: `You help people find critical disaster information from r/asheville megathreads. Use tools to search for information and summarize only urgent, actionable info suitable for SMS (road closures, shelters, emergency services, supplies).

User query: ${userQuery}`,
    toolkit,
  }).pipe(
    Effect.map((r) => r.text),
    Effect.catchAll(() => Effect.dieMessage("Agent error occurred")),
  );

const WebhookHandler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;

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
    Effect.catchTag("ParseError", () =>
      Effect.dieMessage("Failed to parse JSON"),
    ),
  );

  yield* Effect.logInfo(
    `Received SMS request from ${decoded.phone}: ${decoded.query}`,
  );

  const response = yield* disasterAgent(decoded.query);

  yield* Effect.logInfo(`Agent completed`);

  return yield* HttpServerResponse.text(`Response: ${response}`);
});

// Layer: OpenRouterClient depends on HttpClient and gets API key from Config
const openRouterClientLayer = OpenRouterClient.layerConfig({
  apiKey: Config.redacted("OPENROUTER_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer));

// Layer: OpenRouterLanguageModel depends on OpenRouterClient
const openRouterLanguageModelLayer = OpenRouterLanguageModel.layer({
  model: "anthropic/claude-4.5-sonnet",
}).pipe(Layer.provide(openRouterClientLayer));

// Combined layer for the webhook handler
const appLayer = Layer.mergeAll(
  toolHandlersLayer,
  openRouterLanguageModelLayer,
);

// Provide dependencies to webhook handler for Bun export
const WebhookHandlerWithDeps = WebhookHandler.pipe(Effect.provide(appLayer));
const handler = HttpApp.toWebHandler(WebhookHandlerWithDeps);

export default handler;
export { handler };

// Server layer for standalone execution
const serverLayer = HttpServer.serve(WebhookHandlerWithDeps).pipe(
  Layer.provide(BunHttpServer.layer({ port: 3000 })),
);

if (import.meta.main) {
  BunRuntime.runMain(
    Effect.logInfo("Server started on port 3000").pipe(
      Effect.flatMap(() => Layer.launch(serverLayer)),
    ),
  );
}
