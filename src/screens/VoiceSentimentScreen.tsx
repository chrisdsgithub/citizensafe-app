import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Platform } from 'react-native';
import { analyzeVoiceSentiment, pickAudioFile } from '../services/voiceApi';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';

// --- Constants ---
const DARK_NAVY = '#1E1E2F';
const CARD_BG = '#303045';
const GOLD_ACCENT = '#FFD700';
const INACTIVE_GRAY = '#A0A0A0';
const DANGER_RED = '#FF4D4F';
const SUCCESS_GREEN = '#4CAF50';
const WARNING_ORANGE = '#FFA726';

// --- Helper function to get emotion color ---
const getEmotionColor = (emotion: string): string => {
    switch (emotion.toLowerCase()) {
        case 'angry':
            return '#FF4D4F';
        case 'happy':
            return '#4CAF50';
        case 'sad':
            return '#1890FF';
        case 'fearful':
            return '#FFA726';
        case 'surprised':
            return '#FFD700';
        case 'neutral':
            return '#A0A0A0';
        case 'calm':
            return '#52C41A';
        case 'disgust':
            return '#FF7A45';
        default:
            return '#FFD700';
    }
};

export default function VoiceSentimentScreen() {
    const [audioFile, setAudioFile] = useState<{ uri: string; name: string; size: number } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<{
        sentiment: string;
        risk_level: string;
        confidence?: number;
        emotion_details?: {
            angry?: number;
            calm?: number;
            disgust?: number;
            fearful?: number;
            happy?: number;
            neutral?: number;
            sad?: number;
            surprised?: number;
        };
        audio_features?: {
            energy?: number;
            zcr?: number;
            spectral_centroid?: number;
            mfcc_variance?: number;
            tempogram?: number;
        };
    } | null>(null);

    // Cleanup sound on unmount
    useEffect(() => {
        return sound
            ? () => {
                console.log('Unloading Sound');
                sound.unloadAsync();
            }
            : undefined;
    }, [sound]);

    const playPauseAudio = async () => {
        if (!audioFile) {
            Alert.alert('Error', 'No audio file to play');
            return;
        }

        try {
            if (sound) {
                // If sound exists, toggle play/pause
                const status = await sound.getStatusAsync();
                if (status.isLoaded) {
                    if (isPlaying) {
                        await sound.pauseAsync();
                        setIsPlaying(false);
                    } else {
                        await sound.playAsync();
                        setIsPlaying(true);
                    }
                }
            } else {
                // Load and play new sound
                console.log('Loading Sound');
                const { sound: newSound } = await Audio.Sound.createAsync(
                    { uri: audioFile.uri },
                    { shouldPlay: true }
                );
                setSound(newSound);
                setIsPlaying(true);

                // Listen for playback finish
                newSound.setOnPlaybackStatusUpdate((status) => {
                    if (status.isLoaded && status.didJustFinish) {
                        setIsPlaying(false);
                    }
                });
            }
        } catch (error) {
            console.error('Error playing audio:', error);
            Alert.alert('Playback Error', 'Failed to play audio file');
        }
    };

    const stopAudio = async () => {
        if (sound) {
            try {
                await sound.stopAsync();
                await sound.unloadAsync();
                setSound(null);
                setIsPlaying(false);
            } catch (error) {
                console.error('Error stopping audio:', error);
            }
        }
    };

    const handleUploadAudio = async () => {
        try {
            setIsLoading(true);
            // Stop any playing audio
            await stopAudio();
            
            const file = await pickAudioFile();
            if (file) {
                setAudioFile(file);
                setAnalysisResult(null);
                Alert.alert('Success', `Audio file selected: ${file.name}`);
            }
        } catch (e) {
            console.error('Error picking audio file:', e);
            Alert.alert('Error', 'Failed to pick audio file');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnalyze = async () => {
        if (!audioFile) {
            Alert.alert('Error', 'Please upload an audio file first.');
            return;
        }
        
        setIsLoading(true);
        setAnalysisResult(null);

        try {
            const result = await analyzeVoiceSentiment(audioFile.uri);
            
            // Store ALL data from the backend response
            setAnalysisResult({
                sentiment: result.sentiment || 'Unknown',
                risk_level: result.risk_level || 'Unknown',
                confidence: result.confidence,
                emotion_details: result.emotion_details,
                audio_features: result.audio_features,
            });
            
            // Just log, no popup alert
            console.log('✅ Analysis complete:', result.sentiment, result.risk_level);
        } catch (error) {
            console.error('Voice analysis error:', error);
            Alert.alert('Analysis Error', `${(error as Error).message || 'Failed to analyze voice'}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>Voice Sentiment Analysis</Text>

                <View style={styles.cardContainer}>
                    {/* Left Card: Audio Upload */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Voice Analysis</Text>
                        <Text style={styles.cardSubtitle}>
                            Upload an audio file (e.g., from an emergency call) to analyze the speaker's emotional state.
                        </Text>
                        
                        <TouchableOpacity style={styles.uploadArea} onPress={handleUploadAudio} disabled={isLoading}>
                            <Ionicons name="cloud-upload" size={50} color={audioFile ? GOLD_ACCENT : INACTIVE_GRAY} />
                            <Text style={[styles.uploadText, audioFile && { color: 'white' }]}>
                                {audioFile ? `✓ ${audioFile.name}` : 'Click to upload audio (WAV, MP3, or OGG)'}
                            </Text>
                            {audioFile && (
                                <Text style={styles.fileSizeText}>{(audioFile.size / 1024).toFixed(2)} KB</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={[styles.analyzeButton, (!audioFile || isLoading) && styles.analyzeButtonDisabled]} 
                            onPress={handleAnalyze} 
                            disabled={isLoading || !audioFile}
                        >
                            {isLoading ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <ActivityIndicator color={DARK_NAVY} />
                                    <Text style={styles.analyzeButtonText}>Analyzing...</Text>
                                </View>
                            ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <Ionicons name="analytics" size={20} color={DARK_NAVY} />
                                    <Text style={styles.analyzeButtonText}>Analyze Voice Sentiment</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Right Card: Analysis Result */}
                    <View style={styles.card}>
                         <Text style={styles.cardTitle}>AI Analysis Result</Text>
                         {analysisResult ? (
                            <ScrollView style={styles.resultContainer}>
                                {/* Main Sentiment Display */}
                                <View style={styles.sentimentHeader}>
                                    <Ionicons 
                                        name={
                                            analysisResult.sentiment === 'Negative' ? 'sad' :
                                            analysisResult.sentiment === 'Positive' ? 'happy' :
                                            'remove-circle'
                                        }
                                        size={50}
                                        color={
                                            analysisResult.sentiment === 'Negative' ? DANGER_RED :
                                            analysisResult.sentiment === 'Positive' ? SUCCESS_GREEN :
                                            WARNING_ORANGE
                                        }
                                    />
                                    <Text style={styles.sentimentText}>{analysisResult.sentiment}</Text>
                                </View>

                                {/* Risk Level Badge */}
                                <View style={[
                                    styles.riskBadge,
                                    { backgroundColor: 
                                        analysisResult.risk_level === 'High Risk' ? 'rgba(255, 77, 79, 0.2)' :
                                        analysisResult.risk_level === 'Medium Risk' ? 'rgba(255, 167, 38, 0.2)' :
                                        'rgba(76, 175, 80, 0.2)'
                                    }
                                ]}>
                                    <Ionicons 
                                        name={
                                            analysisResult.risk_level === 'High Risk' ? 'warning' :
                                            analysisResult.risk_level === 'Medium Risk' ? 'alert-circle' :
                                            'shield-checkmark'
                                        }
                                        size={20}
                                        color={
                                            analysisResult.risk_level === 'High Risk' ? DANGER_RED :
                                            analysisResult.risk_level === 'Medium Risk' ? WARNING_ORANGE :
                                            SUCCESS_GREEN
                                        }
                                    />
                                    <Text style={[
                                        styles.riskText,
                                        { color:
                                            analysisResult.risk_level === 'High Risk' ? DANGER_RED :
                                            analysisResult.risk_level === 'Medium Risk' ? WARNING_ORANGE :
                                            SUCCESS_GREEN
                                        }
                                    ]}>
                                        {analysisResult.risk_level}
                                    </Text>
                                </View>

                                {/* Emotion Breakdown */}
                                {analysisResult.emotion_details && Object.keys(analysisResult.emotion_details).length > 0 && (
                                    <View style={styles.emotionSection}>
                                        <Text style={styles.sectionTitle}>
                                            <Ionicons name="happy" size={16} color={GOLD_ACCENT} /> Emotion Breakdown
                                        </Text>
                                        <View style={styles.emotionBars}>
                                            {Object.entries(analysisResult.emotion_details).map(([emotion, score]: [string, any]) => (
                                                <View key={emotion} style={styles.emotionBarContainer}>
                                                    <View style={styles.emotionLabelRow}>
                                                        <Text style={styles.emotionLabel}>
                                                            {emotion.charAt(0).toUpperCase() + emotion.slice(1)}
                                                        </Text>
                                                        <Text style={styles.emotionPercentage}>
                                                            {(score * 100).toFixed(1)}%
                                                        </Text>
                                                    </View>
                                                    <View style={styles.progressBarBg}>
                                                        <View
                                                            style={[
                                                                styles.progressBarFill,
                                                                {
                                                                    width: `${Math.min(score * 100, 100)}%`,
                                                                    backgroundColor: getEmotionColor(emotion),
                                                                }
                                                            ]}
                                                        />
                                                    </View>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                )}

                                {/* Audio Playback Controls */}
                                {audioFile && (
                                    <View style={styles.audioPlayerSection}>
                                        <Text style={styles.sectionTitle}>
                                            <Ionicons name="musical-note" size={16} color={GOLD_ACCENT} /> Audio Playback
                                        </Text>
                                        <View style={styles.audioControls}>
                                            <TouchableOpacity 
                                                style={styles.audioButton}
                                                onPress={playPauseAudio}
                                            >
                                                <Ionicons 
                                                    name={isPlaying ? "pause-circle" : "play-circle"} 
                                                    size={48} 
                                                    color={GOLD_ACCENT} 
                                                />
                                                <Text style={styles.audioButtonText}>
                                                    {isPlaying ? 'Pause' : 'Play'}
                                                </Text>
                                            </TouchableOpacity>
                                            
                                            {sound && (
                                                <TouchableOpacity 
                                                    style={styles.audioButton}
                                                    onPress={stopAudio}
                                                >
                                                    <Ionicons 
                                                        name="stop-circle" 
                                                        size={48} 
                                                        color={DANGER_RED} 
                                                    />
                                                    <Text style={styles.audioButtonText}>
                                                        Stop
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        <Text style={styles.audioFileName}>
                                            <Ionicons name="document-text" size={14} color={INACTIVE_GRAY} /> {audioFile.name}
                                        </Text>
                                    </View>
                                )}

                                {/* Analysis Description */}
                                <View style={styles.descriptionBox}>
                                    <Ionicons name="information-circle" size={18} color={GOLD_ACCENT} />
                                    <Text style={styles.descriptionText}>
                                        {analysisResult.sentiment === 'Negative' 
                                            ? 'Voice analysis indicates distress, fear, or anger. This report may require immediate attention.'
                                            : analysisResult.sentiment === 'Positive'
                                            ? 'Voice analysis indicates calm, confident, or positive emotional state.'
                                            : 'Voice analysis shows neutral emotional state with balanced characteristics.'}
                                    </Text>
                                </View>
                            </ScrollView>
                         ) : (
                            <View style={styles.emptyResult}>
                                <Ionicons name="mic" size={60} color={INACTIVE_GRAY} />
                                <Text style={styles.emptyResultText}>Analysis results will appear here.</Text>
                                <Text style={styles.emptyResultSubtext}>
                                    Using CNN + BiLSTM + Attention model trained on RAVDESS, CREMA-D, and TESS datasets
                                </Text>
                            </View>
                         )}
                    </View>
                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: DARK_NAVY },
    scrollContent: { padding: 20, flexGrow: 1 },
    title: { 
        fontSize: 34, 
        marginTop: 60,
        fontFamily: 'Raleway-Bold', 
        color: 'white', 
        marginBottom: 20, 
    },
    cardContainer: {
        flexDirection: Platform.OS === 'web' ? 'row' : 'column',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
    },
    card: {
        backgroundColor: CARD_BG,
        borderRadius: 10,
        padding: 20,
        marginBottom: 20,
        width: Platform.OS === 'web' ? '48%' : '100%',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        minHeight: 400,
    },
    cardTitle: {
        fontSize: 20,
        fontFamily: 'Raleway-Bold',
        color: GOLD_ACCENT,
        marginBottom: 5,
    },
    cardSubtitle: {
        fontSize: 14,
        fontFamily: 'JosefinSans-Medium',
        color: INACTIVE_GRAY,
        marginBottom: 20,
    },
    // Upload Styles
    uploadArea: {
        backgroundColor: DARK_NAVY,
        borderWidth: 2,
        borderColor: GOLD_ACCENT + '60',
        borderStyle: 'dashed',
        borderRadius: 10,
        padding: 30,
        alignItems: 'center',
        marginBottom: 20,
        minHeight: 150,
        justifyContent: 'center',
    },
    uploadIcon: {
        fontSize: 40,
        color: INACTIVE_GRAY,
        marginBottom: 10,
    },
    uploadText: {
        color: INACTIVE_GRAY,
        fontFamily: 'JosefinSans-Medium',
        textAlign: 'center',
    },
    analyzeButton: {
        backgroundColor: GOLD_ACCENT,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    analyzeButtonText: {
        color: DARK_NAVY,
        fontFamily: 'Raleway-Bold',
        fontSize: 16,
    },
    // Result Styles
    emptyResult: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    micIcon: {
        fontSize: 60,
        marginBottom: 15,
        color: INACTIVE_GRAY,
    },
    emptyResultText: {
        color: INACTIVE_GRAY,
        fontFamily: 'JosefinSans-Medium',
        textAlign: 'center',
    },
    resultContainer: {
        marginTop: 10,
    },
    resultHeader: {
        fontSize: 14,
        fontFamily: 'JosefinSans-Medium',
        color: INACTIVE_GRAY,
        marginBottom: 15,
    },
    resultLabel: {
        fontSize: 12,
        fontFamily: 'Raleway-Bold',
        color: GOLD_ACCENT,
        marginTop: 10,
    },
    resultValue: {
        fontSize: 16,
        fontFamily: 'JosefinSans-Medium',
        color: 'white',
    },
    transcriptText: {
        fontSize: 14,
        fontFamily: 'JosefinSans-Medium',
        color: 'white',
        marginTop: 5,
        borderLeftColor: GOLD_ACCENT,
        borderLeftWidth: 3,
        paddingLeft: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        paddingVertical: 5,
        borderRadius: 4,
    },
    fileSizeText: {
        fontSize: 12,
        fontFamily: 'JosefinSans-Medium',
        color: INACTIVE_GRAY,
        marginTop: 5,
    },
    analyzeButtonDisabled: {
        opacity: 0.5,
    },
    // Sentiment Display
    sentimentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 15,
        marginBottom: 20,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    sentimentText: {
        fontSize: 28,
        fontFamily: 'Raleway-Bold',
        color: 'white',
    },
    riskBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: 8,
        marginBottom: 20,
        justifyContent: 'center',
    },
    riskText: {
        fontSize: 16,
        fontFamily: 'Raleway-Bold',
    },
    sectionTitle: {
        fontSize: 16,
        fontFamily: 'Raleway-Bold',
        color: GOLD_ACCENT,
        marginBottom: 15,
    },
    descriptionBox: {
        flexDirection: 'row',
        gap: 10,
        backgroundColor: 'rgba(255, 215, 0, 0.1)',
        borderRadius: 8,
        padding: 15,
        borderLeftWidth: 3,
        borderLeftColor: GOLD_ACCENT,
    },
    descriptionText: {
        flex: 1,
        fontSize: 13,
        fontFamily: 'JosefinSans-Medium',
        color: 'white',
        lineHeight: 20,
    },
    emptyResultSubtext: {
        fontSize: 11,
        fontFamily: 'JosefinSans-Medium',
        color: INACTIVE_GRAY,
        textAlign: 'center',
        marginTop: 10,
        lineHeight: 16,
    },
    // Emotion Breakdown
    emotionSection: {
        marginBottom: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 8,
        padding: 15,
        borderWidth: 1,
        borderColor: 'rgba(255, 215, 0, 0.3)',
    },
    emotionBars: {
        gap: 12,
    },
    emotionBarContainer: {
        marginBottom: 8,
    },
    emotionLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    emotionLabel: {
        fontSize: 13,
        fontFamily: 'JosefinSans-Medium',
        color: 'white',
    },
    emotionPercentage: {
        fontSize: 13,
        fontFamily: 'Raleway-Bold',
        color: 'white',
    },
    progressBarBg: {
        height: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 4,
        minWidth: 2,
    },
    // Audio Player
    audioPlayerSection: {
        marginBottom: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 8,
        padding: 15,
        borderWidth: 1,
        borderColor: 'rgba(255, 215, 0, 0.2)',
    },
    audioControls: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 30,
        marginVertical: 10,
    },
    audioButton: {
        alignItems: 'center',
        gap: 8,
    },
    audioButtonText: {
        fontSize: 13,
        fontFamily: 'JosefinSans-Medium',
        color: 'white',
    },
    audioFileName: {
        fontSize: 12,
        fontFamily: 'JosefinSans-Medium',
        color: INACTIVE_GRAY,
        textAlign: 'center',
        marginTop: 5,
    },
});