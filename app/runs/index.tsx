import React from "react";
import { Button, Text } from "@/ui";
import { api } from "@/arc/api";
import { usePoll } from "@/arc/hooks";
import { useWallet } from "@/arc/wallet";
import { Note, Page } from "@/arc/ui";
import { RoundRow, SpeedReceipt } from "@/arc/rounds";
export default function Runs() {
  const address = useWallet((s) => s.address);
  const read = usePoll(() => api.rounds(address ?? undefined), 10000, [
    address,
  ]);
  return (
    <Page
      title="Fills, timed"
      eyebrow={
        address ? "This wallet’s rounds" : "Public council rounds · all wallets"
      }
    >
      <Text variant="secondary">
        The vote, the fill and the measured wait. Refusals stay in the record
        too. This executor keeps the latest 100 rounds.
      </Text>
      {read.error ? (
        <>
          <Note tone="down">{read.error}</Note>
          <Button label="Try again" onPress={read.refresh} />
        </>
      ) : !read.data ? (
        <Text variant="secondary">Reading rounds…</Text>
      ) : !read.data.rounds.length ? (
        <Note>No rounds recorded by this executor yet.</Note>
      ) : (
        read.data.rounds.map((r) => (
          <React.Fragment key={r.id}>
            <RoundRow round={r} />
            <SpeedReceipt round={r} />
          </React.Fragment>
        ))
      )}
    </Page>
  );
}
