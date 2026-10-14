/** Source agent-room navigation, backed by recorded ballots rather than LLM chat. */
import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AgentOrb, Button, Press, SheetCard, Text, colors, space } from "@/ui";
import { agentGradient } from "@/design/gradients";
import { api } from "@/arc/api";
import { usePoll } from "@/arc/hooks";
import { useWallet } from "@/arc/wallet";
import { Note, Page } from "@/arc/ui";
import { when } from "@/arc/format";
import { SEATS } from "../shared/arc";
export default function Rooms() {
  const params = useLocalSearchParams<{ seat?: string }>();
  const [selected, setSelected] = useState(params.seat ?? SEATS[0]!.id);
  const seat = SEATS.find((s) => s.id === selected) ?? SEATS[0]!;
  const address = useWallet((s) => s.address);
  const read = usePoll(() => api.rounds(address ?? undefined), 10000, [
    address,
  ]);
  return (
    <Page
      title="Agent rooms"
      eyebrow="Recorded reasons · rule-based, not an LLM"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 16, paddingBottom: 10 }}
      >
        {SEATS.map((s) => (
          <Press
            key={s.id}
            onPress={() => setSelected(s.id)}
            accessibilityLabel={s.name}
            accessibilityState={{ selected: s.id === seat.id }}
            style={{
              width: 76,
              alignItems: "center",
              gap: 8,
              opacity: s.id === seat.id ? 1 : 0.5,
            }}
          >
            <AgentOrb
              gradient={agentGradient(s.name)}
              size={56}
              identity={s.name}
              face
              bloom={s.id === seat.id}
            />
            <Text variant="secondarySm" align="center">
              {s.name}
            </Text>
          </Press>
        ))}
      </ScrollView>
      <View style={{ gap: 6 }}>
        <Text variant="cardTitle">{seat.name}</Text>
        <Text variant="secondary">{seat.role}</Text>
      </View>
      {!address ? (
        <Note>
          Public rounds from all wallets. Connect on Home to show only yours.
        </Note>
      ) : null}
      {read.error ? (
        <>
          <Note tone="down">{read.error}</Note>
          <Button label="Try again" onPress={read.refresh} />
        </>
      ) : !read.data ? (
        <Text variant="secondary">Reading this desk’s record…</Text>
      ) : !read.data.rounds.length ? (
        <Note>
          No votes recorded yet. Convene a council round to hear this desk’s
          reason.
        </Note>
      ) : (
        read.data.rounds.map((r) => {
          const b = r.ballots.find((b) => b.seat === seat.id);
          return b ? (
            <SheetCard key={r.id} style={{ gap: space.s10 }}>
              <Text variant="footnote" color={colors.ink55}>
                {when(r.createdAt)} · {r.inputs.proposal.side}{" "}
                {r.inputs.proposal.label}
              </Text>
              <Text
                variant="rowPrimary"
                color={b.vote === "veto" ? colors.down : colors.accentHi}
              >
                {b.vote.toUpperCase()}
              </Text>
              <Text variant="bodySm">{b.reason}</Text>
              <Button
                label="Replay this round"
                variant="ghost"
                onPress={() => router.push(`/round/${r.id}`)}
              />
            </SheetCard>
          ) : null;
        })
      )}
      <Button
        label="Convene the council"
        onPress={() => router.push("/council")}
      />
    </Page>
  );
}
