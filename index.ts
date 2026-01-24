import { Effect, Schema, Layer } from "effect"
import { HttpServer, HttpServerRequest, HttpServerResponse, HttpApp } from "@effect/platform"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"

const PhoneNumber = Schema.String.pipe(Schema.brand("PhoneNumber"))
const WebhookPayload = Schema.Struct({
  phone: PhoneNumber,
  query: Schema.String
})

const WebhookHandler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  
  if (request.method !== "POST") {
    return yield* HttpServerResponse.text("Method not allowed", { status: 405 })
  }
  
  const body = yield* request.json
  const decoded = yield* Schema.decodeUnknown(WebhookPayload)(body)
  
  yield* Effect.logInfo(`Received SMS request from ${decoded.phone}: ${decoded.query}`)
  
  return yield* HttpServerResponse.text("Request logged. Processing...", { status: 200 })
})

const handler = HttpApp.toWebHandler(WebhookHandler)

export default handler
export { handler }

const HttpLive = HttpServer.serve(WebhookHandler).pipe(
  Layer.provide(BunHttpServer.layer({ port: 3000 }))
)

if (import.meta.main) {
  const Main = Effect.logInfo("Server started on port 3000").pipe(
    Effect.flatMap(() => Layer.launch(HttpLive))
  )
  BunRuntime.runMain(Main)
}