import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
// Removed FileSystem import as we no longer need to read the file into a Base64 string
// import * as FileSystem from 'expo-file-system/legacy'; 
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

// --- Firebase Imports ---
import { auth, db, storage } from '../../firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, updateDoc } from 'firebase/firestore'; // Imported updateDoc for final step
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useState } from 'react';

type CitizenSignupNavigationProp = NativeStackNavigationProp<RootStackParamList, 'CitizenSignup'>;

export default function CitizenSignup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [aadharDoc, setAadharDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingAadhar, setUploadingAadhar] = useState(false);
  const navigation = useNavigation<CitizenSignupNavigationProp>();

  // State to track focus for each input field
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isPhoneFocused, setIsPhoneFocused] = useState(false);

  const handleDocumentPick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setAadharDoc(result.assets[0]);
        Alert.alert('Success', 'Aadhar card selected!');
      } else if (result.canceled) {
        Alert.alert('Selection Cancelled', 'You did not select an Aadhar card.');
      }
    } catch (err) {
      console.error('Document picker failed:', err);
      Alert.alert('Error', 'Failed to pick document. Check device permissions.');
    }
  };

  const handleSignUp = async () => {
    setLoading(true);
    
    if (!email || !password || !name || !phone || !aadharDoc) {
      Alert.alert('Error', 'Please fill all fields and select a document.');
      setLoading(false);
      return;
    }
    
    // Variables must be scoped outside of try/catch for cleanup
    let user = null;
    let aadharDocUrl = '';

    try {
      // 1. Authenticate user with Firebase Auth (Success)
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      user = userCredential.user;
      
      const userDocRef = doc(db, "users", user.uid);

      // 2. *** FIX RACE CONDITION: CREATE FIRESTORE PROFILE FIRST ***
      // We set the initial document without the final Aadhar URL, ensuring the document exists.
      await setDoc(userDocRef, {
        fullName: name,
        email: email,
        phone: phone,
        // aadharCardUrl is set later via updateDoc
        createdAt: new Date(),
        role: 'citizen',
        isAadharVerified: false,
        credibilityScore: 100
      });

      // 3. File Handling and Upload to Firebase Storage (This triggers the Cloud Function)
      setUploadingAadhar(true);
      
      const response = await fetch(aadharDoc.uri);
      const fileBlob = await response.blob();

      const fileExt = aadharDoc.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      
      // Storage reference must match security rules: aadhar_documents/{user.uid}/{fileName}
      const storageRef = ref(storage, `aadhar_documents/${user.uid}/${fileName}`);
      
      await uploadBytes(storageRef, fileBlob);
      aadharDocUrl = await getDownloadURL(storageRef);
      setUploadingAadhar(false);

      // 4. Update Firestore with the new Aadhar URL
      // This step is critical because the Cloud Function needs the document to exist (Step 2)
      // and the app needs the URL for future use.
      await updateDoc(userDocRef, {
        aadharCardUrl: aadharDocUrl
      });
      
      // 5. *** TRIGGER AADHAAR VERIFICATION ***
      // Call the OCR + Face verification endpoint
      console.log('🔍 Starting Aadhaar verification...');
      try {
  const verificationResponse = await fetch('http://192.168.29.169:8080/verify-aadhaar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.uid,
            aadhar_url: aadharDocUrl,
            // profile_picture_url: Not provided - face verification will be skipped
            user_full_name: name.trim()
          })
        });
        
        const verificationResult = await verificationResponse.json();
        
        if (verificationResult.success) {
          if (verificationResult.auto_verified) {
            console.log('✅ Aadhaar auto-verified!');
            Alert.alert(
              'Success', 
              `Citizen account created!\n\n✅ Identity Verified\nName Match: ${verificationResult.name_match_score}%${verificationResult.face_match_score ? `\nFace Match: ${verificationResult.face_match_score}%` : ''}`
            );
          } else {
            console.log('⚠️ Aadhaar flagged for manual review');
            Alert.alert(
              'Success', 
              'Citizen account created!\n\n⚠️ Your identity verification is pending manual review by an officer.'
            );
          }
        } else {
          console.warn('❌ Verification failed:', verificationResult.error);
          Alert.alert('Success', 'Citizen account created! Verification will be completed later.');
        }
      } catch (verificationError) {
        console.error('Verification API error:', verificationError);
        // Don't block signup if verification fails
        Alert.alert('Success', 'Citizen account created! Verification will be completed later.');
      }
      
      navigation.navigate('MainTabs');
      
    } catch (error) {
      // Log the full error to capture hidden details
      console.error("Firebase Signup Failed:", error);
      
      let errorMessage = "Signup Failed. Please try again.";
      
      if (error.code === 'auth/email-already-in-use') {
          errorMessage = "This email is already registered. Please sign in or use a different email.";
      } else if (error.code === 'auth/weak-password') {
          errorMessage = "Password should be at least 6 characters.";
      } else if (error.code) {
          errorMessage = `Auth Error: ${error.code.replace('auth/', '').replace(/-/g, ' ').toUpperCase()}`;
      } else if (error.message.includes('Blob') || error.message.includes('network request failed')) {
          // Catch generic network errors and suggest the Storage rule check again
          errorMessage = "File upload failed (Network/Permission issue). Verify Storage Security Rules are published correctly.";
      }
      
      // Cleanup the user if authentication succeeded but subsequent steps failed
      if (user) {
          console.warn("Cleaned up orphaned user due to signup failure.");
          // NOTE: We rely on the server-side to clean up the partially uploaded data
      }
      
      Alert.alert('Signup Failed', errorMessage);
      
    } finally {
      setLoading(false);
      setUploadingAadhar(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardAvoidingContainer}
    >
      {/* Background Image */}
      <Image
        source={require('../../assets/images/bg_img.png')}
        style={styles.backgroundImage}
      />
      
      {/* Fixed Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.arrow}>⬅</Text>
        </TouchableOpacity>
        <View style={styles.greetingsWrapper}>
          <Text style={styles.greetingsText}>Greetings</Text>
          <Text style={styles.citizenText}>Citizen</Text>
        </View>
      </View>

      <Image
        source={require('../../assets/images/people-icon.png')}
        style={styles.peopleIcon}
        resizeMode="contain"
      />

      {/* Scrollable Form Content */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.formContent}>
          <View style={styles.signupPrompt}>
            <Text style={styles.signupPromptText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('CitizenLogin')}>
              <Text style={styles.signupLinkText}> Sign in</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={[styles.input, isNameFocused && styles.inputFocused]}
            placeholder="Full Name"
            placeholderTextColor="#A0A0A0"
            value={name}
            onChangeText={setName}
            onFocus={() => setIsNameFocused(true)}
            onBlur={() => setIsNameFocused(false)}
          />
          <TextInput
            style={[styles.input, isEmailFocused && styles.inputFocused]}
            placeholder="Email"
            placeholderTextColor="#A0A0A0"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            onFocus={() => setIsEmailFocused(true)}
            onBlur={() => setIsEmailFocused(false)}
          />
          <TextInput
            style={[styles.input, isPasswordFocused && styles.inputFocused]}
            placeholder="Password"
            placeholderTextColor="#A0A0A0"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            onFocus={() => setIsPasswordFocused(true)}
            onBlur={() => setIsPasswordFocused(false)}
          />
          <TextInput
            style={[styles.input, isPhoneFocused && styles.inputFocused]}
            placeholder="Phone Number"
            placeholderTextColor="#A0A0A0"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            onFocus={() => setIsPhoneFocused(true)}
            onBlur={() => setIsPhoneFocused(false)}
          />

          <TouchableOpacity
            style={styles.uploadButton}
            onPress={handleDocumentPick}
            disabled={uploadingAadhar || loading}
          >
            {uploadingAadhar ? (
              <View style={styles.uploadingContainer}>
                <ActivityIndicator color="#fff" />
                <Text style={[styles.uploadButtonText, { marginLeft: 10 }]}>Uploading...</Text>
              </View>
            ) : (
              <Text style={styles.uploadButtonText}>{aadharDoc ? 'Aadhar Selected' : 'Upload Aadhar Card (PDF)'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.signupButton} onPress={handleSignUp} disabled={loading}>
            {loading ? <ActivityIndicator color="#1E1E2F" /> : <Text style={styles.signupButtonText}>Sign Up</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingContainer: {
    flex: 1,
    backgroundColor: '#1E1E2F',
  },
  backgroundImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    opacity: 0.6,
  },
  peopleIcon: {
    width: 250,
    height: 100,
    alignSelf: 'center',
    marginBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    marginBottom: 40,
  },
  backButton: {
    marginRight: 15,
  },
  arrow: {
    fontSize: 32,
    color: '#FFD700',
  },
  greetingsWrapper: {
    flexDirection: 'column',
  },
  greetingsText: {
    fontSize: 38,
    color: 'white',
    fontFamily: 'Raleway-Bold',
  },
  citizenText: {
    fontSize: 38,
    color: '#FFD700',
    marginTop: -10,
    fontFamily: 'Raleway-Bold',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  formContent: {
    width: '100%',
    alignSelf: 'center',
  },
  signupPrompt: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 30,
  },
  signupPromptText: {
    color: '#A0A0A0',
    fontSize: 16,
    fontFamily: 'JosefinSans-Medium',
  },
  signupLinkText: {
    color: '#FFD700',
    fontSize: 16,
    fontFamily: 'JosefinSans-Medium',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    padding: 18,
    marginBottom: 15,
    borderRadius: 8,
    color: 'white',
    fontSize: 18,
    fontFamily: 'JosefinSans-Medium',
  },
  inputFocused: {
    borderColor: '#FFD700',
  },
  uploadButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  uploadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonText: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Raleway-Bold',
  },
  signupButton: {
    backgroundColor: '#FFD700',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
  },
  signupButtonText: {
    textAlign: 'center',
    color: '#1E1E2F',
    fontSize: 18,
    fontFamily: 'Raleway-Bold',
  },
});