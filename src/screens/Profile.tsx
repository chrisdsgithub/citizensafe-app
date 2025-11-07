import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator, Alert, Platform, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy'; // LEGACY import to avoid deprecation
import { auth, db, storage } from '../../firebaseConfig';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore'; // Added onSnapshot
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { signOut } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';

interface UserData {
  fullName: string;
  email: string;
  phone: string;
  address?: string;
  credibilityScore?: number; // optional now, officers won't have this
  isAadharVerified?: boolean;
  profilePictureUrl?: string;
  aadharCardUrl?: string;
  // Officer-specific
  role?: 'citizen' | 'officer' | string;
  badgeNumber?: string;
  precinct?: string;
  badgeUrl?: string;
  isVerifiedOfficer?: boolean;
}

const DEFAULT_AVATAR = 'https://placehold.co/80x80/FFD700/1E1E2F?text=P'; 
const ID_UPLOAD_ICON = '☁️'; 

type ProfileNavProp = NativeStackNavigationProp<RootStackParamList, 'Profile'>;
const Profile = () => {
  const user = auth.currentUser;
  const navigation = useNavigation<ProfileNavProp>();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // REMOVED: [address, setAddress] state
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // --- Fetch user data (using onSnapshot for real-time updates) ---
  useEffect(() => {
    if (!user) {
      setLoading(false);
      Alert.alert("Error", "User not logged in.");
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);

    // Set up real-time listener using onSnapshot
    const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data() as UserData;
        setUserData(data);
        setProfileImage(data.profilePictureUrl || null);
        // Removed setAddress(data.address || ''); 
        setLoading(false);
      } else {
        // We shouldn't hit this if the signup process worked
        Alert.alert("Error", "User profile not found in database.");
        setLoading(false);
      }
    }, (error) => {
      console.error("Error fetching user data:", error);
      Alert.alert("Fetch Error", "Could not load user profile.");
      setLoading(false);
    });

    return () => unsubscribe(); // Cleanup listener
  }, [user]);

  // Handle Profile Picture Upload
