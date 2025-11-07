import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

// --- Firebase Imports ---
import { auth, db } from '../../firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

// Note: No FileSystem or Storage imports needed since officers don't upload Aadhar/Documents here.

type OfficerSignupNavigationProp = NativeStackNavigationProp<RootStackParamList, 'OfficerSignup'>;

export default function OfficerSignup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [badgeNumber, setBadgeNumber] = useState(''); // New Field
  const [precinct, setPrecinct] = useState('');       // New Field
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<OfficerSignupNavigationProp>();

  // State to track focus for input fields
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isBadgeFocused, setIsBadgeFocused] = useState(false);
  const [isPrecinctFocused, setIsPrecinctFocused] = useState(false);

  const handleSignUp = async () => {
    setLoading(true);
    if (!email || !password || !name || !badgeNumber || !precinct) {
      Alert.alert('Error', 'Please fill all fields.');
      setLoading(false);
      return;
    }
    
    try {
      // 1. Authenticate user with Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Save officer data to Firestore
      // Use the structure from your database screenshot (users collection)
      await setDoc(doc(db, "users", user.uid), {
        fullName: name,
        email: email,
        badgeNumber: badgeNumber,
        precinct: precinct,
        createdAt: new Date(),
        role: 'officer',
        isVerifiedOfficer: false, // Default to false, waiting for admin/system verification
      });

      Alert.alert('Success', 'Officer account created! Awaiting internal verification.');
      // Officer should navigate to a specific pending screen or a verification notice screen
      navigation.navigate('OfficerLogin'); // Redirect to login for now
    } catch (error) {
      console.error("Firebase Signup Failed:", error.code, error.message);
      Alert.alert('Signup Failed', error.message);
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
        source={require('../../assets/images/police_signup.png')}
        style={styles.peopleIcon}
        resizeMode="contain"
      />

      {/* Scrollable Form Content */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.formContent}>
          <View style={styles.signupPrompt}>
            <Text style={styles.signupPromptText}>Already registered?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('OfficerLogin')}>
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
            style={[styles.input, isBadgeFocused && styles.inputFocused]}
            placeholder="Badge Number"
            placeholderTextColor="#A0A0A0"
            value={badgeNumber}
            onChangeText={setBadgeNumber}
            keyboardType="numeric"
            onFocus={() => setIsBadgeFocused(true)}
            onBlur={() => setIsBadgeFocused(false)}
          />
          <TextInput
            style={[styles.input, isPrecinctFocused && styles.inputFocused]}
            placeholder="Precinct/Station Name"
            placeholderTextColor="#A0A0A0"
            value={precinct}
            onChangeText={setPrecinct}
            onFocus={() => setIsPrecinctFocused(true)}
            onBlur={() => setIsPrecinctFocused(false)}
          />

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
    width: 450,
    height: 120,
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
  officerText: { // Changed from citizenText
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