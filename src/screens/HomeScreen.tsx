import React, { useState } from 'react';
import {
  Keyboard,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Analysis, analyzeTicker, getAvailableTickers } from '../engine';
import { Stat } from '../components/Stat';
import { VerdictPill } from '../components/VerdictPill';
import { colors, spacing } from '../theme';

// --- formatting helpers ---------------------------------------------------
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (x: number) => `$${x.toFixed(2)}`;
const big = (millions: number) => {
  const abs = Math.abs(millions);
  if (abs >= 1_000_000) return `$${(millions / 1_000_000).toFixed(2)}T`;
  if (abs >= 1_000) return `$${(millions / 1_000).toFixed(1)}B`;
  return `$${millions.toFixed(0)}M`;
};

const TICKERS = getAvailableTickers();

export function HomeScreen() {
  const [input, setInput] = useState('AAPL');
  const [analysis, setAnalysis] = useState<Analysis | null>(() =>
    analyzeTicker('AAPL'),
  );
  const [error, setError] = useState<string | null>(null);

  const run = (ticker: string) => {
    Keyboard.dismiss();
    const result = analyzeTicker(ticker);
    if (!result) {
      setError(`No data for "${ticker.toUpperCase()}". Try: ${TICKERS.join(', ')}`);
      setAnalysis(null);
      return;
    }
    setError(null);
    setInput(result.financials.ticker);
    setAnalysis(result);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Stock Analyst</Text>
        <Text style={styles.tagline}>Fundamentals + DCF, computed live on device</Text>

        <View style={styles.searchRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => run(input)}
            placeholder="Ticker (e.g. AAPL)"
            placeholderTextColor={colors.subtext}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.input}
          />
          <Pressable style={styles.button} onPress={() => run(input)}>
            <Text style={styles.buttonText}>Analyze</Text>
          </Pressable>
        </View>

        <View style={styles.chips}>
          {TICKERS.map((t) => (
            <Pressable key={t} style={styles.chip} onPress={() => run(t)}>
              <Text style={styles.chipText}>{t}</Text>
            </Pressable>
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {analysis && <AnalysisView analysis={analysis} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function AnalysisView({ analysis }: { analysis: Analysis }) {
  const { financials: f, metrics: m, valuation: v } = analysis;
  return (
    <View>
      {/* Header card: price + valuation verdict */}
      <View style={styles.card}>
        <Text style={styles.company}>{f.name}</Text>
        <Text style={styles.ticker}>{f.ticker}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{usd(f.price)}</Text>
          <VerdictPill verdict={v.verdict} />
        </View>
        <Text style={styles.intrinsic}>
          DCF fair value {usd(v.intrinsicValuePerShare)} ({v.upsideVsPrice >= 0 ? '+' : ''}
          {pct(v.upsideVsPrice)} vs price)
        </Text>
      </View>

      {/* Valuation multiples */}
      <Text style={styles.section}>Valuation</Text>
      <View style={styles.card}>
        <View style={styles.grid}>
          <Stat label="Market cap" value={big(m.marketCap)} />
          <Stat label="Enterprise value" value={big(m.enterpriseValue)} />
          <Stat label="P/E" value={`${m.pe.toFixed(1)}x`} />
          <Stat label="EV / EBIT" value={`${m.evToEbit.toFixed(1)}x`} />
          <Stat label="Price / FCF" value={`${m.priceToFcf.toFixed(1)}x`} />
          <Stat label="EPS" value={usd(m.eps)} />
        </View>
      </View>

      {/* Quality + health */}
      <Text style={styles.section}>Quality &amp; health</Text>
      <View style={styles.card}>
        <View style={styles.grid}>
          <Stat label="Gross margin" value={pct(m.grossMargin)} />
          <Stat label="Operating margin" value={pct(m.operatingMargin)} />
          <Stat label="Net margin" value={pct(m.netMargin)} />
          <Stat label="FCF margin" value={pct(m.fcfMargin)} />
          <Stat label="ROE" value={pct(m.roe)} />
          <Stat label="Debt / equity" value={`${m.debtToEquity.toFixed(2)}x`} />
          <Stat label="Revenue growth" value={pct(f.revenueGrowth)} />
          <Stat label="Net debt" value={big(m.netDebt)} />
        </View>
      </View>

      {/* Placeholder for the AI thesis layer (next phase) */}
      <Text style={styles.section}>AI thesis</Text>
      <View style={[styles.card, styles.thesisCard]}>
        <Text style={styles.thesisText}>
          Coming next: a sourced bull/bear thesis generated by Claude over these
          exact numbers — it reasons, it never invents figures.
        </Text>
      </View>

      <Text style={styles.disclaimer}>
        Illustrative data &amp; educational tooling — not investment advice.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, paddingBottom: spacing.lg * 2 },
  brand: { color: colors.text, fontSize: 30, fontWeight: '800', marginTop: spacing.sm },
  tagline: { color: colors.subtext, fontSize: 14, marginBottom: spacing.lg },
  searchRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  chips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  chip: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipText: { color: colors.subtext, fontWeight: '600' },
  error: { color: colors.red, marginTop: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  company: { color: colors.text, fontSize: 20, fontWeight: '700' },
  ticker: { color: colors.subtext, fontSize: 13, marginTop: 2 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  price: { color: colors.text, fontSize: 28, fontWeight: '800' },
  intrinsic: { color: colors.subtext, fontSize: 13, marginTop: spacing.sm },
  section: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: spacing.lg,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  thesisCard: { borderStyle: 'dashed' },
  thesisText: { color: colors.subtext, fontSize: 14, lineHeight: 20 },
  disclaimer: {
    color: colors.subtext,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
