/** Source home composition: balance, round actions, setup steps, agent sheet and floating capsule. */
import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { encodeFunctionData } from "viem";
import {
  AgentOrb,
  Button,
  HoldButton,
  Press,
  Screen,
  SheetCard,
  TabBar,
  Text,
  colors,
  radius,
  space,
} from "@/ui";
import { Avatar, QuickAction, QuickActions } from "@/ui/QuickAction";
import { Rise } from "@/ui/Rise";
import { Icon } from "@/design/Icon";
import { agentGradient } from "@/design/gradients";
import { useStore } from "@/state/store";
import { api } from "@/arc/api";
import { delegationAbi } from "@/arc/abis";
import { usd } from "@/arc/format";
import { useConfig, usePoll } from "@/arc/hooks";
import { Bar, Note, TxLink } from "@/arc/ui";
import { RoundRow } from "@/arc/rounds";
import {
  hasPendingOwnerTransaction,
  recoverOwnerTransaction,
  sendTx,
  useWallet,
} from "@/arc/wallet";
import { SEATS } from "../shared/arc";
export default function Home() {
  const { balancesHidden, setBalancesHidden } = useStore();
  const config = useConfig((s) => s.config);
  const { address, connectDevice, connectInjected } = useWallet();
  const account = usePoll(address ? () => api.account(address) : null, 10000, [
    address,
  ]);
  const rounds = usePoll(address ? () => api.rounds(address) : null, 10000, [
    address,
  ]);
  const [tab, setTab] = useState<"agents" | "activity">("agents");
  const [stopTx, setStopTx] = useState<{ hash: string; ms: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const p = account.data?.permission;
  const live =
    !!p?.granted && !p.revoked && !p.stopped && p.expiresAt * 1000 > Date.now();
  async function connect() {
    if (!config) {
      setError("Arc configuration is still loading. Try again shortly.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await connectInjected(config);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }
  async function stop() {
    if (!config?.deployment || stopping) return;
    setStopping(true);
    setError(null);
    try {
      setStopTx(
        await sendTx(
          config.deployment.delegation,
          encodeFunctionData({ abi: delegationAbi, functionName: "revoke" }),
        ),
      );
      await account.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0]! : String(e));
    } finally {
      setStopping(false);
    }
  }
  return (
    <Screen gutter="none" tabBar>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View style={{ paddingHorizontal: space.gutter, gap: space.s22 }}>
          <Rise index={0}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Avatar initial="X" />
              <View style={{ flex: 1 }}>
                <Text variant="rowPrimary">
                  {address
                    ? `${address.slice(0, 6)}…${address.slice(-4)}`
                    : "Your desk"}
                </Text>
                <Text variant="secondarySm">
                  {config
                    ? config.fork
                      ? "Local fork"
                      : config.arc.name
                    : "Connecting to Arc…"}{" "}
                  · USDC
                </Text>
              </View>
              <Press
                onPress={() => router.push("/explore")}
                accessibilityRole="button"
                accessibilityLabel="Explore"
                testID="open-explore"
                hitHeight={44}
              >
                <Icon name="grid" size={22} color={colors.ink70} />
              </Press>
            </View>
          </Rise>
          <Rise index={1}>
            <Press
              onPress={() => setBalancesHidden(!balancesHidden)}
              accessibilityRole="button"
              accessibilityLabel={
                balancesHidden ? "Show balances" : "Hide balances"
              }
              testID="toggle-balances"
            >
              <Text variant="secondary">USDC balance</Text>
              <Text variant="heroBalance" figure="own" style={{ marginTop: 6 }}>
                {account.data ? usd(account.data.gasUsdc) : "—"}
              </Text>
            </Press>
            <Text
              variant="secondarySm"
              color={colors.ink55}
              style={{ marginTop: 6 }}
            >
              {account.error
                ? "Balance unavailable. Try again from Fund."
                : "Your money. Your permission. USDC pays gas too."}
            </Text>
          </Rise>
          <QuickActions>
            <QuickAction
              icon="plus"
              label="Fund"
              primary
              onPress={() => router.push("/fund")}
            />
            <QuickAction
              icon="swapH"
              label="Trade"
              onPress={() => router.push("/council")}
            />
            <QuickAction
              icon="strategies"
              label="Permission"
              onPress={() => router.push("/permission")}
              testID="open-permission"
            />
            <QuickAction
              icon="activity"
              label="History"
              onPress={() => router.push("/history")}
            />
          </QuickActions>
          {!address ? (
            <SheetCard tone="accent">
              <Text variant="cardTitle">
                A bot that trades within your limits.
              </Text>
              <Text variant="secondary" style={{ marginVertical: 12 }}>
                Five rule-based agents, not an LLM. You decide what they may
                spend and when they stop.
              </Text>
              <Button
                label="Create a device key"
                disabled={!config}
                testID="connect-device"
                onPress={() => {
                  if (config) connectDevice(config);
                }}
              />
              <Button
                label={
                  connecting ? "Connecting wallet…" : "Use a browser wallet"
                }
                loading={connecting}
                disabled={!config}
                testID="connect-browser"
                variant="ghost"
                onPress={connect}
              />
              <Text variant="footnote" color={colors.ink55}>
                Device keys stay in this browser’s storage. Use them for testnet
                only.
              </Text>
            </SheetCard>
          ) : (
            <View style={{ gap: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  borderWidth: 1,
                  borderColor: colors.cardBorder,
                  borderRadius: radius.card,
                  backgroundColor: colors.surface,
                }}
              >
                {[
                  {
                    label: "Fund",
                    done: !!account.data && account.data.gasUsdc > 0,
                    route: "/fund",
                  },
                  { label: "Permit", done: live, route: "/permission" },
                  {
                    label: "Trade",
                    done: !!rounds.data?.rounds.some(
                      (r) => r.trade && "hash" in r.trade,
                    ),
                    route: "/council",
                  },
                ].map((s, i) => (
                  <Press
                    key={s.label}
                    onPress={() => router.push(s.route as never)}
                    accessibilityRole="button"
                    style={{
                      flex: 1,
                      alignItems: "center",
                      gap: 6,
                      padding: 12,
                      borderLeftWidth: i ? 1 : 0,
                      borderColor: colors.hairline,
                    }}
                  >
                    <Icon
                      name={s.done ? "check" : "plus"}
                      size={14}
                      color={colors.ink55}
                    />
                    <Text variant="secondarySm">{s.label}</Text>
                  </Press>
                ))}
              </View>
              {p ? (
                <Press
                  onPress={() => router.push("/permission")}
                  testID="permission-card"
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text variant="secondarySm">
                      {live ? "Agents may trade" : "Agents are stopped"}
                    </Text>
                    <Text variant="secondarySm" figure="own">
                      {usd(p.remainingToday)} left today
                    </Text>
                  </View>
                  <View style={{ marginTop: 8 }}>
                    <Bar
                      fraction={p.dailyCap ? p.spentToday / p.dailyCap : 0}
                    />
                  </View>
                </Press>
              ) : (
                <Text variant="secondarySm">
                  Reading your permission from Arc…
                </Text>
              )}
              {live ? (
                <HoldButton
                  label={
                    stopping ? "Stopping on Arc…" : "Hold to stop every agent"
                  }
                  onCommit={stop}
                  testID="hold-stop"
                />
              ) : null}
            </View>
          )}
          {hasPendingOwnerTransaction() ? (
            <Button
              label="Check the unconfirmed transaction"
              variant="secondary"
              onPress={async () => {
                try {
                  await recoverOwnerTransaction();
                  setError(null);
                  await account.refresh();
                } catch (e) {
                  setError(String(e));
                }
              }}
            />
          ) : null}
          {stopTx ? (
            <Note tone="up">
              Stopped on Arc in {stopTx.ms} ms. <TxLink hash={stopTx.hash} />
            </Note>
          ) : null}
          {error ? <Note tone="down">{error}</Note> : null}
        </View>
        <Rise index={2} style={{ marginTop: 28 }}>
          <View
            style={{
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              backgroundColor: colors.surface,
              padding: space.gutter,
              borderTopWidth: 1,
              borderColor: colors.cardBorder,
              gap: 18,
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                backgroundColor: colors.ink28,
                borderRadius: 2,
                alignSelf: "center",
              }}
            />
            <View style={{ flexDirection: "row", gap: 24 }}>
              {(["agents", "activity"] as const).map((t) => (
                <Press
                  key={t}
                  onPress={() => setTab(t)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t }}
                  aria-selected={tab === t}
                  style={{
                    paddingBottom: 10,
                    borderBottomWidth: 2,
                    borderColor: tab === t ? colors.accent : "transparent",
                  }}
                >
                  <Text
                    variant="rowPrimary"
                    color={tab === t ? colors.ink : colors.ink55}
                  >
                    {t === "agents" ? "Your council" : "Latest rounds"}
                  </Text>
                </Press>
              ))}
            </View>
            {tab === "agents" ? (
              <>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 20 }}
                >
                  {SEATS.map((s) => (
                    <Press
                      key={s.id}
                      onPress={() => router.push(`/rooms?seat=${s.id}`)}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${s.name} room`}
                      style={{ width: "33.33%", alignItems: "center", gap: 8 }}
                    >
                      <AgentOrb
                        gradient={agentGradient(s.name)}
                        size={56}
                        face
                        identity={s.name}
                        bloom
                      />
                      <Text variant="secondarySm" align="center">
                        {s.name}
                      </Text>
                    </Press>
                  ))}
                </View>
                <Text variant="secondarySm">
                  Each desk reads Arc, votes by fixed rules and records its
                  reasons.
                </Text>
              </>
            ) : (
              <>
                {rounds.error ? <Note tone="down">{rounds.error}</Note> : null}
                {!address ? (
                  <Text variant="secondary">Connect to see your rounds.</Text>
                ) : !rounds.data ? (
                  <Text variant="secondary">Reading rounds…</Text>
                ) : !rounds.data.rounds.length ? (
                  <Text variant="secondary">
                    No rounds yet. Convene the council to start.
                  </Text>
                ) : (
                  rounds.data.rounds
                    .slice(0, 4)
                    .map((r) => <RoundRow key={r.id} round={r} />)
                )}
              </>
            )}
            <Button
              label="Explore xorr"
              variant="secondary"
              onPress={() => router.push("/explore")}
            />
          </View>
        </Rise>
      </ScrollView>
      <TabBar
        active="home"
        onHome={() => router.replace("/")}
        onSwap={() => router.push("/council")}
        onMessages={() => router.push("/rooms")}
      />
    </Screen>
  );
}
