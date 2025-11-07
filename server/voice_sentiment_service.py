"""
Voice Sentiment Analysis Service
Loads the pre-trained Keras model for voice sentiment analysis (CNN + BiLSTM + Attention)
Model trained on RAVDESS, CREMA-D, and TESS datasets
LAZY IMPORT: TensorFlow only imported when needed (not on module load)
"""

import os
import numpy as np
import librosa
import warnings

warnings.filterwarnings('ignore')

# Global model - only loaded on first use
MODEL = None
LABEL_ENCODER = None

# Model configuration (matching training)
SAMPLE_RATE = 22050
N_MFCC = 40  # Changed from 13 to 40 (as in training)
MAX_PAD_LEN = 200  # Timesteps
N_FEATURES = 120  # 40 MFCC + 40 Delta + 40 Delta-Delta

# 8-class emotion labels (from training)
EMOTION_LABELS = ['angry', 'calm', 'disgust', 'fearful', 'happy', 'neutral', 'sad', 'surprised']

# Map to broad categories
EMOTION_MAP = {
    'angry': 'negative',
    'calm': 'positive',
    'disgust': 'negative',
    'fearful': 'negative',
    'happy': 'positive',
    'neutral': 'neutral',
    'sad': 'negative',
    'surprised': 'positive'
}

def _import_dependencies():
    """Lazy import of heavy dependencies only when needed"""
    try:
        import tensorflow as tf
        from tensorflow import keras
        return tf, keras
    except ImportError as e:
        raise RuntimeError(f"Missing dependencies: {e}")

def _get_custom_objects():
    """Return custom objects dict for Keras model loading - MATCHES TRAINING CODE EXACTLY"""
    from tensorflow.keras.layers import Layer
    from tensorflow.keras import backend as K
    
    # Define custom Attention layer EXACTLY as in training code
    class Attention(Layer):
        def __init__(self, **kwargs):
            super(Attention, self).__init__(**kwargs)

        def build(self, input_shape):
            self.W = self.add_weight(
                name="att_weight", 
                shape=(input_shape[-1],), 
                initializer="random_normal", 
                trainable=True
            )
            super(Attention, self).build(input_shape)

        def call(self, x):
            e = K.tanh(x)  # (batch, timesteps, features)
            e = K.dot(e, K.expand_dims(self.W))  # (batch, timesteps, 1)
            a = K.softmax(e, axis=1)  # attention weights
            output = K.sum(x * a, axis=1)  # weighted sum
            return output
        
        def get_config(self):
            config = super(Attention, self).get_config()
            return config
        
        @classmethod
        def from_config(cls, config):
            return cls(**config)
    
    return {'Attention': Attention}

def load_voice_model():
    """Load the pre-trained voice sentiment model (CNN + BiLSTM + Attention)"""
    global MODEL
    
    if MODEL is not None:
        return MODEL
    
    try:
        # Import TensorFlow
        import tensorflow as tf
        from tensorflow import keras
        
        # Try multiple possible model paths
        possible_paths = [
            os.path.join(os.path.dirname(__file__), 'final_model.keras'),
            os.path.join(os.path.dirname(__file__), 'voice_sentiment_model.keras'),
            os.path.join(os.path.dirname(__file__), 'models', 'final_model.keras'),
        ]
        
        model_path = None
        for path in possible_paths:
            if os.path.exists(path):
                model_path = path
                break
        
        if not model_path:
            print(f"⚠️  Model file not found in any of these locations:")
            for path in possible_paths:
                print(f"    - {path}")
            print("⚠️  Will use feature-based fallback analysis")
            return None
        
        # Load the model with custom Attention layer
        print(f"🎤 Loading Keras model from {model_path}")
        custom_objects = _get_custom_objects()
        MODEL = keras.models.load_model(model_path, custom_objects=custom_objects)
        print("✅ Keras model loaded successfully (CNN + BiLSTM + Attention)")
        print(f"   Input shape: {MODEL.input_shape}")
        print(f"   Output shape: {MODEL.output_shape}")
        return MODEL
    
    except Exception as e:
        print(f"❌ Failed to load Keras model: {e}")
        import traceback
        traceback.print_exc()
        print("⚠️  Will use feature-based fallback analysis")
        return None


