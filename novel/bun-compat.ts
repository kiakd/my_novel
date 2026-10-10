// Bun runtime compat shim (loaded via `bun --preload ./bun-compat.ts`).
//
// mongodb → bson runs this at module load:
//   const { startupSnapshot } = globalThis?.process?.getBuiltinModule?.('v8') ?? {};
//   if (startupSnapshot?.isBuildingSnapshot?.()) { ... }
// Bun >= 1.3.14 exposes node:v8 with a `startupSnapshot.isBuildingSnapshot` that THROWS
//   NotImplementedError (ERR_NOT_IMPLEMENTED) → backend crashes on startup.
// (The old CI image worked only because its `oven/bun:1` tag resolved to an earlier Bun.)
//
// Fix: hide the 'v8' builtin from getBuiltinModule so bson's `?? {}` fallback skips the
// snapshot probe entirely. Version-independent; does not touch app code or the bson snapshot logic.
const orig = process.getBuiltinModule;
if (typeof orig === 'function') {
  // @ts-expect-error — narrow override to shield bson's optional v8 snapshot probe
  process.getBuiltinModule = function (id: string) {
    if (id === 'v8' || id === 'node:v8') return undefined;
    return orig.call(this, id);
  };
}