const handlePhotoChange = async () => {
  if (!user) return;

  // Ask for media library permission
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission denied', 'Camera roll permissions required!');
    return;
  }

  // Pick an image
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });

  if (result.canceled || !result.assets?.length) return;

  const localUri = result.assets[0].uri;
  setProfileImage(localUri); // Optimistic UI

  try {
    setIsSaving(true);

    // --- Convert file to Blob using fetch API (modern way) ---
    const response = await fetch(localUri);
    const blob = await response.blob();

    // --- Upload to Firebase using UID-based filename ---
    const storageRef = ref(storage, `profile_pictures/${user.uid}.jpg`);
    await uploadBytes(storageRef, blob);

    // --- Get download URL and update Firestore ---
    const downloadURL = await getDownloadURL(storageRef);
    const userDocRef = doc(db, 'users', user.uid);
    await updateDoc(userDocRef, { profilePictureUrl: downloadURL });

    // Note: onSnapshot listener handles state update here
    Alert.alert('Success', 'Profile picture updated!');
  } catch (error) {
    console.error("Profile Picture Upload Failed:", error);
    Alert.alert('Upload Failed', 'Could not upload profile picture. Check your network or permissions.');
    setProfileImage(userData?.profilePictureUrl || DEFAULT_AVATAR);
  } finally {
    setIsSaving(false);
  }
};

  // Save personal info
  const handleSaveChanges = async () => {
    if (!user || !userData) return;
    setIsSaving(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const updatePayload: any = {
        fullName: userData.fullName,
        phone: userData.phone,
      };
      if (userData.role === 'officer') {
        updatePayload.badgeNumber = userData.badgeNumber || '';
        updatePayload.precinct = userData.precinct || '';
      }
      await updateDoc(userDocRef, updatePayload);
      Alert.alert("Success", "Profile updated successfully!");
    } catch (error) {
      console.error("Error saving profile:", error);
      Alert.alert("Save Failed", "Could not update profile data.");
    } finally {
      setIsSaving(false);
    }
  };

  // Document upload placeholder
  // For officers: upload badge image (photo of badge)
  const handleBadgeUpload = async () => {
    if (!user) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Camera roll permissions required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;

    const localUri = result.assets[0].uri;
    try {
      setIsSaving(true);
      const response = await fetch(localUri);
      const blob = await response.blob();
      const filename = `${Date.now()}.jpg`;
      const storageRef = ref(storage, `officer_badges/${user.uid}/${filename}`);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, { badgeUrl: downloadURL });
      Alert.alert('Success', 'Badge uploaded. Awaiting verification.');
    } catch (error) {
      console.error('Badge upload failed:', error);
      Alert.alert('Upload Failed', 'Could not upload badge image.');
    } finally {
      setIsSaving(false);
    }
  };

  // General logout handler
  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Route to login based on role; default to CitizenLogin
      const role = userData?.role || 'citizen';
      if (role === 'officer') {
        navigation.replace('OfficerLogin');
      } else {
        navigation.replace('CitizenLogin');
      }
    } catch (error) {
      console.error('Logout failed:', error);
      Alert.alert('Logout Failed', 'Please try again.');
    }
  };

  if (loading) return (
    <View style={[profileStyles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color="#FFD700" />
      <Text style={profileStyles.loadingText}>Loading Profile...</Text>
    </View>
  );

  if (!userData) return (
    <View style={[profileStyles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={profileStyles.errorText}>User data not available.</Text>
    </View>
  );

  const avatarSource = profileImage ? { uri: profileImage } : { uri: DEFAULT_AVATAR }; 

  return (
    <ScrollView style={profileStyles.container} contentContainerStyle={profileStyles.contentContainer}>
      {/* Personal Info Card */}
      <View style={profileStyles.card}>
        <Text style={profileStyles.cardTitle}>Personal Information</Text>
        <Text style={profileStyles.cardSubtitle}>Update your personal details here.</Text>

        <View style={profileStyles.photoSection}>
          <Image source={avatarSource} style={profileStyles.profilePhoto} fadeDuration={0} />
          <TouchableOpacity style={profileStyles.changePhotoButton} onPress={handlePhotoChange} disabled={isSaving}>
            {isSaving && profileImage === avatarSource.uri ? (
              <ActivityIndicator color="#FFD700" size="small" />
            ) : (
              <Text style={profileStyles.changePhotoText}>Change Photo</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* --- IMPROVED LAYOUT FOR INPUTS --- */}
        <View style={profileStyles.inputColumn}> 
          {/* Full Name */}
          <TextInput
            style={[profileStyles.input, profileStyles.inputFull]}
            placeholder="Full Name"
            placeholderTextColor="#A0A0A0"
            value={userData.fullName}
            onChangeText={(text) => setUserData(prev => prev ? { ...prev, fullName: text } : null)}
          />
          {/* Email Address (Read-only) */}
          <TextInput
            style={[profileStyles.input, profileStyles.inputFull]}
            placeholder="Email Address"
            placeholderTextColor="#A0A0A0"
            value={userData.email}
            editable={false}
          />
          {/* Phone Number */}
          <TextInput
            style={[profileStyles.input, profileStyles.inputFull]}
            placeholder="Phone Number"
            placeholderTextColor="#A0A0A0"
            value={userData.phone}
            onChangeText={(text) => setUserData(prev => prev ? { ...prev, phone: text } : null)}
            keyboardType="phone-pad"
          />
          {/* Officer-specific fields */}
          {userData.role === 'officer' && (
            <>
              <TextInput
                style={[profileStyles.input, profileStyles.inputFull]}
                placeholder="Precinct / Station"
                placeholderTextColor="#A0A0A0"
                value={userData.precinct || ''}
                onChangeText={(text) => setUserData(prev => prev ? { ...prev, precinct: text } : null)}
              />
              <TextInput
                style={[profileStyles.input, profileStyles.inputFull]}
                placeholder="Badge Number"
                placeholderTextColor="#A0A0A0"
                value={userData.badgeNumber || ''}
                onChangeText={(text) => setUserData(prev => prev ? { ...prev, badgeNumber: text } : null)}
                keyboardType="default"
              />
            </>
          )}
        </View>
        {/* --- END IMPROVED LAYOUT --- */}

        <TouchableOpacity style={profileStyles.saveButton} onPress={handleSaveChanges} disabled={isSaving}>
          {isSaving ? <ActivityIndicator color="#1E1E2F" /> : <Text style={profileStyles.saveButtonText}>Save Changes</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={profileStyles.logoutButton} onPress={handleLogout}>
          <Text style={profileStyles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {/* Identity Verification / Credibility Score */}
      <View style={profileStyles.rightColumn}>
        {/* Identity / Officer Badge */}
        <View style={[profileStyles.card, profileStyles.identityCard]}>
          <Text style={profileStyles.cardTitle}>{userData.role === 'officer' ? 'Officer Verification' : 'Identity Verification'}</Text>
          <Text style={profileStyles.cardSubtitle}>
            {userData.role === 'officer' ? 'Upload your official badge (photo) for internal verification.' : 'Verification status of the ID you uploaded during signup.'}
          </Text>

          {userData.role === 'officer' ? (
            // Officer view: show precinct/badge and badge upload
            <>
              <Text style={profileStyles.smallLabel}>Precinct</Text>
              <Text style={profileStyles.smallValue}>{userData.precinct || 'Not set'}</Text>
              <Text style={profileStyles.smallLabel}>Badge Number</Text>
              <Text style={profileStyles.smallValue}>{userData.badgeNumber || 'Not set'}</Text>

              {userData.badgeUrl ? (
                <View style={profileStyles.verifiedBox}>
                  <Ionicons 
                    name={userData.isVerifiedOfficer ? "shield-checkmark" : "hourglass"} 
                    size={40} 
                    color={userData.isVerifiedOfficer ? "#4CAF50" : "#FFA726"} 
                  />
                  <Text style={profileStyles.verifiedText}>
                    {userData.isVerifiedOfficer ? 'Officer Verified' : 'Badge Pending Review'}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={profileStyles.uploadArea}>
                    <Ionicons name="camera" size={40} color="#A0A0A0" />
                    <Text style={profileStyles.uploadText}>Upload a clear photo of your officer badge (front).</Text>
                  </View>
                  <TouchableOpacity style={profileStyles.uploadButton} onPress={handleBadgeUpload}>
                    <Text style={profileStyles.uploadButtonText}>Upload Badge</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            // Citizen view: show Aadhaar verification area
            <>
              {userData.isAadharVerified ? (
                <View style={profileStyles.verifiedBox}>
                  <View style={profileStyles.verifiedHeader}>
                    <Ionicons name="shield-checkmark" size={40} color="#4CAF50" />
                    <Text style={profileStyles.verifiedText}>Aadhaar Verified</Text>
                  </View>
                  
                  {/* Show verification details if available */}
                  {(userData as any).verification_details && (
                    <View style={profileStyles.verificationDetailsBox}>
                      <View style={profileStyles.verificationRow}>
                        <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                        <Text style={profileStyles.verificationDetailText}>
                          Name Match: {((userData as any).verification_details.name_match_score || 0).toFixed(0)}%
                        </Text>
                      </View>
                      {(userData as any).verification_details.aadhaar_number && (
                        <View style={profileStyles.verificationRow}>
                          <Ionicons name="card" size={18} color="#FFD700" />
                          <Text style={profileStyles.verificationDetailText}>
                            Aadhaar: {(userData as any).verification_details.aadhaar_number}
                          </Text>
                        </View>
                      )}
                      {(userData as any).verification_details.dob && (
                        <View style={profileStyles.verificationRow}>
                          <Ionicons name="calendar" size={18} color="#FFD700" />
                          <Text style={profileStyles.verificationDetailText}>
                            DOB: {(userData as any).verification_details.dob}
                          </Text>
                        </View>
                      )}
                      <View style={profileStyles.verificationRow}>
                        <Ionicons name="time" size={18} color="#888" />
                        <Text style={profileStyles.verificationDetailText}>
                          Method: OCR + Face Recognition
                        </Text>
                      </View>
                    </View>
                  )}
                  
                  {userData?.aadharCardUrl && (
                    <TouchableOpacity 
                      style={profileStyles.viewDocButton} 
                      onPress={async () => {
                        if (userData.aadharCardUrl) {
                          const supported = await Linking.canOpenURL(userData.aadharCardUrl);
                          if (supported) {
                            await Linking.openURL(userData.aadharCardUrl);
                          } else {
                            Alert.alert('Error', 'Cannot open document URL');
                          }
                        }
                      }}
                    >
                      <Ionicons name="document-text" size={20} color="#1E1E2F" />
                      <Text style={profileStyles.viewDocButtonText}>View Document</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <>
                  <View style={profileStyles.pendingBox}>
                    <View style={profileStyles.pendingHeader}>
                      <Ionicons name="hourglass" size={36} color="#FFA726" />
                      <Text style={profileStyles.pendingText}>Verification Pending</Text>
                    </View>
                    
                    <Text style={profileStyles.pendingDescription}>
                      {userData?.aadharCardUrl ? 'Your Aadhaar document is under review by our verification system.' : 'Document uploaded during signup'}
                    </Text>
                    
                    {/* Show partial verification details if available */}
                    {(userData as any).verification_details && (
                      <View style={profileStyles.pendingDetailsBox}>
                        <Text style={profileStyles.pendingDetailsTitle}>Verification Status:</Text>
                        {(userData as any).verification_details.name_match_score !== undefined && (
                          <View style={profileStyles.verificationRow}>
                            <Ionicons name="person" size={16} color="#FFA726" />
                            <Text style={profileStyles.pendingDetailText}>
                              Name Match: {((userData as any).verification_details.name_match_score || 0).toFixed(0)}%
                            </Text>
                          </View>
                        )}
                        <View style={profileStyles.verificationRow}>
                          <Ionicons name="alert-circle" size={16} color="#FFA726" />
                          <Text style={profileStyles.pendingDetailText}>
                            Status: {(userData as any).verification_details.verification_status || 'Processing'}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                  
                  {userData?.aadharCardUrl && (
                    <TouchableOpacity 
                      style={profileStyles.viewDocButtonSecondary} 
                      onPress={async () => {
                        if (userData.aadharCardUrl) {
                          const supported = await Linking.canOpenURL(userData.aadharCardUrl);
                          if (supported) {
                            await Linking.openURL(userData.aadharCardUrl);
                          } else {
                            Alert.alert('Error', 'Cannot open document URL');
                          }
                        }
                      }}
                    >
                      <Text style={profileStyles.uploadButtonText}>View Uploaded Document</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </>
          )}
        </View>

        {/* Credibility Score Card - show only for citizens */}
        {userData.role !== 'officer' && (
          <View style={[profileStyles.card, profileStyles.scoreCard]}>
            <Text style={profileStyles.cardTitle}>Credibility Score</Text>
            <Text style={profileStyles.cardSubtitle}>Your score is based on the accuracy of your past reports.</Text>
            <View style={profileStyles.scoreDisplay}>
              <Text style={profileStyles.scoreIcon}>🎖️</Text>
              <Text style={profileStyles.scoreText}>{userData.credibilityScore ?? 0}</Text>
            </View>
            <View style={profileStyles.scoreBarContainer}>
              <View style={[profileStyles.scoreBar, { width: `${userData.credibilityScore ?? 0}%` }]} />
            </View>
            <Text style={profileStyles.scoreFooter}>Keep submitting accurate reports to maintain a high score.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

// Styles updated to support single column layout and fonts
const profileStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E1E2F' },
  contentContainer: { padding: 20, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  loadingText: { color: '#A0A0A0', marginTop: 20, fontFamily: 'JosefinSans-Medium' },
  errorText: { color: '#FF4C4C', marginTop: 20, fontSize: 16, fontFamily: 'Raleway-Bold' },
  
  // Card styles
  card: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', width: Platform.OS === 'web' ? '48%' : '100%', minWidth: 300 },
  cardTitle: { fontSize: 20, color: 'white', marginBottom: 5, fontFamily: 'Raleway-Bold' },
  cardSubtitle: { fontSize: 14, color: '#A0A0A0', marginBottom: 20, fontFamily: 'JosefinSans-Medium' },
  
  // Personal Info styles
  photoSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  profilePhoto: { width: 80, height: 80, borderRadius: 40, marginRight: 20, backgroundColor: '#303045' },
  changePhotoButton: { backgroundColor: '#303045', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8 },
  changePhotoText: { color: '#FFD700', fontFamily: 'JosefinSans-Medium' },
  
  // NEW: Input styles for vertical stacking
  inputColumn: { 
      flexDirection: 'column', 
      marginBottom: 10,
  },
  input: { 
      height: 48, 
      backgroundColor: '#303045', 
      borderRadius: 8, 
      paddingHorizontal: 15, 
      color: 'white', 
      fontFamily: 'JosefinSans-Medium',
      marginBottom: 10, // Added margin bottom for spacing in single column
  },
  inputFull: { 
      width: '100%', // Input takes full width
  },
  // Removed inputRow and inputHalf styles
  
  saveButton: { backgroundColor: '#FFD700', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 }, // Adjusted top margin
  saveButtonText: { color: '#1E1E2F', fontSize: 16, fontFamily: 'Raleway-Bold' },
  
  // Right Column (Verification/Score)
  rightColumn: { width: Platform.OS === 'web' ? '48%' : '100%', minWidth: 300 },
  identityCard: { marginBottom: 20, minHeight: 300 },
  uploadArea: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 2, borderColor: '#FFD700', borderStyle: 'dashed', borderRadius: 12, padding: 30, alignItems: 'center', marginBottom: 15 },
  uploadIcon: { fontSize: 40, marginBottom: 10 },
  uploadText: { color: '#A0A0A0', textAlign: 'center', fontFamily: 'JosefinSans-Medium' },
  uploadButton: { backgroundColor: '#FFD700', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  uploadButtonText: { color: '#1E1E2F', fontSize: 16, fontFamily: 'Raleway-Bold' },
  verificationNote: { fontSize: 12, color: '#A0A0A0', textAlign: 'center', marginTop: 5, fontFamily: 'JosefinSans-Medium' },
  // Verified Box Styles
  verifiedBox: { 
    padding: 20, 
    backgroundColor: 'rgba(76, 175, 80, 0.15)', 
    borderRadius: 12, 
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  verifiedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 12,
  },
  verifiedIcon: { fontSize: 40 },
  verifiedText: { 
    color: '#4CAF50', 
    fontSize: 22, 
    fontFamily: 'Raleway-Bold' 
  },
  verificationDetailsBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    gap: 10,
  },
  verificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  verificationDetailText: {
    color: '#CCCCCC',
    fontSize: 14,
    fontFamily: 'JosefinSans-Medium',
  },
  viewDocButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 5,
  },
  viewDocButtonText: {
    color: '#1E1E2F',
    fontSize: 16,
    fontFamily: 'Raleway-Bold',
  },
  
  // Pending Box Styles
  pendingBox: {
    padding: 20,
    backgroundColor: 'rgba(255, 167, 38, 0.15)',
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 167, 38, 0.3)',
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    gap: 12,
  },
  pendingText: {
    color: '#FFA726',
    fontSize: 20,
    fontFamily: 'Raleway-Bold',
  },
  pendingDescription: {
    color: '#CCCCCC',
    fontSize: 14,
    textAlign: 'center',
    fontFamily: 'JosefinSans-Medium',
    marginBottom: 15,
    lineHeight: 20,
  },
  pendingDetailsBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 15,
    marginTop: 10,
    gap: 10,
  },
  pendingDetailsTitle: {
    color: '#FFA726',
    fontSize: 14,
    fontFamily: 'Raleway-Bold',
    marginBottom: 8,
  },
  pendingDetailText: {
    color: '#CCCCCC',
    fontSize: 13,
    fontFamily: 'JosefinSans-Medium',
  },
  viewDocButtonSecondary: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderWidth: 1,
    borderColor: '#FFD700',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
  },
  scoreCard: { minHeight: 200 },
  scoreDisplay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  scoreIcon: { fontSize: 30, marginRight: 10 },
  scoreText: { fontSize: 48, color: '#FFD700', fontFamily: 'Raleway-Bold' },
  scoreBarContainer: { height: 8, backgroundColor: '#303045', borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  scoreBar: { height: '100%', backgroundColor: '#3498DB', borderRadius: 4 },
  scoreFooter: { fontSize: 12, color: '#A0A0A0', textAlign: 'center', fontFamily: 'JosefinSans-Medium' },
  // Small text styles used by officer identity area
  smallLabel: { color: '#A0A0A0', fontSize: 12, marginTop: 6, fontFamily: 'JosefinSans-Medium' },
  smallValue: { color: 'white', fontSize: 16, fontFamily: 'Raleway-Bold', marginBottom: 6 },
  logoutButton: { marginTop: 12, backgroundColor: '#FF4C4C', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  logoutButtonText: { color: 'white', fontFamily: 'Raleway-Bold' },
});

export default Profile;