def extract_features(file_path: str, n_mfcc: int = N_MFCC, max_pad_len: int = MAX_PAD_LEN):
    """
    Extract MFCC features along with delta and delta-delta, then pad/truncate.
    MATCHES TRAINING CODE EXACTLY
    
    Output shape: (timesteps, n_mfcc*3) = (200, 120)
    
    Args:
        file_path: Path to the audio file
        n_mfcc: Number of MFCC coefficients (default 40)
        max_pad_len: Maximum number of timesteps (default 200)
    
    Returns:
        Combined feature array with shape (max_pad_len, n_mfcc*3)
    """
    try:
        # Load audio file
        y, sr = librosa.load(file_path, sr=None)
        
        # Extract MFCC
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc)

        # Compute delta and delta-delta
        delta = librosa.feature.delta(mfcc)
        delta2 = librosa.feature.delta(mfcc, order=2)

        # Stack: (n_mfcc*3, timesteps)
        combined = np.vstack([mfcc, delta, delta2])
        combined = combined.T  # shape: (timesteps, n_mfcc*3)

        # Pad or truncate to fixed length
        if combined.shape[0] < max_pad_len:
            pad_width = max_pad_len - combined.shape[0]
            combined = np.pad(combined, ((0, pad_width), (0, 0)), mode="constant")
        else:
            combined = combined[:max_pad_len, :]

        return combined  # shape: (200, 120)
    except Exception as e:
        raise ValueError(f"Failed to extract features from audio: {e}")


