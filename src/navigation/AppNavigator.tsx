import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
// Import new tabs component
import OfficerTabs from '../screens/OfficerTabs'; 
import SplashScreen from '../screens/SplashScreen';
import UserType from '../screens/UserType';
import CitizenSignup from '../screens/CitizenSignup';
import CrimeFeed from '../screens/CrimeFeed';
import OfficerSignup from '../screens/OfficerSignup';
import CitizenLogin from '../screens/CitizenLogin';
import OfficerLogin from '../screens/OfficerLogin';
import AIReportBot from '../screens/AIReportBot';
import MainTabs from '../screens/MainTabs';
// import OfficerDashboard from '../screens/OfficerDashboard'; // Removed direct import
import Profile from '../screens/Profile';
import CrimeMap from '../screens/CrimeMap';
import RiskPrediction from '../screens/RiskPrediction';
import CrimeTypePrediction from '../screens/CrimeTypePrediction';
import ReportManagementScreen from '../screens/ReportManagementScreen';
import IncidentEscalationRisksScreen from '../screens/IncidentEscalationRisksScreen';
import FlaggedReportsScreen from '../screens/FlaggedReportsScreen';

export type RootStackParamList = {
  Splash: undefined;
  UserType: undefined;
  CitizenSignup: undefined;
  CitizenLogin:undefined;
  OfficerLogin: undefined;
  CrimeFeed: undefined;
  OfficerSignup:undefined;
  AIReportBot: undefined;
  MainTabs: undefined;
  OfficerDashboard: undefined; // Keep this route definition if other screens use it
  OfficerTabs: undefined; // NEW: The main tab screen for officers
  CrimeMap: undefined;
  Profile: { userType?: 'Officer' | 'Citizen' } | undefined;
  ReportManagementScreen: { highlightId?: string } | undefined;
  IncidentEscalationRisks: undefined; // NEW: View all incident escalation risks
  FlaggedReports: { flaggedReports: any[] }; // NEW: View all flagged fake reports
  Chat: undefined; // Added for internal type linking
  RiskPrediction: { reportText?: string } | undefined;
  CrimeTypePrediction: { description?: string; location?: string } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator id={undefined} initialRouteName="Splash" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="UserType" component={UserType} />
        <Stack.Screen name="CitizenSignup" component={CitizenSignup} />
        <Stack.Screen name="CitizenLogin" component={CitizenLogin} />
        <Stack.Screen name="OfficerLogin" component={OfficerLogin} />
        <Stack.Screen name="OfficerSignup" component={OfficerSignup} />
        
        {/* 🚨 FIX: Replaced OfficerDashboard screen with OfficerTabs navigator */}
        <Stack.Screen name="OfficerDashboard" component={OfficerTabs} /> 
        <Stack.Screen name="OfficerTabs" component={OfficerTabs} /> 

        <Stack.Screen name="CrimeMap" component={CrimeMap} />
        <Stack.Screen name="RiskPrediction" component={RiskPrediction} />
        <Stack.Screen name="CrimeTypePrediction" component={CrimeTypePrediction} />
        <Stack.Screen name="Profile" component={Profile}
          options={({ route }) => ({
            headerShown: true,
            title: route.params?.userType === 'Officer' ? 'Officer Profile' : 'Citizen Profile',
            headerStyle: { backgroundColor: '#1E1E2F' },
            headerTintColor: '#FFD700',
            headerTitleStyle: { fontFamily: 'Raleway-Bold' }
          })}
        />

        {/* Report management screen for officers */}
        <Stack.Screen name="ReportManagementScreen" component={ReportManagementScreen} />

        {/* Incident Escalation Risks screen for officers */}
        <Stack.Screen name="IncidentEscalationRisks" component={IncidentEscalationRisksScreen} />

        {/* Flagged Reports screen for officers */}
        <Stack.Screen name="FlaggedReports" component={FlaggedReportsScreen} />

        <Stack.Screen name="AIReportBot" component={AIReportBot} />
        <Stack.Screen name="MainTabs" component={MainTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
