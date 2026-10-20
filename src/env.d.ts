/// <reference types="vite/client" />

/** a fingerprint of src/game and the balance data, put in by the vite/vitest `define` (scripts/simBuild.ts) */
declare const __SIM_BUILD__: string;

declare module "*.yaml" {
  const data: unknown;
  export default data;
}
