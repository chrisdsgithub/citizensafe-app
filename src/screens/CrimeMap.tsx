import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, ScrollView, Platform, TouchableOpacity, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

// --- Firebase Imports ---
import { auth, db } from '../../firebaseConfig';
import { collection, query, orderBy, onSnapshot, doc as firestoreDoc, getDoc } from 'firebase/firestore';
import MapView, { Marker, Circle, Callout } from 'react-native-maps';
import * as Location from 'expo-location';

type CrimeMapNavigationProp = NativeStackNavigationProp<RootStackParamList, 'CrimeMap'>;
interface CrimeData {
  id: string;
  location: string;
  description: string;
  type: string;
  latitude?: number;
  longitude?: number;
  riskLevelText?: string;
  timestamp?: Date;
}

interface ReportLocation {
  latitude: number;
  longitude: number;
  type: string;
  id: string;
}

// --- Main Crime Map Component ---
export default function CrimeMap() {
  const navigation = useNavigation<CrimeMapNavigationProp>();
  const user = auth.currentUser;
  
  const [crimeData, setCrimeData] = useState<CrimeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<any>(null);
  const mapRef = useRef<MapView | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedCrime, setSelectedCrime] = useState<CrimeData | null>(null);

  // --- Load Crime Data from Firebase ---
  useEffect(() => {
    if (!user) {
      console.log('CrimeMap: No user authenticated');
      setLoading(false);
      return;
    }
    
    console.log('CrimeMap: Loading data for user:', user.uid);
    setLoading(true);

    const reportsQuery = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));
    const crimeFeedQuery = query(collection(db, 'crimeFeed'), orderBy('timestamp', 'desc'));

    const unsubscribeReports = onSnapshot(reportsQuery, (snapshot) => {
      const reportsData: CrimeData[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        console.log('CrimeMap: Report doc:', doc.id, 'reportType:', data.reportType);
        return {
          id: doc.id,
          location: data.location?.city || 'Unknown',
          description: data.description || '',
          type: data.reportType === 'AI_Summary' ? 'AI Report' : 'Citizen Report',
          latitude: data.location?.latitude,
          longitude: data.location?.longitude,
          riskLevelText: data.riskLevelText || 'Unknown',
          timestamp: data.timestamp?.toDate(),
        };
      });

      const unsubscribeCrimeFeed = onSnapshot(crimeFeedQuery, (snapshot) => {
        const crimeFeedData: CrimeData[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          console.log('CrimeMap: CrimeFeed doc:', doc.id, 'location:', data.location, 'coords:', data.location?.latitude, data.location?.longitude);
          return {
            id: doc.id,
            location: data.location?.city || 'Unknown',
            description: data.description || '',
            type: 'Crime Feed',
            latitude: data.location?.latitude,
            longitude: data.location?.longitude,
            riskLevelText: data.riskLevelText || 'Unknown',
            timestamp: data.timestamp?.toDate(),
          };
        });

        console.log('CrimeMap: Total crimeFeed docs:', snapshot.docs.length);
        console.log('CrimeMap: CrimeFeed with coords:', crimeFeedData.filter(item => item.latitude && item.longitude).length);
        console.log('CrimeMap: Reports with coords:', reportsData.filter(item => item.latitude && item.longitude).length);
        
        const allData = [...reportsData, ...crimeFeedData].filter(item => item.latitude && item.longitude);
        console.log('CrimeMap: Filtered data with coordinates:', allData.length, 'out of', reportsData.length + crimeFeedData.length);
        console.log('CrimeMap: Type breakdown:', allData.map(d => d.type));
        setCrimeData(allData);
        setLoading(false);

        // Set initial map region to Mumbai if no data
        if (allData.length === 0) {
          setRegion({
            latitude: 19.0760,
            longitude: 72.8777,
            latitudeDelta: 0.5,
            longitudeDelta: 0.5,
          });
        } else {
          // Center on the first item or calculate center
          const first = allData[0];
          setRegion({
            latitude: first.latitude!,
            longitude: first.longitude!,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          });
        }

        return () => unsubscribeCrimeFeed();
      });

      return () => unsubscribeReports();
    }, (error) => {
      console.error('Error fetching crime data:', error);
      setLoading(false);
    });
  }, [user]);

  // --- Get User Location ---
  useEffect(() => {
    (async () => {
      try {
        console.log('CrimeMap: Requesting location permissions...');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('CrimeMap: Location permission denied');
          Alert.alert('Location Permission', 'Location permission is required to show your position on the map.');
          return;
        }

        console.log('CrimeMap: Getting current position...');
        const location = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = location.coords;
        console.log('CrimeMap: User location:', latitude, longitude);
        setUserLocation({ latitude, longitude });
      } catch (error) {
        console.error('CrimeMap: Error getting location:', error);
        Alert.alert('Location Error', 'Unable to get your current location.');
      }
    })();
  }, []);

  const zoomToFit = () => {
    if (!mapRef.current || crimeData.length === 0) return;
    const coords = crimeData
      .filter(crime => crime.latitude && crime.longitude)
      .map(crime => ({ latitude: crime.latitude!, longitude: crime.longitude! }));
    if (coords.length > 0) {
      // @ts-ignore - using native method
      mapRef.current.fitToCoordinates(coords, { edgePadding: { top: 80, right: 80, bottom: 80, left: 80 }, animated: true });
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'high risk': return '#FF0000'; // Red
      case 'medium risk': return '#FFA500'; // Orange
      case 'low risk': return '#00FF00'; // Green
      default: return '#808080'; // Gray
    }
  };


  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mumbai Crime Map</Text>
      <Text style={styles.subtitle}>Showing {crimeData.length} incidents on map.</Text>

      <View style={styles.mapContainer}>
        {loading ? (
          <ActivityIndicator size="large" color="#FFD700" style={styles.loader} />
        ) : crimeData.length === 0 ? (
          <Text style={styles.placeholderText}>No incidents found.</Text>
        ) : (
          region ? (
            <MapView
              ref={(r) => { mapRef.current = r; }}
              style={StyleSheet.absoluteFill}
              initialRegion={region}
              showsUserLocation={true}
              showsMyLocationButton={false}
              zoomEnabled={true}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              {crimeData
                .filter(crime => crime.latitude && crime.longitude)
                .map((crime) => {
                  const CITIZEN_REPORT_COLOR = 'red'; // Red for Citizen Reports
                  const AI_REPORT_COLOR = 'yellow'; // Yellow for AI Reports
                  const markerColor = crime.type === 'Citizen Report' ? CITIZEN_REPORT_COLOR : AI_REPORT_COLOR;
                  console.log('CrimeMap Marker:', crime.type, '-> Color:', markerColor);
                  return (
                    <Marker
                      key={crime.id}
                      coordinate={{ latitude: crime.latitude!, longitude: crime.longitude! }}
                      title={crime.type}
                      description={`${crime.location} - ${crime.riskLevelText} Risk`}
                      pinColor={markerColor}
                      onPress={() => setSelectedCrime(crime)}
                    >
                      <Callout tooltip={false} onPress={() => setSelectedCrime(crime)}>
                        <View style={{ width: 250, padding: 8 }}>
                          <Text style={{ fontFamily: 'Raleway-Bold', color: crime.type === 'Citizen Report' ? '#E74C3C' : '#FFD700', marginBottom: 4 }}>
                            {crime.type}
                          </Text>
                          <Text style={{ color: 'white', marginBottom: 2, fontFamily: 'JosefinSans-Medium' }}>
                            {crime.location}
                          </Text>
                          <Text style={{ color: getRiskColor(crime.riskLevelText || 'Low'), fontWeight: 'bold', marginBottom: 2, fontFamily: 'JosefinSans-Medium' }}>
                            {'Risk Level: ' + crime.riskLevelText}
                          </Text>
                          <Text style={{ color: '#A0A0A0', marginBottom: 2, fontFamily: 'JosefinSans-Medium' }}>
                            {crime.timestamp ? crime.timestamp.toLocaleString() : 'Unknown time'}
                          </Text>
                          <Text style={{ color: '#A0A0A0', fontSize: 12, fontFamily: 'JosefinSans-Medium' }}>
                            Tap to view details
                          </Text>
                        </View>
                      </Callout>
                    </Marker>
                  );
                })}

              {/* User location marker & circle (blue) for clarity */}
              {userLocation && (
                <>
                  <Circle
                    center={userLocation}
                    radius={50}
                    strokeColor={'rgba(0,122,255,0.4)'}
                    fillColor={'rgba(0,122,255,0.15)'}
                  />
                  <Marker
                    coordinate={userLocation}
                    title={'You'}
                    description={'Your location'}
                    pinColor={'#007AFF'}
                  />
                </>
              )}
            </MapView>
          ) : (
            <ActivityIndicator size="large" color="#FFD700" />
          )
        )}

        {/* Floating controls */}
        <View style={styles.mapControls} pointerEvents="box-none">
          <TouchableOpacity style={styles.controlButton} onPress={zoomToFit}>
            <Text style={styles.controlText}>Fit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.controlButton, { marginTop: 8 }]} onPress={() => setRegion({
            latitude: 19.0760,
            longitude: 72.8777,
            latitudeDelta: 0.5,
            longitudeDelta: 0.5,
          })}>
            <Text style={styles.controlText}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <Text style={styles.legendTitle}>Legend</Text>
    <View style={styles.legendContainer}>
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: '#FF0000' }]} />
      <Text style={styles.legendText}>Crime Feed</Text>
    </View>
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: '#FFD700' }]} />
      <Text style={styles.legendText}>AI Reports</Text>
    </View>
        <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#007AFF' }]} />
            <Text style={styles.legendText}>Your Location</Text>
        </View>
      </View>
      
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>← Back to Dashboard</Text>
      </TouchableOpacity>

      {/* Bottom panel showing selected crime details */}
      {selectedCrime && (
        <View style={styles.bottomPanel}>
          <View style={styles.bottomHeader}>
            <Text style={styles.bottomTitle}>{selectedCrime.id.substring(0, 8)} • {selectedCrime.type}</Text>
            <TouchableOpacity onPress={() => setSelectedCrime(null)}>
              <Text style={{ color: '#A0A0A0' }}>Close</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.bottomLocation}>{selectedCrime.location}</Text>
          <Text style={[styles.bottomDesc, { color: getRiskColor(selectedCrime.riskLevelText || 'Low'), fontWeight: 'bold', marginBottom: 8 }]}>
            Risk Level: {selectedCrime.riskLevelText}
          </Text>
          <Text style={styles.bottomDesc}>{selectedCrime.description}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#A0A0A0', fontSize: 12, marginBottom: 4 }}>
                🕐 {selectedCrime.timestamp ? selectedCrime.timestamp.toLocaleString() : 'Unknown time'}
              </Text>
              <Text style={{ color: '#A0A0A0', fontSize: 12 }}>
                {selectedCrime.type}
              </Text>
            </View>
            <TouchableOpacity style={[styles.secondaryButton]} onPress={() => setSelectedCrime(null)}>
              <Text style={{ color: '#A0A0A0' }}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E2F',
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Raleway-Bold',
    color: 'white',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#A0A0A0',
    marginBottom: 20,
  },
  mapContainer: {
    width: '100%',
    height: 420, // Increased fixed height for larger map
    backgroundColor: '#303045',
    borderRadius: 15,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  mapControls: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  controlButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  controlText: { color: 'white', fontFamily: 'JosefinSans-Medium' },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  loader: {
    position: 'absolute',
  },
  placeholderText: {
    color: '#A0A0A0',
    fontFamily: 'JosefinSans-Medium',
  },
  legendTitle: {
      fontSize: 18,
      fontFamily: 'Raleway-Bold',
      color: 'white',
      marginBottom: 10,
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#303045',
    borderRadius: 10,
    marginBottom: 30,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 90,
    justifyContent: 'flex-start',
  },
  legendDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginRight: 8,
  },
  legendText: {
      color: 'white',
      fontFamily: 'JosefinSans-Medium',
      fontSize: 14,
  },
  backButton: {
    backgroundColor: '#FFD700',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#1E1E2F',
    fontFamily: 'Raleway-Bold',
    fontSize: 16,
  }
  ,
  filterContainer: {
    backgroundColor: '#303045',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  filterRow: {
    marginBottom: 12,
  },
  filterLabel: {
    color: '#FFD700',
    fontFamily: 'Raleway-Bold',
    fontSize: 14,
    marginBottom: 8,
  },
  filterScroll: {
    marginBottom: 5,
  },
  filterButton: {
    backgroundColor: '#1E1E2F',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#404050',
  },
  filterButtonActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  filterButtonText: {
    color: '#A0A0A0',
    fontFamily: 'JosefinSans-Medium',
    fontSize: 12,
  },
  filterButtonTextActive: {
    color: '#1E1E2F',
    fontWeight: 'bold',
  },
  bottomPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    backgroundColor: '#1E1E2F',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  bottomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomTitle: { color: '#FFD700', fontFamily: 'Raleway-Bold' },
  bottomLocation: { color: '#A0A0A0', marginTop: 6 },
  bottomDesc: { color: 'white', marginTop: 8, fontFamily: 'JosefinSans-Medium' },
  viewButton: { backgroundColor: '#FFD700', padding: 10, borderRadius: 8, alignItems: 'center' },
  secondaryButton: { backgroundColor: 'transparent', padding: 10, borderRadius: 8, alignItems: 'center' },
});