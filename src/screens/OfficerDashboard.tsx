import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, ScrollView, Platform, Modal, Dimensions, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

// --- Firebase Imports ---
import { auth, db } from '../../firebaseConfig';
import { predictRisk, detectFakeReport, predictCrimeType } from '../services/riskApi';
import { collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, where, serverTimestamp } from 'firebase/firestore';

type OfficerDashboardNavigationProp = NativeStackNavigationProp<RootStackParamList, 'OfficerDashboard'>;

// --- Constants ---
const DARK_NAVY = '#1E1E2F';
const CARD_BG = '#303045';
const GOLD_ACCENT = '#FFD700';
const PLACEHOLDER_AVATAR = 'https://placehold.co/100x100/A0A0A0/FFFFFF?text=P';
const INACTIVE_GRAY = '#A0A0A0';

// --- Interfaces (UPDATED for Real ML Scores) ---
interface ReportSummary {
  id: string;
  type: string;
  location: string;
  status: 'Pending' | 'Investigating' | 'Resolved';
  // Fields written by the Cloud Function (ML Model)
  escalationRiskScore: number; // Numerical score (0-100)
  riskLevelText: 'Low Risk' | 'Medium Risk' | 'High Risk' | 'Failed' | string; // Text label
  description: string;
  reportId: string;
  coords: { latitude: number, longitude: number } | null;
  // Mocked detail fields for the modal (until the backend provides them)
  potentialCrime?: string; 
  reasoning?: string;
  // Auto-extraction fields provided by server-side auto-classification
  auto_crime_confidence?: number | null;
  auto_extracted_location?: string | null;
  auto_extracted_date?: string | null;
  auto_extracted_time?: string | null;
  auto_crime_reasoning?: string | null;
  // Verification status fields
  is_fake?: boolean;
  verification_confidence?: number;
  verification_reasoning?: string;
  // Escalation prediction fields (from HybridRiskModel)
  escalation_prediction?: string;
  escalation_confidence?: number;
  escalation_probabilities?: { Low: number; Medium: number; High: number };
  escalation_reasoning?: string;
  escalation_predicted_at?: any;
  // Additional fields from Firestore
  createdAt?: any;
  submittedAt?: any;
  timestamp?: any;
  // User information
  userId?: string;
  userName?: string;
  userRole?: string;
}

// Get screen dimensions for modal sizing
const { width, height } = Dimensions.get('window');

// --- Utility Functions ---
const getStatusColor = (status: ReportSummary['status']) => {
  switch (status) {
    case 'Investigating': return '#FFD700';
    case 'Resolved': return '#2ECC71';
    case 'Pending': return '#E74C3C';
    default: return '#A0A0A0';
  }
};

// Renamed from getRiskColor to getRiskStyleColor to match usage
const getRiskStyleColor = (riskText: ReportSummary['riskLevelText']) => {
  switch (riskText) {
    case 'High Risk': return '#C0392B';
    case 'Medium Risk': return '#E67E22';
    case 'Low Risk': return '#27AE60';
    default: return '#A0A0A0';
  }
};

// Get verification status color
const getVerificationColor = (is_fake?: boolean) => {
  if (is_fake === undefined) return '#95A5A6'; // Gray for unverified
  return is_fake ? '#E74C3C' : '#27AE60'; // Red for fake, green for verified
};

const getVerificationBadge = (is_fake?: boolean) => {
  if (is_fake === undefined) return 'Verifying';
  return is_fake ? 'FAKE' : 'Verified';
};

// --- Report Details Modal Component (Matches the image structure) ---
// (Removed duplicate or misplaced modal implementation)


// --- Report Row Component ---
const ReportRow = ({ report, onUpdateStatus, onOpenDetails }: { 
  report: ReportSummary, 
  onUpdateStatus: (id: string, status: ReportSummary['status']) => void,
  onOpenDetails: (report: ReportSummary) => void
}) => (
  <View style={feedStyles.reportRow}>
    {/* Report ID and Action button */}
    <TouchableOpacity onPress={() => onOpenDetails(report)} style={{ width: 60, marginRight: 10 }}>
        <Text style={[feedStyles.reportText, { color: GOLD_ACCENT, textDecorationLine: 'underline' }]}>{report.reportId}</Text>
    </TouchableOpacity>
    
    <Text style={[feedStyles.reportText, { width: 80 }]}>{report.type}</Text>
    <Text style={[feedStyles.reportText, { flex: 1 }]}>{report.location}</Text>
    
    {/* Status Badge */}
    <TouchableOpacity 
      style={[feedStyles.statusBadgeButton, { backgroundColor: getStatusColor(report.status) + '30', borderColor: getStatusColor(report.status) }]}
      onPress={() => onUpdateStatus(report.id, report.status)} // Passes current status to determine next
    >
      <Text style={[feedStyles.statusBadgeText, { color: getStatusColor(report.status) }]}>
        {report.status}
      </Text>
    </TouchableOpacity>
  </View>
);

// --- Incident Risk Component (UPDATED to show real score) ---
const IncidentRisk = ({ report, onOpenDetails }: { report: ReportSummary, onOpenDetails: (report: ReportSummary) => void }) => (
  <TouchableOpacity style={feedStyles.riskRow} onPress={() => onOpenDetails(report)}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
      <Ionicons 
        name={report.riskLevelText === 'High Risk' ? 'alert-circle' : report.riskLevelText === 'Medium Risk' ? 'warning' : 'checkmark-circle'} 
        size={20} 
        color={getRiskStyleColor(report.riskLevelText)}
        style={{ marginRight: 8 }}
      />
      <Text style={feedStyles.riskType}>{report.description.substring(0, 45) + '...'}</Text>
    </View>
    <View style={feedStyles.riskDetails}>
      {/* Badges Container */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        {/* Risk Score Badge */}
        <Text style={[feedStyles.riskBadge, { backgroundColor: getRiskStyleColor(report.riskLevelText), color: 'white' }]}>
          {report.riskLevelText} ({report.escalationRiskScore}%)
        </Text>
        
        {/* Verification Badge: show FAKE or Verifying only (hide green 'Verified' for escalation list) */}
        {report.is_fake === true ? (
          <View style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 5,
            backgroundColor: getVerificationColor(report.is_fake) + '40',
            borderWidth: 1,
            borderColor: getVerificationColor(report.is_fake),
            marginLeft: 8,
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <Ionicons name='close-circle' size={14} color={getVerificationColor(true)} style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: getVerificationColor(true), fontFamily: 'Raleway-Bold' }}>FAKE</Text>
          </View>
        ) : report.is_fake === undefined ? (
          <View style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 5,
            backgroundColor: '#95A5A6' + '40',
            borderWidth: 1,
            borderColor: '#95A5A6',
            marginLeft: 8,
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <Ionicons name='hourglass' size={14} color={'#95A5A6'} style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#95A5A6', fontFamily: 'Raleway-Bold' }}>Verifying</Text>
          </View>
        ) : null}
      </View>
      
      <Text style={feedStyles.riskSubtext}>{report.location}</Text>
    </View>
  </TouchableOpacity>
);

