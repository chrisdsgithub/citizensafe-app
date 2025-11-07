import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { RootStackParamList } from '../navigation/AppNavigator'; 
import { AUTO_VERIFY_REPORT_ENDPOINT, PROCESS_NEW_REPORT_ENDPOINT } from '../config/api';
import CustomAlert from '../components/CustomAlert';

// --- Firebase Imports ---
import { auth, db, storage } from '../../firebaseConfig';
import { collection, query, orderBy, onSnapshot, addDoc, doc, getDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

type CrimeFeedNavigationProp = NativeStackNavigationProp<RootStackParamList, 'CrimeFeed'>;

// --- Interface for Report Data ---
interface Report {
  id: string;
  userId: string;
  description: string;
  location: { latitude: number, longitude: number, city: string };
  mediaUrl?: string;
  timestamp: Date;
  userName: string;
  credibilityScore: number;
  userAvatarUrl?: string;
}

// --- Constants ---
const HIGH_CREDIBILITY_THRESHOLD = 80;
const PLACEHOLDER_AVATAR = 'https://placehold.co/100x100/A0A0A0/FFFFFF?text=ABC';
const DEFAULT_AVATAR = 'https://placehold.co/40x40/FFD700/1E1E2F?text=P'; // Small profile placeholder

// Utility to format time (simple)
const formatTimeAgo = (date: Date): string => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return interval + " yr ago";
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return interval + " mo ago";
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return interval + " day ago";
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return interval + " hr ago";
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return interval + " min ago";
  return "just now";
};

