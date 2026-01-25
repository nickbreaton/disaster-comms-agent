import { Args, Command } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "@effect/platform"
import { Config, Effect } from "effect"

const query = Args.text({ name: "query" })

const command = Command.make("query", { query }, ({ query }) =>
  Effect.gen(function* () {
    const webhookSecret = yield* Config.string("WEBHOOK_SECRET")
    const client = yield* HttpClient.HttpClient

    const request = yield* HttpClientRequest.post(`http://localhost:3000/${webhookSecret}`).pipe(
      HttpClientRequest.bodyJson({ query }),
    )

    const response = yield* client.execute(request)
    const text = yield* response.text

    yield* Effect.log(text)
  }),
)

const cli = Command.run(command, { name: "query", version: "0.0.0" })

cli(process.argv).pipe(
  Effect.provide(BunContext.layer),
  Effect.provide(FetchHttpClient.layer),
  BunRuntime.runMain,
)
