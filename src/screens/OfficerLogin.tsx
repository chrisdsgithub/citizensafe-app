import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

// --- Firebase Imports ---
import { auth, db } from '../../firebaseConfig';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

type OfficerLoginNavigationProp = NativeStackNavigationProp<RootStackParamList, 'OfficerLogin'>;

export default function OfficerLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<OfficerLoginNavigationProp>();

  // State to track focus for input fields
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      setLoading(false);
      return;
    }

    try {
      // 1. Authenticate user with Firebase Auth (This is the error point)
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Fetch user data and check role from Firestore
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        await signOut(auth);
        throw new Error("Profile not found. Please contact support.");
      }

      const userData = userDoc.data();
      const userRole = userData.role;

      // 3. Verify Role
      if (userRole !== 'officer') {
        // Log out the user immediately if they try to sign into the wrong portal
        await signOut(auth);
        throw new Error("Access Denied. You are not registered as an officer.");
      }

      Alert.alert('Success', 'Welcome back, Officer!');
      navigation.navigate('OfficerTabs'); 

    } catch (error) {
      console.error("Firebase Signin Failed:", error.code, error.message);
      
      let errorMessage = "Sign-in Failed. Please check your credentials.";
      // This block captures the primary authentication failure
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
          errorMessage = "Invalid email or password. Please try again.";
      } else if (error.message.includes("Access Denied")) {
          errorMessage = error.message;
      }
      
      Alert.alert('Login Failed', errorMessage);
    } finally {
      setLoading(false);
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
          <Text style={styles.greetingsText}>Welcome</Text>
          <Text style={styles.officerText}>Officer</Text>
        </View>
      </View>

      <Image
        source={require('../../assets/images/signin_police.png')} // Use the police-themed icon/image
        style={styles.peopleIcon}
        resizeMode="contain"
      />

      {/* Scrollable Form Content */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.formContent}>
          
          <View style={styles.signupPrompt}>
            <Text style={styles.signupPromptText}>Not registered?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('OfficerSignup')}>
              <Text style={styles.signupLinkText}> Sign Up</Text>
            </TouchableOpacity>
          </View>

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
          
          <TouchableOpacity style={styles.signupButton} onPress={handleSignIn} disabled={loading}>
            {loading ? <ActivityIndicator color="#1E1E2F" /> : <Text style={styles.signupButtonText}>Sign In</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingContainer: { flex: 1, backgroundColor: '#1E1E2F', },
  backgroundImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.6, },
  peopleIcon: { width: 250, height: 200, alignSelf: 'center', marginBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, marginBottom: 40, },
  backButton: { marginRight: 15, },
  arrow: { fontSize: 32, color: '#FFD700', },
  greetingsWrapper: { flexDirection: 'column', },
  greetingsText: { fontSize: 38, color: 'white', fontFamily: 'Raleway-Bold', },
  officerText: { fontSize: 38, color: '#FFD700', marginTop: -10, fontFamily: 'Raleway-Bold', },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 20, },
  formContent: { width: '100%', alignSelf: 'center', },
  signupPrompt: { flexDirection: 'row', justifyContent: 'center', marginBottom: 30, },
  signupPromptText: { color: '#A0A0A0', fontSize: 16, fontFamily: 'JosefinSans-Medium', },
  signupLinkText: { color: '#FFD700', fontSize: 16, fontFamily: 'JosefinSans-Medium', },
  input: { backgroundColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.5)', padding: 18, marginBottom: 15, borderRadius: 8, color: 'white', fontSize: 18, fontFamily: 'JosefinSans-Medium', },
  inputFocused: { borderColor: '#FFD700', },
  signupButton: { backgroundColor: '#FFD700', padding: 15, borderRadius: 8, marginTop: 20, },
  signupButtonText: { textAlign: 'center', color: '#1E1E2F', fontSize: 18, fontFamily: 'Raleway-Bold', },
});