// --- Escalation Prediction Card Component ---
const EscalationPredictionCard = ({ report, onOpenDetails }: { report: ReportSummary, onOpenDetails: (report: ReportSummary) => void }) => {
  const getRiskColor = (risk: string) => {
    if (risk === 'High') return '#E74C3C';
    if (risk === 'Medium') return '#F39C12';
    return '#2ECC71';
  };

  const riskColor = getRiskColor(report.escalation_prediction || 'Low');
  const confidence = Math.round((report.escalation_confidence || 0) * 100);
  
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
    <TouchableOpacity style={feedStyles.riskRow} onPress={() => onOpenDetails(report)}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Ionicons 
            name={report.escalation_prediction === 'High' ? 'alert-circle' : report.escalation_prediction === 'Medium' ? 'warning' : 'checkmark-circle'} 
            size={20} 
            color={riskColor}
            style={{ marginRight: 8 }}
          />
          <Text style={[feedStyles.riskType, { flex: 1 }]} numberOfLines={1}>
            {report.description.substring(0, 40) + '...'}
          </Text>
        </View>
        <Text style={{ fontSize: 11, color: INACTIVE_GRAY, marginLeft: 8 }}>{timeAgo}</Text>
      </View>
      
      <View style={feedStyles.riskDetails}>
        {/* Risk Badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={[feedStyles.riskBadge, { backgroundColor: riskColor, color: 'white' }]}>
            {report.escalation_prediction} Risk
          </Text>
          
          {/* Report Type Badge */}
          <View style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 5,
            backgroundColor: CARD_BG,
            borderWidth: 1,
            borderColor: GOLD_ACCENT,
            marginLeft: 8,
          }}>
            <Text style={{ fontSize: 11, color: GOLD_ACCENT }}>{report.type}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};


