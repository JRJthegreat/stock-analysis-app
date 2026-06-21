import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Verdict } from '../engine';
import { colors } from '../theme';

const COLOR: Record<Verdict, string> = {
  Undervalued: colors.green,
  'Fairly valued': colors.amber,
  Overvalued: colors.red,
};

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  const color = COLOR[verdict];
  return (
    <View style={[styles.pill, { borderColor: color, backgroundColor: color + '22' }]}>
      <Text style={[styles.text, { color }]}>{verdict}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
});
