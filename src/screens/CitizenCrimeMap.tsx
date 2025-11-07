import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import MapView, { Marker, Circle, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import { crimeData as importedCrimeData } from '../services/crimeData';

interface CrimeData {
  incident_id: string;
  location: string;
  sub_location: string;
  datetime_occurred: string;
  hour: number;
  part_of_day: string;
  crime_type: string;
  description: string;
  is_user_report: boolean;
  Risk_Label: string;
  latitude?: number;
  longitude?: number;
}

type CrimeMapNavigationProp = NativeStackNavigationProp<RootStackParamList, 'CrimeMap'>;

const MUMBAI_LOCATIONS: { [key: string]: { latitude: number; longitude: number } } = {
  'Marine Drive': { latitude: 18.9433, longitude: 72.8232 },
  'Powai': { latitude: 19.1197, longitude: 72.9051 },
  'Thane': { latitude: 19.2183, longitude: 72.9781 },
  'Colaba': { latitude: 18.9067, longitude: 72.8147 },
  'Juhu': { latitude: 19.1075, longitude: 72.8263 },
  'Worli': { latitude: 19.0167, longitude: 72.8167 },
  'Bandra': { latitude: 19.0544, longitude: 72.8406 },
  'Chembur': { latitude: 19.0622, longitude: 72.9028 },
  'Andheri': { latitude: 19.1197, longitude: 72.8464 },
  'Borivali': { latitude: 19.2294, longitude: 72.8573 },
  'Mumbai': { latitude: 19.0760, longitude: 72.8777 },
};

export default function CitizenCrimeMap() {
  const navigation = useNavigation<CrimeMapNavigationProp>();
  const [crimeData, setCrimeData] = useState<CrimeData[]>([]);
  const [filteredCrimeData, setFilteredCrimeData] = useState<CrimeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedCrime, setSelectedCrime] = useState<CrimeData | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string>('All');
  const [selectedCrimeType, setSelectedCrimeType] = useState<string>('All');
  const [availableLocations, setAvailableLocations] = useState<string[]>([]);
  const [hotspots, setHotspots] = useState<any[]>([]);
  const [availableCrimeTypes, setAvailableCrimeTypes] = useState<string[]>([]);
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    const validCrimes = importedCrimeData.filter(c => c.latitude !== undefined && c.longitude !== undefined);
    setCrimeData(validCrimes);
    setFilteredCrimeData(validCrimes);
    const locations = new Set<string>();
    const types = new Set<string>();
    importedCrimeData.forEach(c => {
      if (c.location) locations.add(c.location);
      if (c.crime_type) types.add(c.crime_type);
    });
    setAvailableLocations(['All', ...Array.from(locations)]);
    setAvailableCrimeTypes(['All', ...Array.from(types)]);
    const hotspotsMap = {};
    importedCrimeData.forEach(crime => {
      const loc = crime.location;
      if (MUMBAI_LOCATIONS[loc] && !hotspotsMap[loc]) {
        hotspotsMap[loc] = { count: 0, riskSum: 0, coords: MUMBAI_LOCATIONS[loc] };
      }
      if (hotspotsMap[loc]) {
        hotspotsMap[loc].count++;
        const riskVal = crime.Risk_Label === 'High' ? 3 : crime.Risk_Label === 'Medium' ? 2 : 1;
        hotspotsMap[loc].riskSum += riskVal;
      }
    });
    const hotspotList = Object.keys(hotspotsMap).map(key => {
      const h = hotspotsMap[key];
      const avgRisk = h.riskSum / h.count;
      return { location: key, count: h.count, avgRisk, coords: h.coords };
    }).filter(h => h.coords);
    setHotspots(hotspotList);
    setRegion({
      latitude: 19.0760,
      longitude: 72.8777,
      latitudeDelta: 0.4,
      longitudeDelta: 0.4,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    let filtered = crimeData;
    if (selectedLocation !== 'All') {
      filtered = filtered.filter(c => c.location === selectedLocation);
    }
    if (selectedCrimeType !== 'All') {
      filtered = filtered.filter(c => c.crime_type === selectedCrimeType);
    }
    setFilteredCrimeData(filtered);
  }, [selectedLocation, selectedCrimeType, crimeData]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch (err) {
        console.warn('Location error:', err);
      }
    })();
  }, []);

  const getRiskColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'high': return '#FF0000';
      case 'medium': return '#FFA500';
      case 'low': return '#00FF00';
      default: return '#808080';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mumbai Crime Map</Text>
      <Text style={styles.subtitle}>Showing {filteredCrimeData.length} incidents</Text>

      {/* Filter Controls */}
      <View style={styles.filterContainer}>
        <Text style={styles.filterLabel}>Location</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {availableLocations.map(loc => (
            <TouchableOpacity
              key={loc}
              style={[styles.filterButton, selectedLocation === loc && styles.filterButtonActive]}
              onPress={() => setSelectedLocation(loc)}
            >
              <Text style={[styles.filterButtonText, selectedLocation === loc && styles.filterButtonTextActive]}>
                {loc}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.filterLabel, { marginTop: 10 }]}>Crime Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {availableCrimeTypes.map(type => (
            <TouchableOpacity
              key={type}
              style={[styles.filterButton, selectedCrimeType === type && styles.filterButtonActive]}
              onPress={() => setSelectedCrimeType(type)}
            >
              <Text style={[styles.filterButtonText, selectedCrimeType === type && styles.filterButtonTextActive]}>
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        {loading ? (
          <ActivityIndicator size="large" color="#FFD700" />
        ) : (
          region && (
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={region}
              showsUserLocation
              zoomEnabled
              rotateEnabled={false}
            >
              {filteredCrimeData.map(crime => (
                <Marker
                  key={crime.incident_id}
                  coordinate={{ latitude: crime.latitude!, longitude: crime.longitude! }}
                  pinColor={getRiskColor(crime.Risk_Label)}
                  onPress={() => setSelectedCrime(crime)}
                >
                  <Callout>
                    <Text style={{ fontWeight: 'bold', fontFamily: 'JosefinSans-Medium' }}>{crime.crime_type}</Text>
                    <Text style={{ fontFamily: 'Raleway-Bold' }}>{crime.location}</Text>
                    <Text style={{ color: getRiskColor(crime.Risk_Label), fontFamily: 'Raleway-Bold' }}>
                      Risk: {crime.Risk_Label}
                    </Text>
                  </Callout>
                </Marker>
              ))}
              {hotspots.map(hotspot => (
                <Circle
                  key={hotspot.location}
                  center={hotspot.coords}
                  radius={hotspot.count * 100}
                  fillColor={getRiskColor(hotspot.avgRisk > 2.5 ? 'High' : hotspot.avgRisk > 1.5 ? 'Medium' : 'Low') + '40'}
                  strokeColor={getRiskColor(hotspot.avgRisk > 2.5 ? 'High' : hotspot.avgRisk > 1.5 ? 'Medium' : 'Low')}
                />
              ))}
              {userLocation && (
                <Circle
                  center={userLocation}
                  radius={50}
                  strokeColor={'rgba(0,122,255,0.4)'}
                  fillColor={'rgba(0,122,255,0.15)'}
                />
              )}
            </MapView>
          )
        )}
      </View>

      {/* Legend */}
      <View style={styles.legendContainer}>
        <Text style={styles.legendTitle}>Legend</Text>
        <View style={styles.legendRow}>
          <View style={[styles.legendColor, { backgroundColor: '#FF0000' }]} />
          <Text style={styles.legendText}>High Risk</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendColor, { backgroundColor: '#FFA500' }]} />
          <Text style={styles.legendText}>Medium Risk</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendColor, { backgroundColor: '#00FF00' }]} />
          <Text style={styles.legendText}>Low Risk</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendCircle, { borderColor: '#FF0000' }]} />
          <Text style={styles.legendText}>Hotspots</Text>
        </View>
      </View>

      {/* Selected Crime Detail */}
      {selectedCrime && (
        <View style={styles.bottomPanel}>
          <Text style={{ color: '#FFD700', fontFamily: 'JosefinSans-Medium' }}>{selectedCrime.crime_type}</Text>
          <Text style={{ color: '#A0A0A0', fontFamily: 'Raleway-Bold' }}>{selectedCrime.location} - {selectedCrime.sub_location}</Text>
          <Text style={{ color: getRiskColor(selectedCrime.Risk_Label), fontFamily: 'Raleway-Bold' }}>
            Risk: {selectedCrime.Risk_Label}
          </Text>
          <TouchableOpacity onPress={() => setSelectedCrime(null)}>
            <Text style={{ color: '#888', marginTop: 5 }}>Close</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E1E2F', paddingTop: 50, paddingHorizontal: 20 },
  title: { fontSize: 26, color: 'white', fontFamily: 'Raleway-Bold' },
  subtitle: { color: '#A0A0A0', marginBottom: 10, fontFamily: 'Raleway-Bold' },
  filterContainer: { 
    backgroundColor: '#303045', 
    padding: 10, 
    borderRadius: 10, 
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  filterLabel: { color: '#FFD700', marginBottom: 5, fontFamily: 'JosefinSans-Medium', fontSize: 18 },
  filterButton: {
    backgroundColor: '#1E1E2F',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    marginRight: 6,
  },
  filterButtonActive: { backgroundColor: '#FFD700' },
  filterButtonText: { color: '#A0A0A0', fontFamily: 'Raleway-Bold' },
  filterButtonTextActive: { color: '#1E1E2F',fontFamily: 'Raleway-Bold' },
  mapContainer: { flex: 1, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#FFD700', marginVertical: 10 },
  bottomPanel: {
    backgroundColor: '#2A2A3A',
    padding: 10,
    borderRadius: 8,
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },
  legendContainer: {
    backgroundColor: '#303045',
    padding: 10,
    borderRadius: 10,
    marginVertical: 10,
    flexDirection: 'column',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  legendTitle: {
    color: '#FFD700',
    fontSize: 16,
    marginRight: 10,
    fontFamily: 'JosefinSans-Medium',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 5,
  },
  legendCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: 'transparent',
    marginRight: 5,
  },
  legendText: {
    color: '#A0A0A0',
    fontSize: 13,
    fontFamily: 'Raleway-Bold',
  },
});