// --- Main Officer Dashboard Component ---
export default function OfficerDashboard() {
  const navigation = useNavigation<OfficerDashboardNavigationProp>();
  const user = auth.currentUser;


  // Real-time KPI state
  const [activeAlerts, setActiveAlerts] = useState(0);
  const [reportsFiled, setReportsFiled] = useState(0);
  const [officersDuty, setOfficersDuty] = useState(0);

  // Profile avatar URL
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(PLACEHOLDER_AVATAR);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [recentReports, setRecentReports] = useState<ReportSummary[]>([]);
  const [fakeReports, setFakeReports] = useState<ReportSummary[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportSummary | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  
  // Escalation Prediction State
  const [escalationPrediction, setEscalationPrediction] = useState<{
    predicted_risk: string;
    confidence: number;
    probabilities: { Low: number; Medium: number; High: number };
    reasoning: string;
  } | null>(null);
  const [loadingEscalation, setLoadingEscalation] = useState(false);
  const [escalationFilter, setEscalationFilter] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');
  
  // Notifications
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; body: string; createdAt: Date }>>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [notifBadgeCount, setNotifBadgeCount] = useState(0);

  // --- Modal Handlers ---
  const handleOpenDetails = async (report: ReportSummary) => {
    setSelectedReport(report);
    setIsModalVisible(true);
    setModalLoading(true);

    try {
      // Fetch latest report doc to get full fields (if needed)
      const reportRef = doc(db, 'reports', report.id);
      const snap = await getDoc(reportRef);
      const data = snap.exists() ? snap.data() : {};

      // Check if report is marked as fake - if so, block prediction
      if (data.is_fake === true) {
        Alert.alert(
          'Report Flagged',
          `This report has been flagged as inauthentic and cannot be used for crime prediction.\n\nReason: ${data.verification_reasoning || 'Failed verification'}`
        );
        setModalLoading(false);
        return;
      }

      const text = data.description || report.description || '';
      const city = data.location?.city || report.location || 'Unknown';
      
      // Format time_of_occurrence: extract HH:MM from timestamp if available
      let time_of_occurrence = '';
      if (data.timestamp) {
        try {
          // Firestore Timestamp to Date conversion
          const date = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          time_of_occurrence = `${hours}:${minutes}`;
        } catch (e) {
          time_of_occurrence = '';
        }
      }

      // Call prediction API (this uses Firebase auth token under the hood)
      const resp = await predictRisk({ text, city, time_of_occurrence });

      // Normalize response and write back to Firestore so other officers see ML results
      const mlUpdate: any = {
        riskLevelText: resp.label || 'Unknown',
        escalationRiskScore: resp.confidence ? Math.round(Number(resp.confidence) * 100) : 0,
        potentialCrime: resp.potentialCrime || resp.label || null,
        reasoning: resp.reasoning || null,
        mlUpdatedAt: serverTimestamp()
      };

      try {
        await updateDoc(reportRef, mlUpdate);
      } catch (firestoreError) {
        console.warn('⚠️  Firestore update failed (but displaying prediction anyway):', firestoreError);
        // Continue anyway - we still want to display the prediction even if Firestore write fails
      }

      // Update local selected report with ML fields for immediate UI update
      setSelectedReport((prev) => prev ? { ...prev, ...mlUpdate } as ReportSummary : null);
    } catch (e) {
      console.error('Prediction API failed:', e);
      // Show the modal anyway; the modal renders mock text when reasoning is missing
    } finally {
      setModalLoading(false);
    }
  };

  const handleCloseDetails = () => {
    setIsModalVisible(false);
    setSelectedReport(null);
    setEscalationPrediction(null); // Clear escalation prediction when closing
  };

  // --- Escalation Risk Prediction ---
  const handlePredictEscalation = async (report: ReportSummary) => {
    setLoadingEscalation(true);
    setEscalationPrediction(null);
    
    try {
      // Prepare incident data for the model
      const incidentData = {
        description: report.description || 'Unknown incident',
        location: report.location || 'Unknown',
        sub_location: '', // Can be extracted from coords or additional data
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
        part_of_day: '', // Will be inferred by backend
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
      
      // Update Firestore AND local state immediately
      if (report.id) {
        try {
          const reportRef = doc(db, 'reports', report.id);
          const escalationUpdate = {
            escalation_prediction: result.predicted_risk,
            escalation_confidence: result.confidence,
            escalation_probabilities: result.probabilities,
            escalation_reasoning: result.reasoning,
            escalation_predicted_at: serverTimestamp()
          };
          
          await updateDoc(reportRef, escalationUpdate);
          
          // ✅ CRITICAL: Update local state immediately so it appears in the dashboard
          const localUpdate = {
            ...escalationUpdate,
            escalation_predicted_at: new Date() // Use local timestamp for immediate display
          };
          
          // Update recentReports array
          setRecentReports((prev) => {
            const updated = prev.map(r => r.id === report.id ? { ...r, ...localUpdate } : r);
            console.log('🔄 Updated recentReports:', updated.map(r => ({
              id: r.id,
              hasEscalation: !!r.escalation_prediction,
              escalation: r.escalation_prediction,
              timestamp: r.escalation_predicted_at
            })));
            return updated;
          });
          
          // Update selectedReport if it's the same
          setSelectedReport((prev) => 
            prev && prev.id === report.id ? { ...prev, ...localUpdate } as ReportSummary : prev
          );
          
          console.log('✅ Escalation prediction saved to Firestore and local state updated');
          console.log('📦 Local update data:', localUpdate);
        } catch (firestoreError) {
          console.warn('⚠️  Could not save escalation prediction to Firestore:', firestoreError);
          // Even if Firestore fails, update local state
          const localUpdate = {
            escalation_prediction: result.predicted_risk,
            escalation_confidence: result.confidence,
            escalation_probabilities: result.probabilities,
            escalation_reasoning: result.reasoning,
            escalation_predicted_at: new Date()
          };
          
          setRecentReports((prev) => 
            prev.map(r => r.id === report.id ? { ...r, ...localUpdate } : r)
          );
          
          setSelectedReport((prev) => 
            prev && prev.id === report.id ? { ...prev, ...localUpdate } as ReportSummary : prev
          );
        }
      }
      
    } catch (error) {
      console.error('❌ Escalation prediction error:', error);
      Alert.alert(
        'Prediction Error',
        `Failed to predict escalation risk: ${(error as Error).message}`
      );
    } finally {
      setLoadingEscalation(false);
    }
  };

  // --- Officer Action: Update Report Status ---
  // Unified status change handler: try to persist to Firestore, fall back to local-only
  // Try to set the report status to a specific target value (persist if possible, else fallback to local)
  const setReportStatus = async (reportId: string, targetStatus: ReportSummary['status']) => {
    if (user) {
      try {
        const reportRef = doc(db, 'reports', reportId);
        await updateDoc(reportRef, {
          status: targetStatus,
          updatedBy: user.uid,
          updatedAt: new Date(),
        });
        // Update local mirror for responsiveness
        setRecentReports((prev) => prev.map(r => r.id === reportId ? { ...r, status: targetStatus } : r));
        setSelectedReport((prev) => prev ? (prev.id === reportId ? { ...prev, status: targetStatus } as ReportSummary : prev) : prev);
        Alert.alert('Success', `Report status updated to ${targetStatus}.`);
        return;
      } catch (e) {
        console.error('Persisting status failed, falling back to local update:', e);
        const msg = (e as Error).message || String(e);
        Alert.alert('Warning', `Could not persist status change: ${msg}. Applying locally.`);
      }
    } else {
      Alert.alert('Notice', 'Not signed in — applying status locally only.');
    }

    // Fallback: apply locally only so UI reflects change until rules/network are fixed
    setRecentReports((prev) => prev.map(r => r.id === reportId ? { ...r, status: targetStatus } : r));
    setSelectedReport((prev) => prev ? (prev.id === reportId ? { ...prev, status: targetStatus } as ReportSummary : prev) : prev);
  };

  // Cycle helper: uses setReportStatus to set the next status
  const changeReportStatus = async (reportId: string, currentStatus: ReportSummary['status']) => {
    const nextStatus: ReportSummary['status'] =
      currentStatus === 'Pending' ? 'Investigating' :
      currentStatus === 'Investigating' ? 'Resolved' : 'Investigating';
    await setReportStatus(reportId, nextStatus);
  };

  // Local-only handler used by modal
  // Deprecated: keep for backwards compatibility but route to changeReportStatus by cycling from current
  const handleLocalStatusUpdate = (reportId: string, newStatus: ReportSummary['status']) => {
    // Directly set to the chosen status (modal should pass the desired status)
    setReportStatus(reportId, newStatus);
  };


  // --- Fetch Flagged Reports from flagged_reports collection ---
  useEffect(() => {
    if (!user) return;

    console.log('🔍 Setting up flagged_reports listener...');
    // Try ordering by timestamp as fallback if flagged_at doesn't exist
    const flaggedQuery = query(
      collection(db, 'flagged_reports'), 
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(flaggedQuery, async (snapshot) => {
      console.log(`📊 Flagged reports snapshot: ${snapshot.docs.length} documents`);
      const flaggedData: ReportSummary[] = await Promise.all(snapshot.docs.map(async (docSnapshot) => {
        const data = docSnapshot.data();
        const userId = data.userId || 'Unknown';
        
        // Fetch username
        let userName = data.userName || 'Anonymous';
        if (userName === 'Anonymous' && userId !== 'Unknown') {
          try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
              const userData: any = userDoc.data();
              userName = userData.displayName || userData.name || userData.email || 'Anonymous';
            }
          } catch (e) {
            console.warn('Could not fetch username for userId:', userId, e);
          }
        }

        return {
          id: docSnapshot.id,
          type: data.reportType === 'AI_Summary' ? 'AI Summary' : 'Citizen Post',
          location: typeof data.location === 'string' ? data.location : (data.location?.city || 'Unknown'),
          timestamp: data.timestamp,
          status: data.status || 'Pending',
          riskLevelText: 'Flagged',
          escalationRiskScore: 0,
          is_fake: true,
          verification_reasoning: data.verification_reasoning || 'Flagged by automatic detection',
          description: data.description || 'No description available',
          potentialCrime: null,
          auto_extracted_location: null,
          auto_extracted_date: null,
          auto_extracted_time: null,
          auto_crime_reasoning: null,
          userName: userName,
          reportId: docSnapshot.id,
          coords: null,
        } as ReportSummary;
      }));

      console.log(`✅ Setting fakeReports state with ${flaggedData.length} reports`);
      setFakeReports(flaggedData);
    }, (error) => {
      console.error('❌ Error fetching flagged reports:', error);
    });

    return () => unsubscribe();
  }, [user]);

  // --- Fetch Recent Reports from Firestore (UPDATED to use ML model data) ---
  useEffect(() => {
    if (!user) return; 
    setLoadingReports(true);

    const reportsQuery = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(reportsQuery, async (snapshot) => {
      console.log('🔔 Firestore listener triggered - snapshot size:', snapshot.docs.length);
      const allReportsData: ReportSummary[] = await Promise.all(snapshot.docs.map(async (docSnapshot) => {
        const data = docSnapshot.data();
        
        // Debug: Log escalation fields from Firestore
        if (data.escalation_prediction) {
          console.log(`📥 Firestore has escalation for ${docSnapshot.id}:`, {
            prediction: data.escalation_prediction,
            confidence: data.escalation_confidence,
            timestamp: data.escalation_predicted_at
          });
        }
        
        const reportType = data.reportType === 'AI_Summary' ? 'AI Summary' : 'Citizen Post';
        
        // --- FETCHING ML DATA FROM FIRESTORE ---
        const riskLevelText = data.riskLevelText || 'Pending';
        const escalationRiskScore = data.escalationRiskScore || 0;
        const is_fake = data.is_fake || false;
        const verification_reasoning = data.verification_reasoning || '';
        const userId = data.submittedBy || data.userId || data.postedByUserId || 'Unknown';
        
        // Fetch username from users collection if not in report
        let userName = data.submitterName || data.userName || 'Anonymous';
        if (userName === 'Anonymous' && userId !== 'Unknown') {
          try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
              const userData: any = userDoc.data();
              userName = userData.displayName || userData.name || userData.email || 'Anonymous';
            }
          } catch (e) {
            console.warn('Could not fetch username for userId:', userId, e);
          }
        }
        
        // If auto-classification suggests 'Assault', optionally bump risk locally for UI visibility
        // Only auto-elevate when the model's auto_crime_confidence is high to avoid overriding
        // the main risk label for lower-confidence predictions.
        let localRiskLevelText = riskLevelText as ReportSummary['riskLevelText'];
        let localEscalationScore = escalationRiskScore;
        const potentialCrimeVal = data.auto_crime_type || data.potentialCrime || null;
        const autoCrimeConf = typeof data.auto_crime_confidence === 'number' ? data.auto_crime_confidence : 0;
        if (potentialCrimeVal && typeof potentialCrimeVal === 'string' && potentialCrimeVal.toLowerCase().includes('assault')) {
          // Elevate to high risk for officer attention only when the auto-classifier is confident
          if (autoCrimeConf >= 0.75) {
            if (localRiskLevelText !== 'High Risk') {
              localRiskLevelText = 'High Risk';
            }
            localEscalationScore = Math.max(localEscalationScore, 75);
          }
        }

        return {
          id: docSnapshot.id,
          reportId: `REP-${docSnapshot.id.substring(0, 5).toUpperCase()}`, 
          type: reportType,
          location: data.location?.city || 'Location Unknown',
          status: data.status || 'Pending', 
          riskLevelText: localRiskLevelText as ReportSummary['riskLevelText'],
          escalationRiskScore: localEscalationScore, 
          description: data.description || "", 
          coords: data.location?.latitude ? { latitude: data.location.latitude, longitude: data.location.longitude } : null,
          is_fake: is_fake,
          verification_reasoning: verification_reasoning,
          userId: userId,
          // Auto-extraction fields added for officer preview (confidence intentionally omitted from UI)
          potentialCrime: data.auto_crime_type || data.potentialCrime || null,
          auto_extracted_location: data.auto_extracted_location || null,
          auto_extracted_date: data.auto_extracted_date || null,
          auto_extracted_time: data.auto_extracted_time || null,
          auto_crime_reasoning: data.auto_crime_reasoning || null,
          userName: userName,
          // Escalation prediction fields (from AI Model)
          escalation_prediction: data.escalation_prediction || undefined,
          escalation_confidence: data.escalation_confidence || undefined,
          escalation_probabilities: data.escalation_probabilities || undefined,
          escalation_reasoning: data.escalation_reasoning || undefined,
          escalation_predicted_at: data.escalation_predicted_at || undefined,
        } as ReportSummary;
      }));

      // All reports from 'reports' collection are genuine
      // Fake reports are now in separate 'flagged_reports' collection
      const reportsWithEscalation = allReportsData.filter(r => r.escalation_prediction);
      console.log('🔄 Firestore listener update - reports with escalation:', reportsWithEscalation.length);
      if (reportsWithEscalation.length > 0) {
        console.log('📋 Escalation data in listener:', reportsWithEscalation.map(r => ({
          id: r.id,
          prediction: r.escalation_prediction,
          confidence: r.escalation_confidence,
          timestamp: r.escalation_predicted_at,
          hasTimestamp: !!r.escalation_predicted_at
        })));
      }
      
      // 🔒 CRITICAL: Preserve local escalation data if Firestore doesn't have it yet
      // This prevents race condition where serverTimestamp() takes time to propagate
      setRecentReports((prevReports) => {
        return allReportsData.map(newReport => {
          const existingReport = prevReports.find(r => r.id === newReport.id);
          
          // If existing report has escalation data but new report doesn't, preserve it
          if (existingReport?.escalation_prediction && !newReport.escalation_prediction) {
            console.log(`🔒 Preserving local escalation data for ${newReport.id}`);
            return {
              ...newReport,
              escalation_prediction: existingReport.escalation_prediction,
              escalation_confidence: existingReport.escalation_confidence,
              escalation_probabilities: existingReport.escalation_probabilities,
              escalation_reasoning: existingReport.escalation_reasoning,
              escalation_predicted_at: existingReport.escalation_predicted_at,
            };
          }
          
          return newReport;
        });
      });

      // Update KPI counts based on snapshot (only genuine reports)
      try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const activeCount = allReportsData.filter(d => {
          return (d.status === 'Pending') || (d.riskLevelText === 'High Risk');
        }).length;
        const todayCount = snapshot.docs.filter(d => {
          const ts = d.data().timestamp?.toDate ? d.data().timestamp.toDate() : null;
          // No need to filter is_fake since reports collection only has genuine reports
          return ts ? (ts >= startOfDay) : false;
        }).length;

        setReportsFiled(todayCount);
        setActiveAlerts(activeCount);
      } catch (e) {
        // ignore KPI calc errors
      }
      setLoadingReports(false);
    }, (error) => {
      console.error("Error fetching dashboard reports:", error);
      setLoadingReports(false);
      Alert.alert("Data Error", "Failed to load recent reports. Check Firestore rules.");
    });

    return () => unsubscribe();
  }, [user]);


  // Listen for officer count in users collection
  useEffect(() => {
    if (!user) return;
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('role', '==', 'officer'));
      const unsub = onSnapshot(q, (snap) => {
        setOfficersDuty(snap.size);
      }, (err) => console.error('officer count listener', err));
      return () => unsub();
    } catch (e) {
      console.error('officer count setup failed', e);
    }
  }, [user]);


  // Subscribe to authenticated user's profile for avatar updates
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const d: any = snap.data();
        // Profile.tsx writes `profilePictureUrl` when an officer uploads their photo.
        // Prefer that field, then fall back to other legacy fields.
        setProfileAvatarUrl(d.profilePictureUrl || d.avatarUrl || d.photoURL || d.badgeUrl || PLACEHOLDER_AVATAR);
        // store role for UI permission checks
        setUserRole(d.role || null);
      }
    }, (err) => console.error('user profile listener', err));
    return () => unsub();
  }, [user]);


  // --- Real-time Notifications Listener (new reports only) ---
  useEffect(() => {
    if (!user) return;

    // Listen for new reports ordered by timestamp descending
    const reportsRef = collection(db, 'reports');
    const q = query(reportsRef, orderBy('timestamp', 'desc'));

    let initialized = false;

    const unsub = onSnapshot(q, (snapshot) => {
      if (!initialized) {
        // Skip the initial snapshot (existing documents)
        initialized = true;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const title = data.reportType === 'AI_Summary' ? 'New AI Report' : 'New Report Filed';
          const body = (data.description || '').substring(0, 100);
          const createdAt = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();

          setNotifications(prev => [{ id: change.doc.id, title, body, createdAt }, ...prev].slice(0, 10));
          setNotifBadgeCount(c => c + 1);
        }
      });
    }, (err) => console.error('Notif listener error', err));

    return () => unsub();
  }, [user]);
  
  
  // Calculate total high risks for KPI card
  const highRiskCount = recentReports.filter(r => r.riskLevelText === 'High Risk').length;
  // Calculate total escalation risks (High and Medium)
  const totalEscalationRisks = recentReports.filter(r => r.riskLevelText === 'High Risk' || r.riskLevelText === 'Medium Risk').length;

  // Officer credibility score state (for fake report detection)
  const [officerCredibilityScore, setOfficerCredibilityScore] = useState(85);

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/images/bg_img.png')} style={styles.backgroundImage} />

      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={styles.notifButton} onPress={() => setShowNotifDropdown(s => !s)}>
            <Ionicons name="notifications-outline" size={26} color={GOLD_ACCENT} />
            {notifBadgeCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{notifBadgeCount}</Text></View>}
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Profile', { userType: 'Officer' })} style={styles.profileButton}>
          <Image source={{ uri: profileAvatarUrl || PLACEHOLDER_AVATAR }} style={styles.profileAvatar} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Dashboard</Text>

        {/* --- 1. Map Button (Full Width, Prominent) --- */}
        <TouchableOpacity 
          style={[styles.mapButton, styles.fullWidthMapButton]} 
          onPress={() => navigation.navigate('CrimeMap')}
        >
          <Text style={styles.mapButtonText}>View Live Incident Map</Text>
          <Text style={styles.mapButtonSubtitle}>View {recentReports.filter(r => r.coords).length} Geo-Tagged Incidents</Text>
        </TouchableOpacity>


        {/* --- 2. KPI Cards --- */}
        <View style={styles.kpiContainer}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{activeAlerts}</Text>
            <Text style={styles.kpiLabel}>Active Alerts</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{reportsFiled}</Text>
            <Text style={styles.kpiLabel}>Reports Filed Today</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{officersDuty}</Text>
            <Text style={styles.kpiLabel}>Officers on Duty</Text>
          </View>
          {/* KPI CARD FOR REAL RISK COUNT */}
          <View style={[styles.kpiCard, { borderColor: highRiskCount > 0 ? getRiskStyleColor('High Risk') : INACTIVE_GRAY }]}>
            <Text style={[styles.kpiValue, { color: highRiskCount > 0 ? getRiskStyleColor('High Risk') : GOLD_ACCENT }]}>
                {totalEscalationRisks}
            </Text>
            <Text style={styles.kpiLabel}>Escalation Risks</Text>
          </View>
        </View>

        {/* --- 2B. Flagged Reports (Fake Report Detection) --- */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionTitleContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="alert-circle" size={24} color="#E74C3C" style={{ marginRight: 8 }} />
              <Text style={styles.sectionTitle}>Flagged Reports</Text>
            </View>
            {fakeReports.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{fakeReports.length}</Text>
              </View>
            )}
          </View>
          
          {fakeReports.length === 0 ? (
            <Text style={feedStyles.emptyText}>No flagged reports. All submissions appear legitimate.</Text>
          ) : (
            <View>
              {fakeReports.slice(0, 3).map((report) => (
                <View key={`fake-${report.id}`} style={styles.fakeReportItem}>
                  <View style={styles.fakeReportHeader}>
                    <View style={styles.fakeReportMeta}>
                      <Text style={styles.fakeReportID}>Report #{report.id.substring(0, 8)}</Text>
                      <Text style={styles.fakeReportType}>{report.type}</Text>
                      {report.userName && (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="person" size={12} color="#C7CAD1" style={{ marginRight: 6 }} />
                          <Text style={styles.fakeReportUser}>{report.userName}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.fakeReportBadge}>
                      <Text style={styles.fakeReportBadgeText}>FAKE</Text>
                    </View>
                  </View>
                  
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Ionicons name="location" size={13} color="#E8E9ED" style={{ marginRight: 6 }} />
                    <Text style={styles.fakeReportLocation}>{report.location}</Text>
                  </View>
                  
                  {report.description && (
                    <View style={styles.reportDescriptionBox}>
                      <Text style={styles.reportDescriptionLabel}>Report Text:</Text>
                      <Text style={styles.reportDescriptionText} numberOfLines={2}>
                        {report.description}
                      </Text>
                    </View>
                  )}
                  
                  {report.verification_reasoning && (
                    <View style={styles.reasonBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Ionicons name="close-circle" size={12} color="#E74C3C" style={{ marginRight: 6 }} />
                        <Text style={styles.reasonLabel}>Reason:</Text>
                      </View>
                      <Text style={styles.reasonText} numberOfLines={2}>
                        {report.verification_reasoning}
                      </Text>
                    </View>
                  )}
                  
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                    <Ionicons name="time" size={11} color="#A0A0A0" style={{ marginRight: 6 }} />
                    <Text style={styles.fakeReportTime}>
                      {report.timestamp ? new Date(report.timestamp.toDate?.() || report.timestamp).toLocaleString() : 'Unknown'}
                    </Text>
                  </View>
                </View>
              ))}
              
              {fakeReports.length > 3 && (
                <TouchableOpacity 
                  style={styles.viewMoreButton}
                  onPress={() => navigation.navigate('FlaggedReports', { flaggedReports: fakeReports })}
                >
                  <Text style={styles.viewMoreText}>
                    View All {fakeReports.length} Flagged Reports
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={GOLD_ACCENT} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* --- 4. Recent Reports Section --- */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Recent Incident Reports</Text>
          <View style={feedStyles.tableHeader}>
            <Text style={[feedStyles.tableHeaderText, { width: 60 }]}>ID</Text>
            <Text style={[feedStyles.tableHeaderText, { width: 80 }]}>TYPE</Text>
            <Text style={[feedStyles.tableHeaderText, { flex: 1 }]}>LOCATION</Text>
            <Text style={[feedStyles.tableHeaderText, { width: 90, textAlign: 'center' }]}>STATUS</Text>
          </View>
          
          {loadingReports ? (
            <ActivityIndicator style={{ marginVertical: 20 }} size="small" color={GOLD_ACCENT} />
          ) : (
      recentReports.slice(0, 5).map(report => (
        <ReportRow 
          key={report.id} 
          report={report} 
          onUpdateStatus={changeReportStatus} 
          onOpenDetails={handleOpenDetails}
        />
      ))
          )}
          <TouchableOpacity
            style={styles.viewAllButton}
            onPress={() => navigation.getParent()?.navigate('ReportManagementScreen')}
            accessibilityRole="button"
            accessibilityLabel="View all reports"
          >
            <View style={styles.viewAllButtonInner}>
              <Text style={styles.viewAllText}>View All Reports</Text>
              <Text style={styles.viewAllArrow}>→</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* --- 5. Recent Escalation Predictions (calculated by officers) --- */}
        <View style={styles.sectionCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>Recent Escalation Predictions</Text>
          </View>
          {loadingReports ? (
             <ActivityIndicator style={{ marginVertical: 20 }} size="small" color={GOLD_ACCENT} />
          ) : (
            (() => {
              console.log('🎯 Recent Escalation Predictions rendering...');
              console.log('📝 Total recentReports:', recentReports.length);
              console.log('📋 All reports:', recentReports.map(r => ({
                id: r.id,
                hasEscalation: !!r.escalation_prediction,
                hasTimestamp: !!r.escalation_predicted_at
              })));
              
              // Filter reports that have HIGH RISK escalation predictions only
              const calculatedReports = recentReports.filter(r => {
                console.log(`🔍 Checking report ${r.id}:`, {
                  has_escalation_prediction: !!r.escalation_prediction,
                  has_escalation_predicted_at: !!r.escalation_predicted_at,
                  escalation_prediction: r.escalation_prediction,
                  escalation_predicted_at: r.escalation_predicted_at
                });
                return r.escalation_prediction === 'High' && r.escalation_predicted_at;
              });
              
              console.log(`📊 Total reports with escalation: ${calculatedReports.length}`);
              
              // Sort by prediction time (most recent first)
              const sortedReports = calculatedReports.sort((a, b) => {
                // Handle both Firestore timestamps and Date objects
                const getTime = (timestamp: any) => {
                  if (!timestamp) return 0;
                  if (timestamp.toMillis) return timestamp.toMillis();
                  if (timestamp instanceof Date) return timestamp.getTime();
                  if (timestamp.seconds) return timestamp.seconds * 1000;
                  return 0;
                };
                
                const timeA = getTime(a.escalation_predicted_at);
                const timeB = getTime(b.escalation_predicted_at);
                return timeB - timeA;
              });
              
              console.log(`📋 Sorted reports (latest 3):`, sortedReports.slice(0, 3).map(r => ({
                id: r.id,
                risk: r.escalation_prediction,
                time: r.escalation_predicted_at
              })));
              
              return sortedReports.length > 0 ? (
                <>
                  {sortedReports.slice(0, 3).map((report) => (
                    <EscalationPredictionCard 
                      key={`escalation-${report.id}`} 
                      report={report} 
                      onOpenDetails={handleOpenDetails}
                    />
                  ))}
                  {sortedReports.length > 3 && (
                    <TouchableOpacity
                      style={styles.viewAllButton}
                      onPress={() => navigation.navigate('IncidentEscalationRisks')}
                      accessibilityRole="button"
                      accessibilityLabel="View all escalation predictions"
                    >
                      <View style={styles.viewAllButtonInner}>
                        <Text style={styles.viewAllText}>View All Predictions ({sortedReports.length})</Text>
                        <Text style={styles.viewAllArrow}>→</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <Text style={feedStyles.emptyText}>
                  No high-risk escalation predictions. Click "Analyze with AI Model" in report details to generate predictions.
                </Text>
              );
            })()
          )}
        </View>

        {/* --- 5. Crime Type Prediction Section --- */}
        <View style={styles.sectionCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="shield-checkmark" size={24} color={GOLD_ACCENT} style={{ marginRight: 8 }} />
            <Text style={styles.sectionTitle}>Crime Classification Tool</Text>
          </View>
          <Text style={styles.sectionSubtitle}>Manually classify crimes using ML model</Text>
          
          <TouchableOpacity
            style={styles.crimeClassificationButton}
            onPress={() => navigation.navigate('CrimeTypePrediction')}
          >
            <Ionicons name="checkmark-done-circle" size={28} color={GOLD_ACCENT} style={{ marginRight: 12 }} />
            <View style={styles.crimeClassificationButtonContent}>
              <Text style={styles.crimeClassificationButtonTitle}>Classify Crime Type</Text>
              <Text style={styles.crimeClassificationButtonSubtitle}>Predict into 11 crime categories</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={GOLD_ACCENT} />
          </TouchableOpacity>

          <View style={styles.crimeTypesPreview}>
            <Text style={styles.crimeTypesPreviewLabel}>Supported Categories:</Text>
            <Text style={styles.crimeTypesPreviewText}>
              Armed Robbery • Arson • Assault • Burglary • Cybercrime • Fraud • Murder • Rape • Theft • Traffic Offense • Vandalism
            </Text>
          </View>
        </View>

        {/* Notification Dropdown Modal (simple) */}
        {showNotifDropdown && (
          <View style={styles.notifDropdown}>
            <Text style={styles.notifHeader}>Notifications</Text>
            {notifications.length === 0 && <Text style={styles.notifEmpty}>No new notifications</Text>}
            {notifications.map(n => (
              <TouchableOpacity key={n.id} style={styles.notifItem} onPress={() => {
                // Open report details by navigating to ReportManagementScreen and optionally highlighting report
                setShowNotifDropdown(false);
                navigation.getParent()?.navigate('ReportManagementScreen');
              }}>
                <Text style={styles.notifTitle}>{n.title}</Text>
                <Text style={styles.notifBody}>{n.body}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.clearButton} onPress={() => { setNotifications([]); setNotifBadgeCount(0); }}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}
        
    {/* --- Report Details Modal --- */}
    <ReportDetailsModal 
      report={selectedReport} 
      isVisible={isModalVisible} 
      onClose={handleCloseDetails}
      modalLoading={modalLoading}
      userRole={userRole}
      onLocalUpdate={handleLocalStatusUpdate}
      escalationPrediction={escalationPrediction}
      loadingEscalation={loadingEscalation}
      onPredictEscalation={handlePredictEscalation}
      onClearEscalation={() => setEscalationPrediction(null)}
    />
        
      </ScrollView>
    </View>
  );
}

// --- Modal Component (moved here for completeness) ---
const ReportDetailsModal = ({ 
  report, 
  isVisible, 
  onClose, 
  modalLoading, 
  userRole, 
  onLocalUpdate,
  escalationPrediction,
  loadingEscalation,
  onPredictEscalation,
  onClearEscalation
}: { 
  report: ReportSummary | null; 
  isVisible: boolean; 
  onClose: () => void; 
  modalLoading: boolean; 
  userRole?: string | null; 
  onLocalUpdate?: (reportId: string, newStatus: ReportSummary['status']) => void;
  escalationPrediction?: {
    predicted_risk: string;
    confidence: number;
    probabilities: { Low: number; Medium: number; High: number };
    reasoning: string;
  } | null;
  loadingEscalation?: boolean;
  onPredictEscalation?: (report: ReportSummary) => void;
  onClearEscalation?: () => void;
}) => {
  if (!report) return null;
  
  // Modal displays report details. Status is read-only here; status changes are done via the status badge in the list.

  const riskColor = getRiskStyleColor(report.riskLevelText);
  const confidence = report.escalationRiskScore;

  // Use actual ML fields if present (reasoning, potentialCrime) otherwise show fallback
  const potentialCrime = report.potentialCrime || (report.riskLevelText === 'High Risk' ? 'Aggravated Assault / Burglary' : 'Minor Disturbance');
  const reasoning = report.reasoning || `Risk assessed by ML model. Score ${confidence}%. Incident in ${report.location} suggests ${report.riskLevelText} risk. Requires human review.`;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View style={modalStyles.centeredView}>
        <View style={modalStyles.modalView}>
          
          {/* Header and Close Button */}
          <View style={modalStyles.modalHeader}>
            <Text style={modalStyles.modalTitle}>Report Details - {report.reportId}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={modalStyles.closeButton}>X</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={modalStyles.modalContent}>
            
            {/* Summary Section */}
            <View style={modalStyles.summarySection}>
              <Text style={modalStyles.summaryLabel}>Status</Text>
              <Text style={[modalStyles.statusPill, { 
                  backgroundColor: getStatusColor(report.status) + '30',
                  color: getStatusColor(report.status),
                  borderColor: getStatusColor(report.status),
                }]}> 
                {report.status}
              </Text>

              {/* Status is read-only in the modal - use the status badge in the list to change status. */}
              
              <Text style={modalStyles.summaryLabel}>Type</Text>
              <Text style={modalStyles.summaryValue}>{report.type}</Text>

              <Text style={modalStyles.summaryLabel}>Full Summary</Text>
              <Text style={modalStyles.summaryValue}>{report.description}</Text>

              <Text style={modalStyles.summaryLabel}>Location</Text>
              <Text style={modalStyles.summaryValue}>{report.location}</Text>
              
              <View style={modalStyles.divider} />
            </View>

            {/* AI-Powered Escalation Prediction */}
            <View style={[modalStyles.escalationSection, { 
              borderColor: escalationPrediction 
                ? (escalationPrediction.predicted_risk === 'High' ? '#E74C3C' :
                   escalationPrediction.predicted_risk === 'Medium' ? '#F39C12' : '#27AE60')
                : GOLD_ACCENT + '40'
            }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={modalStyles.escalationHeader}>↗ Escalation Prediction</Text>
                </View>
                {escalationPrediction && (
                  <TouchableOpacity onPress={onClearEscalation}>
                    <Ionicons name="refresh" size={18} color={GOLD_ACCENT} />
                  </TouchableOpacity>
                )}
              </View>

              {!escalationPrediction ? (
                <>
                  <Text style={[modalStyles.detailValue, { fontSize: 12, color: INACTIVE_GRAY, marginBottom: 15 }]}>
                    Uses HybridRiskModel (BERT + Categorical Embeddings) for deep learning-based risk assessment
                  </Text>
                  
                  <TouchableOpacity
                    style={[
                      modalStyles.predictButton,
                      loadingEscalation && { opacity: 0.6 }
                    ]}
                    onPress={() => onPredictEscalation && onPredictEscalation(report)}
                    disabled={loadingEscalation}
                  >
                    {loadingEscalation ? (
                      <ActivityIndicator size="small" color={DARK_NAVY} />
                    ) : (
                      <>
                        <Ionicons name="flask" size={20} color={DARK_NAVY} style={{ marginRight: 8 }} />
                        <Text style={modalStyles.predictButtonText}>Analyze with AI Model</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {/* Likelihood */}
                  <Text style={modalStyles.detailLabel}>Likelihood</Text>
                  <Text style={[modalStyles.riskPill, { 
                    backgroundColor: escalationPrediction.predicted_risk === 'High' ? '#E74C3C' :
                                     escalationPrediction.predicted_risk === 'Medium' ? '#F39C12' : '#27AE60',
                    color: 'white' 
                  }]}>
                    {escalationPrediction.predicted_risk} Risk
                  </Text>

                  {/* Potential Crime - Extract from reasoning or probabilities */}
                  <Text style={modalStyles.detailLabel}>Potential Crime</Text>
                  <Text style={modalStyles.detailValue}>
                    {escalationPrediction.predicted_risk === 'High' 
                      ? 'Violent Escalation / Multiple Suspects' 
                      : escalationPrediction.predicted_risk === 'Medium'
                      ? 'Property Damage / Confrontation'
                      : 'Minor Disturbance / Low Priority'}
                  </Text>

                  {/* Reasoning */}
                  <Text style={modalStyles.detailLabel}>Reasoning</Text>
                  <Text style={modalStyles.detailValue}>{escalationPrediction.reasoning}</Text>
                </>
              )}
            </View>
            
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_NAVY },
  backgroundImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.2 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, marginBottom: 20, },
  menuIcon: { fontSize: 28, color: 'white', },
  bellIcon: { fontSize: 28, color: GOLD_ACCENT, },
  title: { fontSize: 32, fontFamily: 'Raleway-Bold', color: 'white', marginBottom: 20, paddingTop: 10 },

  // Map Button Styles (New Prominent Button)
  mapButton: {
    height: 80, 
    backgroundColor: GOLD_ACCENT + '20',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20, 
    padding: 10,
    borderWidth: 1,
    borderColor: GOLD_ACCENT + '70',
  },
  fullWidthMapButton: {
    width: '100%',
  },
  mapButtonText: {
    color: GOLD_ACCENT,
    fontFamily: 'Raleway-Bold',
    fontSize: 18,
    marginBottom: 5,
  },
  mapButtonSubtitle: {
    color: 'white',
    fontFamily: 'JosefinSans-Medium',
    fontSize: 12,
    textAlign: 'center',
  },

  // KPI Cards
  kpiContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20, },
  kpiCard: { backgroundColor: CARD_BG, width: '48%', borderRadius: 10, padding: 15, marginBottom: 10, borderColor: GOLD_ACCENT + '50', borderWidth: 1, },
  kpiValue: { fontSize: 30, fontFamily: 'Raleway-Bold', color: GOLD_ACCENT, },
  kpiLabel: { fontSize: 14, color: '#A0A0A0', fontFamily: 'JosefinSans-Medium', },

  // Section Cards
  sectionCard: { backgroundColor: CARD_BG, borderRadius: 10, padding: 15, marginBottom: 20, borderColor: '#4A4A6A', borderWidth: 1, },
  sectionTitle: { fontSize: 18, fontFamily: 'Raleway-Bold', color: 'white', marginBottom: 10, },
  sectionSubtitle: { fontSize: 12, fontFamily: 'JosefinSans-Medium', color: '#A0A0A0', marginBottom: 12 },
  sectionTitleContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  viewAllButton: { alignSelf: 'flex-end', marginTop: 10, },
  viewAllText: { color: GOLD_ACCENT, fontFamily: 'JosefinSans-Medium', fontSize: 14, },

  // Crime Classification Button
  crimeClassificationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderWidth: 2,
    borderColor: GOLD_ACCENT,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 12,
  },
  crimeClassificationButtonIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  crimeClassificationButtonContent: {
    flex: 1,
  },
  crimeClassificationButtonTitle: {
    fontSize: 14,
    fontFamily: 'Raleway-Bold',
    color: GOLD_ACCENT,
    marginBottom: 2,
  },
  crimeClassificationButtonSubtitle: {
    fontSize: 12,
    fontFamily: 'JosefinSans-Medium',
    color: '#AAA',
  },
  crimeClassificationButtonArrow: {
    fontSize: 18,
    color: GOLD_ACCENT,
    marginLeft: 8,
  },
  crimeTypesPreview: {
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.15)',
    borderRadius: 8,
    padding: 10,
  },
  crimeTypesPreviewLabel: {
    fontSize: 11,
    fontFamily: 'Raleway-Bold',
    color: GOLD_ACCENT,
    marginBottom: 6,
  },
  crimeTypesPreviewText: {
    fontSize: 11,
    fontFamily: 'JosefinSans-Medium',
    color: '#CCC',
    lineHeight: 16,
  },
  
  // Fake Report Styles
  fakeReportItem: { 
    backgroundColor: 'rgba(231, 76, 60, 0.1)', 
    borderRadius: 8, 
    padding: 12, 
    marginBottom: 10, 
    borderWidth: 1, 
    borderColor: 'rgba(231, 76, 60, 0.3)',
  },
  fakeReportHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  fakeReportMeta: { 
    flex: 1,
  },
  fakeReportID: { 
    fontSize: 14, 
    fontFamily: 'Raleway-Bold', 
    color: '#E74C3C',
  },
  fakeReportType: { 
    fontSize: 12, 
    fontFamily: 'JosefinSans-Medium', 
    color: '#A0A0A0',
    marginTop: 2,
  },
  fakeReportUser: {
    fontSize: 11,
    fontFamily: 'JosefinSans-Medium',
    color: '#E74C3C',
    marginTop: 4,
    fontStyle: 'italic',
  },
  fakeReportBadge: { 
    backgroundColor: '#E74C3C', 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    borderRadius: 6,
  },
  fakeReportBadgeText: { 
    color: 'white', 
    fontFamily: 'Raleway-Bold', 
    fontSize: 12,
  },
  fakeReportLocation: { 
    fontSize: 13, 
    fontFamily: 'JosefinSans-Medium', 
    color: 'white',
    flex: 1,
  },
  reasonBox: { 
    backgroundColor: 'rgba(231, 76, 60, 0.15)', 
    borderRadius: 6, 
    padding: 10, 
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#E74C3C',
  },
  reasonLabel: { 
    fontSize: 11, 
    fontFamily: 'Raleway-Bold', 
    color: '#E74C3C',
  },
  reasonText: { 
    fontSize: 12, 
    fontFamily: 'JosefinSans-Medium', 
    color: 'white',
    lineHeight: 18,
  },
  fakeReportTime: { 
    fontSize: 11, 
    fontFamily: 'JosefinSans-Medium', 
    color: '#A0A0A0',
    flex: 1,
  },
  reportDescriptionBox: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: GOLD_ACCENT,
  },
  reportDescriptionLabel: {
    fontSize: 11,
    fontFamily: 'Raleway-Bold',
    color: GOLD_ACCENT,
    marginBottom: 4,
  },
  reportDescriptionText: {
    fontSize: 12,
    fontFamily: 'JosefinSans-Medium',
    color: 'white',
    lineHeight: 18,
  },
  viewMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderWidth: 1,
    borderColor: GOLD_ACCENT,
    borderRadius: 8,
    padding: 14,
    marginTop: 12,
  },
  viewMoreText: {
    color: GOLD_ACCENT,
    fontFamily: 'Raleway-Bold',
    fontSize: 14,
    marginRight: 8,
  },

  viewAllButtonInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,215,0,0.06)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,215,0,0.18)' },
  viewAllArrow: { color: GOLD_ACCENT, fontFamily: 'Raleway-Bold', marginLeft: 8 },

  // Crime Prediction styles
  smallHint: { color: '#A0A0A0', fontFamily: 'JosefinSans-Medium', marginBottom: 8 },
  inputLabel: { color: GOLD_ACCENT, fontFamily: 'Raleway-Bold', marginTop: 8, marginBottom: 6 },
  predInput: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 12, borderRadius: 8, color: 'white', fontFamily: 'JosefinSans-Medium' },
  predictButton: { backgroundColor: GOLD_ACCENT, padding: 12, borderRadius: 8, marginTop: 12, alignItems: 'center' },
  predictButtonText: { color: DARK_NAVY, fontFamily: 'Raleway-Bold' },
  predictionResultBox: { marginTop: 12, backgroundColor: '#1E1E2F', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#2A2A3A', minHeight: 80, justifyContent: 'center' },
  predictionText: { color: GOLD_ACCENT, fontFamily: 'Raleway-Bold', fontSize: 16 },
  predictionPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  predictionPlaceholderText: { color: '#A0A0A0', fontFamily: 'JosefinSans-Medium' },
  
  // Dropdown styles for crime prediction
  dropdownRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  dropdownOption: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  dropdownOptionActive: { backgroundColor: GOLD_ACCENT, borderColor: GOLD_ACCENT },
  dropdownOptionText: { color: 'white', fontFamily: 'JosefinSans-Medium', fontSize: 12 },
  dropdownOptionTextActive: { color: DARK_NAVY, fontFamily: 'Raleway-Bold' },

  // Notification styles
  notifButton: { padding: 6, borderRadius: 8, marginRight: 6 },
  badge: { position: 'absolute', right: -4, top: -4, backgroundColor: '#E74C3C', minWidth: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: 'white', fontSize: 11, fontFamily: 'Raleway-Bold', paddingHorizontal: 3 },
  notifDropdown: { position: 'absolute', left: 20, top: 0, width: 300, backgroundColor: '#151515', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, padding: 10, zIndex: 9999 },
  notifHeader: { fontFamily: 'Raleway-Bold', color: 'white', marginBottom: 8, fontSize: 16 },
  notifEmpty: { color: '#A0A0A0', fontFamily: 'JosefinSans-Medium' },
  notifItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  notifTitle: { color: GOLD_ACCENT, fontFamily: 'Raleway-Bold' },
  notifBody: { color: 'white', fontFamily: 'JosefinSans-Medium' },
  clearButton: { marginTop: 8, alignSelf: 'flex-end' },
  clearText: { color: '#A0A0A0', fontFamily: 'JosefinSans-Medium' },

  // Profile avatar/button in header
  profileButton: { padding: 4, borderRadius: 20, overflow: 'hidden' },
  profileAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: GOLD_ACCENT },
  notifIconWrapper: { position: 'relative' },

  // Data Insight Styles (Kept styles for consistency, but not used in this file)
  dataInsightContainerScroll: { height: 250, maxHeight: 200 }, 
  insightSection: { marginBottom: 5 },
  insightTitle: { fontSize: 14, fontFamily: 'Raleway-Bold', color: 'white', marginBottom: 5 },
  insightRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  insightLabel: { color: '#A0A0A0', fontFamily: 'JosefinSans-Medium', fontSize: 13 },
  insightCount: { color: GOLD_ACCENT, fontFamily: 'Raleway-Bold', fontSize: 13 }
});

const feedStyles = StyleSheet.create({
  tableHeader: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#4A4A6A', marginBottom: 5, },
  tableHeaderText: { fontFamily: 'Raleway-Bold', color: GOLD_ACCENT, fontSize: 12, },
  reportRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.1)', },
  reportText: { fontSize: 14, color: 'white', fontFamily: 'JosefinSans-Medium', marginRight: 10, },
  statusBadgeButton: { 
    paddingHorizontal: 8, 
    paddingVertical: 3, 
    borderRadius: 10, 
    borderWidth: 1,
    overflow: 'hidden', 
    width: 90,
    alignItems: 'center',
    textAlign: 'center',
  },
  statusBadgeText: { 
    fontSize: 10, 
    fontFamily: 'Raleway-Bold', 
  },
  viewPredictionButton: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: GOLD_ACCENT + '20',
    borderWidth: 1,
    borderColor: GOLD_ACCENT,
    marginLeft: 8,
    width: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewPredictionText: {
    fontSize: 14,
    color: GOLD_ACCENT,
    fontFamily: 'Raleway-Bold',
  },
  // Incident Risk Styles
  riskRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.1)', },
  riskType: { fontSize: 16, color: 'white', fontFamily: 'JosefinSans-Medium', marginBottom: 4, },
  riskDetails: { flexDirection: 'row', alignItems: 'center', },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, fontSize: 12, color: 'white', fontFamily: 'Raleway-Bold', marginRight: 10, overflow: 'hidden', },
  riskSubtext: { fontSize: 12, color: '#A0A0A0', fontFamily: 'JosefinSans-Medium', },
  emptyText: { fontSize: 14, color: '#A0A0A0', fontFamily: 'JosefinSans-Medium', textAlign: 'center', marginVertical: 10 },
});

