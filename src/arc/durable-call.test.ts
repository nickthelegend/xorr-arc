import { describe, it, expect, vi } from "vitest";
import { waitForFinalized } from "./durable-call";
import type { PublicClient } from "viem";
describe("Arc finalized tag lag", () => {
  it("waits for the mined block without signing or resubmitting", async () => {
    const getBlock = vi
      .fn()
      .mockResolvedValueOnce({ number: 9n })
      .mockResolvedValueOnce({ number: 10n });
    const pause = vi.fn(async () => {});
    await waitForFinalized(
      { getBlock } as unknown as PublicClient,
      10n,
      3,
      pause,
    );
    expect(getBlock).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(getBlock).toHaveBeenCalledWith({ blockTag: "finalized" });
  });
  it("keeps an unconfirmed receipt pending if the RPC never catches up", async () => {
    const getBlock = vi.fn(async () => ({ number: 9n }));
    await expect(
      waitForFinalized(
        { getBlock } as unknown as PublicClient,
        10n,
        2,
        async () => {},
      ),
    ).rejects.toThrow("No new transaction was sent");
    expect(getBlock).toHaveBeenCalledTimes(2);
  });
});
