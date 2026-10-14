import React from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Button, Text, colors } from "@/ui";
import { Page } from "@/arc/ui";
export default function How() {
  return (
    <Page title="How xorr works">
      {[
        [
          "1",
          "Fund your wallet",
          "USDC is your trading balance and your gas on Arc. Your assets stay in your wallet.",
        ],
        [
          "2",
          "Give it a limit",
          "Choose a daily cap, venue and expiry. XorrDelegation checks the permission and Chainlink price floor on every fill.",
        ],
        [
          "3",
          "Let the council vote",
          "Five deterministic desks explain their votes. Approved rounds can trade inside your permission; one hold stops them.",
        ],
      ].map(([n, title, body]) => (
        <View key={n} style={{ gap: 12, paddingVertical: 14 }}>
          <Text variant="heroBalance" color={colors.accentHi}>
            {n}
          </Text>
          <Text variant="cardTitle">{title}</Text>
          <Text variant="body" color={colors.ink70}>
            {body}
          </Text>
        </View>
      ))}
      <Button
        label="Set your permission"
        onPress={() => router.push("/permission")}
      />
      <Button
        label="See what has run on Arc"
        variant="ghost"
        onPress={() => router.push("/arc")}
      />
    </Page>
  );
}
