import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  autoCrimeType?: string | null;
  autoCrimeConfidence?: number | null; // 0-1 or 0-100 depending on source
  autoExtractedLocation?: string | null;
  autoExtractedDate?: string | null;
  autoExtractedTime?: string | null;
  autoCrimeReasoning?: string | null;
  onOpenDetails?: () => void;
}

export default function AutoReportPreview({ autoCrimeType, autoCrimeConfidence, autoExtractedLocation, autoExtractedDate, autoExtractedTime, autoCrimeReasoning, onOpenDetails }: Props) {
  // If no predicted type is present, don't render
  if (!autoCrimeType) return null;

  return (
    <TouchableOpacity style={styles.container} onPress={onOpenDetails} activeOpacity={0.9}>
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark" size={18} color="#fff" />
        </View>
      </View>
      <View style={styles.middle}>
        <Text style={styles.title}>{autoCrimeType || 'Predicted'}</Text>
        {autoCrimeReasoning ? <Text numberOfLines={2} style={styles.reason}>{autoCrimeReasoning}</Text> : null}
      </View>
      {/* Confidence removed from UI per request */}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2F3340',
    padding: 10,
    borderRadius: 10,
    marginHorizontal: 8,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#1E90FF'
  },
  left: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconWrap: {
    backgroundColor: '#1E90FF',
    padding: 8,
    borderRadius: 8,
  },
  middle: {
    flex: 1,
    paddingHorizontal: 10
  },
  right: {
    width: 64,
    alignItems: 'flex-end'
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  sub: {
    color: '#C7CAD1',
    marginTop: 4,
    fontSize: 12
  },
  reason: {
    marginTop: 6,
    color: '#D9DCE0',
    fontSize: 12
  },
  confidenceBadge: {
    backgroundColor: '#111218',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#33363E'
  },
  confidenceText: {
    color: '#FFFFFF',
    fontWeight: '700'
  }
});
