import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

/** One label/value pair inside a metrics grid. */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: '50%',
    paddingVertical: 8,
  },
  label: {
    color: colors.subtext,
    fontSize: 12,
    marginBottom: 2,
  },
  value: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
});
