import { HttpServer } from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { WebhookHandlerWithDeps } from ".";
import { Effect, Layer } from "effect";

// Server layer for standalone execution
const serverLayer = HttpServer.serve(WebhookHandlerWithDeps).pipe(
  Layer.provide(BunHttpServer.layer({ port: 3000 })),
);

BunRuntime.runMain(
  Effect.logInfo("Server started on port 3000").pipe(
    Effect.flatMap(() => Layer.launch(serverLayer)),
  ),
);
