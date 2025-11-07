// FirebaseAppProvider.js
import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { app } from './firebaseConfig'; // Import the app instance

export default function FirebaseAppProvider({ children }) {
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);

  useEffect(() => {
    // Check if the app object is created and try a simple connection test
    if (app && app.options.projectId) {
      setIsFirebaseReady(true);
    } else {
      // This will only run if initialization fails
      console.error("Firebase app initialization failed.");
      // You could handle an error screen here
    }
  }, []);

  if (!isFirebaseReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E2F',
  },
});