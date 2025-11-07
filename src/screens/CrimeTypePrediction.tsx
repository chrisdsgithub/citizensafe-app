import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { predictCrimeType } from '../services/riskApi';

type Props = NativeStackScreenProps<RootStackParamList, 'CrimeTypePrediction'>;

const DARK_NAVY = '#1E1E2F';
const CARD_BG = '#303045';
const GOLD_ACCENT = '#FFD700';
const { width } = Dimensions.get('window');

// Crime type categories (11 types supported by model)
const CRIME_TYPES = [
  'Armed Robbery',
  'Arson',
  'Assault',
  'Burglary',
  'Cybercrime',
  'Fraud',
  'Kidnapping',
  'Murder',
  'Rape',
  'Theft',
  'Traffic Offense',
  'Vandalism'
];

// Part of day options
const PARTS_OF_DAY = ['Morning', 'Afternoon', 'Evening', 'Night'];

// Days of week (0 = Sunday, 6 = Saturday)
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function CrimeTypePrediction({ route }: Props) {
  // Form inputs
  const [description, setDescription] = useState(route.params?.description || '');
  const [location, setLocation] = useState(route.params?.location || '');
  const [subLocation, setSubLocation] = useState('');
  const [partOfDay, setPartOfDay] = useState('Afternoon');
  const [dayOfWeek, setDayOfWeek] = useState(new Date().getDay().toString());
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString());

  // UI state
  const [predicting, setPredicting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePredict = async () => {
    // Validation
    if (!description.trim()) {
      Alert.alert('Input Required', 'Please enter a crime description');
      return;
    }
    if (!location.trim()) {
      Alert.alert('Input Required', 'Please enter a location');
      return;
    }
    if (!subLocation.trim()) {
      Alert.alert('Input Required', 'Please enter a sub-location');
      return;
    }

    setPredicting(true);
    setError(null);
    setResult(null);

    try {
      const response = await predictCrimeType({
        description: description.trim(),
        location: location.trim(),
        sub_location: subLocation.trim(),
        part_of_day: partOfDay,
        day_of_week: parseInt(dayOfWeek),
        month: parseInt(month)
      });

      // Normalize response for the UI: prefer friendly override_label or detected_issue,
      // fall back to the model's crime_type. Do NOT expose numeric confidence here.
      const adapted = {
        ...response,
        label: response.override_label || response.detected_issue || response.crime_type || 'Unknown'
      };

      setResult(adapted);
    } catch (e: any) {
      const errorMsg = e.message || 'Failed to predict crime type';
      setError(errorMsg);
      Alert.alert('Prediction Error', errorMsg);
    } finally {
      setPredicting(false);
    }
  };

  const handleClear = () => {
    setDescription('');
    setLocation('');
    setSubLocation('');
    setPartOfDay('Afternoon');
    setDayOfWeek(new Date().getDay().toString());
    setMonth((new Date().getMonth() + 1).toString());
    setResult(null);
    setError(null);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Crime Type Prediction</Text>
        <Text style={styles.subtitle}>Classify incident using ML model</Text>
      </View>

      {/* Description Input */}
      <View style={styles.section}>
        <Text style={styles.label}>Crime Description *</Text>
        <TextInput
          style={[styles.input, { minHeight: 100 }]}
          placeholder="Describe the incident in detail..."
          placeholderTextColor="#888"
          value={description}
          onChangeText={setDescription}
          multiline
          editable={!predicting}
        />
      </View>

      {/* Location Input */}
      <View style={styles.section}>
        <Text style={styles.label}>Location (City/Area) *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Andheri West, Mumbai"
          placeholderTextColor="#888"
          value={location}
          onChangeText={setLocation}
          editable={!predicting}
        />
      </View>

      {/* Sub-Location Input */}
      <View style={styles.section}>
        <Text style={styles.label}>Sub-Location *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Railway Station, Main Road"
          placeholderTextColor="#888"
          value={subLocation}
          onChangeText={setSubLocation}
          editable={!predicting}
        />
      </View>

      {/* Part of Day Selection */}
      <View style={styles.section}>
        <Text style={styles.label}>Time of Day</Text>
        <View style={styles.optionsRow}>
          {PARTS_OF_DAY.map((period) => (
            <TouchableOpacity
              key={period}
              style={[
                styles.optionButton,
                partOfDay === period && styles.optionButtonActive
              ]}
              onPress={() => setPartOfDay(period)}
              disabled={predicting}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  partOfDay === period && styles.optionButtonTextActive
                ]}
              >
                {period}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Day of Week Selection */}
      <View style={styles.section}>
        <Text style={styles.label}>Day of Week</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalScroll}
        >
          <View style={styles.optionsRow}>
            {DAYS_OF_WEEK.map((day, index) => (
              <TouchableOpacity
                key={day}
                style={[
                  styles.optionButton,
                  styles.dayButton,
                  dayOfWeek === index.toString() && styles.optionButtonActive
                ]}
                onPress={() => setDayOfWeek(index.toString())}
                disabled={predicting}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    styles.dayButtonText,
                    dayOfWeek === index.toString() && styles.optionButtonTextActive
                  ]}
                >
                  {day.substring(0, 3)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Month Selection */}
      <View style={styles.section}>
        <Text style={styles.label}>Month</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalScroll}
        >
          <View style={styles.optionsRow}>
            {Array.from({ length: 12 }, (_, i) => (i + 1).toString()).map((m) => (
              <TouchableOpacity
                key={m}
                style={[
                  styles.optionButton,
                  styles.monthButton,
                  month === m && styles.optionButtonActive
                ]}
                onPress={() => setMonth(m)}
                disabled={predicting}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    month === m && styles.optionButtonTextActive
                  ]}
                >
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.predictButton]}
          onPress={handlePredict}
          disabled={predicting}
        >
          {predicting ? (
            <ActivityIndicator color={DARK_NAVY} size="small" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="search-outline" size={20} color={DARK_NAVY} style={{ marginRight: 8 }} />
              <Text style={styles.predictButtonText}>Predict Crime Type</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.clearButton]}
          onPress={handleClear}
          disabled={predicting}
        >
          <Text style={styles.clearButtonText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Error Display */}
      {error && (
        <View style={styles.errorBox}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="alert-circle" size={20} color="#E74C3C" style={{ marginRight: 8 }} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        </View>
      )}

      {/* Result Display */}
      {result && (
        <View style={styles.resultCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Ionicons name="checkmark-done-circle" size={24} color={GOLD_ACCENT} style={{ marginRight: 8 }} />
            <Text style={styles.resultTitle}>Prediction Result</Text>
          </View>

          {/* Crime Type Badge */}
          <View style={styles.resultBadge}>
            <Text style={styles.resultBadgeLabel}>Crime Type</Text>
            <Text style={styles.resultBadgeValue}>{result.label || 'Unknown'}</Text>
          </View>

          {/* Confidence Score removed from UI by design (server still uses it internally) */}

          {/* Reasoning */}
          {result.reasoning && (
            <View style={styles.resultItem}>
              <Text style={styles.resultItemLabel}>Reasoning</Text>
              <Text style={styles.resultItemValue}>{result.reasoning}</Text>
            </View>
          )}

          {/* Crime Type Reference */}
          <View style={styles.referenceBox}>
            <Text style={styles.referenceTitle}>Supported Crime Types:</Text>
            <View style={styles.crimeTypeList}>
              {CRIME_TYPES.map((type, index) => (
                <Text key={type} style={styles.crimeTypeItem}>
                  {index + 1}. {type}
                </Text>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Empty State */}
      {!result && !predicting && (
        <View style={styles.emptyState}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Ionicons name="information-circle" size={28} color={GOLD_ACCENT} style={{ marginRight: 8 }} />
            <Text style={styles.emptyStateTitle}>How It Works</Text>
          </View>
          <Text style={styles.emptyStateText}>
            1. Enter crime description and location{'\n'}
            2. Select time and date details{'\n'}
            3. Click "Predict" to classify the crime{'\n'}
            4. View the model's prediction with confidence score
          </Text>
        </View>
      )}

      {/* Info Box */}
      <View style={styles.infoBox}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Ionicons name="help-circle" size={20} color={GOLD_ACCENT} style={{ marginRight: 8, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Model Information</Text>
            <Text style={styles.infoText}>
              This model uses machine learning to classify crimes into 11 categories. Predictions are based on crime description, location, time, and date.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 30,
    backgroundColor: DARK_NAVY,
  },

  header: {
    marginBottom: 24,
    marginTop: 20,
  },

  title: {
    fontSize: 28,
    fontFamily: 'Raleway-Bold',
    color: GOLD_ACCENT,
  },

  subtitle: {
    fontSize: 14,
    fontFamily: 'JosefinSans-Medium',
    color: '#AAA',
  },

  section: {
    marginBottom: 20,
  },

  label: {
    fontSize: 14,
    fontFamily: 'Raleway-Bold',
    color: '#FFF',
    marginBottom: 8,
  },

  input: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: '#404050',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFF',
    fontFamily: 'JosefinSans-Medium',
    fontSize: 14,
  },

  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  horizontalScroll: {
    flexGrow: 0,
  },

  optionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: '#404050',
  },

  dayButton: {
    minWidth: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },

  monthButton: {
    minWidth: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  optionButtonActive: {
    backgroundColor: GOLD_ACCENT,
    borderColor: GOLD_ACCENT,
  },

  optionButtonText: {
    color: '#AAA',
    fontFamily: 'JosefinSans-Medium',
    fontSize: 12,
  },

  dayButtonText: {
    fontSize: 11,
  },

  optionButtonTextActive: {
    color: DARK_NAVY,
    fontWeight: 'bold',
  },

  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 20,
  },

  button: {
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },

  predictButton: {
    backgroundColor: GOLD_ACCENT,
    borderRadius: 10,
    paddingVertical: 14,
  },

  predictButtonText: {
    fontSize: 14,
    fontFamily: 'Raleway-Bold',
    color: DARK_NAVY,
  },

  clearButton: {
    backgroundColor: '#404050',
    paddingVertical: 12,
  },

  clearButtonText: {
    fontSize: 13,
    fontFamily: 'Raleway-Bold',
    color: '#AAA',
  },

  errorBox: {
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginVertical: 12,
  },

  errorText: {
    color: '#E74C3C',
    fontFamily: 'JosefinSans-Medium',
    fontSize: 13,
  },

  resultCard: {
    backgroundColor: CARD_BG,
    borderWidth: 2,
    borderColor: GOLD_ACCENT,
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
  },

  resultTitle: {
    fontSize: 16,
    fontFamily: 'Raleway-Bold',
    color: GOLD_ACCENT,
    marginBottom: 12,
  },

  resultBadge: {
    backgroundColor: DARK_NAVY,
    borderWidth: 2,
    borderColor: GOLD_ACCENT,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },

  resultBadgeLabel: {
    fontSize: 12,
    fontFamily: 'JosefinSans-Medium',
    color: '#AAA',
    marginBottom: 4,
  },

  resultBadgeValue: {
    fontSize: 18,
    fontFamily: 'Raleway-Bold',
    color: GOLD_ACCENT,
  },

  resultItem: {
    marginBottom: 12,
  },

  resultItemLabel: {
    fontSize: 12,
    fontFamily: 'JosefinSans-Medium',
    color: '#AAA',
    marginBottom: 4,
  },

  resultItemValue: {
    fontSize: 13,
    fontFamily: 'JosefinSans-Medium',
    color: '#FFF',
    lineHeight: 18,
  },

  confidenceContainer: {
    marginTop: 4,
  },

  progressBar: {
    height: 8,
    backgroundColor: '#1E1E2F',
    borderRadius: 4,
    marginTop: 4,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: GOLD_ACCENT,
  },

  referenceBox: {
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },

  referenceTitle: {
    fontSize: 12,
    fontFamily: 'Raleway-Bold',
    color: GOLD_ACCENT,
    marginBottom: 8,
  },

  crimeTypeList: {
    gap: 4,
  },

  crimeTypeItem: {
    fontSize: 11,
    fontFamily: 'JosefinSans-Medium',
    color: '#DDD',
    lineHeight: 16,
  },

  emptyState: {
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: 12,
    padding: 16,
    marginVertical: 20,
  },

  emptyStateTitle: {
    fontSize: 14,
    fontFamily: 'Raleway-Bold',
    color: GOLD_ACCENT,
    marginBottom: 8,
  },

  emptyStateText: {
    fontSize: 12,
    fontFamily: 'JosefinSans-Medium',
    color: '#AAA',
    lineHeight: 18,
  },

  infoBox: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: '#404050',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    marginBottom: 20,
  },

  infoTitle: {
    fontSize: 12,
    fontFamily: 'Raleway-Bold',
    color: GOLD_ACCENT,
    marginBottom: 6,
  },

  infoText: {
    fontSize: 12,
    fontFamily: 'JosefinSans-Medium',
    color: '#AAA',
    lineHeight: 16,
  },
});
