import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

const DARK_BG = '#1A1A2E';
const CARD_BG = '#252541';
const GOLD_ACCENT = '#FFD700';
const TEXT_PRIMARY = '#E8E9ED';
const TEXT_SECONDARY = '#C7CAD1';

interface ReportSummary {
  id: string;
  type: string;
  location: string;
  timestamp: any;
  userName?: string;
  verification_reasoning?: string;
  description?: string;
}

const FlaggedReportsScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { flaggedReports } = route.params as { flaggedReports: ReportSummary[] };

  const renderReportCard = (report: ReportSummary) => (
    <View
      key={`flagged-${report.id}`}
      style={styles.reportCard}
    >
      <View style={styles.reportHeader}>
        <View style={styles.reportMeta}>
          <Text style={styles.reportID}>Report #{report.id.substring(0, 8)}</Text>
          <Text style={styles.reportType}>{report.type}</Text>
          {report.userName && (
            <View style={styles.userRow}>
              <Ionicons name="person" size={13} color={TEXT_SECONDARY} style={{ marginRight: 6 }} />
              <Text style={styles.reportUser}>{report.userName}</Text>
            </View>
          )}
        </View>
        <View style={styles.fakeBadge}>
          <Text style={styles.fakeBadgeText}>FAKE</Text>
        </View>
      </View>

      <View style={styles.locationRow}>
        <Ionicons name="location" size={14} color={TEXT_PRIMARY} style={{ marginRight: 6 }} />
        <Text style={styles.reportLocation}>{report.location}</Text>
      </View>

      {report.description && (
        <View style={styles.descriptionPreview}>
          <Text style={styles.descriptionLabel}>Report Text:</Text>
          <Text style={styles.descriptionText}>
            {report.description}
          </Text>
        </View>
      )}

      {report.verification_reasoning && (
        <View style={styles.reasonBox}>
          <View style={styles.reasonLabelRow}>
            <Ionicons name="close-circle" size={14} color="#E74C3C" style={{ marginRight: 6 }} />
            <Text style={styles.reasonLabel}>Flagged Reason:</Text>
          </View>
          <Text style={styles.reasonText}>
            {report.verification_reasoning}
          </Text>
        </View>
      )}

      <View style={styles.timeRow}>
        <Ionicons name="time" size={12} color={TEXT_SECONDARY} style={{ marginRight: 6 }} />
        <Text style={styles.reportTime}>
          {report.timestamp ? new Date(report.timestamp.toDate?.() || report.timestamp).toLocaleString() : 'Unknown'}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={GOLD_ACCENT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Flagged Reports</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{flaggedReports.length}</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {flaggedReports.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={64} color="#27AE60" />
            <Text style={styles.emptyText}>No flagged reports</Text>
            <Text style={styles.emptySubtext}>All submissions appear legitimate</Text>
          </View>
        ) : (
          flaggedReports.map(renderReportCard)
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop:40,
    flex: 1,
    backgroundColor: DARK_BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
    fontFamily: 'Raleway-Bold',
  },
  badge: {
    backgroundColor: '#E74C3C',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: TEXT_PRIMARY,
    fontWeight: 'bold',
    marginTop: 16,
    fontFamily: 'Raleway-Bold',
  },
  emptySubtext: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 8,
  },
  reportCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#E74C3C',
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  reportMeta: {
    flex: 1,
  },
  reportID: {
    fontSize: 14,
    color: GOLD_ACCENT,
    fontWeight: 'bold',
    marginBottom: 6,
    fontFamily: 'Raleway-Bold',
  },
  reportType: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginBottom: 6,
    fontFamily: 'JosefinSans-Medium',
  },
  reportUser: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    fontFamily: 'JosefinSans-Medium',
  },
  fakeBadge: {
    backgroundColor: '#E74C3C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  fakeBadgeText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  reportLocation: {
    fontSize: 14,
    color: TEXT_PRIMARY,
    fontFamily: 'JosefinSans-Medium',
    flex: 1,
  },
  descriptionPreview: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: GOLD_ACCENT,
  },
  descriptionLabel: {
    fontSize: 13,
    color: GOLD_ACCENT,
    fontWeight: 'bold',
    marginBottom: 8,
    fontFamily: 'Raleway-Bold',
    letterSpacing: 0.5,
  },
  descriptionText: {
    fontSize: 14,
    color: TEXT_PRIMARY,
    lineHeight: 22,
    fontFamily: 'JosefinSans-Medium',
  },
  reasonBox: {
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#E74C3C',
  },
  reasonLabel: {
    fontSize: 13,
    color: '#E74C3C',
    fontWeight: 'bold',
    fontFamily: 'Raleway-Bold',
    letterSpacing: 0.5,
  },
  reasonText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 20,
    fontFamily: 'JosefinSans-Medium',
  },
  reportTime: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    fontFamily: 'JosefinSans',
    flex: 1,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  reasonLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
});

export default FlaggedReportsScreen;
