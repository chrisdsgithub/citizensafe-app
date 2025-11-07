import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import OfficerDashboard from '../screens/OfficerDashboard';
import OfficerChatScreen from '../screens/OfficerChatScreen';
import VoiceSentimentScreen from '../screens/VoiceSentimentScreen';
import { Platform, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons'; // NEW: Import Ionicons

const Tab = createBottomTabNavigator();

const DARK_NAVY = '#041330';
const CARD_BG = '#303045';
const GOLD_ACCENT = '#FFD700';
const INACTIVE_BLUE = '#3498DB'; 
const DANGER_RED = '#E74C3C'; // For badge

// Custom Icon Wrapper for Circular Design
// ✅ Fixed TabIcon
const TabIcon = ({ iconName, color, focused }) => {
  const isDashboard = iconName.includes('speedometer');

  // Gold if focused, else normal tint
  const iconColor = focused ? GOLD_ACCENT : color;

  return (
    <View
      style={[
        tabStyles.iconWrapper,
        isDashboard && tabStyles.dashboardIcon // keep center raised style
      ]}
    >
      <Ionicons
        name={iconName}
        size={isDashboard ? 30 : 24}
        color={iconColor}
        style={isDashboard && focused && { transform: [{ scale: 1.1 }] }}
      />
    </View>
  );
};

export default function OfficerTabs() {
    return (
        <Tab.Navigator id={undefined}
            initialRouteName="Dashboard"
            screenOptions={({ route }) => ({
                headerShown: false,
                // FIX: Active/Inactive Colors are Gold/Blue
                tabBarActiveTintColor: GOLD_ACCENT,
                tabBarInactiveTintColor: INACTIVE_BLUE, 
                tabBarStyle: {
                    backgroundColor: DARK_NAVY,
                    borderTopWidth: 0,
                    height: Platform.OS === 'ios' ? 90 : 60,
                    paddingBottom: Platform.OS === 'ios' ? 25 : 5, 
                    justifyContent: 'space-around', 
                },
                tabBarLabelStyle: {
                    fontFamily: 'Raleway-Bold',
                    fontSize: 12,
                },
                tabBarItemStyle: {
                    flex: 1, 
                    marginHorizontal: 5,
                }
            })}
        >
            <Tab.Screen 
                name="Chat" 
                component={OfficerChatScreen} 
                options={{
                    tabBarIcon: ({ color, size, focused }) => (
                        <TabIcon 
                            iconName={focused ? "chatbox-ellipses" : "chatbox-ellipses-outline"} 
                            color={color} 
                            focused={focused} 
                        /> 
                    ),
                    tabBarBadge: 2, 
                    tabBarBadgeStyle: { backgroundColor: DANGER_RED, color: 'white' }
                }}
            />
             <Tab.Screen 
                name="Dashboard" 
                component={OfficerDashboard} 
                options={{
                    tabBarIcon: ({ color, size, focused }) => (
                        <TabIcon 
                            iconName={focused ? "speedometer" : "speedometer-outline"} 
                            color={color} 
                            focused={focused} 
                        />
                    ),
                    tabBarLabel: "" // Center icon has no label
                }}
            />
            <Tab.Screen 
                name="Voice Analysis" 
                component={VoiceSentimentScreen} 
                options={{
                    tabBarIcon: ({ color, size, focused }) => (
                        <TabIcon 
                            iconName={focused ? "mic-circle" : "mic-circle-outline"} 
                            color={color} 
                            focused={focused} 
                        /> 
                    ),
                    tabBarLabel: "Voice AI"
                }}
            />
        </Tab.Navigator>
    );
}

const tabStyles = StyleSheet.create({
    iconWrapper: {
        width: 45,
        height: 45,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: CARD_BG, 
    },
    iconWrapperActive: {
        backgroundColor: GOLD_ACCENT, 
        transform: [{ scale: 1.05 }],
    },
    dashboardIcon: {
        // Distinct styling for the central Dashboard button
        width: 60, 
        height: 60, 
        borderRadius: 30, 
        backgroundColor: DARK_NAVY, // Match container
        borderColor: GOLD_ACCENT,
        borderWidth: 2, 
        marginTop: -20, // Lift the center icon up dramatically
        shadowColor: GOLD_ACCENT,
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.8,
        shadowRadius: 5,
        elevation: 5,
    }
});