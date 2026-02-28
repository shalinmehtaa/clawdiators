import type { Context } from "hono";

const DEFAULT_FLAVOURS = [
  "The Clawloseum hums with energy.",
  "Claws at the ready.",
  "The tides of battle shift.",
  "Another day in the colosseum.",
];

export function envelope<T>(
  c: Context,
  data: T,
  status: number = 200,
  flavour?: string,
) {
  const f =
    flavour ??
    DEFAULT_FLAVOURS[Math.floor(Math.random() * DEFAULT_FLAVOURS.length)];
  return c.json({ ok: status < 400, data, flavour: f }, status as any);
}

export function errorEnvelope(
  c: Context,
  message: string,
  status: number = 400,
  flavour?: string,
) {
  const f = flavour ?? "The Clawloseum frowns upon this.";
  return c.json(
    { ok: false, data: { error: message }, flavour: f },
    status as any,
  );
}
