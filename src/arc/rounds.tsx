/** Source history row and speed receipt, bound to Arc records and real receipt fees. */
import React from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Glow, Press, SheetCard, Text, colors, radius, space } from "@/ui";
import { Icon } from "@/design/Icon";
import { api, type Round } from "./api";
import { useConfig, usePoll } from "./hooks";
import { usd, when } from "./format";
import { Details, TxLink } from "./ui";

export function RoundRow({ round: r }: { round: Round }) {
  const filled = !!r.trade && "hash" in r.trade;
  return (
    <Press
      onPress={() => router.push(`/round/${r.id}`)}
      accessibilityLabel={`${r.inputs.proposal.side} ${r.inputs.proposal.label}, ${filled ? "filled" : r.decision}`}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderColor: colors.hairline,
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="swapH" size={18} color={colors.accentHi} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="rowPrimary">
            {r.inputs.proposal.side === "buy" ? "Buy" : "Sell"}{" "}
            {r.inputs.proposal.label}
          </Text>
          <Text variant="secondarySm">
            {when(r.createdAt)} · {filled ? "filled" : r.decision}
          </Text>
        </View>
        <Text variant="value" figure="own">
          {usd(r.inputs.proposal.usd)}
        </Text>
      </View>
    </Press>
  );
}
export function SpeedReceipt({ round }: { round: Round }) {
  const t = round.trade;
  const hash = t && "hash" in t ? t.hash : null;
  const receipt = usePoll(hash ? () => api.receipt(hash) : null, 0, [hash]);
  const config = useConfig((s) => s.config);
  if (!t || !("hash" in t)) return null;
  return (
    <SheetCard
      bordered
      tone="accent"
      borderRadius={radius.panel}
      padding={space.s18}
      testID="speed-receipt"
    >
      <Glow
        strength={0.22}
        style={{ top: -30, left: -40, right: 120, bottom: 40 }}
      />
      <Text variant="rowPrimary">Speed on Arc</Text>
      <Text variant="heroBalance" style={{ marginTop: 8 }}>
        {(t.ms / 1000).toFixed(2)} s
      </Text>
      <Text variant="secondarySm">
        Send to receipt · {config?.fork ? "Fork" : "Live (testnet)"}
      </Text>
      <Text variant="secondarySm" style={{ marginTop: 6 }}>
        {receipt.data
          ? `${receipt.data.feeUsdc.toFixed(6)} USDC fee`
          : receipt.error
            ? "Fee unavailable from RPC"
            : "Reading the receipt fee…"}
      </Text>
      <Details>
        <Text variant="footnote">
          Measured by the executor, including submission and receipt polling.
          This is not a measurement of consensus finality.{" "}
          {receipt.data
            ? `Block ${receipt.data.block}. Gas used ${receipt.data.gasUsed}.`
            : ""}
        </Text>
        <Text variant="footnote">
          {t.memo.tagged
            ? "Arc Memo carries the council decision id."
            : "Memo was not executed by this node."}
        </Text>
      </Details>
      <TxLink hash={t.hash} />
    </SheetCard>
  );
}
