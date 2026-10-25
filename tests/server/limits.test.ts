import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POLL_FOR } from "../../src/scores";
import { MAX_QUEUE, REPLAY_TIMEOUT_MS, SUBMITS_PER_HOUR, SYNC_WAIT_MS } from "../../server/limits";

const text = (f: string) => readFileSync(new URL("../../" + f, import.meta.url), "utf8");

describe("what the service allows", () => {
  it("a replay may take as long as a late game needs: 56 s at the natural pace, 77 s with the waves called at once", () => {
    expect(REPLAY_TIMEOUT_MS).toBeGreaterThan(77_000);
    expect(REPLAY_TIMEOUT_MS).toBe(90_000);
    expect(MAX_QUEUE).toBe(3);
    expect(SUBMITS_PER_HOUR).toBe(20);
  });

  it("the page waits at least for the longest replay (after the service's own wait), and nginx need not wait for it", () => {
    expect(POLL_FOR).toBe(120_000);
    expect(POLL_FOR).toBeGreaterThanOrEqual(REPLAY_TIMEOUT_MS + SYNC_WAIT_MS);
    // nginx waits for one answer, and the service answers after SYNC_WAIT_MS: well inside proxy_read_timeout
    const read = /proxy_read_timeout (\d+)s/.exec(text("server/deploy/nginx-xeno-api.conf"));
    expect(Number(read![1]) * 1000).toBeGreaterThan(SYNC_WAIT_MS);
  });

  it("the documents say the same numbers", () => {
    for (const f of ["README.md", "server/deploy/README.md"]) {
      const doc = text(f);
      expect(doc, f).toContain("90 s");
      expect(doc, f).toContain("56 s");
      expect(doc, f).toContain("77 s");
      expect(doc, f).not.toMatch(/\b20 s of CPU/);
    }
    expect(text("README.md")).toContain("120 s");
    const unit = text("server/deploy/xeno-scores.service");
    expect(unit).toMatch(/^Nice=10$/m);
    expect(unit).toMatch(/^CPUWeight=50$/m);
    expect(unit).toContain("90 s");
  });
});
