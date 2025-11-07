import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  FlatList,
  Dimensions,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { auth, db } from '../../firebaseConfig';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

type Props = NativeStackScreenProps<RootStackParamList, 'IncidentEscalationRisks'>;

const DARK_NAVY = '#1E1E2F';
const CARD_BG = '#303045';
const GOLD_ACCENT = '#FFD700';
const INACTIVE_GRAY = '#7F8C99';
const { width } = Dimensions.get('window');

interface EscalationReport {
  id: string;
  reportId: string;
  description: string;
  location: string;
  status: 'Pending' | 'Investigating' | 'Resolved';
  timestamp?: any;
  userName?: string;
  type: string; // 'Citizen Post' or 'AI Summary'
  // Escalation prediction fields
  escalation_prediction?: string;
  escalation_confidence?: number;
  escalation_probabilities?: { Low: number; Medium: number; High: number };
  escalation_reasoning?: string;
  escalation_predicted_at?: any;
}

export default function IncidentEscalationRisksScreen({ navigation }: Props) {
  const user = auth.currentUser;
  const [allReports, setAllReports] = useState<EscalationReport[]>([]);
  const [filteredReports, setFilteredReports] = useState<EscalationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');
  const [selectedReport, setSelectedReport] = useState<EscalationReport | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Fetch all reports with escalation predictions
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const reportsQuery = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(
      reportsQuery,
      (snapshot) => {
        const reports: EscalationReport[] = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              reportId: `REP-${doc.id.substring(0, 5).toUpperCase()}`,
              description: data.description || '',
              location: data.location?.city || 'Unknown',
              status: data.status || 'Pending',
              timestamp: data.timestamp,
              userName: data.submitterName || data.userName || 'Anonymous',
              type: data.reportType === 'AI_Summary' ? 'AI Summary' : 'Citizen Post',
              // Escalation prediction fields
              escalation_prediction: data.escalation_prediction,
              escalation_confidence: data.escalation_confidence,
              escalation_probabilities: data.escalation_probabilities,
              escalation_reasoning: data.escalation_reasoning,
              escalation_predicted_at: data.escalation_predicted_at,
            };
          })
          .filter((r) => r.escalation_prediction && r.escalation_predicted_at) // Only show reports with escalation predictions
          .sort((a, b) => {
            // Sort by prediction time (most recent first)
            const getTime = (timestamp: any) => {
              if (!timestamp) return 0;
              if (timestamp.toMillis) return timestamp.toMillis();
              if (timestamp instanceof Date) return timestamp.getTime();
              if (timestamp.seconds) return timestamp.seconds * 1000;
              return 0;
            };
            return getTime(b.escalation_predicted_at) - getTime(a.escalation_predicted_at);
          });

        console.log(`📊 Loaded ${reports.length} reports with escalation predictions`);
        setAllReports(reports);
        applyFilter(reports, selectedFilter);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching escalation reports:', error);
        Alert.alert('Error', 'Failed to load escalation predictions');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const applyFilter = (reports: EscalationReport[], filter: 'All' | 'High' | 'Medium' | 'Low') => {
    if (filter === 'All') {
      setFilteredReports(reports);
    } else {
      setFilteredReports(reports.filter((r) => r.escalation_prediction === filter));
    }
  };

  const handleFilterChange = (filter: 'All' | 'High' | 'Medium' | 'Low') => {
    setSelectedFilter(filter);
    applyFilter(allReports, filter);
  };

  const getFilterCount = (filter: 'All' | 'High' | 'Medium' | 'Low') => {
    if (filter === 'All') return allReports.length;
    return allReports.filter((r) => r.escalation_prediction === filter).length;
  };

  const getRiskColor = (risk: string) => {
    if (risk === 'High') return '#E74C3C';
    if (risk === 'Medium') return '#F39C12';
    return '#2ECC71';
  };

  const getRiskIcon = (risk: string) => {
    if (risk === 'High') return 'alert-circle';
    if (risk === 'Medium') return 'warning';
    return 'checkmark-circle';
  };

  const openReportDetails = (report: EscalationReport) => {
    setSelectedReport(report);
    setModalVisible(true);
  };

  const EscalationReportCard = ({ report }: { report: EscalationReport }) => {
    const riskColor = getRiskColor(report.escalation_prediction || 'Low');
    
    // Format prediction time
    let timeAgo = 'Recently';
    if (report.escalation_predicted_at) {
      try {
        const predictedDate = report.escalation_predicted_at.toDate ? report.escalation_predicted_at.toDate() : new Date(report.escalation_predicted_at);
        const now = new Date();
        const diffMs = now.getTime() - predictedDate.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) timeAgo = 'Just now';
        else if (diffMins < 60) timeAgo = `${diffMins}m ago`;
        else if (diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)}h ago`;
        else timeAgo = `${Math.floor(diffMins / 1440)}d ago`;
      } catch (e) {
        timeAgo = 'Recently';
      }
    }

    return (
      <TouchableOpacity
        style={[styles.reportCard, { borderLeftColor: riskColor }]}
        onPress={() => openReportDetails(report)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.riskIconContainer}>
            <Ionicons
              name={getRiskIcon(report.escalation_prediction || 'Low')}
              size={24}
              color={riskColor}
            />
          </View>
          <View style={styles.headerContent}>
            <Text style={styles.reportId}>{report.reportId}</Text>
            <Text style={styles.timeAgo}>{timeAgo}</Text>
          </View>
          <View style={[styles.riskBadge, { backgroundColor: riskColor }]}>
            <Text style={styles.riskBadgeText}>
              {report.escalation_prediction}
            </Text>
          </View>
        </View>

        <Text style={styles.description} numberOfLines={2}>
          {report.description}
        </Text>

        <View style={styles.cardFooter}>
          <View style={[styles.typeBadge, { borderColor: GOLD_ACCENT }]}>
            <Text style={styles.typeBadgeText}>{report.type}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color={GOLD_ACCENT} />
        </TouchableOpacity>
        <Text style={styles.title}>Incident Escalation Risks</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Filter Buttons */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterButtonsWrapper}>
          {(['All', 'High', 'Medium', 'Low'] as const).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterButton,
                selectedFilter === filter && styles.filterButtonActive,
              ]}
              onPress={() => handleFilterChange(filter)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  selectedFilter === filter && styles.filterButtonTextActive,
                ]}
              >
                {filter}
              </Text>
              <Text
                style={[
                  styles.filterButtonCount,
                  selectedFilter === filter && styles.filterButtonCountActive,
                ]}
              >
                {getFilterCount(filter)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Reports List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={GOLD_ACCENT} />
        </View>
      ) : filteredReports.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="checkmark-circle" size={64} color={GOLD_ACCENT} />
          <Text style={styles.emptyText}>No {selectedFilter === 'All' ? '' : selectedFilter.toLowerCase()} risk incidents</Text>
        </View>
      ) : (
        <FlatList
          data={filteredReports}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EscalationReportCard report={item} />}
          contentContainerStyle={styles.listContent}
          scrollEnabled={true}
        />
      )}

      {/* Details Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Escalation Prediction Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color={GOLD_ACCENT} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {selectedReport && (
                <>
                  {/* Report ID and Type */}
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Report ID</Text>
                    <Text style={styles.modalValue}>{selectedReport.reportId}</Text>
                  </View>

                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Report Type</Text>
                    <Text style={styles.modalValue}>{selectedReport.type}</Text>
                  </View>

                  {/* Risk Prediction */}
                  <View style={[styles.modalSection, { borderLeftColor: getRiskColor(selectedReport.escalation_prediction || 'Low') }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Ionicons 
                        name={getRiskIcon(selectedReport.escalation_prediction || 'Low')} 
                        size={24} 
                        color={getRiskColor(selectedReport.escalation_prediction || 'Low')}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={[styles.modalSectionTitle, { color: getRiskColor(selectedReport.escalation_prediction || 'Low') }]}>
                        {selectedReport.escalation_prediction} Risk
                      </Text>
                    </View>
                    <Text style={styles.modalConfidence}>
                      Confidence: {Math.round((selectedReport.escalation_confidence || 0) * 100)}%
                    </Text>
                  </View>

                  {/* Probabilities */}
                  {selectedReport.escalation_probabilities && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Risk Probabilities</Text>
                      <View style={styles.probabilityContainer}>
                        <View style={styles.probabilityRow}>
                          <Text style={styles.probabilityLabel}>Low:</Text>
                          <View style={styles.probabilityBarContainer}>
                            <View 
                              style={[
                                styles.probabilityBar, 
                                { width: `${(selectedReport.escalation_probabilities.Low || 0) * 100}%`, backgroundColor: '#2ECC71' }
                              ]} 
                            />
                          </View>
                          <Text style={styles.probabilityValue}>{Math.round((selectedReport.escalation_probabilities.Low || 0) * 100)}%</Text>
                        </View>
                        <View style={styles.probabilityRow}>
                          <Text style={styles.probabilityLabel}>Medium:</Text>
                          <View style={styles.probabilityBarContainer}>
                            <View 
                              style={[
                                styles.probabilityBar, 
                                { width: `${(selectedReport.escalation_probabilities.Medium || 0) * 100}%`, backgroundColor: '#F39C12' }
                              ]} 
                            />
                          </View>
                          <Text style={styles.probabilityValue}>{Math.round((selectedReport.escalation_probabilities.Medium || 0) * 100)}%</Text>
                        </View>
                        <View style={styles.probabilityRow}>
                          <Text style={styles.probabilityLabel}>High:</Text>
                          <View style={styles.probabilityBarContainer}>
                            <View 
                              style={[
                                styles.probabilityBar, 
                                { width: `${(selectedReport.escalation_probabilities.High || 0) * 100}%`, backgroundColor: '#E74C3C' }
                              ]} 
                            />
                          </View>
                          <Text style={styles.probabilityValue}>{Math.round((selectedReport.escalation_probabilities.High || 0) * 100)}%</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Reasoning */}
                  {selectedReport.escalation_reasoning && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>AI Reasoning</Text>
                      <Text style={styles.modalReasoning}>{selectedReport.escalation_reasoning}</Text>
                    </View>
                  )}

                  {/* Full Description */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Full Description</Text>
                    <Text style={styles.modalDescription}>{selectedReport.description}</Text>
                  </View>

                  {/* Location */}
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Location</Text>
                    <Text style={styles.modalValue}>{selectedReport.location}</Text>
                  </View>

                  {/* Status */}
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Status</Text>
                    <Text style={[styles.modalValue, { color: GOLD_ACCENT }]}>{selectedReport.status}</Text>
                  </View>

                  {/* Submitted By */}
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Submitted By</Text>
                    <Text style={styles.modalValue}>{selectedReport.userName}</Text>
                  </View>
                </>
              )}
            </ScrollView>

            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_NAVY,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 50,
    backgroundColor: CARD_BG,
  },
  title: {
    fontSize: 20,
    color: 'white',
    fontFamily: 'Raleway-Bold',
  },
  headerSpacer: {
    width: 28,
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 215, 0, 0.1)',
  },
  filterButtonsWrapper: {
    paddingRight: 16,
    flexGrow: 1,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    backgroundColor: GOLD_ACCENT,
    borderColor: GOLD_ACCENT,
  },
  filterButtonText: {
    color: '#AAA',
    fontSize: 14,
    fontFamily:'JosefinSans-Medium',
    marginRight: 8,
  },
  filterButtonTextActive: {
    color: DARK_NAVY,
  },
  filterButtonCount: {
    color: '#777',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  filterButtonCountActive: {
    color: DARK_NAVY,
    backgroundColor: 'rgba(30, 30, 47, 0.4)',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#AAA',
    fontSize: 16,
    marginTop: 16,
    fontFamily: 'Raleway-Bold',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 30,
  },
  reportCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  riskIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  reportId: {
    color: GOLD_ACCENT,
    fontSize: 14,
    marginBottom: 4,
    fontFamily: 'Raleway-Bold',
  },
  location: {
    color: '#AAA',
    fontSize: 12,
    fontFamily: 'JosefinSans-Medium',
  },
  riskBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  riskBadgeText: {
    fontSize: 13,
    fontFamily: 'Raleway-Bold',
  },
  description: {
    color: '#DDD',
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
    fontFamily: 'JosefinSans-Medium',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusContainer: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  statusLabel: {
    color: GOLD_ACCENT,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'JosefinSans-Medium',
  },
  timeAgo: {
    color: '#AAA',
    fontSize: 11,
    fontFamily: 'JosefinSans-Medium',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  typeBadgeText: {
    color: GOLD_ACCENT,
    fontSize: 11,
    fontFamily: 'JosefinSans-Medium',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width - 40,
    maxHeight: '85%',
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 215, 0, 0.2)',
  },
  modalTitle: {
    fontSize: 20,
    color: GOLD_ACCENT,
    fontFamily: 'Raleway-Bold',
  },
  modalBody: {
    maxHeight: '75%',
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  modalLabel: {
    color: '#AAA',
    fontSize: 13,
    fontFamily: 'JosefinSans-Medium',
  },
  modalValue: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Raleway-Bold',
    flex: 1,
    textAlign: 'right',
  },
  modalSection: {
    marginVertical: 16,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  modalSectionTitle: {
    color: GOLD_ACCENT,
    fontSize: 16,
    fontFamily: 'Raleway-Bold',
    marginBottom: 12,
  },
  modalConfidence: {
    color: 'white',
    fontSize: 15,
    fontFamily: 'JosefinSans-Medium',
  },
  probabilityContainer: {
    marginTop: 8,
  },
  probabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  probabilityLabel: {
    color: '#AAA',
    fontSize: 13,
    width: 60,
    fontFamily: 'JosefinSans-Medium',
  },
  probabilityBarContainer: {
    flex: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  probabilityBar: {
    height: '100%',
    borderRadius: 10,
  },
  probabilityValue: {
    color: 'white',
    fontSize: 12,
    width: 45,
    textAlign: 'right',
    fontFamily: 'Raleway-Bold',
  },
  modalReasoning: {
    color: '#DDD',
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
    fontFamily: 'JosefinSans-Medium',
  },
  modalDescription: {
    color: '#DDD',
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'JosefinSans-Medium',
  },
  closeButton: {
    marginTop: 20,
    backgroundColor: GOLD_ACCENT,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: DARK_NAVY,
    fontSize: 16,
    fontFamily: 'Raleway-Bold',
  },
});