def predict_sentiment(audio_path: str):
    """
    Predict sentiment from audio file using CNN + BiLSTM + Attention model
    Returns 8-emotion breakdown + mapped broad category (negative/neutral/positive)
    
    Args:
        audio_path: Path to the audio file
    
    Returns:
        dict with sentiment prediction, 8-emotion probabilities, confidence, and audio features
    """
    # Try to load the trained model
    model = load_voice_model()
    
    if model is not None:
        # ========================================
        # PRIMARY: Use trained CNN+BiLSTM+Attention model
        # ========================================
        try:
            print("🎤 Using trained CNN+BiLSTM+Attention model for prediction")
            
            # Extract features (MFCC + Delta + Delta-Delta)
            features = extract_features(audio_path, n_mfcc=N_MFCC, max_pad_len=MAX_PAD_LEN)
            print(f"📊 Extracted features shape: {features.shape}")  # Should be (200, 120)
            
            # Reshape for model input: (1, 200, 120)
            features_batch = np.expand_dims(features, axis=0)
            
            # Predict
            predictions = model.predict(features_batch, verbose=0)[0]
            print(f"📊 Raw predictions shape: {predictions.shape}")  # Should be (8,)
            
            # Get predicted emotion index and name
            predicted_idx = np.argmax(predictions)
            predicted_emotion = EMOTION_LABELS[predicted_idx]
            confidence = float(predictions[predicted_idx])
            
            # Map to broad category
            broad_category = EMOTION_MAP[predicted_emotion]
            sentiment = broad_category.capitalize()  # 'negative' -> 'Negative'
            
            # Determine risk level
            if sentiment == 'Negative':
                risk_level = 'High Risk'
            elif sentiment == 'Neutral':
                risk_level = 'Medium Risk'
            else:  # Positive
                risk_level = 'Low Risk'
            
            # Create emotion breakdown
            emotion_details = {
                emotion: float(predictions[i]) 
                for i, emotion in enumerate(EMOTION_LABELS)
            }
            
            print(f"✅ Prediction: {predicted_emotion} ({confidence:.2%}) -> {sentiment}")
            print(f"📊 Emotion breakdown: {emotion_details}")
            
            # Also extract audio features for additional context
            y, sr = librosa.load(audio_path, sr=SAMPLE_RATE)
            energy = float(np.sqrt(np.mean(y**2)))
            zcr = float(np.mean(librosa.feature.zero_crossing_rate(y)))
            spec_cent = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
            mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
            mfcc_var = float(np.mean(np.var(mfcc, axis=1)))
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            tempogram = float(np.mean(onset_env))
            
            return {
                'sentiment': sentiment,
                'risk_level': risk_level,
                'confidence': confidence,
                'predicted_emotion': predicted_emotion,
                'emotion_details': emotion_details,
                'audio_features': {
                    'energy': energy,
                    'zcr': zcr,
                    'spectral_centroid': spec_cent,
                    'mfcc_variance': mfcc_var,
                    'tempogram': tempogram
                },
                'model_used': 'CNN+BiLSTM+Attention',
                'model_type': '8-class emotion recognition'
            }
        
        except Exception as model_error:
            print(f"❌ Model prediction failed: {model_error}")
            import traceback
            traceback.print_exc()
            print("⚠️  Falling back to acoustic feature analysis")
    
    # ========================================
    # FALLBACK: Use acoustic feature analysis
    # ========================================
    print("🎤 Using acoustic feature analysis (fallback)")
    try:
        # Load audio and compute features
        y, sr = librosa.load(audio_path, sr=SAMPLE_RATE)
        
        # 1. Energy
        energy = np.sqrt(np.mean(y**2))
        
        # 2. Zero crossing rate (voice quality indicator)
        zcr = np.mean(librosa.feature.zero_crossing_rate(y))
        
        # 3. Spectral centroid (brightness of sound)
        spec_cent = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
        
        # 4. MFCC variance (voice texture)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        mfcc_var = np.mean(np.var(mfcc, axis=1))
        
        # 5. Tempogram (rhythm/urgency)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempogram = np.mean(onset_env)
        
        # Emotion detection heuristics:
        # Negative (distressed): High ZCR, variable pitch, urgent rhythm
        # Positive (calm): Low energy, low variation, smooth
        # Neutral: Medium values
        
        negative_score = 0
        positive_score = 0
        neutral_score = 0
        
        # High ZCR suggests tension/distress
        if zcr > 0.10:  # Raised threshold
            negative_score += 0.3
        elif zcr < 0.02:
            positive_score += 0.2
        else:
            neutral_score += 0.2
        
        # High spectral centroid suggests stress/urgency
        if spec_cent > 4500:  # Raised threshold
            negative_score += 0.2
        elif spec_cent < 1500:
            positive_score += 0.2
        else:
            neutral_score += 0.2
        
        # High MFCC variance suggests emotional variation (could be negative)
        if mfcc_var > 60:  # Raised threshold
            negative_score += 0.2
        elif mfcc_var < 15:
            positive_score += 0.2
        else:
            neutral_score += 0.2
        
        # High onset energy suggests urgency/distress
        if tempogram > 0.4:  # Raised threshold
            negative_score += 0.15
        elif tempogram < 0.08:
            positive_score += 0.15
        else:
            neutral_score += 0.15
        
        # Energy-based classification (refined) - balanced
        if energy > 0.20:
            negative_score += 0.1  # Very high energy = possible distress
        elif energy < 0.03:
            positive_score += 0.15  # Very low energy = calm
        else:
            neutral_score += 0.1
        
        # Additional heuristics for better distinction
        # Only strong combinations
        if zcr > 0.08 and spec_cent > 4000:
            negative_score += 0.2  # Strong negative indicator
        elif zcr < 0.03 and spec_cent < 2000:
            positive_score += 0.2  # Strong positive indicator
        
        # If scores are too close, let neutral win
        if sum([negative_score, neutral_score, positive_score]) < 0.6:
            neutral_score += 0.3  # Prefer neutral for low confidence
        
        # Determine sentiment based on scores
        scores = {
            'Negative': negative_score,
            'Neutral': neutral_score,
            'Positive': positive_score
        }
        
        # First pass: get sentiment from scores
        sentiment = max(scores, key=scores.get)
        
        # Avoid too many Neutral classifications - if close between Negative and Positive, pick one
        if sentiment == 'Neutral' and (negative_score > 0.1 or positive_score > 0.1):
            scores['Neutral'] *= 0.5  # Reduce neutral weight
            sentiment = max(scores, key=scores.get)
        
        # Determine risk level
        if sentiment == 'Negative':
            risk_level = 'High Risk'
        elif sentiment == 'Neutral':
            risk_level = 'Medium Risk'
        else:  # Positive
            risk_level = 'Low Risk'
        
        print(f"📊 Analysis: ZCR={zcr:.4f}, SpecCent={spec_cent:.0f}, "
              f"MFCCVar={mfcc_var:.2f}, Tempogram={tempogram:.3f}, Energy={energy:.3f}")
        print(f"📊 Scores: Negative={negative_score:.2f}, Neutral={neutral_score:.2f}, Positive={positive_score:.2f}")
        print(f"📊 Sentiment: {sentiment}")
        print(f"📊 Risk Level: {risk_level}")
        
        return {
            'sentiment': sentiment,
            'risk_level': risk_level,
            'confidence': max(scores.values()),
            'audio_features': {
                'energy': float(energy),
                'zcr': float(zcr),
                'spectral_centroid': float(spec_cent),
                'mfcc_variance': float(mfcc_var),
                'tempogram': float(tempogram)
            },
            'scores': {
                'negative': float(negative_score),
                'neutral': float(neutral_score),
                'positive': float(positive_score)
            }
        }
    except Exception as error:
        print(f"❌ Analysis failed: {error}")
        import traceback
        traceback.print_exc()
        return {
            'error': f"Audio analysis failed: {str(error)[:80]}",
            'sentiment': 'Unknown',
            'risk_level': 'Error'
        }


def get_sentiment_description(sentiment: str) -> str:

    descriptions = {
        'Neutral': 'Calm and composed',
        'Positive': 'Happy, confident, or reassured',
        'Negative': 'Distressed, angry, or afraid'
    }
    return descriptions.get(sentiment, sentiment)
