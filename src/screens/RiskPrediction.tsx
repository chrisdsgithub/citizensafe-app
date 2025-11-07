import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { auth } from '../../firebaseConfig';
import { RootStackParamList } from '../navigation/AppNavigator';
import { predictRisk } from '../services/riskApi';

type Props = NativeStackScreenProps<RootStackParamList, 'RiskPrediction'>;

export default function RiskPrediction({ route }: Props) {
  const [text, setText] = useState('');
  const [city, setCity] = useState('Unknown');
  const [time, setTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-populate report text if passed via navigation params
  useEffect(() => {
    if (route.params?.reportText) {
      setText(route.params.reportText);
    }
  }, [route.params?.reportText]);

  async function handlePredict() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const json = await predictRisk({ text, city, time_of_occurrence: time });
      setResult(json);
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Escalation Prediction</Text>

      <Text style={styles.label}>Report Text</Text>
      <TextInput style={styles.input} multiline value={text} onChangeText={setText} placeholder="Describe the incident" />

      <Text style={styles.label}>City</Text>
      <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="City" />

      <Text style={styles.label}>Time of Occurrence (DD-MM-YYYY HH:MM)</Text>
      <TextInput style={styles.input} value={time} onChangeText={setTime} placeholder="28-07-2024 22:05" />

      <TouchableOpacity style={styles.button} onPress={handlePredict} disabled={loading}>
        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Predict</Text>}
      </TouchableOpacity>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {result ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>Likelihood</Text>
          <Text style={styles.resultValue}>{result.label}</Text>

          <Text style={styles.resultLabel}>Confidence</Text>
          <Text style={styles.resultValue}>{Math.round(result.confidence * 100)}%</Text>

          <Text style={styles.resultLabel}>Reasoning</Text>
          <Text style={styles.resultText}>{result.reasoning}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#0F1720', flexGrow: 1 },
  heading: { color: '#FFD700', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  label: { color: '#FFF', marginTop: 8, marginBottom: 4 },
  input: { backgroundColor: '#1E1E2F', color: '#FFF', padding: 10, borderRadius: 8 },
  button: { backgroundColor: '#FFD700', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  buttonText: { color: '#000', fontWeight: '700' },
  resultBox: { backgroundColor: '#111', padding: 12, borderRadius: 8, marginTop: 16 },
  resultLabel: { color: '#AAA', fontSize: 12, marginTop: 8 },
  resultValue: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  resultText: { color: '#DDD', marginTop: 4 },
  error: { color: 'tomato', marginTop: 8 }
});
