import { Effect, Ref } from "effect";

export class SmsSendState extends Effect.Service<SmsSendState>()(
  "@services/SmsSendState",
  {
    effect: Effect.gen(function* () {
      const ref = yield* Ref.make(false);

      const markSent = () => Ref.set(ref, true);
      const isSent = () => Ref.get(ref);

      return { markSent, isSent };
    }),
  },
) {}
