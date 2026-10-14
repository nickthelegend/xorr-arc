/** Source Explore layout, adapted to the Arc API catalog. */
import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import {
  Eyebrow,
  Fill,
  Glow,
  HeaderBar,
  Press,
  Screen,
  SheetCard,
  Text,
  colors,
  divider,
  radius,
  size,
  space,
} from "@/ui";
import { Rise } from "@/ui/Rise";
import { Icon, type IconName } from "@/design/Icon";

type Item = { route: string; title: string; detail: string };
type Group = { title: string; items: Item[] };

/** Each `detail` says what the screen shows, in a few words, rather than restating its title. */
const GROUPS: Group[] = [
  {
    title: "Markets",
    items: [
      {
        route: "/markets",
        title: "Markets",
        detail: "Chainlink prices beside the venue",
      },
      {
        route: "/treasury",
        title: "Treasury",
        detail: "EURC and permissioned USYC",
      },
    ],
  },
  {
    title: "Agents",
    items: [
      {
        route: "/agents",
        title: "Identity & reputation",
        detail: "Five ERC-8004 seats, read from Arc",
      },
    ],
  },
];

type Story = {
  route: string;
  params?: Record<string, string>;
  title: string;
  detail: string;
  icon: IconName;
};
/** The story, first: what xorr is about on Arc, each a screen that shows it rather than says it. */
const STORY: Story[] = [
  {
    route: "/arc",
    title: "Built on Arc",
    detail: "Live, fork and not run. Every piece, with evidence.",
    icon: "activity",
  },
  {
    route: "/council",
    title: "The council",
    detail: "Five rule-based votes; replay any round.",
    icon: "sparkle",
  },
  {
    route: "/runs",
    title: "Fills, timed",
    detail: "Each fill’s measured speed and USDC fee.",
    icon: "swapH",
  },
  {
    route: "/rooms",
    title: "Agent rooms",
    detail: "What each desk voted, and the numbers behind it.",
    icon: "chat",
  },
  {
    route: "/permission",
    title: "Your permission",
    detail: "A daily limit, a venue, an end date. Yours to stop.",
    icon: "strategies",
  },
  {
    route: "/how",
    title: "How xorr works",
    detail: "Three steps, in a minute.",
    icon: "markets",
  },
];
/** Then the four places your own money shows. */
const YOURS: Item[] = [
  {
    route: "/fund",
    title: "Fund & withdraw",
    detail: "USDC on Arc; cross-chain routes labelled Not run",
  },
  {
    route: "/history",
    title: "History",
    detail: "Every recorded fill for this wallet",
  },
  {
    route: "/permission",
    title: "Today’s limit",
    detail: "Spent, left and the stop switch",
  },
];
const STORY_SHOWN = STORY;
const YOURS_SHOWN = YOURS;
const SHOWN = GROUPS;
const ELSEWHERE = SHOWN.reduce((n, g) => n + g.items.length, 0);

function ExploreRow({ item, onPress }: { item: Item; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.detail}`}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: space.s12,
          minHeight: size.rowLg,
          paddingVertical: space.s10,
        },
        divider,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text variant="rowPrimary">{item.title}</Text>
        <Text
          variant="secondarySm"
          color={colors.ink55}
          style={{ marginTop: space.s2 }}
        >
          {item.detail}
        </Text>
      </View>
      <Icon name="chevron" size={14} color={colors.ink30} />
    </Press>
  );
}

export default function Explore() {
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace("/");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar
          onBack={goBack}
          title={<Text variant="screenTitle">Explore</Text>}
        />
      </View>

      <Fill style={{ marginTop: space.s8 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: space.gutter,
            paddingBottom: space.s30,
          }}
        >
          <Eyebrow style={{ marginTop: space.s16 }}>The story</Eyebrow>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: space.s10,
              marginTop: space.s10,
            }}
          >
            {STORY_SHOWN.map((t, i) => (
              <Rise
                key={t.route}
                index={i}
                style={{ width: "48%", flexGrow: 1 }}
              >
                <Press
                  onPress={() =>
                    router.push(
                      (t.params
                        ? { pathname: t.route, params: t.params }
                        : t.route) as never,
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${t.title}. ${t.detail}`}
                  testID={`explore-story-${t.route.slice(1)}`}
                >
                  <SheetCard
                    bordered
                    tone={i === 0 ? "accent" : "default"}
                    borderRadius={radius.panel}
                    padding={space.s14}
                    style={{ minHeight: 118 }}
                  >
                    {i === 0 ? (
                      <Glow
                        strength={0.2}
                        style={{ top: -20, left: -20, right: 40, bottom: 20 }}
                      />
                    ) : null}
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: colors.accentSoft,
                        borderWidth: 1,
                        borderColor: colors.accentLine,
                      }}
                    >
                      <View>
                        <Icon
                          name={t.icon}
                          size={15}
                          color={colors.accentHi}
                          strokeWidth={2}
                        />
                      </View>
                    </View>
                    <Text variant="rowPrimary" style={{ marginTop: space.s10 }}>
                      {t.title}
                    </Text>
                    <Text
                      variant="footnote"
                      color={colors.ink55}
                      style={{ marginTop: space.s2 }}
                    >
                      {t.detail}
                    </Text>
                  </SheetCard>
                </Press>
              </Rise>
            ))}
          </View>

          <View style={{ marginTop: space.s22 }}>
            <Eyebrow>Your money</Eyebrow>
            {YOURS_SHOWN.map((item) => (
              <ExploreRow
                key={item.route}
                item={item}
                onPress={() => router.push(item.route as never)}
              />
            ))}
          </View>

          <Press
            onPress={() => setOpen(!open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={
              open
                ? "Hide everything else"
                : `Everything else, ${ELSEWHERE} screens`
            }
            testID="explore-everything"
            style={{
              marginTop: space.s16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              minHeight: size.rowLg,
            }}
          >
            <View>
              <Text variant="rowPrimary">
                {open ? "Hide everything else" : "Everything else"}
              </Text>
              <Text
                variant="secondarySm"
                color={colors.ink55}
                style={{ marginTop: space.s2 }}
              >
                {`${ELSEWHERE} more screens: money, markets, agents, proof, the system`}
              </Text>
            </View>
            <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
              <Icon name="chevron" size={14} color={colors.ink55} />
            </View>
          </Press>

          {open
            ? SHOWN.map((g) => (
                <View
                  key={g.title}
                  style={{ marginTop: space.s22 }}
                  testID="explore-group"
                >
                  <Eyebrow>{g.title}</Eyebrow>
                  {g.items.map((item) => (
                    <ExploreRow
                      key={item.route}
                      item={item}
                      onPress={() => router.push(item.route as never)}
                    />
                  ))}
                </View>
              ))
            : null}
        </ScrollView>
      </Fill>
    </Screen>
  );
}
