import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Platform, FlatList, Modal, ActivityIndicator, Dimensions, KeyboardAvoidingView, Image, Linking } from 'react-native';
// NEW IMPORTS: Required for image upload and location tracking
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { auth, db, storage } from '../../firebaseConfig'; // Ensure 'storage' is imported
import { collection, query, orderBy, onSnapshot, doc, getDoc, addDoc, serverTimestamp, where, updateDoc, getDocs, arrayRemove, deleteDoc } from 'firebase/firestore'; 
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; // Storage functions

// --- Constants ---
const DARK_NAVY = '#1E1E2F';
const CARD_BG = '#303045';
const GOLD_ACCENT = '#eace2dff';
const INACTIVE_GRAY = '#A0A0A0';
const DANGER_RED = '#E74C3C';
const { width } = Dimensions.get('window');

// --- Interfaces (Unchanged) ---
interface Case {
    id: string;
    title: string;
    caseId: string; // e.g., CASE-0123
    newMessages: number;
    members: string[]; // List of UIDs who can access this chat
    createdBy: string; // The UID of the officer who created the case
}

interface Message {
    id: string;
    text: string;
    userId: string;
    userName: string;
    createdAt: Date;
    // Future fields for media
    mediaUrl?: string; 
    location?: { lat: number, lng: number };
}

interface Officer {
    uid: string;
    fullName: string;
}


