import React from 'react';
import { ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { RootStackParamList } from '../navigation/AppNavigator';

type UserTypeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'UserType'>;

export default function UserTypeScreen() {
  const navigation = useNavigation<UserTypeScreenNavigationProp>();

  return (
    <ImageBackground
      source={require('../../assets/images/bg1.png')}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        <Text style={styles.mainTitle}>Select</Text>
        <Text style={styles.subtitle}>User Type</Text>

        {/* Citizen and Officer Sign-up Buttons */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('CitizenSignup')}
        >
          <Text style={styles.buttonText}>CITIZEN</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('OfficerSignup')}
        >
          <Text style={styles.buttonText}>OFFICER</Text>
        </TouchableOpacity>

       {/* Login Link for Existing Users */}
   {/*}   <View style={styles.loginLinkContainer}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>Log In</Text>
          </TouchableOpacity>
        </View> */}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  mainTitle: { fontSize: 50, fontFamily: 'Raleway-Bold', color: '#fff', marginBottom: 20, marginTop: -50, textAlign: 'center' },
  subtitle: { fontSize: 50, fontFamily: 'Raleway-Bold', color: '#FFD700', marginBottom: 80, textAlign: 'center' },
  button: { width: '80%', height: '15%', backgroundColor: '#0b275d', paddingVertical: 18, marginVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  buttonText: { color: '#FFD700', fontSize: 30, fontFamily: 'JosefinSans-Medium', textAlign: 'center' },
  loginLinkContainer: { flexDirection: 'row', marginTop: 20 },
  loginText: { color: '#fff', fontSize: 16 },
  loginLink: { color: '#FFD700', fontSize: 16, fontWeight: 'bold' },
});