import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, ScrollView, Platform, Dimensions, Modal } from 'react-native';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'; 
import { doc as firestoreDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'; 
import { auth, db } from '../../firebaseConfig'; 
import { useNavigation, useRoute } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

// --- Constants ---
const DARK_NAVY = '#1E1E2F';
const CARD_BG = '#303045';
const GOLD_ACCENT = '#FFD700';
const INACTIVE_GRAY = '#A0A0A0';

interface ReportData {
  id: string;
  reportId: string;
  description: string;
  location: string;
  status: string;
  risk: string;
  timestamp: Date;
  userId: string;
  type?: string;
  escalation_prediction?: string;
  escalation_confidence?: number;
  escalation_probabilities?: object;
  escalation_reasoning?: string;
  escalation_predicted_at?: Date;
}

export default function ReportManagementScreen() {
    const [reports, setReports] = useState<ReportData[]>([]);
    const [loading, setLoading] = useState(true);
    const navigation = useNavigation();
    const route: any = useRoute();
    const highlightId: string | undefined = route.params?.highlightId;
    const [modalReport, setModalReport] = useState<ReportData | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const scrollRef = React.useRef<ScrollView | null>(null);
    
    // Escalation prediction state
    const [escalationPrediction, setEscalationPrediction] = useState<any>(null);
    const [loadingEscalation, setLoadingEscalation] = useState(false);
    const [selectedReportForEscalation, setSelectedReportForEscalation] = useState<ReportData | null>(null);
    const [escalationModalVisible, setEscalationModalVisible] = useState(false);

    // --- 1. Fetch all reports ---
    useEffect(() => {
        const reportsQuery = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));

        const unsubscribe = onSnapshot(reportsQuery, (snapshot) => {
            const reportsData: ReportData[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    reportId: `REP-${doc.id.substring(0, 5).toUpperCase()}`,
                    description: data.description || 'N/A',
                    location: data.location?.city || 'Unknown',
                    status: data.status || 'Pending',
                    risk: data.riskLevelText || 'Pending',
                    timestamp: data.timestamp?.toDate() || new Date(),
                    userId: data.userId || 'N/A',
                    type: data.crime_type || data.type || 'Unknown',
                    escalation_prediction: data.escalation_prediction,
                    escalation_confidence: data.escalation_confidence,
                    escalation_probabilities: data.escalation_probabilities,
                    escalation_reasoning: data.escalation_reasoning,
                    escalation_predicted_at: data.escalation_predicted_at?.toDate(),
                };
            });
            setReports(reportsData);
            setLoading(false);

            // If a highlightId was passed via navigation, attempt to scroll to it
            if (highlightId) {
                const idx = reportsData.findIndex(r => r.id === highlightId);
                if (idx >= 0 && scrollRef.current) {
                    // Rough scroll: multiply row height (~56) by index
                    const y = Math.max(0, idx * 56 - 20);
                    scrollRef.current.scrollTo({ y, animated: true });
                }
                                // Also auto-open modal for that report
                                (async () => {
                                    try {
                                        setModalLoading(true);
                                        const ref = firestoreDoc(db, 'reports', highlightId);
                                        const snap = await getDoc(ref);
                                        if (snap.exists()) {
                                            const data = snap.data();
                                            setModalReport({
                                                id: snap.id,
                                                reportId: `REP-${snap.id.substring(0,5).toUpperCase()}`,
                                                description: data.description || 'N/A',
                                                location: data.location?.city || 'Unknown',
                                                status: data.status || 'Pending',
                                                risk: data.riskLevelText || data.escalationRiskScore || 'Pending',
                                                timestamp: data.timestamp?.toDate() || new Date(),
                                                userId: data.userId || 'N/A',
                                                type: data.crime_type || data.type || 'Unknown',
                                                escalation_prediction: data.escalation_prediction,
                                                escalation_confidence: data.escalation_confidence,
                                                escalation_probabilities: data.escalation_probabilities,
                                                escalation_reasoning: data.escalation_reasoning,
                                                escalation_predicted_at: data.escalation_predicted_at?.toDate(),
                                            });
                                        }
                                    } catch (e) {
                                        console.error('Failed to load highlighted report', e);
                                    } finally { setModalLoading(false); }
                                })();
            }
        }, (error) => {
            console.error("Error fetching reports:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // --- Escalation Prediction Logic ---
    const handlePredictEscalation = async (report: ReportData) => {
        setSelectedReportForEscalation(report);
        setLoadingEscalation(true);
        setEscalationPrediction(null);
        setEscalationModalVisible(true);
        
        try {
            // Prepare incident data for the model
            const incidentData = {
                description: report.description || 'Unknown incident',
                location: report.location || 'Unknown',
                sub_location: '',
                crime_type: report.type || 'Unknown',
                datetime_occurred: report.timestamp 
                    ? new Date(report.timestamp).toLocaleString('en-GB', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    }).replace(',', '')
                    : new Date().toLocaleString('en-GB', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    }).replace(',', ''),
                part_of_day: '',
                is_user_report: report.userId ? true : false
            };
            
            console.log('📊 Requesting escalation prediction for:', incidentData);
            
            // Call the backend API
            const response = await fetch('http://192.168.29.169:8080/predict-escalation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(incidentData)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('✅ Escalation prediction result:', result);
            
            setEscalationPrediction(result);
            
            // Update Firestore with prediction
            if (report.id) {
                try {
                    const reportRef = firestoreDoc(db, 'reports', report.id);
                    const escalationUpdate = {
                        escalation_prediction: result.predicted_risk,
                        escalation_confidence: result.confidence,
                        escalation_probabilities: result.probabilities,
                        escalation_reasoning: result.reasoning,
                        escalation_predicted_at: serverTimestamp()
                    };
                    
                    await updateDoc(reportRef, escalationUpdate);
                    
                    // Update local state
                    setReports((prev) => 
                        prev.map(r => r.id === report.id ? { ...r, ...escalationUpdate, escalation_predicted_at: new Date() } : r)
                    );
                    
                    console.log('✅ Escalation prediction saved to Firestore');
                } catch (firestoreError) {
                    console.warn('⚠️ Could not save escalation prediction to Firestore:', firestoreError);
                }
            }
            
        } catch (error) {
            console.error('❌ Escalation prediction error:', error);
            setEscalationPrediction({
                error: (error as Error).message,
                predicted_risk: 'Error',
                confidence: 0
            });
        } finally {
            setLoadingEscalation(false);
        }
    };

    // --- 2. CSV Export Logic ---
    const handleExportCSV = async () => {
        if (reports.length === 0) {
            Alert.alert("Export Failed", "No reports available to export.");
            return;
        }

        try {
            // --- Helper function to escape CSV fields ---
            const escapeCSVField = (field: any) => {
                if (typeof field !== 'string') field = String(field);
                if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
                    return '"' + field.replace(/"/g, '""') + '"';
                }
                return field;
            };

            // --- Build CSV string ---
            const headers = ["ID", "Status", "Risk Level", "Description", "Location", "Timestamp"];
            const csvHeaders = headers.map(escapeCSVField).join(',');
            const rows = reports.map(r => [
                escapeCSVField(r.reportId),
                escapeCSVField(r.status),
                escapeCSVField(r.risk),
                escapeCSVField(r.description),
                escapeCSVField(r.location),
                escapeCSVField(r.timestamp.toLocaleString()), // More readable timestamp
            ].join(','));
            
            const csvString = [
                csvHeaders,
                ...rows
            ].join('\n');

            // --- Save to file and share ---
            const fileUri = FileSystem.documentDirectory + 'reports.csv';
            await FileSystem.writeAsStringAsync(fileUri, csvString);

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri);
            } else {
                Alert.alert("Export Successful", `CSV saved to ${fileUri}`);
            }
        } catch (error) {
            console.error("Error exporting CSV:", error);
            Alert.alert("Export Failed", "An error occurred while exporting the CSV.");
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color={GOLD_ACCENT} />
                <Text style={styles.loadingText}>Loading All Reports...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={styles.backIcon}>⬅</Text>
                </TouchableOpacity>
                <Text style={styles.title}>All Reports ({reports.length})</Text>
                <TouchableOpacity style={styles.exportButton} onPress={handleExportCSV}>
                    <Text style={styles.exportButtonText}>Export CSV</Text>
                </TouchableOpacity>
            </View>

            <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent}>
                <View style={styles.table}>
                    <View style={styles.tableHeader}>
                        <Text style={[styles.tableHeaderText, { width: 60 }]}>ID</Text>
                        <Text style={[styles.tableHeaderText, { flex: 1 }]}>DESCRIPTION</Text>
                        <Text style={[styles.tableHeaderText, { width: 60 }]}>RISK</Text>
                        <Text style={[styles.tableHeaderText, { width: 60 }]}>STATUS</Text>
                        <Text style={[styles.tableHeaderText, { width: 70 }]}>ANALYZE</Text>
                    </View>
                    {reports.map((report) => (
                        <View key={report.id} style={[styles.tableRow, report.id === highlightId ? styles.highlightRow : null]}>
                            <Text style={[styles.tableCell, { width: 60 }]}>{report.reportId}</Text>
                            <Text style={[styles.tableCell, { flex: 1 }]}>{report.description.substring(0, 30)}...</Text>
                            <Text style={[styles.tableCell, { width: 60, color: report.risk === 'High Risk' ? '#E74C3C' : '#2ECC71' }]}>{report.risk}</Text>
                            <Text style={[styles.tableCell, { width: 60, color: report.status === 'Resolved' ? '#2ECC71' : GOLD_ACCENT }]}>{report.status}</Text>
                            <TouchableOpacity 
                                style={styles.escalationButton}
                                onPress={() => handlePredictEscalation(report)}
                                disabled={loadingEscalation && selectedReportForEscalation?.id === report.id}
                            >
                                <Text style={styles.escalationButtonText}>
                                    {report.escalation_prediction ? '✓ Done' : 'Analyze'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                    {reports.length === 0 && <Text style={styles.emptyText}>No historical reports found.</Text>}
                </View>
            </ScrollView>

                        {/* Detail Modal (auto-open when highlightId passed) */}
                        {modalReport && (
                            <View style={modalStyles.modalBackdrop}>
                                <View style={modalStyles.modalBox}>
                                    <View style={modalStyles.modalHeader}>
                                        <Text style={modalStyles.modalTitle}>Report Details - {modalReport.reportId}</Text>
                                        <TouchableOpacity onPress={() => setModalReport(null)}>
                                            <Text style={{ color: INACTIVE_GRAY }}>Close</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <ScrollView style={{ marginTop: 10 }}>
                                        <Text style={modalStyles.label}>Type</Text>
                                        <Text style={modalStyles.value}>{modalReport?.risk}</Text>
                                        <Text style={modalStyles.label}>Location</Text>
                                        <Text style={modalStyles.value}>{modalReport?.location}</Text>
                                        <Text style={modalStyles.label}>Description</Text>
                                        <Text style={modalStyles.value}>{modalReport?.description}</Text>
                                        <Text style={modalStyles.label}>Status</Text>
                                        <Text style={modalStyles.value}>{modalReport?.status}</Text>
                                    </ScrollView>
                                </View>
                            </View>
                        )}

                        {/* Escalation Prediction Modal */}
                        <Modal
                            visible={escalationModalVisible}
                            transparent={true}
                            animationType="fade"
                            onRequestClose={() => setEscalationModalVisible(false)}
                        >
                            <View style={modalStyles.backdropEscalation}>
                                <View style={modalStyles.boxEscalation}>
                                    <View style={modalStyles.headerEscalation}>
                                        <Text style={modalStyles.titleEscalation}>
                                            Escalation Analysis - {selectedReportForEscalation?.reportId}
                                        </Text>
                                        <TouchableOpacity onPress={() => setEscalationModalVisible(false)}>
                                            <Text style={{ color: INACTIVE_GRAY, fontSize: 18 }}>✕</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {loadingEscalation ? (
                                        <View style={modalStyles.centerContent}>
                                            <ActivityIndicator size="large" color={GOLD_ACCENT} />
                                            <Text style={modalStyles.loadingTextEscalation}>
                                                Analyzing escalation risk...
                                            </Text>
                                        </View>
                                    ) : escalationPrediction?.error ? (
                                        <View style={modalStyles.centerContent}>
                                            <Text style={modalStyles.errorText}>
                                                Error: {escalationPrediction.error}
                                            </Text>
                                            <TouchableOpacity 
                                                style={modalStyles.retryButton}
                                                onPress={() => {
                                                    if (selectedReportForEscalation) {
                                                        handlePredictEscalation(selectedReportForEscalation);
                                                    }
                                                }}
                                            >
                                                <Text style={modalStyles.retryButtonText}>Retry</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ) : escalationPrediction ? (
                                        <ScrollView style={modalStyles.contentEscalation}>
                                            <Text style={modalStyles.predictionTitle}>
                                                Predicted Risk Level
                                            </Text>
                                            <View style={[
                                                modalStyles.riskBox,
                                                escalationPrediction.predicted_risk === 'High' 
                                                    ? { backgroundColor: '#E74C3C30' } 
                                                    : { backgroundColor: '#2ECC7130' }
                                            ]}>
                                                <Text style={[
                                                    modalStyles.riskText,
                                                    escalationPrediction.predicted_risk === 'High'
                                                        ? { color: '#E74C3C' }
                                                        : { color: '#2ECC71' }
                                                ]}>
                                                    {escalationPrediction.predicted_risk}
                                                </Text>
                                                <Text style={modalStyles.confidenceText}>
                                                    Confidence: {(escalationPrediction.confidence * 100).toFixed(1)}%
                                                </Text>
                                            </View>

                                            {escalationPrediction.probabilities && (
                                                <>
                                                    <Text style={modalStyles.predictionTitle}>
                                                        Risk Breakdown
                                                    </Text>
                                                    <View style={modalStyles.probabilitiesBox}>
                                                        {Object.entries(escalationPrediction.probabilities).map(([key, value]: [string, any]) => (
                                                            <View key={key} style={modalStyles.probabilityRow}>
                                                                <Text style={modalStyles.probabilityLabel}>
                                                                    {String(key).toUpperCase()}
                                                                </Text>
                                                                <View style={modalStyles.probabilityBar}>
                                                                    <View
                                                                        style={[
                                                                            modalStyles.probabilityFill,
                                                                            { width: `${Math.min(value * 100, 100)}%` }
                                                                        ]}
                                                                    />
                                                                </View>
                                                                <Text style={modalStyles.probabilityValue}>
                                                                    {(value * 100).toFixed(0)}%
                                                                </Text>
                                                            </View>
                                                        ))}
                                                    </View>
                                                </>
                                            )}

                                            {escalationPrediction.reasoning && (
                                                <>
                                                    <Text style={modalStyles.predictionTitle}>
                                                        Analysis Reasoning
                                                    </Text>
                                                    <View style={modalStyles.reasoningBox}>
                                                        <Text style={modalStyles.reasoningText}>
                                                            {escalationPrediction.reasoning}
                                                        </Text>
                                                    </View>
                                                </>
                                            )}
                                        </ScrollView>
                                    ) : null}

                                    <TouchableOpacity 
                                        style={modalStyles.closeButtonEscalation}
                                        onPress={() => setEscalationModalVisible(false)}
                                    >
                                        <Text style={modalStyles.closeButtonTextEscalation}>Close</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: DARK_NAVY },
    center: { justifyContent: 'center', alignItems: 'center' },
    loadingText: { color: INACTIVE_GRAY, marginTop: 10, fontFamily: 'JosefinSans-Medium' },
    
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 50,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: CARD_BG,
    },
    backIcon: { fontSize: 24, color: GOLD_ACCENT },
    title: { 
        fontSize: 22, 
        fontFamily: 'Raleway-Bold', 
        color: 'white',
    },
    exportButton: {
        backgroundColor: GOLD_ACCENT,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 5,
    },
    exportButtonText: {
        color: DARK_NAVY,
        fontFamily: 'Raleway-Bold',
        fontSize: 14,
    },
    
    scrollContent: {
        padding: 10,
        paddingTop: 20,
    },
    table: {
        backgroundColor: CARD_BG,
        borderRadius: 10,
        overflow: 'hidden',
    },
    tableHeader: {
        flexDirection: 'row',
        padding: 10,
        backgroundColor: DARK_NAVY,
        borderBottomWidth: 1,
        borderBottomColor: INACTIVE_GRAY + '50',
    },
    tableHeaderText: {
        fontFamily: 'Raleway-Bold',
        color: GOLD_ACCENT,
        fontSize: 11,
    },
    tableRow: {
        flexDirection: 'row',
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    tableCell: {
        fontSize: 12,
        color: 'white',
        fontFamily: 'JosefinSans-Medium',
        marginRight: 5,
    },
    escalationButton: {
        width: 70,
        height: 30,
        backgroundColor: GOLD_ACCENT,
        borderRadius: 5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    escalationButtonText: {
        fontSize: 11,
        fontFamily: 'Raleway-Bold',
        color: DARK_NAVY,
    },
    emptyText: {
        color: INACTIVE_GRAY,
        textAlign: 'center',
        padding: 20,
        fontFamily: 'JosefinSans-Medium'
    }
    ,
    highlightRow: {
        backgroundColor: 'rgba(255,215,0,0.08)',
        borderLeftWidth: 4,
        borderLeftColor: GOLD_ACCENT,
    }
});

const modalStyles = StyleSheet.create({
    modalBackdrop: { position: 'absolute', left: 16, right: 16, top: 100, bottom: 100, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalBox: { width: '100%', maxHeight: '80%', backgroundColor: DARK_NAVY, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#2A2A2A' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle: { color: GOLD_ACCENT, fontFamily: 'Raleway-Bold' },
    label: { color: '#A0A0A0', marginTop: 10, fontFamily: 'JosefinSans-Medium' },
    value: { color: 'white', marginTop: 4 },
    
    // Escalation Modal Styles
    backdropEscalation: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    boxEscalation: {
        width: '90%',
        maxHeight: '85%',
        backgroundColor: DARK_NAVY,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#2A2A2A',
    },
    headerEscalation: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,215,0,0.2)',
    },
    titleEscalation: {
        color: GOLD_ACCENT,
        fontFamily: 'Raleway-Bold',
        fontSize: 16,
        flex: 1,
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    loadingTextEscalation: {
        color: '#A0A0A0',
        marginTop: 12,
        fontFamily: 'JosefinSans-Medium',
    },
    errorText: {
        color: '#E74C3C',
        fontFamily: 'JosefinSans-Medium',
        textAlign: 'center',
        marginBottom: 16,
    },
    retryButton: {
        backgroundColor: GOLD_ACCENT,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 6,
        marginTop: 12,
    },
    retryButtonText: {
        color: DARK_NAVY,
        fontFamily: 'Raleway-Bold',
        fontSize: 14,
    },
    contentEscalation: {
        maxHeight: '75%',
        marginBottom: 12,
    },
    predictionTitle: {
        color: GOLD_ACCENT,
        fontFamily: 'Raleway-Bold',
        fontSize: 14,
        marginTop: 16,
        marginBottom: 10,
    },
    riskBox: {
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,215,0,0.3)',
        alignItems: 'center',
    },
    riskText: {
        fontFamily: 'Raleway-Bold',
        fontSize: 24,
        marginBottom: 4,
    },
    confidenceText: {
        color: '#A0A0A0',
        fontFamily: 'JosefinSans-Medium',
        fontSize: 12,
    },
    probabilitiesBox: {
        backgroundColor: 'rgba(255,215,0,0.05)',
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,215,0,0.1)',
    },
    probabilityRow: {
        marginBottom: 10,
    },
    probabilityLabel: {
        color: 'white',
        fontFamily: 'JosefinSans-Medium',
        fontSize: 12,
        marginBottom: 4,
    },
    probabilityBar: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 4,
    },
    probabilityFill: {
        height: '100%',
        backgroundColor: GOLD_ACCENT,
    },
    probabilityValue: {
        color: GOLD_ACCENT,
        fontFamily: 'Raleway-Bold',
        fontSize: 11,
    },
    reasoningBox: {
        backgroundColor: 'rgba(160,160,160,0.1)',
        borderRadius: 8,
        padding: 12,
        borderLeftWidth: 3,
        borderLeftColor: GOLD_ACCENT,
    },
    reasoningText: {
        color: '#E0E0E0',
        fontFamily: 'JosefinSans-Medium',
        fontSize: 12,
        lineHeight: 18,
    },
    closeButtonEscalation: {
        backgroundColor: GOLD_ACCENT,
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    closeButtonTextEscalation: {
        color: DARK_NAVY,
        fontFamily: 'Raleway-Bold',
        fontSize: 14,
    },
});