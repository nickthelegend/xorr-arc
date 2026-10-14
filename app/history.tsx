import React, { useState } from "react";
import { router } from "expo-router";
import { Button, Text } from "@/ui";
import { api } from "@/arc/api";
import { usePoll } from "@/arc/hooks";
import { useWallet } from "@/arc/wallet";
import { Choice, Note, Page } from "@/arc/ui";
import { RoundRow } from "@/arc/rounds";
export default function History() {
  const address = useWallet((s) => s.address);
  const read = usePoll(address ? () => api.rounds(address) : null, 10000, [
    address,
  ]);
  const [filter, setFilter] = useState("all");
  const rows = read.data?.rounds.filter(
    (r) =>
      r.trade &&
      "hash" in r.trade &&
      (filter === "all" || r.inputs.proposal.side === filter),
  );
  return (
    <Page title="History" eyebrow="Confirmed fills recorded by this executor">
      <Choice
        options={[
          { label: "All", value: "all" },
          { label: "Buys", value: "buy" },
          { label: "Sells", value: "sell" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {!address ? (
        <>
          <Note>Connect your wallet to see its history.</Note>
          <Button label="Connect a wallet" onPress={() => router.push("/")} />
        </>
      ) : read.error ? (
        <>
          <Note tone="down">{read.error}</Note>
          <Button label="Try again" onPress={read.refresh} />
        </>
      ) : !rows ? (
        <Text variant="secondary">Reading your fills…</Text>
      ) : rows.length ? (
        rows.map((r) => <RoundRow key={r.id} round={r} />)
      ) : (
        <Note>
          No fills in this view yet. Approved rounds with confirmed trades
          appear here.
        </Note>
      )}
      <Button
        label="All rounds and refusals"
        variant="ghost"
        onPress={() => router.push("/runs")}
      />
    </Page>
  );
}