// --- Modal Styles (NEW) ---
const modalStyles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    modalView: {
        width: width * 0.9,
        maxHeight: height * 0.9,
        backgroundColor: DARK_NAVY,
        borderRadius: 15,
        padding: 15,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
        borderColor: '#4A4A6A',
        borderWidth: 1,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#4A4A6A',
        paddingBottom: 10,
        marginBottom: 10,
    },
    modalTitle: {
        fontSize: 20,
        fontFamily: 'Raleway-Bold',
        color: 'white',
    },
    closeButton: {
        fontSize: 20,
        color: INACTIVE_GRAY,
        padding: 5,
    },
    modalContent: {
        paddingVertical: 10,
    },
    divider: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
        marginVertical: 15,
    },
    // Summary Section
    summarySection: {
        marginBottom: 10,
    },
    summaryLabel: {
        fontSize: 12,
        fontFamily: 'JosefinSans-Medium',
        color: GOLD_ACCENT,
        marginTop: 8,
    },
    summaryValue: {
        fontSize: 16,
        fontFamily: 'JosefinSans-Medium',
        color: 'white',
        lineHeight: 22,
    },
    statusPill: {
        fontSize: 14,
        fontFamily: 'Raleway-Bold',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 5,
        alignSelf: 'flex-start',
        color: 'white',
        marginBottom: 8,
        borderWidth: 1, // Added border for status pill
    },
    // Escalation Section
    escalationSection: {
        backgroundColor: '#1E1E2F',
        padding: 15,
        borderRadius: 10,
        borderWidth: 1,
    },
    escalationHeader: {
        fontSize: 16,
        fontFamily: 'Raleway-Bold',
        color: 'white',
        marginBottom: 15,
    },
    detailLabel: {
        fontSize: 12,
        fontFamily: 'JosefinSans-Medium',
        color: INACTIVE_GRAY,
        marginTop: 5,
    },
    detailValue: {
        fontSize: 14,
        fontFamily: 'JosefinSans-Medium',
        color: 'white',
        marginBottom: 10,
    },
    riskPill: {
        fontSize: 14,
        fontFamily: 'Raleway-Bold',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 5,
        alignSelf: 'flex-start',
        color: 'white',
        marginBottom: 10,
    },
    // Advanced Escalation Section
    advancedEscalationSection: {
        backgroundColor: 'rgba(255, 215, 0, 0.05)',
        padding: 15,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: GOLD_ACCENT + '40',
        marginTop: 15,
    },
    advancedEscalationHeader: {
        fontSize: 16,
        fontFamily: 'Raleway-Bold',
        color: GOLD_ACCENT,
    },
    advancedEscalationSubtitle: {
        fontSize: 11,
        fontFamily: 'JosefinSans-Medium',
        color: INACTIVE_GRAY,
        marginBottom: 15,
        lineHeight: 16,
    },
    predictButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: GOLD_ACCENT,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        marginBottom: 15,
    },
    predictButtonText: {
        fontSize: 14,
        fontFamily: 'Raleway-Bold',
        color: DARK_NAVY,
    },
    predictionResults: {
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        padding: 15,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 215, 0, 0.2)',
    },
    resultLabel: {
        fontSize: 13,
        fontFamily: 'JosefinSans-Medium',
        color: 'white',
        marginBottom: 8,
    },
    riskLevelBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        marginLeft: 10,
    },
    riskLevelText: {
        fontSize: 14,
        fontFamily: 'Raleway-Bold',
        color: 'white',
    },
    confidenceBar: {
        height: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        overflow: 'hidden',
        marginTop: 6,
    },
    confidenceFill: {
        height: '100%',
        borderRadius: 4,
    },
    probabilityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    probabilityLabel: {
        width: 70,
        fontSize: 12,
        fontFamily: 'JosefinSans-Medium',
        color: INACTIVE_GRAY,
    },
    probabilityBar: {
        flex: 1,
        height: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 3,
        overflow: 'hidden',
        marginHorizontal: 8,
    },
    probabilityFill: {
        height: '100%',
        borderRadius: 3,
    },
    probabilityValue: {
        width: 50,
        fontSize: 12,
        fontFamily: 'Raleway-Bold',
        color: 'white',
        textAlign: 'right',
    },
    reasoningBox: {
        backgroundColor: 'rgba(255, 215, 0, 0.08)',
        padding: 12,
        borderRadius: 8,
        borderLeftWidth: 3,
        borderLeftColor: GOLD_ACCENT,
    },
    reasoningLabel: {
        fontSize: 12,
        fontFamily: 'Raleway-Bold',
        color: GOLD_ACCENT,
        marginBottom: 6,
    },
    reasoningText: {
        fontSize: 12,
        fontFamily: 'JosefinSans-Medium',
        color: 'white',
        lineHeight: 18,
    }

});