// --- Message Bubble Component (Enhanced with Media & Interactive Location Map) ---
const MessageBubble = ({ message, currentUserId }: { message: Message, currentUserId: string }) => {
    const isCurrentUser = message.userId === currentUserId;
    const time = message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const [locationModalVisible, setLocationModalVisible] = useState(false);

    return (
        <>
            <View style={[chatStyles.messageContainer, isCurrentUser ? chatStyles.messageRight : chatStyles.messageLeft]}>
                <View style={[chatStyles.bubble, isCurrentUser ? chatStyles.bubblePrimary : chatStyles.bubbleSecondary]}>
                    <Text style={[chatStyles.messageUser, { color: isCurrentUser ? DARK_NAVY : GOLD_ACCENT }]}>
                        {isCurrentUser ? 'You' : message.userName}
                    </Text>
                    
                    {/* Display Photo if present */}
                    {message.mediaUrl && (
                        <TouchableOpacity 
                            onPress={() => Linking.openURL(message.mediaUrl)}
                            style={{ marginVertical: 8 }}
                        >
                            <Text style={[chatStyles.messageText, { color: GOLD_ACCENT, textDecorationLine: 'underline' }]}>
                                📷 View Photo
                            </Text>
                        </TouchableOpacity>
                    )}
                    
                    {/* Display Location if present - Interactive Map */}
                    {message.location && (
                        <TouchableOpacity 
                            onPress={() => setLocationModalVisible(true)}
                            style={{ 
                                marginVertical: 8,
                                backgroundColor: 'rgba(255, 215, 0, 0.1)',
                                padding: 8,
                                borderRadius: 6,
                                borderWidth: 1,
                                borderColor: GOLD_ACCENT
                            }}
                        >
                            <Text style={[chatStyles.messageText, { color: GOLD_ACCENT, fontWeight: 'bold' }]}>
                                📍 Live Location
                            </Text>
                            <Text style={[chatStyles.messageText, { color: '#DDD', fontSize: 11, marginTop: 4 }]}>
                                Lat: {message.location.lat.toFixed(4)} | Lng: {message.location.lng.toFixed(4)}
                            </Text>
                            <Text style={[chatStyles.messageText, { color: GOLD_ACCENT, fontSize: 10, marginTop: 4 }]}>
                                Tap to view on map →
                            </Text>
                        </TouchableOpacity>
                    )}
                    
                    <Text style={chatStyles.messageText}>{message.text}</Text>
                    <Text style={chatStyles.messageTime}>{time}</Text>
                </View>
            </View>

            {/* Location Map Modal */}
            {message.location && (
                <Modal
                    visible={locationModalVisible}
                    transparent={true}
                    animationType="slide"
                    onRequestClose={() => setLocationModalVisible(false)}
                >
                    <View style={{ flex: 1, backgroundColor: DARK_NAVY }}>
                        {/* Header */}
                        <View style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            paddingHorizontal: 16,
                            paddingTop: 50,
                            paddingBottom: 16,
                            backgroundColor: CARD_BG,
                            borderBottomWidth: 1,
                            borderBottomColor: GOLD_ACCENT + '30'
                        }}>
                            <Text style={{ fontSize: 18, fontFamily: 'Raleway-Bold', color: 'white' }}>
                                📍 Live Location
                            </Text>
                            <TouchableOpacity onPress={() => setLocationModalVisible(false)}>
                                <Ionicons name="close" size={28} color={GOLD_ACCENT} />
                            </TouchableOpacity>
                        </View>

                        {/* Map View */}
                        <MapView
                            style={{ flex: 1 }}
                            initialRegion={{
                                latitude: message.location.lat,
                                longitude: message.location.lng,
                                latitudeDelta: 0.05,
                                longitudeDelta: 0.05,
                            }}
                        >
                            <Marker
                                coordinate={{
                                    latitude: message.location.lat,
                                    longitude: message.location.lng,
                                }}
                                title={`${message.userName}'s Location`}
                                description={`Lat: ${message.location.lat.toFixed(4)}, Lng: ${message.location.lng.toFixed(4)}`}
                                pinColor={GOLD_ACCENT}
                            />
                        </MapView>

                        {/* Location Details */}
                        <View style={{
                            backgroundColor: CARD_BG,
                            padding: 16,
                            borderTopWidth: 1,
                            borderTopColor: GOLD_ACCENT + '30'
                        }}>
                            <View style={{ marginBottom: 12 }}>
                                <Text style={{ color: GOLD_ACCENT, fontFamily: 'Raleway-Bold', marginBottom: 4 }}>
                                    Officer: {message.userName}
                                </Text>
                                <Text style={{ color: '#DDD', fontFamily: 'JosefinSans-Medium' }}>
                                    Latitude: {message.location.lat.toFixed(6)}
                                </Text>
                                <Text style={{ color: '#DDD', fontFamily: 'JosefinSans-Medium' }}>
                                    Longitude: {message.location.lng.toFixed(6)}
                                </Text>
                            </View>

                            <TouchableOpacity
                                style={{
                                    backgroundColor: GOLD_ACCENT,
                                    paddingVertical: 12,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    marginBottom: 8
                                }}
                                onPress={() => {
                                    const mapsUrl = Platform.select({
                                        ios: `http://maps.apple.com/?q=${message.location.lat},${message.location.lng}`,
                                        android: `http://maps.google.com/?q=${message.location.lat},${message.location.lng}`
                                    });
                                    Linking.openURL(mapsUrl);
                                }}
                            >
                                <Text style={{ color: DARK_NAVY, fontFamily: 'Raleway-Bold', fontSize: 14 }}>
                                    Open in Maps App
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={{
                                    backgroundColor: 'rgba(255, 215, 0, 0.1)',
                                    borderWidth: 1,
                                    borderColor: GOLD_ACCENT,
                                    paddingVertical: 12,
                                    borderRadius: 8,
                                    alignItems: 'center'
                                }}
                                onPress={() => setLocationModalVisible(false)}
                            >
                                <Text style={{ color: GOLD_ACCENT, fontFamily: 'Raleway-Bold', fontSize: 14 }}>
                                    Close
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            )}
        </>
    );
};


