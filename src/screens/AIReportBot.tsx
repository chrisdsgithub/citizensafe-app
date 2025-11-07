import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { AUTO_VERIFY_REPORT_ENDPOINT, PROCESS_NEW_REPORT_ENDPOINT } from '../config/api';
import CustomAlert from '../components/CustomAlert';

// --- Firebase Imports ---
import { auth, db } from '../../firebaseConfig'; 
import { collection, addDoc, serverTimestamp, doc as firestoreDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore'; 
import * as Location from 'expo-location';

type AIReportBotNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AIReportBot'>;

// --- Interfaces for Chat and API ---
interface ChatMessage {
  text: string;
  role: 'user' | 'model';
}

const BOT_INITIAL_MESSAGE: ChatMessage = {
  text: "Hello! I am your AI helper RoboBot. Please describe the incident in detail.",
  role: 'model',
};

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";
const API_KEY = "AIzaSyDyDmY-N_1P85LnMLkKORlOrUrXGPZhppc"; // NOTE: Ensure this is your valid Gemini API key

// --- Main AI Report Bot Component ---
export default function AIReportBot() {
  const navigation = useNavigation<AIReportBotNavigationProp>();
  const user = auth.currentUser;
  
  const [currentMessage, setCurrentMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([BOT_INITIAL_MESSAGE]);
  const [generatedSummary, setGeneratedSummary] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [attachedLocation, setAttachedLocation] = useState<{ latitude: number; longitude: number; city?: string } | null>(null);
  
  // Custom alert state
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    onClose?: () => void;
  }>({
    title: '',
    message: '',
    type: 'info',
  });

  const scrollViewRef = useRef<ScrollView>(null);

  // Helper function to show custom alerts
  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', onClose?: () => void) => {
    console.log(`🎯 showAlert called: [${type}] ${title}`);
    setAlertConfig({ title, message, type, onClose });
    setAlertVisible(true);
    console.log('✅ Alert visibility set to TRUE');
  };

  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [chatHistory]);

  const handleSendMessage = () => {
    if (!currentMessage.trim()) return;
    const newUserMessage: ChatMessage = { text: currentMessage.trim(), role: 'user' };
    setChatHistory(prev => [...prev, newUserMessage]);
    setCurrentMessage('');
    
    if (!generatedSummary) {
        setTimeout(() => {
            const botResponse: ChatMessage = { text: "Thank you, I've noted that. Tell me more, or hit 'GENERATE' when you are done.", role: 'model' };
            setChatHistory(prev => [...prev, botResponse]);
        }, 800);
    }
  };

  const handleGenerateSummary = async () => {
    if (isGenerating || chatHistory.length < 2) {
        Alert.alert("Input Needed", "Please type your message and press Send before generating the summary.");
        return;
    }
    
    setIsGenerating(true);
    setGeneratedSummary(null);

    try {
      const fullPrompt = chatHistory
        .map(msg => `${msg.role === 'user' ? 'WITNESS' : 'ROBOBOT'}: ${msg.text}`)
        .join('\n');
        
      const systemInstruction = `You are a highly professional police report summarization AI. Your goal is to provide a complete, factual, and objective summary for a police internal document.
      1. Analyze the full conversation history.
      2. Extract all critical details: **Type of Crime, Location (if mentioned), Time/Date (if mentioned), Suspect Description, and the Witness's full account.**
      3. Generate a single, formal, detailed summary that is at least 80 words long (unless the input data is extremely sparse).
      4. **Do not use placeholders.** If something is missing, say it's unknown.`;

      const payload = {
        contents: [{ parts: [{ text: fullPrompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
      };

      const response = await fetch(GEMINI_API_URL + API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API call failed: ${response.status} - ${errorData.error.message}`);
      }

      const result = await response.json();
      const summary = result.candidates?.[0]?.content?.parts?.[0]?.text || "Failed to generate summary. Please try adding more detail.";
      
      setGeneratedSummary(summary);
      Alert.alert("Summary Ready", "The AI summary has been generated for review.");

    } catch (error) {
      console.error("Gemini Generation Error:", error);
      const errorMessage = (error as Error).message || "Unknown error during AI generation.";
      Alert.alert("AI Error", `Failed to generate report: ${errorMessage}`);
      setGeneratedSummary(null);
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleSubmitReport = async () => { 
      if (!user) {
          Alert.alert("Error", "You must be logged in to submit a report.");
          return;
      }
      if (!generatedSummary) {
          Alert.alert("Error", "Please generate and review the summary before submitting.");
          return;
      }

      try {
      // Check user credibility BEFORE submitting
      const userDoc = await getDoc(firestoreDoc(db, 'users', user.uid));
      const userCredibility = userDoc.exists() ? userDoc.get('credibilityScore') || 100 : 100;
      
      if (userCredibility <= 0) {
        showAlert(
          "Account Suspended",
          "Your credibility score has reached 0 due to multiple fake reports. You are temporarily blocked from submitting new reports. Please contact support to restore your account.",
          'error'
        );
        return;
      }
      
      // FIRST: Verify the report with backend BEFORE saving to Firestore
      let verificationResult: any = null;
      try {
        console.log('🔍 Verifying AI report with backend before saving...');
        const verificationResponse = await fetch(AUTO_VERIFY_REPORT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            report_id: 'pre-verification',
            report_text: generatedSummary,
            location: attachedLocation?.city || 'AI Generated Report',
            time_of_occurrence: new Date().toISOString(),
            user_id: user.uid
          })
        });

        if (verificationResponse.ok) {
          verificationResult = await verificationResponse.json();
          console.log('✅ Pre-verification result:', verificationResult);
          
          if (verificationResult.is_fake) {
            console.log('🚨 FAKE REPORT DETECTED - Not saving to Firestore');
            
            const credibilityInfo = verificationResult.credibility_change !== undefined
              ? `\n\n⚠️ Your credibility score: ${verificationResult.old_credibility_score} → ${verificationResult.new_credibility_score} (${verificationResult.credibility_change > 0 ? '+' : ''}${verificationResult.credibility_change})`
              : '';
            
            showAlert(
              "Report Flagged",
              `Your report has been flagged as potentially inauthentic and will not be posted to the crime feed.\n\nReason: ${verificationResult.reasoning}${credibilityInfo}`,
              'error',
              () => navigation.goBack()
            );
            return; // Stop - DO NOT save to Firestore
          }
          
          // Report is GENUINE - NOW save to Firestore
          console.log('✅ Report is genuine, saving to Firestore...');
          const finalReport = {
            userId: user.uid,
            description: generatedSummary,
            fullChatHistory: JSON.stringify(chatHistory),
            location: attachedLocation ? { latitude: attachedLocation.latitude, longitude: attachedLocation.longitude, city: attachedLocation.city || 'User Provided' } : { latitude: 0, longitude: 0, city: "AI Generated Report" },
            mediaUrl: null,
            timestamp: serverTimestamp(),
            reportType: 'AI_Summary',
            status: 'Pending',
            postedByUserId: user.uid,
            userName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
            is_fake: false,
            verification_confidence: verificationResult.confidence,
            verification_reasoning: verificationResult.reasoning,
            verified_at: serverTimestamp(),
          };

          const docRef = await addDoc(collection(db, 'reports'), finalReport);
          const reportId = docRef.id;
          console.log('✅ Report saved to Firestore:', reportId);
          
          // Send to crime prediction
          console.log('✅ Sending to crime prediction...');
          try {
            const predictionResponse = await fetch('http://192.168.29.169:8080/predict-crime-type', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: generatedSummary,
                location: attachedLocation?.city || 'AI Generated Report',
                sub_location: attachedLocation?.city || 'Unknown',
                part_of_day: 'Afternoon',
                day_of_week: new Date().getDay(),
                month: new Date().getMonth() + 1
              })
            });

            if (predictionResponse.ok) {
              const predictionResult = await predictionResponse.json();
              console.log('✅ Crime prediction result:', predictionResult);
            }
          } catch (predictionError) {
            console.warn('⚠️ Could not run crime prediction:', predictionError);
          }

          // Trigger server-side processing
          try {
            await fetch(PROCESS_NEW_REPORT_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ report_id: reportId })
            });
          } catch (procErr) {
            console.warn('⚠️ Could not trigger process-new-report:', procErr);
          }
          
          // Show success
          const credibilityInfo = verificationResult?.credibility_change !== undefined && verificationResult.credibility_change > 0
            ? `\n\n✅ Your credibility increased: +${verificationResult.credibility_change} points!`
            : '';
          
          showAlert(
            'Success',
            `AI-generated report posted successfully!${credibilityInfo}`,
            'success',
            () => navigation.goBack()
          );
        } else {
          throw new Error('Verification failed');
        }
      } catch (verificationError: any) {
        console.warn('⚠️ Verification error:', verificationError);
        
        // Check if blocked due to low credibility
        if (verificationError.message?.includes('403') || verificationError.toString().includes('403')) {
          showAlert(
            "Account Suspended",
            "Your credibility score has reached 0. You cannot submit reports.",
            'error',
            () => navigation.goBack()
          );
          return;
        }
        
        // Other errors
        showAlert(
          'Verification Failed',
          'Could not verify your report. Please try again.',
          'error'
        );
        return;
            
            // Check if blocked due to low credibility
            if (verificationError.message?.includes('CREDIBILITY_TOO_LOW') || verificationError.status === 403) {
              showAlert(
                "Account Suspended",
                "Your credibility score has reached 0 due to multiple fake reports. You are temporarily blocked from submitting new reports. Please contact support to restore your account.",
                'error',
                () => navigation.goBack()
              );
              return;
            }
            // Continue even if verification fails - report is already submitted
          }

          const credibilityInfo = verificationResult?.credibility_change !== undefined && verificationResult.credibility_change > 0
            ? `\n\n✅ Your credibility increased: +${verificationResult.credibility_change} points!`
            : '';

          showAlert(
            "Report Submitted",
            `The summarized report has been sent to the feed and is ready for police review!${credibilityInfo}`,
            'success',
            () => {
              setChatHistory([BOT_INITIAL_MESSAGE]);
              setGeneratedSummary(null);
              navigation.goBack();
            }
          );

      } catch (error: any) {
          console.error("Report Submission Failed:", error.code, error.message);
          showAlert(
            "Submission Error",
            "Failed to save the report to the database. Please check your network connection and try again.",
            'error'
          );
      }
  }

  // Attach current device location (optional)
  const handleAttachLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required to attach location.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      // Minimal reverse-geocoding isn't necessary; we'll set city placeholder
      setAttachedLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, city: 'User Location' });
      Alert.alert('Location Attached', `Attached location: ${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`);
    } catch (e) {
      console.error('Attach location failed', e);
      Alert.alert('Error', 'Could not attach location.');
    }
  };

  const ChatBubble = ({ message }: { message: ChatMessage }) => (
    <View style={[
      chatStyles.bubbleContainer,
      message.role === 'user' ? chatStyles.userContainer : chatStyles.modelContainer,
    ]}>
      <View style={chatStyles.iconPlaceholder}>
        <Text style={chatStyles.iconText}>{message.role === 'user' ? '👤' : '🤖'}</Text>
      </View>
      <View style={chatStyles.textContainer}>
        <Text style={chatStyles.text}>{message.text}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.fullScreenScroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.container}>
        <Image
          source={require('../../assets/images/bg_img.png')}
          style={styles.backgroundImage}
        />
        
        {/* --- UPDATED HEADER --- */}
        <View style={styles.curvedHeaderBox}>
          <Text style={[styles.title, { textAlign: 'center' }]}>
            File <Text style={{ color: '#FFD700' }}>Incident</Text> Report
          </Text>
          <Text style={[styles.subtitle, { textAlign: 'center' }]}>
            Describe your experience to our AI assistant.
          </Text>
        </View>

        {/* --- 1. Conversational Report Card --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Conversational Report</Text>
          <Text style={styles.cardSubtitle}>Talk to our AI helper RoboBot.</Text>

          <ScrollView 
            ref={scrollViewRef}
            style={styles.chatHistory}
            contentContainerStyle={{ paddingBottom: 10 }}
          >
            {chatHistory.map((msg, index) => (
              <ChatBubble key={index} message={msg} />
            ))}
          </ScrollView>

          <View style={styles.inputArea}>
            <TextInput
              style={styles.textInput}
              placeholder="Type your message..."
              placeholderTextColor="#A0A0A0"
              value={currentMessage}
              onChangeText={setCurrentMessage}
              onSubmitEditing={handleSendMessage}
              blurOnSubmit={false}
            />
            <TouchableOpacity 
              style={styles.sendButton} 
              onPress={handleSendMessage}
              disabled={!currentMessage.trim()}
            >
              <Text style={styles.sendIcon}>➤</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity 
            style={styles.generateButton} 
            onPress={handleGenerateSummary}
            disabled={isGenerating || chatHistory.length === 1}
          >
            {isGenerating ? (
              <ActivityIndicator color="#1E1E2F" />
            ) : (
              <Text style={styles.generateButtonText}>GENERATE</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* --- 2. Generated Report Summary Card --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Generated Report Summary</Text>
          <Text style={styles.cardSubtitle}>Please review the summary. Once filled, cannot be changed</Text>
          
          <View style={styles.summaryBox}>
            {isGenerating ? (
              <ActivityIndicator size="small" color="#FFD700" />
            ) : (
              <Text style={styles.summaryText}>
                {generatedSummary || "Summary will appear here after you press GENERATE."}
              </Text>
            )}
          </View>

          <TouchableOpacity 
            style={[styles.submitButton, !generatedSummary && styles.submitButtonDisabled]}
            onPress={handleSubmitReport}
            disabled={!generatedSummary}
          >
            <Text style={styles.submitButtonText}>SUBMIT</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <TouchableOpacity style={[styles.generateButton, { flex: 1 }]} onPress={handleAttachLocation}>
              <Text style={styles.generateButtonText}>Attach Location</Text>
            </TouchableOpacity>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-start' }}>
              <Text style={{ color: '#A0A0A0' }}>{attachedLocation ? `${attachedLocation.latitude.toFixed(4)}, ${attachedLocation.longitude.toFixed(4)}` : 'No location attached'}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Custom Alert Modal */}
      <CustomAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => {
          setAlertVisible(false);
          if (alertConfig.onClose) {
            alertConfig.onClose();
          }
        }}
      />
    </ScrollView>
  );
}


// --- Chat Bubble Styles ---
const chatStyles = StyleSheet.create({
  bubbleContainer: {
    flexDirection: 'row',
    maxWidth: '80%',
    marginVertical: 5,
  },
  userContainer: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  modelContainer: {
    alignSelf: 'flex-start',
  },
  iconPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  iconText: {
    fontSize: 18,
  },
  textContainer: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
  },
  text: {
    color: 'white',
    fontFamily: 'JosefinSans-Medium',
    fontSize: 14,
  }
});


// --- Screen Styles ---
const styles = StyleSheet.create({
  // FIX 1: Allow full screen scrolling
  fullScreenScroll: {
      flex: 1,
      backgroundColor: '#1E1E2F',
  },
  // FIX: Increased paddingBottom to accommodate bottom navigation/safe area
  scrollContent: {
      flexGrow: 1,
      paddingBottom: 100, 
  },
  container: {
    flex: 1,
    // Removed paddingTop: 50 from here
  },
  backgroundImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    opacity: 0.2,
  },
  // --- NEW CURVED HEADER BOX STYLES ---
  curvedHeaderBox: {
    backgroundColor: '#041330', 
    paddingBottom: 40, // Extra padding inside the box
    marginTop: 0, 
    marginBottom: 20,
    borderBottomLeftRadius: 50, 
    borderBottomRightRadius: 50,
    overflow: 'hidden', 
    elevation: 5, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  headerContent: {
      // FIX: Ensure content starts below the status bar
      paddingTop: 100, 
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      marginBottom: 10,
  },
  // --- END NEW STYLES ---
  menuIcon: {
    fontSize: 28,
    color: 'white',
  },
  bellIcon: {
    fontSize: 28,
    color: '#FFD700',
  },
  title: {
    fontSize: 32,
    paddingTop: 90,
    fontFamily: 'Raleway-Bold',
    color: 'white',
    paddingHorizontal: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: 'white', // Changed to white for better contrast
    fontFamily: 'JosefinSans-Medium',
    paddingHorizontal: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  
  // Card Styles
  card: {
    backgroundColor: '#145b97',
    borderRadius: 16,
    padding: 15,
    marginHorizontal: 20,
    marginBottom: 20,
    borderColor: '#e1e1f4ff',
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 20,
    fontFamily: 'Raleway-Bold',
    color: '#FFD700',
  },
  cardSubtitle: {
    fontSize: 12,
    color: 'white',
    fontFamily: 'JosefinSans-Medium',
    marginBottom: 10,
  },
  
  // Chat Area Styles
  chatHistory: {
    height: 180,
    backgroundColor: '#0b275d',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#eaf6ff',
    borderRadius: 20,
    paddingHorizontal: 15,
    marginRight: 10,
    color: 'black',
    fontFamily: 'JosefinSans-Medium',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    fontSize: 20,
    transform: [{ rotate: '-45deg' }],
  },
  generateButton: {
    backgroundColor: '#FFD700',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  generateButtonText: {
    color: '#1E1E2F',
    fontFamily: 'Raleway-Bold',
    fontSize: 16,
  },
  
  // Summary Area Styles
  summaryBox: {
    minHeight: 80,
    backgroundColor: '#1E1E2F',
    borderRadius: 8,
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryText: {
    color: 'white',
    fontFamily: 'JosefinSans-Medium',
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: '#FFD700',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#A0A0A0', // Gray out when disabled
  },
  submitButtonText: {
    color: '#1E1E2F',
    fontFamily: 'Raleway-Bold',
    fontSize: 18,
  }
});