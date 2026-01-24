import { Effect, Schema, Layer, Redacted } from "effect"
import { HttpServer, HttpServerRequest, HttpServerResponse, HttpApp, HttpClient } from "@effect/platform"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { LanguageModel, Tool, Toolkit } from "@effect/ai"
import { OpenAiLanguageModel, OpenAiClient } from "@effect/ai-openai"

const PhoneNumber = Schema.String.pipe(Schema.brand("PhoneNumber"))
const WebhookPayload = Schema.Struct({
  phone: PhoneNumber,
  query: Schema.String
})

const SearchMegathread = Tool.make("SearchMegathread", {
  description: "Search r/asheville subreddit megathreads for disaster-related information",
  parameters: {
    query: Schema.String.annotations({ description: "Search query for finding relevant posts" })
  },
  success: Schema.String
})

const SummarizeForSMS = Tool.make("SummarizeForSMS", {
  description: "Summarize findings into SMS-friendly format (max 160 chars, urgent actionable info only)",
  parameters: {
    findings: Schema.String.annotations({ description: "Findings to summarize" })
  },
  success: Schema.String
})

const toolkit = Toolkit.make(SearchMegathread, SummarizeForSMS)
const toolHandlersLayer = toolkit.toLayer({
  SearchMegathread: () => Effect.succeed("[]"),
  SummarizeForSMS: () => Effect.succeed("No summary")
})

const disasterAgent = (userQuery: string) => LanguageModel.generateText({
  prompt: `You help people find critical disaster information from r/asheville megathreads. Use tools to search for information and summarize only urgent, actionable info suitable for SMS (road closures, shelters, emergency services, supplies).

User query: ${userQuery}`,
  toolkit
}).pipe(
  Effect.map((r) => r.text),
  Effect.catchAll(() => Effect.succeed("Agent error occurred"))
)

const WebhookHandler = Effect.gen(function*() {
  const request = yield* HttpServerRequest.HttpServerRequest

  if (request.method !== "POST") {
    return yield* HttpServerResponse.text("Method not allowed", { status: 405 })
  }

  const body = yield* request.json.pipe(
    Effect.orElse(() => Effect.succeed({ phone: "", query: "" }))
  )

  const decoded = yield* Schema.decodeUnknown(WebhookPayload)(body).pipe(
    Effect.orElse(() => Effect.succeed({ phone: "unknown", query: (body as any).query ?? "" }))
  )

  yield* Effect.logInfo(`Received SMS request from ${decoded.phone}: ${decoded.query}`)

  const response = yield* disasterAgent(decoded.query)

  yield* Effect.logInfo(`Agent completed`)

  return yield* HttpServerResponse.text(`Response: ${response}`)
})

const handler = HttpApp.toWebHandler(WebhookHandler)

export default handler
export { handler }

const openAiClientLayer = OpenAiClient.layer({
  apiKey: Redacted.make("sk-test-key")
})

const openAiLanguageModelLayer = OpenAiLanguageModel.layer({
  model: "gpt-4o",
  config: {}
})

const platformLayer = Layer.mergeAll(
  BunHttpServer.layer({ port: 3000 }),
  HttpClient.layer,
  openAiClientLayer,
  toolHandlersLayer,
  openAiLanguageModelLayer
)

if (import.meta.main) {
  BunRuntime.runMain(Effect.logInfo("Server started on port 3000").pipe(
    Effect.flatMap(() => Layer.launch(HttpServer.serve(WebhookHandler).pipe(
      Layer.provide(platformLayer)
    )))
  ))
}