// --- Case Settings/Member Management Modal Component (Unchanged) ---
const CaseSettingsModal = ({ isVisible, onClose, caseData, allOfficers, currentUserId }) => {
    if (!caseData) return null;

    const isCreator = caseData.createdBy === currentUserId;
    
    const getOfficerName = (uid) => allOfficers.find(o => o.uid === uid)?.fullName || 'Unknown Officer';

    const handleRemoveMember = async (memberId: string) => {
        if (!isCreator || memberId === currentUserId) return;

        Alert.alert(
            "Remove Officer",
            `Are you sure you want to remove ${getOfficerName(memberId)} from this case?`,
            [
                { text: "Cancel", style: 'cancel' },
                { 
                    text: "Remove", 
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const caseRef = doc(db, 'cases', caseData.id);
                            await updateDoc(caseRef, {
                                members: arrayRemove(memberId)
                            });
                            Alert.alert("Success", "Officer removed.");
                        } catch (e) {
                            Alert.alert("Error", "Failed to remove member. Check security rules.");
                            console.error(e);
                        }
                    }
                },
            ]
        );
    };
    
    const handleDeleteCase = async () => {
        if (!isCreator) return;
         Alert.alert(
            "DELETE CASE",
            `WARNING: This will permanently delete the entire chat and history for ${caseData.title}. Proceed?`,
            [
                { text: "Cancel", style: 'cancel' },
                { 
                    text: "DELETE", 
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteDoc(doc(db, 'cases', caseData.id));
                            onClose(); // Close modal and navigate away
                            Alert.alert("Success", "Case deleted.");
                        } catch (e) {
                             Alert.alert("Error", "Failed to delete case.");
                            console.error(e);
                        }
                    }
                },
            ]
        );
    };

    return (
        <Modal animationType="slide" transparent={true} visible={isVisible} onRequestClose={onClose}>
            <View style={modalStyles.centeredView}>
                <View style={modalStyles.modalView}>
                    <Text style={modalStyles.modalTitle}>Settings: {caseData.title}</Text>
                    <Text style={modalStyles.sectionHeader}>Group Members ({caseData.members.length})</Text>
                    
                    <ScrollView style={modalStyles.officerList}>
                        {caseData.members.map((memberId) => (
                            <View key={memberId} style={modalStyles.officerRow}>
                                <Text style={modalStyles.officerName}>
                                    {getOfficerName(memberId)} {memberId === caseData.createdBy ? ' (Creator)' : ''}
                                </Text>
                                {isCreator && memberId !== currentUserId && (
                                    <TouchableOpacity 
                                        onPress={() => handleRemoveMember(memberId)}
                                        style={modalStyles.removeButton}
                                    >
                                        <Text style={modalStyles.removeButtonText}>Remove</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))}
                    </ScrollView>
                    
                    {isCreator && (
                        <TouchableOpacity style={modalStyles.deleteCaseButton} onPress={handleDeleteCase}>
                            <Text style={modalStyles.deleteCaseButtonText}>DELETE CASE GROUP</Text>
                        </TouchableOpacity>
                    )}
                    
                    <TouchableOpacity onPress={onClose} style={{ marginTop: 15 }}>
                        <Text style={[styles.emptyText, { color: INACTIVE_GRAY }]}>Close Settings</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};


// --- Case Creation Modal Component (IMPROVED STYLING) ---
const CreateCaseModal = ({ isVisible, onClose, currentUserId, currentUserName, officers }) => {
    const [caseTitle, setCaseTitle] = useState('');
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [isCreating, setIsCreating] = useState(false);

    // Ensure the creator is always a member
    useEffect(() => {
        if (currentUserId && !selectedMembers.includes(currentUserId)) {
            setSelectedMembers([currentUserId]);
        }
    }, [currentUserId]);

    const toggleMember = (uid: string) => {
        if (uid === currentUserId) return; // Cannot remove self
        setSelectedMembers(prev => 
            prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
        );
    };

    const handleCreate = async () => {
        if (caseTitle.trim().length < 3 || selectedMembers.length < 2) { // Require at least 2 members total
            Alert.alert("Error", "Please enter a valid case title and select at least one other member.");
            return;
        }
        setIsCreating(true);

        try {
            // 1. Generate a simple Case ID
            const newCaseId = `CASE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

            // 2. Create the case document
            await addDoc(collection(db, 'cases'), {
                title: caseTitle.trim(),
                caseId: newCaseId,
                members: selectedMembers, // Array of UIDs
                createdBy: currentUserId,
                lastActivity: serverTimestamp(),
            });

            Alert.alert("Success", `Case ${newCaseId} created successfully!`);
            onClose(); // Close the modal and reset state
        } catch (e) {
            console.error("Error creating case:", e);
            Alert.alert("Error", "Failed to create case. Check security rules.");
        } finally {
            setIsCreating(false);
            setCaseTitle('');
            setSelectedMembers([currentUserId]);
        }
    };

    return (
        <Modal animationType="slide" transparent={true} visible={isVisible} onRequestClose={onClose}>
            <View style={modalStyles.centeredView}>
                <View style={modalStyles.modalView}>
                    <Text style={modalStyles.modalTitle}>Create New Case Chat</Text>
                    
                    {/* Input with White Text Color */}
                    <TextInput
                        // FIX: Explicitly setting color to white for visibility
                        style={[styles.textInput, { backgroundColor: CARD_BG, color: 'white', marginBottom: 15, minHeight: 60, paddingVertical: 15, borderWidth: 1, borderColor: GOLD_ACCENT }]} 
                        placeholder="Enter Case Title"
                        placeholderTextColor={INACTIVE_GRAY}
                        value={caseTitle}
                        onChangeText={setCaseTitle}
                    />

                    <Text style={modalStyles.sectionHeader}>Select Officers (Members: {selectedMembers.length})</Text>
                    <ScrollView style={modalStyles.officerList}>
                        {officers.map((officer) => (
                            <TouchableOpacity 
                                key={officer.uid} 
                                style={modalStyles.officerRow}
                                onPress={() => toggleMember(officer.uid)}
                                disabled={officer.uid === currentUserId}
                            >
                                <Text style={[
                                    modalStyles.officerName, 
                                    officer.uid === currentUserId && modalStyles.officerSelf
                                ]}>
                                    {officer.fullName} {officer.uid === currentUserId ? ' (You - Creator)' : ''}
                                </Text>
                                <Text style={modalStyles.toggleText}>
                                    {selectedMembers.includes(officer.uid) ? '✔ ADDED' : '+ ADD'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    <TouchableOpacity 
                        style={styles.sendButton} 
                        onPress={handleCreate} 
                        disabled={isCreating}
                    >
                        {isCreating ? <ActivityIndicator color={DARK_NAVY} /> : <Text style={styles.sendButtonText}>Create Group Chat</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onClose} style={{ marginTop: 10 }}>
                        <Text style={[styles.emptyText, { color: INACTIVE_GRAY }]}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};


export default function OfficerChatScreen() {
    const user = auth.currentUser;
    const currentUserId = user?.uid || '';
    
    const [currentUserName, setCurrentUserName] = useState('Officer'); 
    const [allOfficers, setAllOfficers] = useState<Officer[]>([]); // NEW: List of all officers
    const [isCreateModalVisible, setIsCreateModalVisible] = useState(false); // NEW: Modal state
    const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false); // NEW: Settings Modal state

    const [cases, setCases] = useState<Case[]>([]);
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    
    const flatListRef = useRef(null);
    
    
    // --- 0A. Fetch Current Officer's Full Name ---
    useEffect(() => {
        if (!user) return;
        
        const fetchName = async () => {
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    setCurrentUserName(userDoc.data().fullName || 'Officer');
                }
            } catch (e) {
                console.error("Failed to fetch officer name:", e);
            }
        };
        fetchName();
    }, [user]);

    // --- 0B. Fetch ALL Officers (for Case Creation Modal) ---
    useEffect(() => {
        const officersQuery = query(
            collection(db, 'users'), 
            where('role', '==', 'officer') // Assuming 'role' field is set correctly
        );
        
        const unsubscribe = onSnapshot(officersQuery, (snapshot) => {
            const fetchedOfficers: Officer[] = snapshot.docs.map(doc => ({
                uid: doc.id,
                fullName: doc.data().fullName || 'Unknown Officer',
            }));
            setAllOfficers(fetchedOfficers);
        });

        return () => unsubscribe();
    }, []);


    // --- 1. Fetch Case List (Filtered by Current Officer's Membership) ---
    useEffect(() => {
        if (!user) return;
        
        // Query only cases where the current user's UID is in the 'members' array
        // NOTE: The Firebase Console index link must be created for this query to work: 
        // Array-contains filter + OrderBy requires an index.
        const casesQuery = query(
            collection(db, 'cases'), 
            where('members', 'array-contains', user.uid),
            orderBy('lastActivity', 'desc')
        );

        const unsubscribe = onSnapshot(casesQuery, (snapshot) => {
            const fetchedCases: Case[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    title: data.title || 'Case Title Unknown',
                    caseId: data.caseId || `CASE-${doc.id.substring(0, 4).toUpperCase()}`,
                    newMessages: data.newMessages || 0,
                    members: data.members || [],
                    createdBy: data.createdBy || '',
                };
            });
            setCases(fetchedCases);

            // Automatically select the first case if none is selected
            if (!selectedCaseId && fetchedCases.length > 0) {
                setSelectedCaseId(fetchedCases[0].id);
            }
        });

        return () => unsubscribe();
    }, [user, selectedCaseId]);


    // --- 2. Fetch Messages for Selected Case ---
    useEffect(() => {
        if (!selectedCaseId) {
            setMessages([]);
            return;
        }

        const messagesQuery = query(
            collection(db, 'cases', selectedCaseId, 'messages'),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
            const fetchedMessages: Message[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    text: data.text,
                    userId: data.userId,
                    userName: data.userName,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                };
            });
            setMessages(fetchedMessages);
        }, (error) => {
            console.error("Error fetching messages:", error);
        });

        return () => unsubscribe();
    }, [selectedCaseId]);

    // --- Manual scrolling only - no auto-scroll ---
    // Users can scroll up/down manually to see message history


    // --- 3. Send Message Handler (Updated for rich media/location support) ---
    const handleSend = async (type: 'text' | 'photo' | 'location') => {
        console.log(`🔵 handleSend called with type: ${type}`);
        console.log(`   user: ${user?.uid}, selectedCaseId: ${selectedCaseId}, currentUserId: ${currentUserId}, currentUserName: ${currentUserName}`);
        
        if (!user || !selectedCaseId) {
            Alert.alert("Error", "Please select a chat and ensure you are logged in.");
            console.warn("handleSend blocked: user or selectedCaseId missing");
            return;
        }
        
        let messageText = newMessage.trim();
        let mediaUrl = null;
        let locationData = null;

        if (type === 'text') {
            if (messageText === '') {
                Alert.alert("Info", "Please type a message");
                return;
            }
        } 
        
        console.log(`📸 Type: ${type}`);
        
        // --- 3A. Handle Photo Upload ---
        if (type === 'photo') {
            console.log("📷 Photo upload initiated");
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            console.log(`📷 Permission status: ${status}`);
            
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Media library access is required to share photos.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 0.8,
            });

            console.log(`📷 Image picker result: ${result.canceled ? 'canceled' : 'selected'}`);
            if (result.canceled || !result.assets?.length) {
                console.log("📷 Photo selection canceled");
                return;
            }
            
            const localUri = result.assets[0].uri;
            const imageName = `${user.uid}-${Date.now()}.jpg`;

            Alert.alert("Uploading...", "Sending image to Firebase Storage.");
            
            try {
                console.log(`📷 Uploading to: case_media/${selectedCaseId}/${imageName}`);
                const response = await fetch(localUri);
                const blob = await response.blob();
                const storageRef = ref(storage, `case_media/${selectedCaseId}/${imageName}`);

                await uploadBytes(storageRef, blob);
                mediaUrl = await getDownloadURL(storageRef);
                messageText = `[Photo Shared by ${currentUserName}]`;
                console.log(`✅ Photo uploaded: ${mediaUrl}`);
            } catch (e) {
                Alert.alert("Upload Failed", "Could not send image. Check Storage rules.");
                console.error("Photo upload error:", e);
                return;
            }
        } 

        // --- 3B. Handle Location Sharing ---
        if (type === 'location') {
            console.log("📍 Location capture initiated");
            const { status } = await Location.requestForegroundPermissionsAsync();
            console.log(`📍 Permission status: ${status}`);
            
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Location access is required to share your current map location.');
                return;
            }
            
            try {
                console.log("📍 Getting current location...");
                
                // Set a timeout for location request
                const locationPromise = Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                });
                
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Location timeout - taking too long")), 15000)
                );
                
                let loc = null;
                
                try {
                    loc = await Promise.race([locationPromise, timeoutPromise]) as any;
                    console.log(`✅ Current location obtained: ${loc.coords.latitude}, ${loc.coords.longitude}`);
                } catch (currentLocError) {
                    console.warn("⚠️ Current location failed, trying last known...", currentLocError);
                    
                    // Fallback to last known location (instant)
                    const lastLoc = await Location.getLastKnownPositionAsync();
                    if (lastLoc) {
                        loc = lastLoc;
                        console.log(`✅ Using last known location: ${lastLoc.coords.latitude}, ${lastLoc.coords.longitude}`);
                    } else {
                        throw new Error("Could not get current or last known location");
                    }
                }
                
                if (!loc) {
                    throw new Error("Location data is null");
                }
                
                locationData = { 
                    lat: loc.coords.latitude, 
                    lng: loc.coords.longitude 
                };
                messageText = `[Live Location Shared by ${currentUserName}]`;
                console.log(`✅ Location captured: ${locationData.lat}, ${locationData.lng}`);
            } catch (e) {
                const errorMsg = (e as Error).message || String(e);
                console.error("Location error:", e);
                Alert.alert("Location Error", `Could not get location: ${errorMsg}`);
                return;
            }
        }
        
        // --- 4. Send to Firestore ---
        try {
            console.log(`💬 Sending message to Firestore: cases/${selectedCaseId}/messages`);
            await addDoc(collection(db, 'cases', selectedCaseId, 'messages'), {
                text: messageText,
                userId: currentUserId,
                userName: currentUserName, 
                createdAt: serverTimestamp(),
                mediaUrl: mediaUrl,
                location: locationData,
            });
            console.log("✅ Message sent successfully");
            
            // Clear text input only if text was the primary message type
            if (type === 'text') setNewMessage('');
            
            // Update lastActivity on the case document for ordering
            await updateDoc(doc(db, 'cases', selectedCaseId), {
                lastActivity: serverTimestamp(),
            });
            console.log("✅ Case updated");

        } catch (e) {
            console.error("Error sending message:", e);
            Alert.alert("Error", "Failed to send message. Check network.\n\n" + (e as Error).message);
        }
    };


    const selectedCase = cases.find(c => c.id === selectedCaseId);

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true}>
        <View style={styles.container}>
            <Text style={styles.chatTitleBar}>Officer Group Chat</Text>
            
            <CreateCaseModal 
                isVisible={isCreateModalVisible}
                onClose={() => setIsCreateModalVisible(false)}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                officers={allOfficers}
            />
            
            {selectedCase && (
                <CaseSettingsModal
                    isVisible={isSettingsModalVisible}
                    onClose={() => setIsSettingsModalVisible(false)}
                    caseData={selectedCase}
                    allOfficers={allOfficers}
                    currentUserId={currentUserId}
                />
            )}

            <View style={styles.chatContainer}>
                
                {/* Right Panel: Message Area - Now First */}
                <View style={styles.messagePanel}>
                    {selectedCase ? (
                        <>
                            <View style={styles.caseHeaderRow}>
                                <Text style={styles.caseHeader}>
                                    Case: {selectedCase.title} ({selectedCase.caseId})
                                </Text>
                                <TouchableOpacity onPress={() => setIsSettingsModalVisible(true)}>
                                    <Ionicons name="settings-outline" size={20} color={INACTIVE_GRAY} />
                                </TouchableOpacity>
                            </View>

                            {/* Messages Display */}
                            <ScrollView 
                                style={styles.messageList}
                                showsVerticalScrollIndicator={true}
                                ref={flatListRef}
                                contentContainerStyle={{ paddingBottom: 10, minHeight: 400 }}
                                bounces={true}
                                alwaysBounceVertical={false}
                                scrollEnabled={true}
                                scrollEventThrottle={16}
                                nestedScrollEnabled={true}
                            >
                                {messages.map((message) => (
                                    <MessageBubble key={message.id} message={message} currentUserId={currentUserId} />
                                ))}
                                {messages.length === 0 && (
                                    <Text style={styles.emptyText}>No messages yet. Start the conversation!</Text>
                                )}
                            </ScrollView>

                            {/* Input Area (Interactive) */}
                            <View style={styles.inputArea}>
                                {/* Rich Media Attachments */}
                                <TouchableOpacity 
                                    style={styles.attachmentButton} 
                                    onPress={() => {
                                        console.log("📷 Photo button pressed");
                                        Alert.alert("Debug", "Photo button pressed - initiating upload");
                                        handleSend('photo');
                                    }}
                                >
                                    <Ionicons name="camera-outline" size={18} color={INACTIVE_GRAY} />
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={styles.attachmentButton} 
                                    onPress={() => {
                                        console.log("📍 Location button pressed");
                                        Alert.alert("Debug", "Location button pressed - capturing GPS");
                                        handleSend('location');
                                    }}
                                >
                                    <Ionicons name="location-outline" size={18} color={INACTIVE_GRAY} />
                                </TouchableOpacity>
                                
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Type a message..."
                                    placeholderTextColor={INACTIVE_GRAY}
                                    value={newMessage}
                                    onChangeText={setNewMessage}
                                />
                                <TouchableOpacity style={styles.sendButton} onPress={() => handleSend('text')}>
                                    <Text style={styles.sendButtonText}>Send</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : (
                        <View style={styles.noChatSelected}>
                            <Text style={styles.emptyText}>Select a case chat to begin collaboration.</Text>
                        </View>
                    )}
                </View>

                {/* Panel Separator */}
                <View style={styles.panelSeparator} />

                {/* Left Panel: Case List - Now Second */}
                <View style={styles.caseListPanel}>
                    <Text style={styles.caseListHeader}>Active Cases</Text>
                    
                    <TouchableOpacity 
                        style={styles.createCaseButton}
                        onPress={() => setIsCreateModalVisible(true)}
                    >
                        <Ionicons name="add-circle-outline" size={20} color={DARK_NAVY} />
                        <Text style={styles.createCaseButtonText}>Create New Case</Text>
                    </TouchableOpacity>
                    
                    <TextInput style={styles.searchBar} placeholder="Search cases..." placeholderTextColor={INACTIVE_GRAY} />
                    <ScrollView 
                        style={styles.caseScrollView} 
                        showsVerticalScrollIndicator={true}
                        bounces={true}
                        alwaysBounceVertical={true}
                    >
                        {cases.map((c) => (
                            <TouchableOpacity 
                                key={c.id} 
                                style={[styles.caseRow, c.id === selectedCaseId && styles.caseRowSelected]}
                                onPress={() => setSelectedCaseId(c.id)}
                            >
                                <View>
                                    <Text style={styles.caseTitle}>{c.title}</Text>
                                    <Text style={styles.caseId}>{c.caseId}</Text>
                                </View>
                                {c.newMessages > 0 && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>{c.newMessages}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        ))}
                        {cases.length === 0 && <Text style={styles.emptyText}>No active cases found. Check Firestore Index.</Text>}
                    </ScrollView>
                </View>

            </View>
        </View>
        </ScrollView>
        </KeyboardAvoidingView>
    );
}

// --- Styles ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: DARK_NAVY, paddingTop: Platform.OS === 'web' ? 0 : 20 },
    chatTitleBar: {
        fontSize: 34,
        fontFamily: 'Raleway-Bold',
        color: 'white',
        paddingHorizontal: 20,
        paddingBottom: 10,
        marginTop:20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
        paddingTop: 30, 
    },
    chatContainer: { 
        flex: 1, 
        flexDirection: Platform.OS === 'web' ? 'row' : 'column',
        padding: 20    },
    panelSeparator: {
        height: Platform.OS === 'web' ? 0 : 15,
        width: Platform.OS === 'web' ? 15 : '100%',
    },
    // Panels (Adjusted for web/desktop view based on the image)
    caseListPanel: {
        width: Platform.OS === 'web' ? '30%' : '100%', 
        backgroundColor: CARD_BG,
        borderRadius: 12,
        padding: 15,
        marginRight: Platform.OS === 'web' ? 10 : 0,
        height: Platform.OS === 'web' ? '100%' : 350,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    createCaseButton: {
        backgroundColor: GOLD_ACCENT,
        borderRadius: 8,
        padding: 12,
        marginBottom: 15,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 2,
        flexDirection: 'row',
        justifyContent: 'center',
    },
    createCaseButtonText: {
        color: DARK_NAVY,
        fontFamily: 'Raleway-Bold',
        fontSize: 16,
        marginLeft: 8,
    },
    caseListHeader: {
        fontSize: 18,
        fontFamily: 'Raleway-Bold',
        color: GOLD_ACCENT,
        marginBottom: 15,
        textAlign: 'center',
    },
    caseScrollView: {
        flex: 1,
        maxHeight: Platform.OS === 'web' ? '100%' : 220, // More space for scrolling cases
    },
    messagePanel: {
        backgroundColor: CARD_BG,
        borderRadius: 8,
        padding: 10,
        justifyContent: 'space-between',
        marginTop: Platform.OS === 'web' ? 0 : 10, 
        height: Platform.OS === 'web' ? '100%' : 400, // Fixed height for scrolling
        paddingBottom: 40, // Space for keyboard
    },
    searchBar: {
        backgroundColor: DARK_NAVY,
        borderRadius: 8,
        padding: 12,
        color: 'white',
        marginBottom: 15,
        fontSize: 14,
        fontFamily: 'JosefinSans-Medium',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    // Case List Rows
    caseRow: {
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderRadius: 6,
        marginVertical: 2,
    },
    caseRowSelected: {
        backgroundColor: 'rgba(234, 172, 45, 0.1)',
        borderRadius: 8,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: GOLD_ACCENT,
    },
    caseTitle: {
        fontSize: 16,
        fontFamily: 'JosefinSans-Medium',
        color: 'white'

    },
    caseId: {
        fontSize: 12,
        color: INACTIVE_GRAY,
        fontFamily: 'JosefinSans-Medium',
    },
    badge: {
        backgroundColor: DANGER_RED, // Red badge for unread
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontFamily: 'Raleway-Bold',
    },
    emptyText: {
        color: INACTIVE_GRAY,
        fontFamily: 'JosefinSans-Medium',
        textAlign: 'center',
        paddingVertical: 20,
    },
    // Message Panel
    noChatSelected: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    caseHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    caseHeader: {
        fontSize: 16,
        fontFamily: 'Raleway-Bold',
        color: GOLD_ACCENT,
    },
    settingsIcon: {
        fontSize: 20,
        color: INACTIVE_GRAY,
    },
    messageList: {
        height: 250, // Fixed height for reliable scrolling
        marginTop: 10,
        marginBottom: 10,
    },
    inputArea: {
        flexDirection: 'row',
        paddingTop:10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 20, // Reduced from 40 to 20
    },
    textInput: {
        flex: 1,
        backgroundColor: DARK_NAVY,
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 10,
        color: 'white',
        marginRight: 10,
        fontSize: 16,
        fontFamily: 'JosefinSans-Medium',
    },
    sendButton: {
        backgroundColor: GOLD_ACCENT,
        borderRadius: 20,
        paddingHorizontal: 20,
        paddingVertical: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonText: {
        color: DARK_NAVY,
        fontFamily: 'Raleway-Bold',
        fontSize: 16,
    },
    attachmentButton: {
        backgroundColor: CARD_BG,
        borderRadius: 20,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
        borderWidth: 1,
        borderColor: INACTIVE_GRAY + '50',
    },
});

const chatStyles = StyleSheet.create({
    messageContainer: {
        marginVertical: 8,
        maxWidth: '85%',
    },
    messageLeft: {
        alignSelf: 'flex-start',
    },
    messageRight: {
        alignSelf: 'flex-end',
    },
    bubble: {
        padding: 10,
        borderRadius: 10,
        minWidth: 100,
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
    },
    bubblePrimary: { // Right side (Current User - Yellow)
        backgroundColor: GOLD_ACCENT,
        borderBottomRightRadius: 2,
    },
    bubbleSecondary: { // Left side (Other User - Dark Blue/Gray)
        backgroundColor: '#145b97',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderBottomLeftRadius: 2,
    },
    messageUser: {
        fontSize: 10,
        fontFamily: 'Raleway-Bold',
        color: INACTIVE_GRAY,
        marginBottom: 2,
    },
    messageText: {
        fontSize: 15,
        color: 'white',
        fontFamily: 'JosefinSans-Medium',
    },
    messageTime: {
        fontSize: 10,
        alignSelf: 'flex-end',
        marginTop: 5,
        color: INACTIVE_GRAY,
        fontFamily: 'JosefinSans-Medium',
    }
});

const modalStyles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: 'rgba(0,0,0,0.8)',
    },
    modalView: {
        width: Platform.OS === 'web' ? 400 : '90%',
        backgroundColor: DARK_NAVY,
        borderRadius: 10,
        padding: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontFamily: 'Raleway-Bold',
        color: GOLD_ACCENT,
        marginBottom: 15,
    },
    sectionHeader: {
        fontSize: 14,
        fontFamily: 'Raleway-Bold',
        color: 'white',
        marginTop: 15,
        marginBottom: 5,
    },
    officerList: {
        maxHeight: 200,
        borderWidth: 1,
        borderColor: CARD_BG,
        borderRadius: 5,
        marginBottom: 15,
        paddingHorizontal: 5,
    },
    officerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    officerName: {
        color: 'white',
        fontFamily: 'JosefinSans-Medium',
        flex: 1,
    },
    officerSelf: {
        color: GOLD_ACCENT,
    },
    toggleText: {
        color: GOLD_ACCENT,
        fontFamily: 'Raleway-Bold',
        fontSize: 12,
        paddingHorizontal: 8,
    },
    removeButton: {
        backgroundColor: DANGER_RED,
        borderRadius: 5,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    removeButtonText: {
        color: 'white',
        fontFamily: 'Raleway-Bold',
        fontSize: 12,
    },
    deleteCaseButton: {
        backgroundColor: DANGER_RED,
        borderRadius: 5,
        padding: 10,
        marginTop: 15,
        alignItems: 'center',
    },
    deleteCaseButtonText: {
        color: 'white',
        fontFamily: 'Raleway-Bold',
        fontSize: 16,
    }
});
