import type { FigureKind } from "../ui/mask";
/** Arc-specific building blocks on top of XORR's design system (src/ui). */
import React from 'react';
import { Linking, Platform, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { Eyebrow, Press, SheetCard, Text, Screen, HeaderBar, colors, radius, size, space } from '@/ui';
import { useConfig } from './hooks';
import { short } from './format';

export function open(url: string) {
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
  else void Linking.openURL(url);
}

export function TxLink({ hash, label }: { hash?: string | null; label?: string }) {
  const cfg = useConfig((s) => s.config);
  if (!hash) return null;
  const fork = cfg?.fork;
  return (
    <Press onPress={fork ? undefined : () => open(`${cfg?.explorerUrl}/tx/${hash}`)} testID={`tx-${hash.slice(0, 10)}`}>
      <Text variant="secondary" color={fork ? colors.ink55 : colors.accentHi}>
        {label ? `${label} ` : ''}
        {short(hash, 10)}
        {fork ? ' (local fork)' : ' ↗'}
      </Text>
    </Press>
  );
}

export function AddressLink({ address, label }: { address?: string | null; label?: string }) {
  const cfg = useConfig((s) => s.config);
  if (!address) return <Text variant="secondary">—</Text>;
  return (
    <Press onPress={() => open(`${cfg?.explorerUrl}/address/${address}`)}>
      <Text variant="secondary" color={colors.accentHi}>
        {label ? `${label} ` : ''}
        {short(address, 8)} ↗
      </Text>
    </Press>
  );
}

export function Page({ title, eyebrow, children, back = true }: { title: string; eyebrow?: string; children: React.ReactNode; back?: boolean }) {
  return (
    <Screen gutter="none">
      <View style={{ paddingHorizontal: space.gutter }}>
        <HeaderBar onBack={back ? () => (router.canGoBack() ? router.back() : router.replace('/')) : undefined}
          title={<Text variant="screenTitle">{title}</Text>} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: space.gutter, paddingBottom: 36, gap: space.s16 }}>
        <NetworkBadge />
        {eyebrow ? <Text variant="secondarySm">{eyebrow}</Text> : null}
        {children}
      </ScrollView>
    </Screen>
  );
}

export function NetworkBadge() {
  const cfg = useConfig((s) => s.config);
  if (!cfg) return null;
  const label = cfg.fork ? `${cfg.arc.name} · local fork` : cfg.arc.name;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, backgroundColor: colors.accentSoft }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: cfg.network === 'arc-mainnet' && !cfg.fork ? colors.up : colors.accent }} />
      <Text variant="secondarySm" color={colors.accentHi} testID="network-badge">
        {label}
      </Text>
    </View>
  );
}

export function Card({ title, eyebrow, children, tone, style, testID }: { title?: string; eyebrow?: string; children: React.ReactNode; tone?: 'accent'; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <SheetCard tone={tone} style={style} testID={testID}>
      <View style={{ gap: space.s10 }}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        {title ? <Text variant="cardTitle">{title}</Text> : null}
        {children}
      </View>
    </SheetCard>
  );
}

/** A line of explanation behind a "Details" tap: the reading stays on the card, the why is one tap away. */
export function Details({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <View style={{ gap: space.s6 }}>
      <Press onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitHeight={size.hit} testID={testID} style={{ alignSelf: 'flex-start' }}>
        <Text variant="footnote" color={colors.ink40}>
          {open ? 'Hide details' : 'Details'}
        </Text>
      </Press>
      {open ? children : null}
    </View>
  );
}

export function KV({ k, v, tone, figure = 'own' }: { k: string; v: React.ReactNode; tone?: string; figure?: FigureKind }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s12, alignItems: 'flex-start' }}>
      <Text variant="secondary" style={{ flexShrink: 0 }}>
        {k}
      </Text>
      {typeof v === 'string' || typeof v === 'number' ? (
        <Text variant="value" figure={figure} color={tone} align="right" style={{ flexShrink: 1 }}>
          {v}
        </Text>
      ) : (
        v
      )}
    </View>
  );
}

export function Note({ children, tone }: { children: React.ReactNode; tone?: 'warn' | 'down' | 'up' }) {
  const bg = tone === 'warn' ? colors.warnBg : tone === 'down' ? colors.downBg : tone === 'up' ? colors.upBg : colors.neutralBg;
  const fg = tone === 'warn' ? colors.warn : tone === 'down' ? colors.down : tone === 'up' ? colors.up : colors.ink70;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.tile, padding: space.s12 }}>
      <Text variant="bodySm" color={fg}>
        {children}
      </Text>
    </View>
  );
}

export function Choice<T extends string | number>({ options, value, onChange, testID }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void; testID?: string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Press key={String(o.value)} onPress={() => onChange(o.value)} testID={testID ? `${testID}-${o.value}` : undefined}>
            <View style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.full, backgroundColor: on ? colors.ink : colors.control, borderWidth: 1, borderColor: on ? colors.ink : colors.inputBorder }}>
              <Text variant="control" color={on ? colors.onInk : colors.ink70}>
                {o.label}
              </Text>
            </View>
          </Press>
        );
      })}
    </View>
  );
}

export function Bar({ fraction }: { fraction: number }) {
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.control, overflow: 'hidden' }}>
      <View style={{ width: `${f * 100}%`, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
    </View>
  );
}
