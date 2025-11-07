import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons'; // Used for icons
import { Platform, View } from 'react-native'; 
import CrimeFeed from '../screens/CrimeFeed';
import AIReportBot from '../screens/AIReportBot';
import CitizenCrimeMap from '../screens/CitizenCrimeMap';

const Tab = createBottomTabNavigator();

export default function MainTabs() {
  // Define the colors from your design
  const DARK_NAVY = '#1E1E2F';
  const GOLD_ACCENT = '#FFD700';
  const INACTIVE_GRAY = '#6B7280'; // A dark gray for inactive tabs

  return (
    <Tab.Navigator id={undefined}
      initialRouteName="Feed" 
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: GOLD_ACCENT,
        tabBarInactiveTintColor: INACTIVE_GRAY,
        // FIX: Removed position: absolute, as it breaks the layout flow
        tabBarLabelStyle: {
          fontFamily: 'JosefinSans-Medium',
          fontSize: 12,
          opacity: 1,
        },
        tabBarStyle: {
          backgroundColor: DARK_NAVY, 
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 90 : 60, 
          paddingBottom: Platform.OS === 'ios' ? 25 : 5,
        },
        // Styling applied to the item itself, creating space around the floating circle
        tabBarItemStyle: {
          paddingHorizontal: 5,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Feed') {
            iconName = focused ? 'map' : 'map-outline';
          } else if (route.name === 'Report') {
            iconName = focused ? 'document-text' : 'document-text-outline';
          } else if (route.name === 'CrimeMap') {
            iconName = focused ? 'location' : 'location-outline';
          } 
          
          // FIX: Use a wrapper View for the active icon to force the circular background
          return (
            <View style={{
                width: 50, // Fixed width/height for the circle
                height: 50,
                borderRadius: 25, // Half the size for a circle
                backgroundColor: focused ? '#0b275d' : 'transparent', // Deep blue background for the circle
                justifyContent: 'center',
                alignItems: 'center',
                // Float the active circle up slightly
                transform: [{ translateY: focused ? -5 : 0 }], 
            }}>
                <Ionicons name={iconName as keyof typeof Ionicons.glyphMap} size={size} color={color} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen 
        name="Feed" 
        component={CrimeFeed} 
        options={{ 
            title: 'Crime Feed',
        }} 
      />
      <Tab.Screen 
        name="Report" 
        component={AIReportBot} 
        options={{ 
            title: 'AI Report',
        }} 
      />
      <Tab.Screen 
        name="CrimeMap" 
        component={CitizenCrimeMap} 
        options={{ 
            title: 'Crime Map',
        }} 
      />
    </Tab.Navigator>
  );
}