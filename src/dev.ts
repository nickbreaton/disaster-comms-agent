import { HttpServer } from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { WebhookHandlerWithDeps } from ".";
import { Effect, Layer } from "effect";
import { SmsSendState } from "./services/SmsSendState";

// Server layer for standalone execution
const serverLayer = HttpServer.serve(WebhookHandlerWithDeps).pipe(
  Layer.provide(BunHttpServer.layer({ port: 3000 })),
  Layer.provide(SmsSendState.Default),
);

BunRuntime.runMain(
  Effect.logInfo("Server started on port 3000").pipe(
    Effect.flatMap(() => Layer.launch(serverLayer)),
  ),
);