// --- Report Card Component ---
const ReportCard = ({ report, userId, onDelete }: { report: Report; userId: string | null; onDelete: (id: string) => void }) => {
  const isHighCredibility = report.credibilityScore >= HIGH_CREDIBILITY_THRESHOLD;
  const timeAgo = formatTimeAgo(report.timestamp);

  // Use the fetched userAvatarUrl, or the default placeholder
  const avatarSource = report.userAvatarUrl ? { uri: report.userAvatarUrl } : { uri: DEFAULT_AVATAR };

  return (
    <View style={feedStyles.card}>
      <View style={feedStyles.cardHeader}>
        {/* USING DYNAMIC AVATAR SOURCE */}
        <Image style={feedStyles.avatar} source={avatarSource} />
        <View style={feedStyles.headerText}>
          <View style={feedStyles.nameRow}>
            <Text style={feedStyles.userName} numberOfLines={2} ellipsizeMode="tail">{report.userName || 'Anonymous'}</Text>
            {/* Credibility-based badge */}
            {report.credibilityScore >= HIGH_CREDIBILITY_THRESHOLD ? (
              <View style={feedStyles.badgeContainer}>
                <Ionicons name="checkmark-circle" size={16} color="#FFD700" />
                <Text style={feedStyles.badgeText}>Trusted</Text>
              </View>
            ) : report.credibilityScore >= 50 ? (
              <View style={feedStyles.badgeContainer}>
                <Ionicons name="shield" size={14} color="#A0A0A0" />
                <Text style={feedStyles.badgeTextSmall}>Verified</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* Location & Time Info Box (moved above description) */}
      <View style={feedStyles.infoBox}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="location" size={14} color="#E74C3C" style={{ marginRight: 6 }} />
          <Text style={feedStyles.infoText}>{report.location.city || 'Unknown Location'}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="time" size={14} color="#A0A0A0" style={{ marginRight: 6 }} />
          <Text style={feedStyles.infoText}>{timeAgo}</Text>
        </View>
      </View>

      {/* Description */}
      <Text style={feedStyles.descriptionText}>{report.description}</Text>

      {/* Media */}
      {report.mediaUrl && <Image style={feedStyles.reportMedia} source={{ uri: report.mediaUrl }} />}

      {/* Delete Button */}
      {userId === report.userId && (
        <TouchableOpacity style={feedStyles.deleteButton} onPress={() => onDelete(report.id)}>
          <Text style={feedStyles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// --- Emergency FAB Component ---
const EmergencyFAB = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleCall = (service: 'Police' | 'Ambulance') => {
    const emergencyNumber = service === 'Police' ? '100' : '102'; 
    
    Alert.alert(
      `Call ${service}`,
      `Are you sure you want to call ${service} at ${emergencyNumber}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: `Call ${service}`, 
          onPress: () => {
            console.log(`Calling ${service}...`);
            Alert.alert("Calling...", `Simulating a call to ${service} at ${emergencyNumber}`);
            setIsMenuOpen(false);
          } 
        },
      ]
    );
  };

  return (
    <View style={fabStyles.fabContainer}>
      {isMenuOpen && (
        <>
          {/* Police Button */}
          <TouchableOpacity 
            style={[fabStyles.serviceButton, { backgroundColor: '#3498DB' }]}
            onPress={() => handleCall('Police')}
          >
            <Text style={fabStyles.serviceIcon}>🚨</Text> 
            <Text style={fabStyles.serviceText}>Police</Text>
          </TouchableOpacity>

          {/* Ambulance Button */}
          <TouchableOpacity 
            style={[fabStyles.serviceButton, { backgroundColor: '#E74C3C', marginBottom: 10 }]}
            onPress={() => handleCall('Ambulance')}
          >
            <Text style={fabStyles.serviceIcon}>🚑</Text>
            <Text style={fabStyles.serviceText}>Ambulance</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Main FAB Button */}
      <TouchableOpacity
        style={fabStyles.mainFab}
        onPress={() => setIsMenuOpen(!isMenuOpen)}
      >
        {/* Alarm Call Icon */}
        <Text style={fabStyles.fabIcon}>
          {isMenuOpen ? 'X' : '📞'} 
        </Text>
      </TouchableOpacity>
    </View>
  );
};


// --- Main CrimeFeed Component (UPDATED Fetch Logic) ---
export default function CrimeFeed() {
  const navigation = useNavigation<CrimeFeedNavigationProp>();
  const user = auth.currentUser;

  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<any>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [location, setLocation] = useState<any>(null);
  const [locationText, setLocationText] = useState('Fetching location...');
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string>(DEFAULT_AVATAR); // State for header avatar
  
  // Cache to store fetched user details (names, scores, avatars)
  const userCache = new Map();

  // Custom alert state
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    onClose?: () => void;
  }>({
    title: '',
    message: '',
    type: 'info',
  });

  // Helper function to show custom alerts
  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', onClose?: () => void) => {
    console.log(`🎯 showAlert called: [${type}] ${title}`);
    setAlertConfig({ title, message, type, onClose });
    setAlertVisible(true);
    console.log('✅ Alert visibility set to TRUE');
  }; 

  // --- New: Handle Profile Press ---
  const handleProfilePress = () => {
    navigation.navigate('Profile'); 
  };
  
  // --- 1. Get precise location ---
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationText('Location permission denied. Report will use last known city.');
        return;
      }
      try {
        const locData = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        setLocation(locData.coords);

        const addresses = await Location.reverseGeocodeAsync(locData.coords);
        const loc = addresses[0];
        const street = loc?.street ? loc.street + ', ' : '';
        const city = loc?.city || loc?.subregion || 'Unknown City';
        const region = loc?.region ? loc.region + ', ' : '';
        const postal = loc?.postalCode ? loc.postalCode + ', ' : '';
        const country = loc?.country ? loc.country : '';
        const fullLocation = `${street}${city}, ${region}${postal}${country}`;

        setLocation({ latitude: locData.coords.latitude, longitude: locData.coords.longitude, city: fullLocation });
        setLocationText(fullLocation);
      } catch (e) {
        setLocationText('Current location unavailable. Check device settings.');
        console.error("Location error:", e);
      }
    })();
  }, []);

  // --- 2. Real-time fetch for current user's profile picture (for HEADER and POST AVATAR) ---
  useEffect(() => {
    if (!user) return;
    
    const userDocRef = doc(db, 'users', user.uid);
    
    // Listen for changes to the current user's profile
    const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const userData = docSnapshot.data();
        // This instantly updates the header AND the post box avatar
        setCurrentUserAvatar(userData.profilePictureUrl || DEFAULT_AVATAR); 
        
        // Update cache for the current user IMMEDIATELY
        userCache.set(user.uid, userData); 
      }
    }, (error) => {
      console.error("Failed to listen to current user profile:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // --- 3. Fetch reports (UPDATED to fetch profilePictureUrl) ---
  useEffect(() => {
    const reportsQuery = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));
    
    const unsubscribe = onSnapshot(reportsQuery, async (snapshot) => {
      const fetchedReports: Report[] = [];
      const userPromises: Promise<any>[] = [];

      // Collect user IDs that need fetching (not in cache)
      const usersToFetch = new Set<string>();
      snapshot.docs.forEach(doc => {
          const userId = doc.data().userId;
          if (!userCache.has(userId)) {
              usersToFetch.add(userId);
          }
      });

      // Fetch user data for missing users
      usersToFetch.forEach(userId => {
          userPromises.push(getDoc(doc(db, 'users', userId)));
      });

      const fetchedUserDocs = await Promise.all(userPromises);
      
      // Update cache with newly fetched users
      fetchedUserDocs.forEach(docResult => {
        if (docResult.exists()) {
            userCache.set(docResult.id, docResult.data());
        }
      });
      
      // Map reports using the now complete cache
      const finalReports = snapshot.docs.map((reportDoc) => {
        const data = reportDoc.data();
        const userData = userCache.get(data.userId);

        if (data.reportType === 'AI_Summary') return null;
        
        return {
          id: reportDoc.id,
          userId: data.userId,
          description: data.description,
          location: data.location,
          mediaUrl: data.mediaUrl,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(),
          // Use cached data for all profile info
          userName: userData?.fullName || 'User Deleted',
          credibilityScore: userData?.credibilityScore || 0,
          userAvatarUrl: userData?.profilePictureUrl || DEFAULT_AVATAR, 
        } as Report;
      }).filter(report => report !== null); // Filter out null reports

      setReports(finalReports as Report[]);
      
    }, (error) => {
      console.error("Failed to listen to reports:", error);
      Alert.alert("Data Error", "Could not load feed data.");
    });

    return () => unsubscribe();
  // We use user as dependency for initial fetch
  }, [user]); 

  // --- 4. Image picker ---
  const handleImagePick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Camera roll permissions required!');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, // Using stable constant
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const selectedAsset = result.assets[0];
      if (selectedAsset.uri) setMedia(selectedAsset);
      else Alert.alert("Error", "Selected file is invalid.");
    }
  };

  // --- 5. Submit report ---
  const handleSubmit = async () => {
    if (!user) { Alert.alert("Error", "You must be logged in."); return; }
    if (!description.trim()) { Alert.alert("Error", "Please describe the incident."); return; }

    setIsPosting(true);
    let uploadedMediaUrl = null;

    try {
      // Check user credibility BEFORE submitting
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userCredibility = userDoc.exists() ? userDoc.get('credibilityScore') || 100 : 100;
      
      if (userCredibility <= 0) {
        setIsPosting(false);
        showAlert(
          "Account Suspended",
          `You have been suspended from posting reports due to multiple fake submissions.\n\nYour account will be restored after a review period. Please contact support for assistance.`,
          'error'
        );
        return;
      }
      
      if (media) {
        // Use the robust fetch -> blob conversion for image upload
        const response = await fetch(media.uri);
        const fileBlob = await response.blob();
        const mediaFileName = `${user.uid}-${Date.now()}-media.jpg`;
        const storageRef = ref(storage, `report_media/${mediaFileName}`);

        await uploadBytes(storageRef, fileBlob);
        uploadedMediaUrl = await getDownloadURL(storageRef);
      }

      // FIRST: Verify the report with backend BEFORE saving to Firestore
      let verificationResult: any = null;
      try {
        console.log('🔍 Verifying report with backend before saving...');
        const verificationResponse = await fetch(AUTO_VERIFY_REPORT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            report_id: 'pre-verification', // Temporary ID for pre-verification
            report_text: description.trim(),
            location: location?.city || locationText,
            time_of_occurrence: new Date().toISOString(),
            user_id: user.uid
          })
        });

        if (verificationResponse.ok) {
          verificationResult = await verificationResponse.json();
          console.log('✅ Pre-verification result:', verificationResult);
          
          if (verificationResult.is_fake) {
            console.log('🚨 FAKE REPORT DETECTED - Not saving to Firestore');
            
            // Clear UI state immediately
            setDescription('');
            setMedia(null);
            setIsPosting(false);
            
            // Show alert for ALL fake reports
            const credibilityInfo = verificationResult.new_credibility_score !== undefined
              ? `\n\nCredibility: ${verificationResult.old_credibility_score} → ${verificationResult.new_credibility_score} (${verificationResult.credibility_change > 0 ? '+' : ''}${verificationResult.credibility_change})`
              : '';
            
            // Check if account suspended (credibility = 0)
            if (verificationResult.new_credibility_score <= 0) {
              console.log('🚨 USER ACCOUNT SUSPENDED');
              showAlert(
                "Account Suspended",
                `You have been suspended from posting reports due to multiple fake submissions.\n\nYour account will be restored after a review period. Please contact support for assistance.${credibilityInfo}`,
                'error'
              );
            } else {
              // Show fake report alert with reasoning
              console.log('🚨 Showing fake report alert');
              showAlert(
                "Report Flagged",
                `Your report has been flagged as potentially inauthentic and will not be posted.\n\nReason: ${verificationResult.reasoning}${credibilityInfo}`,
                'warning'
              );
            }
            return; // Stop execution - DO NOT save to Firestore
          }
          
          // Report is GENUINE - NOW save to Firestore
          console.log('✅ Report is genuine, saving to Firestore...');
          const newReportData = {
            userId: user.uid,
            userName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
            description: description.trim(),
            location: location || { latitude: 0, longitude: 0, city: locationText },
            mediaUrl: uploadedMediaUrl,
            timestamp: serverTimestamp(),
            is_fake: false,
            verification_confidence: verificationResult.confidence,
            verification_reasoning: verificationResult.reasoning,
            verified_at: serverTimestamp(),
          };
          
          const docRef = await addDoc(collection(db, 'reports'), newReportData);
          const reportId = docRef.id;
          console.log('✅ Report saved to Firestore:', reportId);
          
          // Now send to crime prediction module
          console.log('✅ Sending to crime prediction...');
          try {
            const predictionResponse = await fetch('http://192.168.29.169:8080/predict-crime-type', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: description.trim(),
                location: location?.city || locationText,
                sub_location: location?.city || 'Unknown',
                part_of_day: 'Afternoon',
                day_of_week: new Date().getDay(),
                month: new Date().getMonth() + 1
              })
            });

            if (predictionResponse.ok) {
              const predictionResult = await predictionResponse.json();
              console.log('✅ Crime prediction result:', predictionResult);
            }
          } catch (predictionError) {
            console.warn('⚠️ Could not run crime prediction:', predictionError);
          }

          // Trigger server-side processing
          try {
            await fetch(PROCESS_NEW_REPORT_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ report_id: reportId })
            });
          } catch (procErr) {
            console.warn('⚠️ Could not trigger process-new-report:', procErr);
          }
          
          // Show success and credibility reward
          const credibilityInfo = verificationResult?.credibility_change !== undefined && verificationResult.credibility_change > 0
            ? `\n\n✅ Your credibility increased: +${verificationResult.credibility_change} points!`
            : '';
          
          showAlert(
            "Report Submitted",
            `Your report has been successfully posted to the crime feed.${credibilityInfo}`,
            'success'
          );
          
          setDescription('');
          setMedia(null);
          setIsPosting(false);
        } else {
          // Verification response not OK
          throw new Error('Verification failed');
        }
      } catch (verificationError: any) {
        console.warn('⚠️ Verification error:', verificationError);
        
        // Check if blocked due to low credibility (403 response)
        if (verificationError.message?.includes('403') || verificationError.toString().includes('403')) {
          setIsPosting(false);
          showAlert(
            "Account Suspended",
            `You have been suspended from posting reports due to multiple fake submissions.\n\nYour account will be restored after a review period. Please contact support for assistance.`,
            'error'
          );
          return;
        }
        
        // For other errors, don't save report
        setIsPosting(false);
        showAlert(
          'Verification Failed',
          'Could not verify your report. Please try again.',
          'error'
        );
        return;
      }

    } catch (error: any) {
      console.error("Report Post Failed:", error);
      showAlert(
        'Post Failed',
        'Failed to submit report. Please check your network connection and try again.',
        'error'
      );
    } finally {
      setIsPosting(false);
    }
  };

  // --- 6. Delete report ---
  const handleDelete = async (reportId: string) => {
    Alert.alert(
      'Delete Report',
      'Are you sure you want to delete this report?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'reports', reportId));
              Alert.alert('Deleted', 'Your report has been deleted.');
            } catch (error) {
              console.error('Delete failed:', error);
              Alert.alert('Error', 'Could not delete the report. Check security rules.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/images/bg_img.png')} style={styles.backgroundImage} />

      {/* --- CURVED HEADER BOX (Covers the top area) --- */}
      <View style={styles.curvedHeaderBox}>
          {/* Header Content placed inside the curved box */}
          <View style={styles.header}>
              {/* REMOVED AMBULANCE ICON (menuIcon) */}
              <View style={{width: 40}} /> 
              
              {/* PROFILE ICON (NEW) */}
              <TouchableOpacity onPress={handleProfilePress} style={styles.profileIconContainer}>
                {/* 🚨 Using Image component instead of Text for avatar */}
                <Image 
                    source={{ uri: currentUserAvatar }} 
                    style={{ width: 40, height: 40, borderRadius: 20 }} 
                />
              </TouchableOpacity>
              
          </View>
          {/* NEW CONTAINER FOR CENTERED TITLE/SUBTITLE */}
          <View style={styles.titleContainer}>
              <Text style={styles.title}>Crime Feed</Text>
              <Text style={styles.subtitle}>Recent incidents reported by the community</Text>
          </View>
          {/* ADDED SPACER VIEW HERE */}
          <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.feedScrollContent} showsVerticalScrollIndicator={false}>
          
          {/* Create Report Card */}
          <View style={styles.createCard}>
            {/* NEW: Display Avatar in the Create Card header */}
            <View style={styles.createCardHeader}>
                <Image 
                    source={{ uri: currentUserAvatar }} 
                    style={styles.createAvatar} 
                />
                <View>
                    <Text style={styles.createTitle}>Create a Report</Text>
                    <Text style={styles.createSubtitle}>Share what you have witnessed</Text>
                </View>
            </View>

            <TextInput
              style={styles.descriptionInput}
              placeholder="Describe the incident, where and when"
              placeholderTextColor="#A0A0A0"
              value={description}
              onChangeText={setDescription}
              multiline
            />

            <View style={styles.createFooter}>
              <TouchableOpacity onPress={handleImagePick} style={styles.addPhotoButton}>
                <Text style={styles.addPhotoText}>
                  {media ? `Photo Selected (${media.fileName || 'Image'})` : 'Add a photo'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={handleSubmit} 
                style={styles.postButton}
                disabled={isPosting || !user || !description.trim()}
              >
                {isPosting ? <ActivityIndicator color="#1E1E2F" /> : <Text style={styles.postButtonText}>POST</Text>}
              </TouchableOpacity>
            </View>
            <Text style={styles.locationInfo}>Location: {locationText}</Text>
          </View>

          {/* Report Feed Content */}
          {reports.length === 0 && !user ? (
            <Text style={styles.emptyFeedText}>Please log in to view the feed.</Text>
          ) : reports.length === 0 ? (
            <Text style={styles.emptyFeedText}>No reports yet. Be the first!</Text>
          ) : (
            reports.map((report) => (
              <ReportCard key={report.id} report={report} userId={user?.uid || null} onDelete={handleDelete} />
            ))
          )}
        {/* Empty view to push content up from the bottom safe area/tab bar */}
        <View style={styles.bottomSpacer} /> 
      </ScrollView>

      {/* --- Emergency FAB --- */}
      <EmergencyFAB /> 

      {/* Custom Alert Modal */}
      <CustomAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => {
          setAlertVisible(false);
          if (alertConfig.onClose) {
            alertConfig.onClose();
          }
        }}
      />

    </View>
  );
}

// --- Styles (UPDATED with font families) ---
const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E1E2F' }, 
  backgroundImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.2 },
  
  // --- NEW CURVED HEADER BOX STYLES (MODIFIED) ---
  curvedHeaderBox: {
    backgroundColor: '#041330', 
    paddingBottom: 0, // Set to 0 so we can control spacing precisely with headerSpacer
    marginTop: 0, 
    // RESTORED CURVED STYLES
    borderBottomLeftRadius: 80, 
    borderBottomRightRadius: 80,
    elevation: 5, 
    shadowColor: '#c7c143ff', 
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    overflow: 'hidden', 
  },
  
  // Header: Includes padding for status bar area (Android/iOS)
  header: { 
      flexDirection: 'row', 
      justifyContent: 'flex-end', // Aligned content to the right (only profile icon left)
      alignItems: 'center', 
      paddingHorizontal: 30, 
      paddingTop: 60, // Pushes content below the status bar
      marginBottom: 10,
  },
  
  // NEW STYLES FOR CENTERING TEXT
  titleContainer: {
      alignItems: 'center',
      paddingHorizontal: 30,
      marginBottom: 15, // Pushes text down from header and up from spacer
  },
  
  // *** FIX 1: New Spacer to push content down from the curved edge ***
  headerSpacer: {
      height: 30, // Explicit space below the header text
  },
  
  // Scroll View & Spacing Fixes (Adjusted margin for flattened header)
  feedScrollContent: { 

      flexGrow: 1, 
      paddingHorizontal: 20,
      marginTop: 20, // Strong negative margin to pull content up under the curve
  },
  bottomSpacer: {
    height: 100, 
  },

  menuIcon: { fontSize: 28, color: 'white' }, // KEPT but now unused in JSX
  // --- PROFILE ICON STYLES (NEW) ---
  profileIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFD700', 
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden', // Ensures nested image is clipped
  },
  // Removed profileIcon text style as it's replaced by Image component
  
  // Title/Subtitle (Font family added and centered slightly)
  title: { fontSize: 48, fontFamily: 'Raleway-Bold', color: '#FFD700' }, // Removed paddingHorizontal
  subtitle: { fontSize: 16, fontFamily: 'JosefinSans-Medium', color: '#A0A0A0', marginBottom: 20 }, // Removed paddingHorizontal
  
  // Create Card Styles (Font family added)
  createCard: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 15, marginBottom: 20, borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1, marginHorizontal: 0 },
  // NEW STYLES FOR CREATE CARD HEADER
  createCardHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 10, 
    paddingBottom: 10,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    borderBottomWidth: 1,
  },
  createAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#303045',
  },
  // END NEW STYLES
  createTitle: { fontSize: 20, fontFamily: 'Raleway-Bold', color: 'white' }, // Reduced size slightly
  createSubtitle: { fontSize: 12, color: '#A0A0A0', fontFamily: 'JosefinSans-Medium', marginTop: 2 }, // Reduced size slightly
  descriptionInput: { minHeight: 80, backgroundColor: '#303045', borderRadius: 8, padding: 10, color: 'white', fontSize: 16, fontFamily: 'JosefinSans-Medium', marginBottom: 10 },
  createFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addPhotoButton: { backgroundColor: '#303045', borderRadius: 8, padding: 8, flex: 1, marginRight: 10 },
  addPhotoText: { color: '#FFD700', fontFamily: 'JosefinSans-Medium', textAlign: 'center' },
  postButton: { backgroundColor: '#FFD700', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  postButtonText: { color: '#1E1E2F', fontFamily: 'Raleway-Bold', fontSize: 16 },
  locationInfo: { fontSize: 12, color: '#A0A0A0', marginTop: 10, fontFamily: 'JosefinSans-Medium' },
  emptyFeedText: { color: '#A0A0A0', textAlign: 'center', marginTop: 50, fontSize: 16, fontFamily: 'JosefinSans-Medium' }
});

const feedStyles = StyleSheet.create({
  card: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 15, marginBottom: 15, borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFD700', marginRight: 10 },
  headerText: { flex: 1 },
  infoBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: 8,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    marginBottom: 10,
  },
  infoText: { fontSize: 12, color: '#A0A0A0', fontFamily: 'JosefinSans-Medium' },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  userName: { fontSize: 16, fontFamily: 'Raleway-Bold', color: 'white', marginRight: 5 },
  verifiedBadge: { fontSize: 14, color: '#FFD700' },
  badgeContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: 6 },
  badgeText: { color: '#FFD700', marginLeft: 4, fontFamily: 'JosefinSans-Medium', fontSize: 12 },
  badgeTextSmall: { color: '#A0A0A0', marginLeft: 4, fontFamily: 'JosefinSans-Medium', fontSize: 11 },
  descriptionText: { fontSize: 16, color: 'white', fontFamily: 'JosefinSans-Medium', marginBottom: 10 },
  reportMedia: { width: '100%', height: 200, borderRadius: 10, marginTop: 5, backgroundColor: '#303045', resizeMode: 'cover' },
  deleteButton: { alignSelf: 'flex-end', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#FF4C4C', borderRadius: 6, marginTop: 5 },
  deleteButtonText: { color: 'white', fontSize: 12, fontFamily: 'JosefinSans-Medium' }
});

const fabStyles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 20, // Adjust for better spacing from the bottom
    right: 20,
    alignItems: 'center',
    zIndex: 10, 
  },
  mainFab: {
    backgroundColor: '#FF4C4C', 
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 3 },
      android: { elevation: 8 },
    }),
  },
  fabIcon: {
    fontSize: 24,
    color: 'white',
    transform: [{ rotate: '180deg' }], 
  },
  serviceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 120,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10, 
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2 },
      android: { elevation: 5 },
    }),
  },
  serviceIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  serviceText: {
    color: 'white',
    fontFamily: 'Raleway-Bold',
    fontSize: 14,
  }
});

const styles = baseStyles;