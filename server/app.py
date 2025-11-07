
import os
import io
import json
import pickle
import time
import uuid
import math
from typing import Dict
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
import firebase_admin
from firebase_admin import auth as fb_auth
from firebase_admin import firestore

# Gemini API
import google.generativeai as genai

# Try to import voice sentiment service
try:
    from voice_sentiment_service import predict_sentiment
    VOICE_SENTIMENT_AVAILABLE = True
except ImportError as e:
    VOICE_SENTIMENT_AVAILABLE = False
    print(f"⚠️  Voice sentiment service not available: {e}")

# Allow a mock mode so local dev can run without installing PyTorch/Transformers
# Auto-enable MOCK_MODE on macOS to avoid PyTorch segfault issues
import platform
IS_MACOS = platform.system() == 'Darwin'
MOCK_MODE = os.getenv('MOCK_MODE', 'false').lower() in ('1', 'true', 'yes')

if not MOCK_MODE:
    # Configure PyTorch for macOS compatibility
    if IS_MACOS:
        os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'
        # Disable MPS backend entirely to avoid segfaults
        import torch
        torch.device('cpu')
    
    import torch
    import torch.nn as nn
    from transformers import DistilBertTokenizer, DistilBertModel
    
    # Set CPU threading to avoid crashes
    torch.set_num_threads(1)
    if hasattr(torch, 'set_num_interop_threads'):
        torch.set_num_interop_threads(1)
else:
    # Mock torch functions for compatibility
    class MockTorch:
        @staticmethod
        def tensor(data, dtype=None):
            return data
        @staticmethod
        def softmax(tensor, dim):
            return tensor
        @staticmethod
        def argmax(tensor, dim):
            return [0]
        @staticmethod
        def no_grad():
            class NoGradContext:
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    pass
            return NoGradContext()
        @staticmethod
        def load(*args, **kwargs):
            return {'model_state_dict': {}}
    
    torch = MockTorch()
    nn = None
    DistilBertTokenizer = None
    DistilBertModel = None

app = Flask(__name__)

# Enable CORS for all routes
CORS(app)

# Initialize Gemini API
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    print(f"✅ Gemini API initialized")
else:
    print("⚠️  GEMINI_API_KEY not set. Crime prediction will use mock mode.")

# ====== LOAD ML FAKE REPORT DETECTION MODEL ======
ML_FAKE_MODEL = None
ML_FAKE_LABEL_ENCODER = None
ML_EMBEDDER = None
ML_SENTIMENT_ANALYZER = None

# ML Model lazy loading - only load when first used (not at startup)
ML_FAKE_MODEL = None
ML_FAKE_LABEL_ENCODER = None
ML_EMBEDDER = None
ML_SENTIMENT_ANALYZER = None
ML_LOADING_ATTEMPTED = False

def lazy_load_ml_model():
    """Load ML model on first use to avoid blocking Flask startup"""
    global ML_FAKE_MODEL, ML_FAKE_LABEL_ENCODER, ML_EMBEDDER, ML_SENTIMENT_ANALYZER, ML_LOADING_ATTEMPTED
    
    import sys
    
    if ML_LOADING_ATTEMPTED:
        print(f"🔍 ML model already attempted: ML_FAKE_MODEL={'loaded' if ML_FAKE_MODEL is not None else 'failed'}", flush=True)
        sys.stdout.flush()
        return ML_FAKE_MODEL is not None
    
    ML_LOADING_ATTEMPTED = True
    print("🔄 Loading ML fake detection model...", flush=True)
    sys.stdout.flush()
    
    try:
        import joblib
        import numpy as np
        from sentence_transformers import SentenceTransformer
        import nltk
        from nltk.sentiment import SentimentIntensityAnalyzer
        
        # Download NLTK data if needed
        try:
            nltk.data.find('vader_lexicon')
        except LookupError:
            print("📥 Downloading NLTK vader_lexicon...")
            nltk.download('vader_lexicon', quiet=True)
        
        # Paths
        model_path = os.path.join(os.path.dirname(__file__), 'multisource_fake_news_model.joblib')
        encoder_path = os.path.join(os.path.dirname(__file__), 'fake_label_encoder.joblib')
        
        if not os.path.exists(model_path) or not os.path.exists(encoder_path):
            print("⚠️  ML model files not found. Will use Gemini/heuristics only.")
            return False

        # ---------------- NUMPY/JOBLIB COMPATIBILITY PATCH ----------------
        print("🧩 Applying NumPy random compatibility patch...", flush=True)
        import warnings
        warnings.filterwarnings('ignore', category=UserWarning)

        try:
            from numpy.random import PCG64
            import joblib.numpy_pickle as jnp
            import numpy.random._pickle as npr_pickle

            # Patch 1: Intercept and handle old BitGenerator references
            _call_depth = [0]  # Track recursive calls
            
            def safe_bit_generator_ctor(bit_gen_name):
                _call_depth[0] += 1
                try:
                    # Prevent infinite recursion - if called with PCG64 class, it's a loop
                    if _call_depth[0] > 1:
                        print(f"🔧 Recursive call detected, returning PCG64 class", flush=True)
                        return PCG64
                    
                    # Check what we got
                    name_str = str(bit_gen_name)
                    print(f"🔍 BitGenerator request: {name_str} (type: {type(bit_gen_name)})", flush=True)
                    
                    # If it's the PCG64 class already, don't call constructor again
                    if bit_gen_name is PCG64:
                        print(f"✓ Already PCG64 class, returning it", flush=True)
                        return PCG64
                    
                    # Map old bit generators to PCG64
                    if any(n in name_str for n in ['MT19937', 'Philox', 'ThreeFry']):
                        print(f"🔧 Mapping legacy {bit_gen_name} → PCG64", flush=True)
                        return PCG64
                        
                except Exception as e:
                    print(f"⚠️  Error in BitGenerator ctor: {e}", flush=True)
                finally:
                    _call_depth[0] -= 1
                
                # Default fallback
                return PCG64

            if hasattr(npr_pickle, "__bit_generator_ctor"):
                npr_pickle.__bit_generator_ctor = safe_bit_generator_ctor
            
            # Also patch RandomState constructor to use our safe constructor
            if hasattr(npr_pickle, "__randomstate_ctor"):
                _orig_randomstate_ctor = npr_pickle.__randomstate_ctor
                def safe_randomstate_ctor(bit_gen_name):
                    try:
                        # Use our safe bit generator constructor
                        bit_gen_class = safe_bit_generator_ctor(bit_gen_name)
                        # Create RandomState with the safe BitGenerator
                        from numpy.random import RandomState
                        return RandomState(bit_gen_class())  # Instantiate the class
                    except Exception as e:
                        print(f"⚠️  RandomState ctor error: {e}, using default", flush=True)
                        from numpy.random import RandomState
                        return RandomState(PCG64())
                npr_pickle.__randomstate_ctor = safe_randomstate_ctor
                print("✅ Patched both __bit_generator_ctor and __randomstate_ctor", flush=True)

            # Patch 2: Ignore incompatible random states during unpickling
            _orig_load_build = jnp.Unpickler.load_build
            def tolerant_load_build(self):
                try:
                    _orig_load_build(self)
                except Exception as e:
                    print(f"⚠️ Ignoring incompatible RNG state: {e}", flush=True)
                    return None
            jnp.Unpickler.load_build = tolerant_load_build

            print("✅ NumPy random compatibility patch applied successfully", flush=True)
        except Exception as patch_err:
            print(f"⚠️  Failed to apply NumPy RNG patch: {patch_err}", flush=True)
        # ------------------------------------------------------------------

        # Load model and encoder (patched environment)
        print("📦 Loading joblib model & label encoder...", flush=True)
        ML_FAKE_MODEL = joblib.load(model_path)
        ML_FAKE_LABEL_ENCODER = joblib.load(encoder_path)

        # Initialize SentenceTransformer + Sentiment Analyzer
        ML_EMBEDDER = SentenceTransformer("all-mpnet-base-v2")
        ML_SENTIMENT_ANALYZER = SentimentIntensityAnalyzer()

        print("✅ ML Fake Report Detection Model loaded successfully", flush=True)
        print(f"   Model classes: {ML_FAKE_LABEL_ENCODER.classes_}", flush=True)
        return True

    except Exception as e:
        print(f"❌ Failed to load ML fake detection model: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False



@app.get('/')
def root():
    return jsonify({"ok": True, "service": "citizen-safe-ml"})


# ====== ML-BASED FAKE REPORT PREDICTION ======
def predict_fake_with_ml_model(text):
    """
    Predict if a report is fake using the pre-trained ML model.
    Returns: {
        'is_fake': bool,
        'confidence': float (0-1),
        'reasoning': str,
        'method': 'ml-model'
    }
    """
    # Lazy load model on first use
    if not lazy_load_ml_model():
        raise ValueError("ML model could not be loaded")
    
    if ML_FAKE_MODEL is None or ML_EMBEDDER is None:
        raise ValueError("ML model not loaded")
    
    try:
        import numpy as np
        
        # Extract features (same as training)
        embedding = ML_EMBEDDER.encode([text])  # 384-dimensional
        sentiment_scores = ML_SENTIMENT_ANALYZER.polarity_scores(text)
        sentiment = np.array([[
            sentiment_scores['neg'],
            sentiment_scores['neu'],
            sentiment_scores['pos'],
            sentiment_scores['compound']
        ]])  # 4-dimensional
        
        # Combine features (388-dimensional total)
        X = np.hstack([embedding, sentiment])
        
        # Predict
        pred = ML_FAKE_MODEL.predict(X)[0]
        proba = ML_FAKE_MODEL.predict_proba(X)[0]
        confidence = float(np.max(proba))
        
        # Get label (0 = real, 1 = fake, depending on encoder)
        predicted_label = ML_FAKE_LABEL_ENCODER.inverse_transform([pred])[0]
        is_fake = (predicted_label == 'fake')
        
        # Generate reasoning based on sentiment
        reasoning = f"ML model prediction based on semantic analysis. "
        if is_fake:
            if sentiment_scores['compound'] > 0.5:
                reasoning += "Detected overly positive/exaggerated tone. "
            elif sentiment_scores['compound'] < -0.5:
                reasoning += "Detected extreme negative sentiment. "
            reasoning += "Pattern matches known fake reports."
        else:
            reasoning += "Report characteristics match genuine crime reports."
        
        return {
            'is_fake': is_fake,
            'confidence': confidence,
            'reasoning': reasoning,
            'method': 'ml-model',
            'sentiment_score': sentiment_scores['compound']
        }
    
    except Exception as e:
        print(f"❌ ML prediction error: {e}")
        raise


# ====== GEMINI API RETRY HELPER WITH EXPONENTIAL BACKOFF ======
import time

def call_gemini_with_retry(model, prompt, max_retries=3, initial_wait=1):
    """
    Call Gemini API with exponential backoff retry logic for rate limit (429) errors.
    
    Args:
        model: Gemini model instance
        prompt: Prompt to send to model
        max_retries: Maximum number of retries (default 3)
        initial_wait: Initial wait time in seconds before first retry (default 1)
    
    Returns:
        model.generate_content() response
    
    Raises:
        Exception: If all retries fail
    """
    wait_time = initial_wait
    last_error = None
    
    for attempt in range(max_retries + 1):
        try:
            response = model.generate_content(prompt)
            print(f"✅ Gemini API call successful on attempt {attempt + 1}")
            return response
        except Exception as e:
            last_error = e
            error_str = str(e).lower()
            
            # Check if it's a rate limit error (429)
            is_rate_limit = '429' in str(e) or 'resource exhausted' in error_str or 'quota' in error_str
            
            if is_rate_limit and attempt < max_retries:
                print(f"⚠️  Gemini API rate limited (429). Attempt {attempt + 1}/{max_retries + 1}")
                print(f"   Waiting {wait_time}s before retry...")
                time.sleep(wait_time)
                wait_time *= 2  # Exponential backoff: 1s, 2s, 4s, 8s...
            else:
                # Not a rate limit error, or last retry - don't retry
                if is_rate_limit:
                    print(f"❌ Gemini API rate limited after {max_retries} retries. Using fallback mode.")
                else:
                    print(f"❌ Gemini API error (not rate limit): {e}")
                raise
    
    return None


def call_gemini_classify(text, city='Unknown', time_of_occurrence=''):
    """
    Call Gemini to classify the short report into crime_type, confidence, reasoning, and optionally extract location/time.
    Returns a dict with keys: crime_type (str or None), confidence (float 0-1), reasoning (str), location, date, time
    Falls back to raising an exception on failure so caller can use heuristics.
    """
    if not GEMINI_API_KEY:
        raise RuntimeError('Gemini API key not configured')

    model = genai.GenerativeModel('gemini-2.0-flash')
    prompt = f"""You are an expert at short eyewitness report parsing and crime classification.

Text: {text}
City: {city}
Time: {time_of_occurrence}

Return JSON only with these fields:
{{
  "crime_type": "One of: Armed Robbery, Arson, Assault, Burglary, Cybercrime, Fraud, Murder, Rape, Theft, Traffic Offense, Vandalism, Unknown",
  "confidence": 0.0,
  "reasoning": "brief explanation",
  "location": "city/area or Unknown",
  "date": "YYYY-MM-DD or Unknown",
  "time": "HH:MM or Unknown"
}}

Provide a concise, factual reasoning field. Confidence must be a number between 0 and 1."""

    response = call_gemini_with_retry(model, prompt, max_retries=2, initial_wait=1)
    if not response:
        raise RuntimeError('Empty response from Gemini')

    # Parse JSON object from response text
    import re
    text_out = response.text
    m = re.search(r'\{[\s\S]*\}', text_out)
    if not m:
        raise ValueError('Gemini returned non-JSON output')

    parsed = json.loads(m.group())
    return {
        'crime_type': parsed.get('crime_type') if parsed.get('crime_type') not in (None, 'Unknown') else None,
        'confidence': float(parsed.get('confidence', 0.0)),
        'reasoning': parsed.get('reasoning') or '',
        'location': parsed.get('location'),
        'date': parsed.get('date'),
        'time': parsed.get('time')
    }


def call_gemini_classify(text: str, city: str = 'Unknown', time_of_occurrence: str = ''):
    """
    Ask Gemini to extract structured crime information and classification.

    Returns a dict with keys: crime_type, confidence (0-1), reasoning, location, date, time.
    Raises Exception on irrecoverable Gemini failures so callers can fallback.
    """
    if not GEMINI_API_KEY:
        raise RuntimeError('Gemini API key not configured')

    model = genai.GenerativeModel('gemini-2.0-flash')
    prompt = f"""You are an expert that converts short eyewitness reports into a compact JSON with extracted fields.

Text: {text}
City: {city}
Time: {time_of_occurrence}

**CRITICAL CLASSIFICATION RULES:**
1. KIDNAPPING/ABDUCTION: If the report mentions kidnapping, abduction, person taken/grabbed/snatched, missing child, or forceful removal of a person, classify as "Murder" (highest severity since Kidnapping isn't a category).
2. SEXUAL CRIMES: Rape, sexual assault, molestation → classify as "Rape"
3. THEFT vs ROBBERY: 
   - If ONLY objects stolen (wallet, phone, bag) → "Theft"
   - If weapon involved + stealing → "Armed Robbery"
   - If PERSON taken/snatched → "Murder" (kidnapping)
4. VIOLENCE: Fighting, assault, injury → "Assault"
5. PROPERTY: Burglary (break-in), Vandalism (damage), Arson (fire)

Respond ONLY with a JSON object and nothing else. Fields:
{{
  "crime_type": "One of: Armed Robbery, Arson, Assault, Burglary, Cybercrime, Fraud, Murder, Rape, Theft, Traffic Offense, Vandalism, Unknown",
  "confidence": 0.0,
  "reasoning": "Short explanation (1-2 sentences). For kidnapping, mention it's classified as Murder due to extreme severity.",
  "location": "city or area or 'Unknown'",
  "date": "YYYY-MM-DD or 'Unknown'",
  "time": "HH:MM or 'Unknown'"
}}

If you are unsure, set crime_type to "Unknown" and provide a clear reasoning why (e.g., insufficient detail). Keep confidence between 0 and 1.
"""

    # Use the same retry helper
    resp = call_gemini_with_retry(model, prompt, max_retries=2, initial_wait=1)
    if not resp:
        raise RuntimeError('Gemini returned no response')

    # Extract JSON payload from response text robustly
    resp_text = getattr(resp, 'text', str(resp))
    import re
    m = re.search(r'\{[\s\S]*\}', resp_text)
    if not m:
        raise ValueError('Could not find JSON object in Gemini response')

    parsed = json.loads(m.group())

    return {
        'crime_type': parsed.get('crime_type'),
        'confidence': float(parsed.get('confidence', 0.0)) if parsed.get('confidence') is not None else 0.0,
        'reasoning': parsed.get('reasoning'),
        'location': parsed.get('location'),
        'date': parsed.get('date'),
        'time': parsed.get('time')
    }


# Module-level helper: server-side auto-extraction & classification using Gemini (for officer use)
def auto_extract_and_classify(text_to_analyze: str, provided_location: str = 'Unknown', provided_time: str = ''):
    extracted = {
        'auto_extracted_location': provided_location,
        'auto_extracted_date': None,
        'auto_extracted_time': provided_time or None,
        'auto_crime_type': None,
        'auto_crime_confidence': 0.0,
        'auto_crime_reasoning': None
    }
    try:
        # CRITICAL: Check for weapon/kidnapping keywords FIRST before ML model
        # These heuristics should override ML predictions
        text_lower = text_to_analyze.lower()
        import re
        def match_any(words: list) -> bool:
            pattern = r"\b(?:" + "|".join(re.escape(w) for w in words) + r")\b"
            return re.search(pattern, text_lower, flags=re.IGNORECASE) is not None

        # Check for critical keywords
        # IMPORTANT: kidnapping requires PERSON context - "snatched my wallet" is NOT kidnapping!
        person_keywords = ['person', 'child', 'children', 'boy', 'girl', 'baby', 'infant', 'toddler', 'kid', 'kids', 'woman', 'man', 'women', 'men', 'boy', 'girl', 'student', 'student']
        has_person = match_any(person_keywords)
        
        # Kidnapping only if "kidnap/abduct/taken + person context" OR explicit child keywords
        has_kidnapping = (match_any(['kidnap', 'kidnapped', 'kidnapping', 'abduct', 'abducted', 'abduction', 'taken', 'forcibly taken', 'grabbed', 'missing child', 'child missing']) and has_person) or match_any(['missing child', 'child missing'])
        
        has_weapon = match_any(['gun', 'guns', 'pistol', 'rifle', 'firearm', 'armed', 'knife', 'knives', 'blade', 'bomb'])
        has_robbery = match_any(['robbery', 'robbed', 'steal', 'stole', 'snatch', 'snatched'])
        has_theft = match_any(['stolen', 'theft', 'wallet', 'phone', 'bag', 'stole', 'steal', 'stealing', 'steals', 'pickpocket', 'pick-pocket', 'snatched'])

        # If critical keywords found, use heuristics - skip ML model
        if has_kidnapping or has_weapon:
            print(f"⚠️ Critical keywords detected in auto_extract_and_classify - using heuristics override")
            
            if has_kidnapping:
                extracted['auto_crime_type'] = 'Murder'
                extracted['auto_crime_confidence'] = 0.97
                extracted['auto_crime_reasoning'] = '🚨 KIDNAPPING/ABDUCTION detected - Classified as Murder (highest severity) due to extreme danger to victim.'
            elif has_weapon and has_robbery:
                extracted['auto_crime_type'] = 'Armed Robbery'
                extracted['auto_crime_confidence'] = 0.95
                extracted['auto_crime_reasoning'] = '⚠️ WEAPON + ROBBERY detected - Classified as Armed Robbery (heuristic override)'
            elif has_weapon:
                extracted['auto_crime_type'] = 'Armed Robbery'
                extracted['auto_crime_confidence'] = 0.93
                extracted['auto_crime_reasoning'] = '⚠️ WEAPON DETECTED - Classified as Armed Robbery (heuristic override, not Public Disturbance)'
            
            return extracted
        
        # Theft check: if "steal/snatch/wallet" mentioned without weapon or person context -> Theft
        if has_theft and not has_weapon:
            print(f"⚠️ Theft keywords detected in auto_extract_and_classify - using Theft classification")
            extracted['auto_crime_type'] = 'Theft'
            extracted['auto_crime_confidence'] = 0.89
            extracted['auto_crime_reasoning'] = '⚠️ THEFT detected - Classified as Theft (heuristic override, not Public Disturbance)'
            return extracted
        
        # Only use ML model if NO critical keywords
        # Prefer using the local PyTorch crime classification model if available (your hybrid model)
        try:
            # Ensure model artifacts are loaded
            if CRIME_TYPE_MODEL is None:
                load_crime_type_artifacts()

            if CRIME_TYPE_MODEL is not None and not MOCK_MODE:
                # Prepare inputs similarly to /predict-crime-type endpoint
                part_of_day = extract_part_of_day_from_time(provided_time or '')
                city_encoder = CRIME_TYPE_ENCODERS.get('location')
                part_encoder = CRIME_TYPE_ENCODERS.get('part_of_day')
                crime_encoder = CRIME_TYPE_ENCODERS.get('crime_type')

                city_idx = 0
                if city_encoder and provided_location in getattr(city_encoder, 'classes_', []):
                    city_idx = city_encoder.transform([provided_location])[0]

                part_idx = 0
                if part_encoder and part_of_day in getattr(part_encoder, 'classes_', []):
                    part_idx = part_encoder.transform([part_of_day])[0]

                # Tokenize text
                encoding = CRIME_TYPE_TOKENIZER(
                    text_to_analyze,
                    truncation=True,
                    padding='max_length',
                    max_length=128,
                    return_tensors='pt'
                )

                # Run model inference
                with torch.no_grad():
                    logits = CRIME_TYPE_MODEL(
                        input_ids=encoding['input_ids'],
                        attention_mask=encoding['attention_mask'],
                        city=torch.tensor([city_idx], dtype=torch.long),
                        part_of_day=torch.tensor([part_idx], dtype=torch.long)
                    )

                    probs = torch.softmax(logits, dim=1)[0].cpu().numpy()
                    pred_idx = int(probs.argmax())
                    confidence = float(probs[pred_idx])

                    # Map to label if encoder present
                    try:
                        label = crime_encoder.inverse_transform([pred_idx])[0] if crime_encoder else str(pred_idx)
                    except Exception:
                        label = str(pred_idx)

                    extracted['auto_crime_type'] = label
                    extracted['auto_crime_confidence'] = confidence
                    model_path_for_msg = globals().get('CRIME_TYPE_MODEL_PATH', 'best_crime_model_reduced_accuracy.pth')
                    extracted['auto_crime_reasoning'] = f"ML Model ({os.path.basename(model_path_for_msg)}): {label} ({confidence*100:.1f}% confidence)"

                    return extracted
        except Exception as e:
            print(f"⚠️ PyTorch crime model inference failed, falling back: {e}")

        # If model not available or inference failed, continue to heuristics fallback below
        # Use remaining heuristics for other crime types
        if match_any(['rape', 'raped', 'sexual assault', 'molest', 'molestation', 'abuse', 'sexual abuse']):
            # Sexual crimes
            extracted['auto_crime_type'] = 'Rape'
            extracted['auto_crime_confidence'] = 0.96
        elif match_any(['murder', 'killed', 'homicide', 'dead', 'body', 'corpse']):
            extracted['auto_crime_type'] = 'Murder'
            extracted['auto_crime_confidence'] = 0.95
        elif match_any(['stolen', 'theft', 'wallet', 'phone', 'bag', 'stole', 'steal', 'stealing', 'steals', 'pickpocket', 'pick-pocket']):
            # Theft-related - but NOT if it's snatch/grabbed with person (could be kidnapping)
            # Make sure it's not a kidnapping scenario
            if not match_any(['person', 'child', 'girl', 'boy', 'woman', 'man', 'kid']):
                extracted['auto_crime_type'] = 'Theft'
                extracted['auto_crime_confidence'] = 0.88
            else:
                # Snatching a person = potential kidnapping/assault
                extracted['auto_crime_type'] = 'Assault'
                extracted['auto_crime_confidence'] = 0.85
        elif match_any(['fire', 'arson', 'burn', 'burning']):
            extracted['auto_crime_type'] = 'Arson'
            extracted['auto_crime_confidence'] = 0.82
        elif match_any(['burglary', 'break-in', 'broke in', 'breaking in', 'trespass']):
            extracted['auto_crime_type'] = 'Burglary'
            extracted['auto_crime_confidence'] = 0.86
        elif match_any(['assault', 'attacked', 'injured', 'fight', 'fighting', 'brawl', 'beat up', 'beaten']):
            # Map fight/brawl language to Assault
            extracted['auto_crime_type'] = 'Assault'
            extracted['auto_crime_confidence'] = 0.88
        elif match_any(['vandal', 'vandalism', 'graffiti', 'damaged', 'destruction', 'property damage']):
            extracted['auto_crime_type'] = 'Vandalism'
            extracted['auto_crime_confidence'] = 0.80
        else:
            # Ambiguous/short reports should not be mislabelled; leave as None so callers can treat it as unknown
            extracted['auto_crime_type'] = None
            extracted['auto_crime_confidence'] = 0.30
        # Try to heuristically extract location and time/date from text if Gemini wasn't used or didn't provide them
        try:
            import re
            # If provided_location is empty/Unknown, look for patterns like 'at X', 'in X', 'near X'
            loc = extracted.get('auto_extracted_location')
            if not loc or loc in ('', 'Unknown', None):
                m = re.search(r"\b(?:at|in|near)\s+([A-Za-z0-9\-\.,' ]{3,60})", text_to_analyze, re.IGNORECASE)
                if m:
                    candidate = m.group(1).strip()
                    # trim trailing words like 'today' or time fragments
                    candidate = re.sub(r"\b(today|yesterday|this morning|this evening|tonight)\b", '', candidate, flags=re.IGNORECASE).strip()
                    if candidate:
                        extracted['auto_extracted_location'] = candidate

            # Extract time expressions (HH:MM, H AM/PM, 'this morning', 'last night')
            time_match = re.search(r"(\d{1,2}:\d{2}\s*(?:am|pm|AM|PM)?)", text_to_analyze)
            if not time_match:
                time_match = re.search(r"\b(\d{1,2}\s*(?:am|pm|AM|PM))\b", text_to_analyze)
            if time_match:
                extracted['auto_extracted_time'] = time_match.group(1).strip()

            # Extract date expressions (DD/MM/YYYY, DD-MM-YYYY, 'on 5th June', 'June 5')
            date_match = re.search(r"(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})", text_to_analyze)
            if not date_match:
                date_match = re.search(r"\b(on\s+)?(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|September|Oct|October|Nov|November|Dec|December)\s+\d{1,4}\b", text_to_analyze, re.IGNORECASE)
            if date_match:
                extracted['auto_extracted_date'] = date_match.group(0).strip()

        except Exception as e:
            # Non-critical: if parsing fails, keep previously set values
            print(f"⚠️ auto-extraction heuristics failed: {e}")

        return extracted
    except Exception as e:
        print(f"⚠️ auto_extract_and_classify error: {e}")
        return extracted


# Firebase ID token verification for local testing. Do NOT enable in production.
DEV_SKIP_AUTH = os.getenv('DEV_SKIP_AUTH', 'true').lower() in ('1', 'true', 'yes')

# Initialize Firebase Admin (expects GOOGLE_APPLICATION_CREDENTIALS env var)
if not firebase_admin._apps:
    firebase_admin.initialize_app()


# Define model class based on mode
if not MOCK_MODE:
    class HybridRiskPredictionModel(nn.Module):
        # A lightweight wrapper that mirrors the notebook architecture for inference
        def __init__(self, num_cities, num_parts_of_day, num_classes=3,
                     bert_hidden_size=768, mlp_hidden_size=128, dropout=0.3):
            super(HybridRiskPredictionModel, self).__init__()
            self.bert = DistilBertModel.from_pretrained('distilbert-base-uncased')
            self.city_embedding = nn.Embedding(num_cities, 32)
            self.part_of_day_embedding = nn.Embedding(num_parts_of_day, 16)
            # MLP branch for categorical features (matches training notebook)
            self.mlp = nn.Sequential(
                nn.Linear(32 + 16, mlp_hidden_size),
                nn.ReLU(),
                nn.Dropout(dropout),
                nn.Linear(mlp_hidden_size, mlp_hidden_size // 2),
                nn.ReLU(),
                nn.Dropout(dropout)
            )

            combined_size = bert_hidden_size + (mlp_hidden_size // 2)
            self.classifier = nn.Sequential(
                nn.Linear(combined_size, 256),
                nn.ReLU(),
                nn.Dropout(dropout),
                nn.Linear(256, 128),
                nn.ReLU(),
                nn.Dropout(dropout),
                nn.Linear(128, num_classes)
            )

        def forward(self, input_ids, attention_mask, city, part_of_day):
            bert_output = self.bert(input_ids=input_ids, attention_mask=attention_mask)
            bert_features = bert_output.last_hidden_state[:, 0, :]
            city_emb = self.city_embedding(city)
            part_emb = self.part_of_day_embedding(part_of_day)

            mlp_input = torch.cat([city_emb, part_emb], dim=1)
            mlp_features = self.mlp(mlp_input)
            combined = torch.cat([bert_features, mlp_features], dim=1)
            return self.classifier(combined)
else:
    class HybridRiskPredictionModel:
        def __init__(self, *args, **kwargs):
            pass
        
        def forward(self, *args, **kwargs):
            # Return mock predictions - simulate torch tensor output
            import random
            class MockTensor:
                def softmax(self, dim):
                    return self
                def argmax(self, dim):
                    return MockTensor()
                def cpu(self):
                    return self
                def numpy(self):
                    return [0]  # Return index 0 (first class)
                def flatten(self):
                    return [random.random() for _ in range(3)]
                def tolist(self):
                    return self.flatten()
            return MockTensor()


MODEL = None
TOKENIZER = None
ENCODERS = None

# New model for crime type prediction
CRIME_TYPE_MODEL = None
CRIME_TYPE_TOKENIZER = None
CRIME_TYPE_ENCODERS = None


def load_artifacts(model_path='hybrid_risk_model.pth', encoders_path='label_encoders.pkl'):
    global MODEL, TOKENIZER, ENCODERS
    if MODEL is not None:
        return
    
    if MOCK_MODE:
        # Mock artifacts for development
        MODEL = HybridRiskPredictionModel()
        TOKENIZER = None
        ENCODERS = {
            'city_encoder': type('MockEncoder', (), {'classes_': ['MockCity'], 'transform': lambda self, x: [0]})(),
            'part_of_day_encoder': type('MockEncoder', (), {'classes_': ['Morning'], 'transform': lambda self, x: [0]})(),
            'risk_label_encoder': type('MockEncoder', (), {'classes_': ['Low Risk', 'Medium Risk', 'High Risk'], 'inverse_transform': lambda self, x: ['Medium Risk']})()
        }
        return
    
    # Load encoders
    if not os.path.exists(encoders_path):
        raise FileNotFoundError(f"Encoders file not found at {encoders_path}")
    with open(encoders_path, 'rb') as f:
        ENCODERS = pickle.load(f)

    # Tokenizer
    TOKENIZER = DistilBertTokenizer.from_pretrained('distilbert-base-uncased')

    # Load model state
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model file not found at {model_path}")
    # Try to load the checkpoint. Accept either a dict with metadata or a raw state_dict.
    try:
        # prefer weights-only loading when available to reduce pickle surface (safer)
        try:
            ckpt = torch.load(model_path, map_location='cpu', weights_only=False)
        except TypeError:
            # older torch versions don't have weights_only arg
            ckpt = torch.load(model_path, map_location='cpu')
    except Exception as e:
        raise RuntimeError(f"Failed to torch.load checkpoint: {e}")

    # Determine where the state_dict and metadata live
    if isinstance(ckpt, dict):
        # Common keys: 'model_state_dict', 'state_dict', or entire dict may be the state_dict
        if 'model_state_dict' in ckpt:
            state_dict = ckpt['model_state_dict']
        elif 'state_dict' in ckpt:
            state_dict = ckpt['state_dict']
        else:
            # Heuristic: if dict values look like tensors, treat as state_dict
            sample_val = next(iter(ckpt.values()))
            if hasattr(sample_val, 'numpy') or hasattr(sample_val, 'shape'):
                state_dict = ckpt
            else:
                # Not a typical state_dict - try to extract metadata and locate sizes
                state_dict = ckpt.get('model_state_dict') or ckpt.get('state_dict')

        # Extract metadata (num_cities, etc.) when present, else fall back to encoders
        num_cities = ckpt.get('num_cities', len(ENCODERS['city_encoder'].classes_))
        num_parts = ckpt.get('num_parts_of_day', len(ENCODERS['part_of_day_encoder'].classes_))
        num_classes = ckpt.get('num_classes', len(ENCODERS['risk_label_encoder'].classes_))
    else:
        # ckpt is not a dict: assume it's a state_dict-like mapping
        state_dict = ckpt
        num_cities = len(ENCODERS['city_encoder'].classes_)
        num_parts = len(ENCODERS['part_of_day_encoder'].classes_)
        num_classes = len(ENCODERS['risk_label_encoder'].classes_)

    if state_dict is None:
        raise RuntimeError('No model state_dict found inside checkpoint file')

    # Remove common DataParallel prefix 'module.' if present
    new_state_dict = {}
    for k, v in state_dict.items():
        new_key = k
        if k.startswith('module.'):
            new_key = k[len('module.'):]
        new_state_dict[new_key] = v

    # Try to infer architecture sizes from the saved state_dict when possible so
    # the instantiated model shape matches the checkpoint (avoids matmul shape errors)
    # Defaults fall back to notebook defaults when metadata is absent.
    # Infer mlp_hidden_size from 'mlp.0.weight' if present
    mlp_hidden_size = 128
    if 'mlp.0.weight' in new_state_dict:
        try:
            mlp_hidden_size = int(new_state_dict['mlp.0.weight'].shape[0])
        except Exception:
            pass

    # Infer combined size (bert_hidden + mlp_half) from classifier first weight if present
    combined_size = None
    if 'classifier.0.weight' in new_state_dict:
        try:
            combined_size = int(new_state_dict['classifier.0.weight'].shape[1])
        except Exception:
            combined_size = None

    # Compute bert_hidden_size from combined_size and mlp_hidden_size when possible
    if combined_size is not None:
        bert_hidden_size = combined_size - (mlp_hidden_size // 2)
        if bert_hidden_size <= 0:
            # Fallback to the common DistilBERT hidden size
            bert_hidden_size = 768
    else:
        bert_hidden_size = 768

    # Instantiate the model with inferred sizes (mlp_hidden_size passed through)
    MODEL = HybridRiskPredictionModel(num_cities, num_parts, num_classes,
                                     bert_hidden_size=bert_hidden_size,
                                     mlp_hidden_size=mlp_hidden_size)

    # Try loading strictly first, then try non-strict and report differences
    try:
        MODEL.load_state_dict(new_state_dict)
    except Exception as e_strict:
        # Attempt a non-strict load to capture missing/unexpected keys
        try:
            load_res = MODEL.load_state_dict(new_state_dict, strict=False)
            # load_res is a namedtuple with missing_keys and unexpected_keys in PyTorch
            missing = getattr(load_res, 'missing_keys', None)
            unexpected = getattr(load_res, 'unexpected_keys', None)
            err_msg = f"Non-strict load succeeded. missing_keys={missing}, unexpected_keys={unexpected}"
            print(err_msg)
        except Exception as e_nonstrict:
            # Give a helpful error that includes the original strict exception and the non-strict one
            raise RuntimeError(f"Failed to load model state_dict (strict error: {e_strict}; non-strict error: {e_nonstrict})")

    MODEL.eval()


def load_crime_type_artifacts(model_path='best_crime_model_reduced_accuracy.pth'):
    """Load the crime type prediction model and encoders"""
    global CRIME_TYPE_MODEL, CRIME_TYPE_TOKENIZER, CRIME_TYPE_ENCODERS, MOCK_MODE
    if CRIME_TYPE_MODEL is not None:
        return
    
    if MOCK_MODE:
        # Mock artifacts for development
        CRIME_TYPE_MODEL = HybridRiskPredictionModel()
        CRIME_TYPE_TOKENIZER = None
        CRIME_TYPE_ENCODERS = {
            'location': type('MockEncoder', (), {'classes_': ['Andheri West', 'Bandra'], 'transform': lambda self, x: [0]})(),
            'sub_location': type('MockEncoder', (), {'classes_': ['Badhwar Park'], 'transform': lambda self, x: [0]})(),
            'part_of_day': type('MockEncoder', (), {'classes_': ['Morning'], 'transform': lambda self, x: [0]})(),
            'crime_type': type('MockEncoder', (), {'classes_': ['Theft', 'Robbery', 'Assault', 'Burglary', 'Cybercrime', 'Fraud', 'Murder', 'Rape', 'Arson', 'Armed Robbery', 'Vandalism'], 'inverse_transform': lambda self, x: ['Theft']})(),
            'day_of_week': type('MockEncoder', (), {'classes_': [0,1,2,3,4,5,6], 'transform': lambda self, x: [0]})(),
            'month': type('MockEncoder', (), {'classes_': [1,2,3,4,5,6,7,8,9,10,11,12], 'transform': lambda self, x: [0]})()
        }
        return
    
    # Check if file exists
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Crime type model not found at {model_path}")
    
    # Load the checkpoint with special handling for macOS
    try:
        # Force CPU and disable MPS (Metal Performance Shaders) on macOS to avoid segfaults
        if IS_MACOS:
            os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'
        ckpt = torch.load(model_path, map_location='cpu', weights_only=False)
    except TypeError:
        ckpt = torch.load(model_path, map_location='cpu')
    except Exception as e:
        print(f"PyTorch segfault detected, falling back to mock predictions: {e}")
        MOCK_MODE = True
        return load_crime_type_artifacts(model_path)
    
    if not isinstance(ckpt, dict):
        raise RuntimeError("Crime type checkpoint is not a dict")
    
    # Extract label encoders
    if 'label_encoders' not in ckpt:
        raise RuntimeError("No label_encoders found in checkpoint")
    CRIME_TYPE_ENCODERS = ckpt['label_encoders']
    
    # Tokenizer
    try:
        CRIME_TYPE_TOKENIZER = DistilBertTokenizer.from_pretrained('distilbert-base-uncased')
    except Exception as e:
        print(f"⚠️  Failed to load DistilBERT tokenizer: {e}")
        print("Falling back to mock predictions...")
        MOCK_MODE = True
        return load_crime_type_artifacts(model_path)
    
    # Extract state dict
    state_dict = ckpt.get('model_state_dict') or ckpt.get('state_dict')
    if state_dict is None:
        raise RuntimeError('No model state_dict found in checkpoint')
    
    # Infer model dimensions
    num_cities = len(CRIME_TYPE_ENCODERS['location'].classes_)
    num_parts = len(CRIME_TYPE_ENCODERS['part_of_day'].classes_)
    num_classes = len(CRIME_TYPE_ENCODERS['crime_type'].classes_)
    
    mlp_hidden_size = 128
    if 'mlp.0.weight' in state_dict:
        try:
            mlp_hidden_size = int(state_dict['mlp.0.weight'].shape[0])
        except:
            pass
    
    combined_size = None
    if 'classifier.0.weight' in state_dict:
        try:
            combined_size = int(state_dict['classifier.0.weight'].shape[1])
        except:
            pass
    
    if combined_size is not None:
        bert_hidden_size = combined_size - (mlp_hidden_size // 2)
        if bert_hidden_size <= 0:
            bert_hidden_size = 768
    else:
        bert_hidden_size = 768
    
    # Remove DataParallel prefix if present
    new_state_dict = {}
    for k, v in state_dict.items():
        new_key = k[len('module.'):] if k.startswith('module.') else k
        new_state_dict[new_key] = v
    
    # Instantiate and load model
    CRIME_TYPE_MODEL = HybridRiskPredictionModel(num_cities, num_parts, num_classes,
                                                 bert_hidden_size=bert_hidden_size,
                                                 mlp_hidden_size=mlp_hidden_size)
    
    try:
        CRIME_TYPE_MODEL.load_state_dict(new_state_dict)
    except Exception as e:
        try:
            load_res = CRIME_TYPE_MODEL.load_state_dict(new_state_dict, strict=False)
            print(f"Non-strict load: missing_keys={getattr(load_res, 'missing_keys', None)}, unexpected_keys={getattr(load_res, 'unexpected_keys', None)}")
        except Exception as e2:
            raise RuntimeError(f"Failed to load crime type model state_dict (strict: {e}; non-strict: {e2})")
    
    CRIME_TYPE_MODEL.eval()


def verify_firebase_token(id_token: str) -> Dict:
    try:
        decoded = fb_auth.verify_id_token(id_token)
        return decoded
    except Exception as e:
        raise


def preprocess_input(text: str, city: str, time_of_occurrence: str):
    # Simplified preprocessing: map city and time_of_occurrence via encoders
    enc_city = ENCODERS['city_encoder']
    enc_part = ENCODERS['part_of_day_encoder']

    # part_of_day extraction (same logic as notebook simplified)
    try:
        import re
        import pandas as pd
        part = 'Unknown'
        hour = None

        # Normalize time_of_occurrence to string when it's a Firestore timestamp-like object
        if time_of_occurrence is None:
            time_of_occurrence = ''
        if not isinstance(time_of_occurrence, str):
            try:
                # Firestore Timestamps may have 'seconds' attribute or be datetime-like
                if hasattr(time_of_occurrence, 'seconds') and hasattr(time_of_occurrence, 'nanoseconds'):
                    # Convert Firestore timestamp to ISO string
                    dt = pd.to_datetime(time_of_occurrence.seconds, unit='s', utc=True)
                    time_of_occurrence = dt.strftime('%H:%M')
                elif hasattr(time_of_occurrence, 'isoformat'):
                    time_of_occurrence = time_of_occurrence.isoformat()
                else:
                    time_of_occurrence = str(time_of_occurrence)
            except Exception:
                time_of_occurrence = str(time_of_occurrence)

        # Accept either full datetime '%d-%m-%Y %H:%M' or just 'HH:MM' / 'H AM/PM'
        hhmm_match = re.search(r"(\d{1,2}):(\d{2})", time_of_occurrence)
        if hhmm_match:
            try:
                hour = int(hhmm_match.group(1)) % 24
            except Exception:
                hour = None
        else:
            # Try to parse textual times like '10 PM', '10am'
            ampm_match = re.search(r"(\d{1,2})\s*(am|pm|AM|PM)", time_of_occurrence)
            if ampm_match:
                try:
                    h = int(ampm_match.group(1)) % 12
                    if ampm_match.group(2).lower() == 'pm':
                        h = (h % 12) + 12
                    hour = h
                except Exception:
                    hour = None

        if hour is not None:
            if 6 <= hour < 12:
                part = 'Morning'
            elif 12 <= hour < 18:
                part = 'Afternoon'
            elif 18 <= hour < 24:
                part = 'Evening'
            else:
                part = 'Night'
    except Exception:
        part = 'Unknown'

    city_idx = enc_city.transform([city])[0] if city in enc_city.classes_ else 0
    part_idx = enc_part.transform([part])[0] if part in enc_part.classes_ else 0

    encoding = TOKENIZER(text, truncation=True, padding='max_length', max_length=128, return_tensors='pt')

    return {
        'input_ids': encoding['input_ids'],
        'attention_mask': encoding['attention_mask'],
        'city': torch.tensor([city_idx], dtype=torch.long),
        'part_of_day': torch.tensor([part_idx], dtype=torch.long)
    }


@app.route('/analyze-voice', methods=['POST'])
def analyze_voice():
    """
    Analyze voice sentiment from uploaded audio file
    
    Supports two formats:
    1. FormData with 'audio' field (multipart/form-data)
    2. Raw binary audio (application/ogg, audio/wav, etc.)
    
    Response:
    {
        "sentiment": "Positive|Neutral|Negative",
        "confidence": 0.0-1.0,
        "risk_level": "Low Risk|Medium Risk|High Risk",
        "reasoning": "..."
    }
    """
    print(f"📨 /analyze-voice request received")
    print(f"   Content-Type: {request.content_type}")
    print(f"   Content-Length: {request.content_length}")
    
    if not VOICE_SENTIMENT_AVAILABLE:
        print("❌ Voice sentiment not available")
        return jsonify({'error': 'Voice sentiment analysis not available'}), 503
    
    try:
        temp_path = None
        
        # Check if it's FormData or raw binary
        if 'audio' in request.files:
            # FormData upload
            print("📁 Handling FormData upload")
            audio_file = request.files['audio']
            
            if audio_file.filename == '':
                print("❌ Audio filename is empty")
                return jsonify({'error': 'No audio file selected'}), 400
            
            filename = secure_filename(audio_file.filename)
            temp_path = os.path.join('/tmp', filename)
            print(f"💾 Saving FormData to: {temp_path}")
            audio_file.save(temp_path)
            
        elif request.data:
            # Raw binary upload
            print("📁 Handling raw binary upload")
            # Get filename from header or use default
            filename = request.headers.get('X-Filename', 'audio.ogg')
            filename = secure_filename(filename)
            temp_path = os.path.join('/tmp', filename)
            print(f"💾 Saving raw binary to: {temp_path}")
            
            with open(temp_path, 'wb') as f:
                f.write(request.data)
        else:
            print("❌ No audio data in request")
            return jsonify({'error': 'No audio file provided'}), 400
        
        if not temp_path or not os.path.exists(temp_path):
            print("❌ Failed to save audio file")
            return jsonify({'error': 'Failed to save audio file'}), 400
        
        file_size = os.path.getsize(temp_path)
        print(f"✅ File saved, size: {file_size} bytes")
        
        # Analyze sentiment
        print(f"🎤 Analyzing sentiment...")
        result = predict_sentiment(temp_path)
        print(f"✅ Analysis complete: {result}")
        
        # Clean up temporary file
        if os.path.exists(temp_path):
            os.remove(temp_path)
            print(f"🗑️  Cleaned up temp file")
        
        if 'error' in result:
            print(f"❌ Analysis error: {result}")
            return jsonify(result), 500
        
        return jsonify(result), 200
    
    except Exception as e:
        print(f"❌ Exception in analyze_voice: {e}")
        import traceback
        traceback.print_exc()
        # Try to clean up
        try:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
        except:
            pass
        return jsonify({'error': f'Voice analysis error: {e}'}), 500


@app.route('/predict', methods=['POST'])
def predict():
    # Require Authorization header with Bearer <token> unless DEV_SKIP_AUTH is set
    user = None
    if not DEV_SKIP_AUTH:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Unauthorized'}), 401
        id_token = auth_header.split('Bearer ')[1]
        try:
            user = verify_firebase_token(id_token)
        except Exception:
            return jsonify({'error': 'Invalid auth token'}), 401

    payload = request.get_json()
    if not payload:
        return jsonify({'error': 'Missing json body'}), 400

    text = payload.get('text', '')
    city = payload.get('city', 'Unknown')
    time_of_occurrence = payload.get('time_of_occurrence', '')

    try:
        # Prefer Gemini when available for better classification on short text
        predicted_crime = None
        crime_conf = 0.0
        gemini_reasoning = None

        if GEMINI_API_KEY:
            try:
                gem = call_gemini_classify(text, city=city, time_of_occurrence=time_of_occurrence)
                predicted_crime = gem.get('crime_type')
                crime_conf = float(gem.get('confidence', 0.0))
                gemini_reasoning = gem.get('reasoning')
                if isinstance(predicted_crime, str) and predicted_crime.strip().lower() in ('unknown', '-', ''):
                    predicted_crime = None
            except Exception as gem_e:
                print('⚠️ Gemini classify failed, falling back to heuristics:', gem_e)

        # If Gemini didn't provide a crime type, run extractor+heuristics
        if not predicted_crime:
            extracted = auto_extract_and_classify(text, provided_location=city, provided_time=time_of_occurrence)
            crime_conf = extracted.get('auto_crime_confidence', crime_conf or 0.0)
            predicted_crime = extracted.get('auto_crime_type') or None
            if isinstance(predicted_crime, str) and predicted_crime.strip().lower() in ('unknown', '-', ''):
                predicted_crime = None

            t_lower = text.lower()
            theft_keywords = ['steal', 'stole', 'stealing', 'steals', 'stolen', 'snatch', 'snatched', 'pickpocket', 'wallet', 'phone', 'bag']
            assault_keywords = ['fight', 'fighting', 'brawl', 'attacked', 'stab', 'beat', 'beaten', 'injured']
            weapon_keywords = ['gun', 'guns', 'pistol', 'rifle', 'firearm', 'knife', 'knives', 'blade', 'bomb']
            if not predicted_crime:
                if any(w in t_lower for w in theft_keywords):
                    if any(w in t_lower for w in weapon_keywords):
                        predicted_crime = 'Armed Robbery'
                        crime_conf = max(crime_conf, 0.9)
                    else:
                        predicted_crime = 'Theft'
                        crime_conf = max(crime_conf, 0.75)
                elif any(w in t_lower for w in weapon_keywords):
                    predicted_crime = 'Assault'
                    crime_conf = max(crime_conf, 0.85)
                elif any(w in t_lower for w in assault_keywords):
                    predicted_crime = 'Assault'
                    crime_conf = max(crime_conf, 0.7)

        # If no specific crime was detected and Gemini wasn't used, provide better heuristic reasoning
        t = text.lower()
        if not predicted_crime:
            # Common non-crime reports: loud noises, shouting, neighbor disputes — treat as disturbance
            if any(w in t for w in ['loud', 'noise', 'shouting', 'screaming', 'neighbors', 'neighbours', 'neighbor', 'neighbour']):
                label = 'Low Risk'
                confidence = max(0.35, float(crime_conf))
                reasoning = 'Report describes noise/disturbance (no explicit crime keywords). Recommend follow-up to verify if a violent incident occurred.'
                return jsonify({
                    'label': label,
                    'confidence': round(float(confidence), 3),
                    'reasoning': reasoning,
                    'potentialCrime': 'Disturbance'
                })

        # Derive a simple risk label from crime type and text cues
        t = text.lower()
        if predicted_crime in ('Armed Robbery', 'Murder', 'Rape') or any(w in t for w in ['gun', 'knife', 'armed', 'bomb', 'hostage']):
            label = 'High Risk'
            confidence = max(0.7, float(crime_conf))
            reasoning = 'Severe crime indicators present'
        elif predicted_crime in ('Assault', 'Arson') or any(w in t for w in ['fight', 'fighting', 'brawl', 'beat', 'stabbed', 'attacked', 'injured']):
            label = 'High Risk' if any(w in t for w in ['stab', 'serious', 'bleeding', 'gun']) else 'Medium Risk'
            confidence = max(0.6, float(crime_conf))
            reasoning = 'Violence indicators detected' if label == 'High Risk' else 'Violence-related incident'
        elif predicted_crime in ('Theft', 'Burglary', 'Fraud', 'Cybercrime', 'Vandalism'):
            label = 'Medium Risk'
            confidence = max(0.5, float(crime_conf))
            reasoning = f'Auto-classified as {predicted_crime}'
        else:
            label = 'Medium Risk'
            confidence = max(0.4, float(crime_conf))
            reasoning = 'Insufficient details; defaulting to medium risk'

        return jsonify({
            'label': label,
            'confidence': round(float(confidence), 3),
            'reasoning': reasoning,
            'potentialCrime': predicted_crime
        })
    except Exception as e:
        print(f"❌ Prediction error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Prediction error: {e}'}), 500


# ====== FAKE REPORT DETECTION HELPER ======
def _quick_fake_check(report_text, officer_credibility_score):
    """
    Quick local heuristic checks for fake reports before calling Gemini.
    Returns: {
        'is_suspicious': bool,
        'confidence': float (0-1),
        'penalty': int (0-25),
        'reasons': [str]
    }
    """
    text_lower = report_text.lower()
    text_words = report_text.split()
    reasons = []
    penalty = 0
    
    # Check 1: Enhanced gibberish detection
    if len(text_words) <= 5:
        gibberish_detected = False
        
        # Check 1a: Vowel ratio (too few vowels)
        vowel_count = sum(1 for char in text_lower if char in 'aeiou')
        total_chars = sum(1 for char in text_lower if char.isalpha())
        if total_chars > 0 and vowel_count / total_chars < 0.2:
            gibberish_detected = True
            reasons.append("Gibberish/random characters detected (low vowel ratio)")
            penalty += 20
        
        # Check 1b: Random consonant clusters (3+ consonants in a row)
        import re
        consonant_clusters = re.findall(r'[^aeiou\s]{4,}', text_lower)
        if consonant_clusters:
            gibberish_detected = True
            reasons.append(f"Gibberish detected (unusual consonant clusters: {consonant_clusters[:2]})")
            penalty += 20
        
        # Check 1c: Check if words contain recognizable English patterns
        # Words with no common English letter combinations
        suspicious_words = []
        for word in text_words:
            word_lower = word.lower()
            if len(word_lower) > 4:
                # Check for lack of common English patterns (th, ing, ed, er, ly, etc.)
                common_patterns = ['th', 'er', 'on', 'an', 'in', 'ed', 'ing', 'ly', 'ion', 'al', 'en']
                has_pattern = any(pattern in word_lower for pattern in common_patterns)
                
                # Check for excessive repeated characters
                has_repeats = re.search(r'(.)\1{2,}', word_lower)  # 3+ same char in a row
                
                if not has_pattern or has_repeats:
                    suspicious_words.append(word)
        
        if len(suspicious_words) >= len(text_words) / 2:  # More than half words are suspicious
            gibberish_detected = True
            reasons.append(f"Gibberish detected (unrecognizable words: {suspicious_words[:3]})")
            penalty += 20
    
    # Check 2: Extremely short reports (< 10 words)
    if len(text_words) < 5:
        reasons.append("Extremely brief report")
        penalty += 5
    elif len(text_words) < 10:
        reasons.append("Very short report (lacks detail)")
        penalty += 2
    
    # Check 2: Obvious joke/satire keywords
    joke_keywords = ['lol', 'haha', 'jk', 'just kidding', 'obviously fake', 'just testing', 'fake report']
    if any(keyword in text_lower for keyword in joke_keywords):
        reasons.append("Obvious satire/joke indicators")
        penalty += 20
    
    # Check 3: Implausible numbers and exaggeration
    implausible_patterns = [
        (r'\b1000\b', '1000+'),
        (r'\b999\b', '999'),
        (r'\b100\s+(?:robbers|criminals|people)\b', '100+ criminals'),
        (r'\bmillion\b', 'million losses'),
        (r'\b50\+?\s+(?:shots|bullets|explosions)\b', '50+ shots'),
        (r'\bevery\s+(\w+\s+)?second\b', 'constant occurrence'),
    ]
    import re
    for pattern, desc in implausible_patterns:
        if re.search(pattern, text_lower):
            reasons.append(f"Implausible scenario ({desc})")
            penalty += 8
    
    # Check 4: Contradictory statements
    if 'but' in text_lower:
        if any(neg in text_lower for neg in ['not', 'never', 'didn\'t', 'didn\'t', 'no one', 'nobody']):
            reasons.append("Contradictory logic")
            penalty += 3
    
    # Check 5: Excessive punctuation or caps
    if text_lower.count('!') > 3 or text_lower.count('?') > 3:
        reasons.append("Excessive punctuation (suspicious tone)")
        penalty += 3
    
    if text_lower.count(text_lower.upper()) > len(text_words) * 0.3:  # > 30% caps
        reasons.append("Excessive capitalization")
        penalty += 3
    
    # Check 6: Generic/vague descriptions
    vague_terms = ['something', 'somebody', 'anyone', 'anything', 'stuff']
    vague_count = sum(1 for term in vague_terms if term in text_lower)
    if vague_count >= 3:
        reasons.append("Vague description with generic terms")
        penalty += 4
    
    # Check 7: Suspicious disclaimer phrases
    disclaimer_phrases = [
        'i\'m just checking', 'just testing', 'this is fake', 'not real',
        'probably not important', 'not sure if', 'might be fake', 'probably fake'
    ]
    if any(phrase in text_lower for phrase in disclaimer_phrases):
        reasons.append("Suspicious disclaimer language")
        penalty += 15
    
    # Check 8: Officer credibility signal
    if officer_credibility_score < 25:
        reasons.append("Very low officer credibility")
        penalty += 5
    
    # Check 9: Missing crime elements - strong indicator for non-crime reports
    crime_keywords = [
        'steal', 'stole', 'stolen', 'steals', 'stealing', 'robbery', 'rob', 'robbed', 'theft', 'thief',
        'fight', 'fighting', 'fought', 'brawl', 'assault', 'assaulted', 'murder', 'murdered', 'rape', 'raped',
        'weapon', 'gun', 'guns', 'knife', 'knives', 'fire', 'hit', 'hitting', 'shot', 'shots', 'injured', 'harm',
        'attack', 'attacked', 'attacking', 'stab', 'stabbed', 'beat', 'beaten', 'beating', 'violence', 'violent',
        'crime', 'criminal', 'accident', 'incident', 'emergency', 'police', 'ambulance', 'hospital', 'danger', 'threat',
        'suspicious', 'kidnap', 'kidnapped', 'kidnapping', 'abduct', 'abducted', 'bomb', 'explosion', 'arson', 'vandal', 'vandalism'
    ]
    
    # Non-crime report keywords (gaming, tech, personal complaints, supernatural, etc.)
    non_crime_keywords = [
        'character', 'game', 'level', 'score', 'password', 'account', 'app', 'bug',
        'update', 'download', 'install', 'error', 'crash', 'freeze', 'lag',
        'late', 'missed', 'forgot', 'lost', 'broke', 'didn\'t work', 'didn\'t get',
        'wasn\'t', 'wasn\'t able', 'didn\'t receive', 'not received', 'order',
        'delivery', 'package', 'complaint', 'review', 'rating',
        'ghost', 'alien', 'ufo', 'demon', 'zombie', 'vampire', 'werewolf', 'spirit',
        'supernatural', 'magic', 'wizard', 'unicorn', 'dragon', 'bigfoot', 'yeti'
    ]
    
    has_crime_keyword = any(keyword in text_lower for keyword in crime_keywords)
    has_non_crime_keyword = any(keyword in text_lower for keyword in non_crime_keywords)
    
    if not has_crime_keyword and len(text_words) >= 5:
        # No crime keywords at all - strong signal of fake/non-crime report
        reasons.append("No crime-related keywords detected")
        penalty += 10
        
        # If it has non-crime keywords, it's definitely a misclassified report
        if has_non_crime_keyword:
            reasons.append("Contains personal/non-crime keywords")
            penalty += 12
    
    # Calculate if suspicious
    is_suspicious = penalty >= 8
    confidence = min(0.2 + (penalty * 0.03), 0.95)  # Confidence scales with penalty
    
    return {
        'is_suspicious': is_suspicious,
        'confidence': confidence,
        'penalty': min(penalty, 25),
        'reasons': reasons
    }


@app.route('/detect-fake-report', methods=['POST'])
def detect_fake_report():
    """
    Detect fake/fraudulent crime reports using Gemini AI
    Analyzes report content, user credibility, and flags suspicious patterns
    
    Request body:
    {
        "report_text": "crime description",
        "officer_id": "user_id",
        "officer_credibility_score": 0-100,
        "location": "crime location",
        "time_of_occurrence": "when it happened"
    }
    
    Response:
    {
        "is_fake": true/false,
        "confidence": 0.95,
        "reasoning": "why it's fake",
        "credibility_penalty": 5-25,
        "can_upload": true/false
    }
    """
    payload = request.get_json()
    if not payload:
        return jsonify({'error': 'Missing json body'}), 400
    
    report_text = payload.get('report_text', '')
    officer_id = payload.get('officer_id', '')
    report_id = payload.get('report_id', '')
    officer_credibility_score = payload.get('officer_credibility_score', 50)  # Default 50/100
    location = payload.get('location', 'Unknown')
    time_of_occurrence = payload.get('time_of_occurrence', '')

    # Initialize defaults so later persistence blocks don't hit undefined names
    is_fake = False
    confidence = 0.0
    reasoning = ''
    credibility_penalty = 0
    can_upload = False
    
    # Validate inputs
    if not report_text:
        return jsonify({'error': 'report_text field is required'}), 400
    
    try:
        # First: Quick local heuristic checks
        quick_flags = _quick_fake_check(report_text, officer_credibility_score)
        
        # TIER 1: Try ML Model (fastest, most accurate)
        # Attempt lazy loading first
        import sys
        print("📞 Attempting to load ML model...", flush=True)
        sys.stdout.flush()
        ml_available = lazy_load_ml_model()
        print(f"📊 ML available: {ml_available}", flush=True)
        sys.stdout.flush()
        
        if ml_available and ML_FAKE_MODEL is not None:
            try:
                print(f"🤖 Using ML model for fake detection...")
                ml_result = predict_fake_with_ml_model(report_text)
                is_fake = ml_result['is_fake']
                confidence = ml_result['confidence']
                reasoning = ml_result['reasoning']
                
                # Integrate heuristic flags if they're more severe
                if quick_flags['is_suspicious'] and quick_flags['confidence'] > confidence:
                    confidence = quick_flags['confidence']
                    reasoning += f" [Heuristics also flagged: {', '.join(quick_flags['reasons'][:2])}]"
                
                credibility_penalty = quick_flags['penalty'] if quick_flags['is_suspicious'] else (20 if is_fake else 0)
                can_upload = not is_fake and officer_credibility_score >= 20
                
                print(f"✅ ML prediction: is_fake={is_fake}, confidence={confidence:.3f}")
                
            except Exception as ml_error:
                print(f"⚠️ ML model failed: {ml_error}, falling back to Gemini/heuristics")
                # Fall through to Gemini
                if GEMINI_API_KEY:
                    pass  # Continue to Gemini below
                else:
                    raise  # No fallback available
        
        # TIER 2: Use Gemini AI (if ML failed or not available)
        if ML_FAKE_MODEL is None or 'is_fake' not in locals():
            if GEMINI_API_KEY:
                # Use Gemini AI for deeper fake report detection
                model = genai.GenerativeModel('gemini-2.0-flash')
                
                prompt = f"""You are an expert crime report analyst trained in fraud detection and report authentication. Your job is to identify fabricated, exaggerated, or malicious crime reports with high accuracy.

**CRITICAL:** This is a CRIME REPORTING app. Reports about non-crime issues (missing orders, app crashes, game problems, personal complaints, customer service issues) are FAKE and should be flagged immediately.

CRIME REPORT TO ANALYZE:
Description: {report_text}
Location: {location}
Time: {time_of_occurrence}
Report Length: {len(report_text.split())} words

OFFICER/REPORTER PROFILE:
- Credibility Score: {officer_credibility_score}/100
- Officer ID: {officer_id}

**FIRST CHECK - IS THIS EVEN A CRIME?**
Before analyzing authenticity, check if this describes an actual CRIME:
- Missing package/order delivery = NOT a crime (customer service issue)
- App bug or crash = NOT a crime (tech support issue)
- Game/character complaint = NOT a crime (entertainment issue)
- Password/account access = NOT a crime (account recovery)
- Noise complaint (disturbance) = MIGHT be crime (disorderly conduct)
- Fight/assault/theft/robbery/weapon = YES, CRIME
- Accident/emergency/injury = MAYBE crime (context dependent)

If report is about a non-crime issue, mark is_fake=true with high confidence immediately.

EVALUATION CRITERIA (for actual crime reports):

1. **Content Authenticity & Detail Level**
   - Genuine reports usually have specific details (addresses, names, descriptions)
   - Vague reports with generic descriptions are suspicious
   - Look for contextual accuracy and realism

2. **Implausible Elements** (Strong red flag)
   - Impossible numbers (e.g., "100 armed robbers", "1,000 stolen cars")
   - Unrealistic scenarios that violate physics/law
   - Exaggerated harm that's inconsistent with described event

3. **Linguistic Red Flags**
   - Excessive punctuation or caps (!!!, ???)
   - Obvious satire/jokes ("lol", "jk", "obviously fake")
   - Extremely formal language inconsistent with urgency
   - Inconsistent tone (comedy mixed with alleged violence)

4. **Temporal & Geographic Consistency**
   - Does the timeline make sense?
   - Is the location plausible?
   - Are incident descriptions consistent with stated time/location?

5. **Internal Contradictions**
   - Conflicting statements within the report
   - Impossible sequences of events
   - Self-defeating logic

6. **Reporter Credibility Signals**
   - Low credibility score + suspicious report = likely fake
   - Frequent false reports from same officer = elevated suspicion
   - First time reporters may lack detail but aren't necessarily fake

7. **Hallmark Phrases of False Reports**
   - "I'm just checking if this works"
   - "This is probably not important but..."
   - Unusual disclaimer language suggesting uncertainty

RESPONSE (JSON ONLY - no explanations before/after):
{{
    "is_fake": true/false,
    "confidence": 0.0-1.0,
    "reasoning": "Concise explanation (1-2 sentences) of verdict",
    "credibility_penalty": 0-25,
    "can_upload": true/false,
    "red_flags_found": ["flag1", "flag2"],
    "severity": "low/medium/high"
}}

IMPORTANT:
- confidence should reflect how certain you are (0.5 = uncertain, 0.95 = very certain)
- credibility_penalty: 0 if genuine crime, 5-15 if suspicious crime, 15-25 if non-crime or fabricated
- can_upload: false if is_fake=true, true if genuine crime
- red_flags_found: list the specific suspicious elements detected
- severity: "low" (minor concerns), "medium" (some red flags), "high" (clearly non-crime or fabricated)
- If report is about missing order, app crash, game issue, etc., set is_fake=true with confidence 0.90+ and credibility_penalty 20+

Respond ONLY with valid JSON, no markdown code blocks or extra text."""
                
                response = call_gemini_with_retry(model, prompt, max_retries=2)
                response_text = response.text if hasattr(response, 'text') else str(response)
                
                # Parse JSON from response
                import re
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    try:
                        result = json.loads(json_match.group())
                        is_fake = result.get('is_fake', False)
                        confidence = float(result.get('confidence', 0.5))
                        reasoning = result.get('reasoning', 'Automated analysis')
                        credibility_penalty = int(result.get('credibility_penalty', 0))
                        can_upload = result.get('can_upload', True)
                        
                        # Integrate local heuristic flags
                        if quick_flags['is_suspicious']:
                            confidence = max(confidence, quick_flags['confidence'])
                            if quick_flags['penalty'] > credibility_penalty:
                                credibility_penalty = quick_flags['penalty']
                            reasoning += f" [Heuristic flags: {', '.join(quick_flags['reasons'][:2])}]"
                    except json.JSONDecodeError:
                        raise ValueError("Could not parse Gemini JSON response")
                else:
                    raise ValueError("Could not extract JSON from Gemini response")
            else:
                # TIER 3: Fallback to heuristics if Gemini unavailable
                is_fake = quick_flags['is_suspicious']
                confidence = quick_flags['confidence']
                credibility_penalty = quick_flags['penalty']
                can_upload = not is_fake and officer_credibility_score >= 20
                reasoning = '; '.join(quick_flags['reasons']) if quick_flags['reasons'] else "Report appears genuine"
        
        # Return verification response
        response_payload = {
            'is_fake': is_fake,
            'confidence': round(confidence, 3),
            'reasoning': reasoning,
            'credibility_penalty': credibility_penalty,
            'can_upload': can_upload,
            'new_credibility_score': max(0, min(100, officer_credibility_score - credibility_penalty))
        }

        # If a report_id was provided, persist verification and optional auto-extraction results
        if report_id:
            try:
                db_firestore = firestore.client()
                # Create a compact verification doc to store in the subcollection
                verification_doc = {
                    'is_fake': is_fake,
                    'confidence': confidence,
                    'reasoning': reasoning,
                    'credibility_penalty': credibility_penalty,
                    'verified_at': firestore.SERVER_TIMESTAMP,
                    'verified_by': 'gemini-api' if GEMINI_API_KEY else 'keyword-fallback'
                }

                # verification subcollection
                db_firestore.collection('reports').document(report_id).collection('verification').document('latest').set(verification_doc)
                db_firestore.collection('reports').document(report_id).update({
                    'is_fake': is_fake,
                    'verification_confidence': confidence,
                    'verification_reasoning': reasoning,
                    'verified_at': firestore.SERVER_TIMESTAMP
                })

                # If allowed, run auto-extraction and write auto_* fields for officer consumption
                if locals().get('can_upload'):
                    try:
                        extracted = auto_extract_and_classify(report_text, provided_location=location, provided_time=time_of_occurrence)
                        update_payload = {
                            'auto_crime_type': extracted.get('auto_crime_type'),
                            'auto_crime_confidence': extracted.get('auto_crime_confidence'),
                            'auto_extracted_location': extracted.get('auto_extracted_location'),
                            'auto_extracted_date': extracted.get('auto_extracted_date'),
                            'auto_extracted_time': extracted.get('auto_extracted_time'),
                            'auto_crime_reasoning': extracted.get('auto_crime_reasoning')
                        }
                        db_firestore.collection('reports').document(report_id).set(update_payload, merge=True)
                    except Exception as write_err:
                        print(f"⚠️ Failed to store auto-extraction for report {report_id}: {write_err}")

                # Update officer credibility if applicable
                if credibility_penalty > 0 and officer_id:
                    try:
                        new_credibility_score = max(0, min(100, officer_credibility_score - credibility_penalty))
                        db_firestore.collection('users').document(officer_id).update({
                            'credibilityScore': new_credibility_score
                        })
                    except Exception as cred_err:
                        print(f"⚠️ Failed to update officer credibility for {officer_id}: {cred_err}")
            except Exception as write_err:
                print(f"⚠️ Failed to persist verification for report {report_id}: {write_err}")

        return jsonify(response_payload)
    
    except Exception as e:
        print(f"❌ Fake report detection error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Detection error: {e}'}), 500


@app.route('/auto-verify-report', methods=['POST'])
def auto_verify_report():
    """
    Automatically verify incoming citizen crime reports
    Called when a citizen submits a report to check authenticity
    Stores verification result in Firestore
    
    Request body:
    {
        "report_id": "firestore_doc_id",
        "report_text": "crime description",
        "location": "crime location",
        "time_of_occurrence": "when it happened",
        "user_id": "citizen_user_id"
    }
    
    Response:
    {
        "is_fake": true/false,
        "confidence": 0.95,
        "reasoning": "why it's fake",
        "credibility_penalty": 0-25,
        "verification_stored": true
    }
    """
    payload = request.get_json()
    if not payload:
        return jsonify({'error': 'Missing json body'}), 400
    
    report_id = payload.get('report_id', '')
    report_text = payload.get('report_text', '')
    location = payload.get('location', 'Unknown')
    time_of_occurrence = payload.get('time_of_occurrence', '')
    user_id = payload.get('user_id', '')
    
    if not report_id or not report_text:
        return jsonify({'error': 'report_id and report_text are required'}), 400
    
    try:
        # Get user credibility score from Firestore
        db_firestore = firestore.client()
        
        user_doc = db_firestore.collection('users').document(user_id).get()
        user_credibility_score = 50  # Default score for NEW users
        
        if user_doc.exists:
            # Get the actual credibility score, default to 50 only if field doesn't exist
            stored_score = user_doc.get('credibilityScore')
            if stored_score is not None:
                user_credibility_score = stored_score
                print(f"📊 User {user_id} current credibility: {user_credibility_score}")
            else:
                print(f"⚠️ User {user_id} has no credibilityScore field, using default: 50")
        else:
            print(f"⚠️ User {user_id} document not found, using default credibility: 50")
        
        # Block users with 0 or negative credibility from submitting reports
        if user_credibility_score <= 0:
            print(f"🚫 ============ BLOCKING USER ============")
            print(f"🚫 User ID: {user_id}")
            print(f"🚫 Credibility Score: {user_credibility_score}")
            print(f"🚫 Report Text: '{report_text[:50]}...'")
            print(f"🚫 ====================================")
            return jsonify({
                'error': 'CREDIBILITY_TOO_LOW',
                'is_fake': True,
                'confidence': 1.0,
                'reasoning': 'Your credibility score has reached 0 due to multiple fake reports. You are temporarily blocked from submitting new reports.',
                'credibility_penalty': 0,
                'current_credibility_score': user_credibility_score,
                'verification_stored': False
            }), 403
        
        print(f"✅ ============ ALLOWING REPORT ============", flush=True)
        print(f"✅ User ID: {user_id}", flush=True)
        print(f"✅ Credibility Score: {user_credibility_score}", flush=True)
        print(f"✅ Report Text: '{report_text[:100]}'", flush=True)
        print(f"✅ ==========================================", flush=True)
        
        # PRE-SCREENING: Check for critical crime keywords (weapons, kidnapping, etc.)
        # These are GENUINE crimes, not fakes - don't flag them as suspicious
        text_lower = report_text.lower()
        weapon_keywords = ['gun', 'guns', 'pistol', 'rifle', 'firearm', 'armed', 'knife', 'knives', 'blade', 'bomb', 'weapon']
        kidnap_keywords = ['kidnap', 'kidnapped', 'kidnapping', 'abduct', 'abducted']
        
        has_weapons = any(w in text_lower for w in weapon_keywords)
        has_kidnapping = any(w in text_lower for w in kidnap_keywords)
        
        if has_weapons or has_kidnapping:
            print(f"⚠️ CRITICAL: Weapon/kidnapping keywords detected - treating as GENUINE crime report", flush=True)
            print(f"   Weapons: {has_weapons}, Kidnapping: {has_kidnapping}", flush=True)
            # Skip ML fake detection for weapon/kidnapping reports - these are genuine crimes
            # Go straight to crime type classification
            is_fake = False
            confidence = 1.0
            reasoning = "Critical crime indicators (weapons/kidnapping) detected - report treated as genuine."
            credibility_penalty = 0
            verification_method = 'safety-heuristics'
            
            # Jump to storing verification result
            print(f"✅ Report allowed - proceeding to crime classification")
        
        # PRE-SCREENING: Quick heuristic checks for obviously fake patterns (only for non-weapon reports)
        elif len(report_text.split()) < 10:
            print(f"🚫 Pre-screening: Report too short ({len(report_text.split())} words)", flush=True)
            # Run additional checks for short reports
            quick_check = _quick_fake_check(report_text, user_credibility_score)
            print(f"🔍 Pre-screening result: suspicious={quick_check['is_suspicious']}, reasons={quick_check['reasons']}, penalty={quick_check['penalty']}", flush=True)
            if quick_check['is_suspicious']:
                print(f"🚫 Pre-screening flagged as fake: {quick_check['reasons']}", flush=True)
                
                # Update user credibility
                penalty = quick_check['penalty']
                new_cred = max(0, user_credibility_score - penalty)
                try:
                    db_firestore.collection('users').document(user_id).update({
                        'credibilityScore': new_cred
                    })
                    print(f"✅ Pre-screening updated credibility: {user_credibility_score} → {new_cred}", flush=True)
                except Exception as e:
                    print(f"⚠️ Failed to update credibility: {e}", flush=True)
                
                # Save to flagged_reports collection (pre-screening caught it)
                flagged_report_id = f"flagged_{user_id}_{int(time.time())}_{str(uuid.uuid4())[:8]}"
                print(f"🚨 Pre-screening: Saving to flagged_reports/{flagged_report_id}", flush=True)
                
                flagged_report_data = {
                    'userId': user_id,
                    'description': report_text,
                    'location': {'city': location} if location else {'city': 'Unknown'},
                    'timestamp': firestore.SERVER_TIMESTAMP,
                    'flagged_at': firestore.SERVER_TIMESTAMP,
                    'is_fake': True,
                    'verification_confidence': 0.85,
                    'verification_reasoning': f"Pre-screening: {'; '.join(quick_check['reasons'])}",
                    'verification_method': 'pre-screening-heuristics',
                    'status': 'Flagged',
                    'reportType': 'Citizen Post',
                }
                
                # Get user name
                try:
                    user_doc = db_firestore.collection('users').document(user_id).get()
                    if user_doc.exists:
                        user_data = user_doc.to_dict()
                        flagged_report_data['userName'] = user_data.get('displayName') or user_data.get('name') or user_data.get('email') or 'Anonymous'
                    else:
                        flagged_report_data['userName'] = 'Anonymous'
                except:
                    flagged_report_data['userName'] = 'Anonymous'
                
                # Save to flagged_reports
                try:
                    db_firestore.collection('flagged_reports').document(flagged_report_id).set(flagged_report_data)
                    print(f"✅ Pre-screening: Saved to flagged_reports/{flagged_report_id}", flush=True)
                except Exception as e:
                    print(f"❌ ERROR saving to flagged_reports: {e}", flush=True)
                    import traceback
                    traceback.print_exc()
                
                return jsonify({
                    'is_fake': True,
                    'confidence': 0.85,
                    'reasoning': f"Report flagged by pre-screening: {'; '.join(quick_check['reasons'])}",
                    'credibility_penalty': penalty,
                    'verification_stored': True,
                    'old_credibility_score': user_credibility_score,
                    'new_credibility_score': new_cred,
                    'credibility_change': -penalty
                })
        
        # TIER 1: Try ML model first (fastest, most reliable)
        # BUT: Skip ML model for weapon/kidnapping reports (these are genuine crimes, not fakes)
        if not (has_weapons or has_kidnapping):
            # Only run ML fake detection for regular reports
            verification_method = 'heuristics'  # Default fallback
            is_fake = False
            confidence = 0.5
            reasoning = "Report appears genuine"
            credibility_penalty = 0
            
            # Attempt lazy loading first
            ml_available = lazy_load_ml_model()
            
            if ml_available and ML_FAKE_MODEL is not None:
                try:
                    print(f"🤖 Using ML model for report {report_id}")
                    ml_result = predict_fake_with_ml_model(report_text)
                    is_fake = ml_result['is_fake']
                    confidence = ml_result['confidence']
                    reasoning = ml_result['reasoning']
                    verification_method = 'ml-model'
                    
                    # Calculate credibility penalty/reward based on ML prediction
                    # ONLY flag as fake if confidence >= 60%
                    if is_fake and confidence >= 0.60:
                        # Flag as fake with varying penalties
                        if confidence >= 0.95:
                            credibility_penalty = 22  # Very confident fake
                            reasoning = f"ML model detected this as fake with very high confidence ({confidence:.1%}). The report exhibits strong patterns of fabrication, including implausible details, inconsistent information, or characteristics typical of non-genuine reports."
                        elif confidence >= 0.85:
                            credibility_penalty = 18  # Confident fake
                            reasoning = f"ML model detected this as fake with high confidence ({confidence:.1%}). The report shows significant indicators of being fabricated or non-genuine based on its content and structure."
                        elif confidence >= 0.70:
                            credibility_penalty = 12  # Likely fake
                            reasoning = f"ML model identified this as likely fake ({confidence:.1%} confidence). The report contains patterns that suggest it may not be a genuine crime report, though some elements are ambiguous."
                        else:  # 60-70%
                            credibility_penalty = 8   # Possibly fake
                            reasoning = f"ML model flagged this as potentially fake ({confidence:.1%} confidence). The report shows some concerning patterns but falls in an uncertain range. Please ensure future reports are detailed and factual."
                        is_fake = True
                    else:
                        # Allow report (treat as genuine)
                        is_fake = False
                        credibility_penalty = 0
                        
                        if is_fake and confidence < 0.60:
                            # ML said fake but confidence too low - allow it
                            reasoning = f"ML model flagged potential concerns (fake probability: {confidence:.1%}), but confidence is below the 60% threshold. Report is allowed. Please provide detailed, factual information in future reports to avoid flags."
                        elif not is_fake and confidence >= 0.95:
                            # Very confident genuine - REWARD +5
                            credibility_penalty = -5
                            reasoning = f"ML model confirmed this as a genuine report with very high confidence ({confidence:.1%}). The report demonstrates clear, credible indicators of an authentic crime incident. Great job on detailed reporting! (+5 credibility)"
                        elif not is_fake and confidence >= 0.85:
                            # Confident genuine - REWARD +3
                            credibility_penalty = -3
                            reasoning = f"ML model verified this as a genuine report with high confidence ({confidence:.1%}). The report shows strong characteristics of an authentic crime incident. (+3 credibility)"
                        elif not is_fake and confidence >= 0.70:
                            # Likely genuine - small reward
                            credibility_penalty = -1
                            reasoning = f"ML model assessed this as a genuine report ({confidence:.1%} confidence). The report appears authentic. (+1 credibility)"
                        else:
                            # Uncertain - no penalty or reward
                            reasoning = f"ML model is uncertain about this report (genuine probability: {confidence:.1%}). No credibility change. For better verification, please include specific details like location, time, and clear descriptions of incidents."
                    
                    print(f"✅ ===== ML CLASSIFICATION =====", flush=True)
                    print(f"✅ Report: '{report_text[:80]}'", flush=True)
                    print(f"✅ ML Result: is_fake={is_fake}, confidence={confidence:.2f}", flush=True)
                    print(f"✅ Decision: {'FLAGGED AS FAKE' if is_fake else 'ALLOWED (genuine/uncertain)'}", flush=True)
                    print(f"✅ Penalty/Reward: {credibility_penalty}", flush=True)
                    print(f"✅ Reasoning: {reasoning[:100]}...", flush=True)
                    print(f"✅ ==============================", flush=True)
                    
                    # If ML confidence is LOW (< 70%) and marked as fake, use Gemini as second opinion
                    if is_fake and confidence < 0.70:
                        print(f"⚠️ ML confidence too low for fake classification ({confidence:.2f}), falling back to Gemini for second opinion...", flush=True)
                        verification_method = 'heuristics'  # Trigger Gemini fallback
                except Exception as e:
                    print(f"⚠️ ML model prediction failed: {e}")
        else:
            # Weapon/kidnapping report - skip ML fake detection, treat as genuine
            print(f"✅ Weapon/kidnapping report detected - skipping ML fake detection")
            is_fake = False
            confidence = 1.0
            reasoning = "Weapon/kidnapping keywords detected - report treated as genuine crime."
            verification_method = 'safety-heuristics'
            credibility_penalty = 0
        
        # TIER 2: If ML failed, unavailable, or low confidence, try Gemini API
        if ML_FAKE_MODEL is None or verification_method == 'heuristics':
            if GEMINI_API_KEY:
                model = genai.GenerativeModel('gemini-2.0-flash')
                
                prompt = f"""You are a crime report fraud detection expert. Analyze this CITIZEN crime report for signs of fabrication.

**CRITICAL:** This is a CRIME REPORTING app. Reports about non-crime issues (missing orders, app crashes, game problems, personal complaints, customer service issues) are FAKE and should be flagged immediately.

CRIME REPORT:
Description: {report_text}
Location: {location}
Time: {time_of_occurrence}

CITIZEN PROFILE:
- Current Credibility Score: {user_credibility_score}/100
- User ID: {user_id}

**FIRST CHECK - IS THIS EVEN A CRIME?**
Before analyzing authenticity, check if this describes an actual CRIME:
- Missing package/order delivery = NOT a crime (customer service issue) → is_fake=true
- App bug or crash = NOT a crime (tech support issue) → is_fake=true
- Game/character complaint = NOT a crime (entertainment issue) → is_fake=true
- Password/account access = NOT a crime (account recovery) → is_fake=true
- Noise complaint (disturbance) = MIGHT be crime (disorderly conduct)
- Fight/assault/theft/robbery/weapon = YES, CRIME
- Accident/emergency/injury = MAYBE crime (context dependent)

If report is about a non-crime issue, mark is_fake=true with high confidence immediately.

Analyze the report for:
1. **Content Authenticity**: Does the description sound genuine and detailed?
2. **Suspicious Patterns**: Red flags like exaggeration, inconsistencies, implausible details
3. **False Claims**: Obvious lies, fabricated evidence, contradictions
4. **Time/Location Inconsistencies**: Does the timeline make sense?
5. **Citizen Credibility**: Low credibility citizens are more likely to file false reports
6. **Language Analysis**: Unusually formal/informal, suspicious tone

Red flags that indicate FAKE reports:
- Obvious typos/inconsistencies suggesting rushed fabrication
- Vague, generic descriptions lacking specific details
- Implausible scenario (e.g., "100 armed robbers", "all ATMs hacked")
- Grammar/spelling that doesn't match report severity
- Conflicting timeline or impossible scenario
- User with known history of false reports (score < 30)
- Reporting an obviously non-existent incident
- Describing a NON-CRIME (missing order, app crash, game issue, etc.)

Respond in JSON format ONLY:
{{
    "is_fake": true/false,
    "confidence": 0.95,
    "reasoning": "Brief explanation",
    "credibility_penalty": 0-25
}}"""
                
                response = call_gemini_with_retry(model, prompt, max_retries=2)
                response_text = response.text if hasattr(response, 'text') else str(response)
                
                # Parse JSON from response
                import re
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    try:
                        result = json.loads(json_match.group())
                        is_fake = result.get('is_fake', False)
                        confidence = float(result.get('confidence', 0.7))
                        reasoning = result.get('reasoning', 'Automated analysis')
                        credibility_penalty = int(result.get('credibility_penalty', 0))
                        verification_method = 'gemini-api'
                        print(f"🤖 Gemini Result: is_fake={is_fake}, confidence={confidence:.2f}")
                    except json.JSONDecodeError:
                        raise ValueError("Could not parse Gemini response")
                else:
                    raise ValueError("Could not parse Gemini response")
            else:
                # TIER 3: Fallback to heuristics if both ML and Gemini unavailable
                print(f"⚠️ Using heuristic fallback for report {report_id}")
                quick_flags = _quick_fake_check(report_text, user_credibility_score)
                is_fake = quick_flags['is_suspicious']
                confidence = quick_flags['confidence']
                credibility_penalty = quick_flags['penalty']
                reasoning = '; '.join(quick_flags['reasons']) if quick_flags['reasons'] else "Report appears genuine"
                verification_method = 'heuristics'
        
        # Store verification result in Firestore
        verification_doc = {
            'is_fake': is_fake,
            'confidence': confidence,
            'reasoning': reasoning,
            'credibility_penalty': credibility_penalty,
            'verified_at': firestore.SERVER_TIMESTAMP,
            'verified_by': verification_method
        }

        if report_id:
            try:
                db_firestore = firestore.client()
                
                # If report is FAKE, save directly to flagged_reports collection
                if is_fake:
                    if report_id == 'pre-verification':
                        # Generate a unique ID for pre-verification flagged reports
                        flagged_report_id = f"flagged_{user_id}_{int(time.time())}_{str(uuid.uuid4())[:8]}"
                        print(f"🚨 Saving pre-verification fake report to flagged_reports/{flagged_report_id}", flush=True)
                        
                        # Create flagged report document
                        flagged_report_data = {
                            'userId': user_id,
                            'description': report_text,
                            'location': {'city': location} if location else {'city': 'Unknown'},
                            'timestamp': firestore.SERVER_TIMESTAMP,
                            'flagged_at': firestore.SERVER_TIMESTAMP,
                            'is_fake': True,
                            'verification_confidence': confidence,
                            'verification_reasoning': reasoning,
                            'verification_method': verification_method,
                            'status': 'Flagged',
                            'reportType': 'Citizen Post',
                        }
                        
                        # Get user name if possible
                        try:
                            user_doc = db_firestore.collection('users').document(user_id).get()
                            if user_doc.exists:
                                user_data = user_doc.to_dict()
                                flagged_report_data['userName'] = user_data.get('displayName') or user_data.get('name') or user_data.get('email') or 'Anonymous'
                        except:
                            flagged_report_data['userName'] = 'Anonymous'
                        
                        # Save to flagged_reports collection
                        try:
                            db_firestore.collection('flagged_reports').document(flagged_report_id).set(flagged_report_data)
                            print(f"✅ Pre-verification fake report saved to flagged_reports/{flagged_report_id}", flush=True)
                            print(f"📋 Report data: {flagged_report_data}", flush=True)
                        except Exception as e:
                            print(f"❌ ERROR saving to flagged_reports: {e}", flush=True)
                            import traceback
                            traceback.print_exc()
                    else:
                        # Post-verification: report exists in 'reports', move it to flagged_reports
                        print(f"🚨 Moving fake report {report_id} to flagged_reports collection")
                        # Get the original report data
                        report_ref = db_firestore.collection('reports').document(report_id)
                        report_data = report_ref.get().to_dict()
                        
                        if report_data:
                            # Add verification info to the report data
                            report_data['is_fake'] = True
                            report_data['verification_confidence'] = confidence
                            report_data['verification_reasoning'] = reasoning
                            report_data['verified_at'] = firestore.SERVER_TIMESTAMP
                            report_data['flagged_at'] = firestore.SERVER_TIMESTAMP
                            report_data['verification_method'] = verification_method
                            
                            # Save to flagged_reports collection
                            db_firestore.collection('flagged_reports').document(report_id).set(report_data)
                            print(f"✅ Fake report saved to flagged_reports/{report_id}")
                            
                            # Delete from main reports collection
                            report_ref.delete()
                            print(f"✅ Removed fake report from reports collection")
                else:
                    # Report is genuine
                    if report_id != 'pre-verification':
                        # Only update Firestore if not pre-verification (frontend will create the document)
                        db_firestore.collection('reports').document(report_id).collection('verification').document('latest').set(verification_doc)
                        db_firestore.collection('reports').document(report_id).update({
                            'is_fake': is_fake,
                            'verification_confidence': confidence,
                            'verification_reasoning': reasoning,
                            'verified_at': firestore.SERVER_TIMESTAMP
                        })

                # If allowed, run auto-extraction and write auto_* fields (skip for pre-verification)
                if locals().get('can_upload') and report_id != 'pre-verification':
                    try:
                        extracted = auto_extract_and_classify(report_text, provided_location=location, provided_time=time_of_occurrence)
                        update_payload = {
                            'auto_crime_type': extracted.get('auto_crime_type'),
                            'auto_crime_confidence': extracted.get('auto_crime_confidence'),
                            'auto_extracted_location': extracted.get('auto_extracted_location'),
                            'auto_extracted_date': extracted.get('auto_extracted_date'),
                            'auto_extracted_time': extracted.get('auto_extracted_time'),
                            'auto_crime_reasoning': extracted.get('auto_crime_reasoning')
                        }
                        db_firestore.collection('reports').document(report_id).set(update_payload, merge=True)
                    except Exception as write_err:
                        print(f"⚠️ Failed to store auto-extraction for report {report_id}: {write_err}")
                
                # Update user credibility score (penalty for fake, reward for genuine)
                if credibility_penalty != 0 and user_id:
                    try:
                        new_credibility_score = max(0, min(100, user_credibility_score - credibility_penalty))
                        
                        # Don't reward if already at 100
                        if user_credibility_score >= 100 and credibility_penalty < 0:
                            print(f"⚠️ User {user_id} already at max credibility (100), no reward applied")
                            new_credibility_score = 100
                        else:
                            db_firestore.collection('users').document(user_id).update({
                                'credibilityScore': new_credibility_score
                            })
                            action = "penalized" if credibility_penalty > 0 else "rewarded"
                            print(f"✅ Updated user {user_id} credibility: {user_credibility_score} → {new_credibility_score} ({action}: {abs(credibility_penalty)} points)")
                    except Exception as cred_err:
                        print(f"⚠️ Failed to update user credibility for {user_id}: {cred_err}")
            except Exception as write_err:
                print(f"⚠️ Failed to store verification for report {report_id}: {write_err}")

        return jsonify({
            'is_fake': is_fake,
            'confidence': confidence,
            'reasoning': reasoning,
            'credibility_penalty': credibility_penalty,
            'verification_stored': bool(report_id),
            'old_credibility_score': user_credibility_score,
            'new_credibility_score': max(0, min(100, user_credibility_score - credibility_penalty)),
            'credibility_change': -credibility_penalty  # Negative penalty = positive change
        })
    
    except Exception as e:
        print(f"❌ Auto-verification error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Verification error: {e}'}), 500


@app.route('/process-new-report', methods=['POST'])
def process_new_report():
    """
    Trigger auto-extraction and classification for an existing report document in Firestore.

    Request body: { "report_id": "docId" }
    Response: returns the extracted payload or an error.
    """
    payload = request.get_json() or {}
    report_id = payload.get('report_id')
    if not report_id:
        return jsonify({'error': 'report_id required'}), 400

    try:
        db_firestore = firestore.client()
        doc_ref = db_firestore.collection('reports').document(report_id)
        doc_snap = doc_ref.get()
        if not doc_snap.exists:
            return jsonify({'error': f'No report with id {report_id}'}), 404

        data = doc_snap.to_dict() or {}
        report_text = data.get('description') or data.get('report_text') or ''
        provided_location = data.get('location') or data.get('location', '')
        provided_time = data.get('time_of_occurrence') or data.get('timestamp')

        # Reuse the helper defined earlier in this file
        extracted = auto_extract_and_classify(report_text, provided_location=provided_location, provided_time=provided_time)

        update_payload = {
            'auto_crime_type': extracted.get('auto_crime_type'),
            'auto_crime_confidence': extracted.get('auto_crime_confidence'),
            'auto_extracted_location': extracted.get('auto_extracted_location'),
            'auto_extracted_date': extracted.get('auto_extracted_date'),
            'auto_extracted_time': extracted.get('auto_extracted_time'),
            'auto_crime_reasoning': extracted.get('auto_crime_reasoning')
        }

        doc_ref.set(update_payload, merge=True)
        return jsonify({'ok': True, 'extracted': update_payload})
    except Exception as e:
        print(f"❌ process-new-report error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ============================================================================
# INCIDENT ESCALATION RISK PREDICTION
# ============================================================================

@app.route('/predict-escalation', methods=['POST'])
def predict_escalation():
    """
    Predict escalation risk level for an incident using HybridRiskModel
    
    Request body (JSON):
    {
        "description": str (required),
        "location": str (optional),
        "sub_location": str (optional),
        "crime_type": str (optional),
        "datetime_occurred": str (optional, format: DD-MM-YYYY HH:MM),
        "part_of_day": str (optional: Morning/Afternoon/Evening/Night),
        "is_user_report": bool (optional, default: true)
    }
    
    Response:
    {
        "predicted_risk": "Low" | "Medium" | "High",
        "confidence": float (0-1),
        "probabilities": {
            "Low": float,
            "Medium": float,
            "High": float
        },
        "reasoning": str,
        "model_used": str,
        "features_analyzed": dict
    }
    """
    print("\n" + "="*70)
    print("📊 /predict-escalation request received")
    print("="*70)
    
    try:
        # Import the escalation service
        try:
            from escalation_model_service import predict_escalation_risk
        except ImportError as e:
            print(f"⚠️  Escalation model service not available: {e}")
            return jsonify({
                'predicted_risk': 'Medium',
                'confidence': 0.0,
                'probabilities': {'Low': 0.33, 'Medium': 0.34, 'High': 0.33},
                'reasoning': 'Escalation prediction service not available.',
                'error': str(e)
            }), 200
        
        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Validate required field
        description = data.get('description')
        if not description:
            return jsonify({'error': 'description is required'}), 400
        
        print(f"📝 Description: {description[:100]}...")
        print(f"📍 Location: {data.get('location', 'Not specified')}")
        print(f"🕒 DateTime: {data.get('datetime_occurred', 'Not specified')}")
        print(f"🔖 Crime Type: {data.get('crime_type', 'Not specified')}")
        
        # Prepare incident data
        incident_data = {
            'description': description,
            'location': data.get('location', 'Unknown'),
            'sub_location': data.get('sub_location', 'Unknown'),
            'crime_type': data.get('crime_type', 'Unknown'),
            'datetime_occurred': data.get('datetime_occurred'),
            'part_of_day': data.get('part_of_day'),
            'is_user_report': data.get('is_user_report', True)
        }
        
        # Make prediction
        result = predict_escalation_risk(incident_data)
        
        print(f"\n🎯 Prediction Result:")
        print(f"   Risk Level: {result['predicted_risk']}")
        print(f"   Confidence: {result['confidence']:.2%}")
        print(f"   Probabilities:")
        for risk, prob in result['probabilities'].items():
            print(f"      {risk}: {prob:.2%}")
        print("="*70 + "\n")
        
        return jsonify(result), 200
    
    except Exception as e:
        print(f"❌ Escalation prediction error: {e}")
        import traceback
        traceback.print_exc()
        
        return jsonify({
            'predicted_risk': 'Medium',
            'confidence': 0.0,
            'probabilities': {'Low': 0.33, 'Medium': 0.34, 'High': 0.33},
            'reasoning': f'Error during prediction: {str(e)}',
            'error': str(e)
        }), 500


if __name__ == '__main__':
    # ============================================
    # AADHAAR VERIFICATION ENDPOINT
    # ============================================
    @app.post('/verify-aadhaar')
    def verify_aadhaar():
        """
        Verify Aadhaar document using OCR + Face Recognition
        Expected JSON: {
            "user_id": "firebase_uid",
            "aadhar_url": "https://...",
            "profile_picture_url": "https://...",
            "user_full_name": "Name from signup"
        }
        """
        try:
            import pytesseract
            import cv2
            import face_recognition
            from PIL import Image
            import requests
            from io import BytesIO
            import re
            import numpy as np
            from pdf2image import convert_from_bytes
            
            data = request.json
            user_id = data.get('user_id')
            aadhar_url = data.get('aadhar_url')
            profile_pic_url = data.get('profile_picture_url')
            user_full_name = data.get('user_full_name', '').strip().lower()
            
            if not all([user_id, aadhar_url, user_full_name]):
                return jsonify({'error': 'Missing required fields'}), 400
            
            print(f"🔍 Verifying Aadhaar for user: {user_id}")
            
            # Download Aadhaar document
            print(f"📥 Downloading Aadhaar from: {aadhar_url}")
            aadhar_response = requests.get(aadhar_url, timeout=10)
            
            # Check if it's a PDF or image
            content_type = aadhar_response.headers.get('content-type', '')
            is_pdf = 'pdf' in content_type.lower() or aadhar_url.lower().endswith('.pdf')
            
            if is_pdf:
                print("📄 Converting PDF to image...")
                # Convert PDF to images (take first page)
                pdf_images = convert_from_bytes(aadhar_response.content, dpi=300, first_page=1, last_page=1)
                if not pdf_images:
                    return jsonify({'error': 'Failed to convert PDF to image'}), 400
                aadhar_image = pdf_images[0]
                print(f"✅ PDF converted successfully ({aadhar_image.size[0]}x{aadhar_image.size[1]})")
            else:
                print("🖼️  Processing image file...")
                aadhar_image = Image.open(BytesIO(aadhar_response.content))
            
            aadhar_cv = cv2.cvtColor(np.array(aadhar_image), cv2.COLOR_RGB2BGR)
            
            # ============================================
            # STEP 1: OCR - Extract text from Aadhaar
            # ============================================
            print("📝 Extracting text using OCR...")
            extracted_text = pytesseract.image_to_string(aadhar_image, config='--psm 6')
            print(f"Extracted text: {extracted_text[:500]}...")
            
            # Extract name - Use multiple strategies
            name_match = None
            lines = extracted_text.split('\n')
            
            # Strategy 1: Look for name after "To" or "Name" keywords
            for i, line in enumerate(lines):
                line_clean = line.strip()
                if any(keyword in line_clean.lower() for keyword in ['to:', 'to', 'name:', 'name']):
                    # Check next few lines for the actual name
                    for j in range(i+1, min(i+4, len(lines))):
                        potential_name = lines[j].strip()
                        # Name should be 2-4 words, letters only (no numbers)
                        words = potential_name.split()
                        if 2 <= len(words) <= 5 and all(w.replace('.', '').isalpha() for w in words):
                            name_match = potential_name.lower()
                            print(f"🎯 Found name after keyword: {name_match}")
                            break
                    if name_match:
                        break
            
            # Strategy 2: If no name found, look for lines with 2-4 words, all alphabetic
            if not name_match:
                for i, line in enumerate(lines):
                    line_clean = line.strip()
                    # Skip obvious headers and gibberish
                    if any(skip in line_clean.lower() for skip in ['government', 'india', 'aadhaar', 'enrollment', 'dob:', 'male', 'female', 'address', 'c/o']):
                        continue
                    # Name should be 2-4 words, mostly alphabetic
                    words = line_clean.split()
                    if 2 <= len(words) <= 5:
                        # Check if it's mostly letters (at least 80% alphabetic characters)
                        alpha_chars = sum(c.isalpha() or c.isspace() for c in line_clean)
                        if alpha_chars / max(len(line_clean), 1) >= 0.8:
                            name_match = line_clean.lower()
                            print(f"🎯 Found name by pattern matching: {name_match}")
                            break
            
            # Strategy 3: Fuzzy search - find line most similar to user's input name
            if not name_match and user_full_name:
                from difflib import SequenceMatcher
                best_match = None
                best_score = 0
                user_name_words = set(user_full_name.lower().split())
                
                for line in lines:
                    line_clean = line.strip().lower()
                    if len(line_clean) < 5 or len(line_clean) > 50:
                        continue
                    # Calculate similarity
                    line_words = set(line_clean.split())
                    common_words = user_name_words & line_words
                    if len(common_words) >= 1:  # At least one word matches
                        score = len(common_words) / len(user_name_words)
                        if score > best_score:
                            best_score = score
                            best_match = line_clean
                
                if best_match and best_score >= 0.4:  # At least 40% word overlap
                    name_match = best_match
                    print(f"🎯 Found name by fuzzy matching (score: {best_score:.2f}): {name_match}")
            
            # Extract Aadhaar number (12 digits, may have spaces)
            aadhaar_number_match = re.search(r'\d{4}\s?\d{4}\s?\d{4}', extracted_text)
            aadhaar_number = aadhaar_number_match.group() if aadhaar_number_match else None
            
            # Extract DOB (DD/MM/YYYY or similar)
            dob_match = re.search(r'\d{2}[/-]\d{2}[/-]\d{4}', extracted_text)
            dob = dob_match.group() if dob_match else None
            
            print(f"✅ OCR Results:")
            print(f"  - Extracted Name: {name_match}")
            print(f"  - User Name: {user_full_name}")
            print(f"  - Aadhaar Number: {aadhaar_number}")
            print(f"  - DOB: {dob}")
            
            # ============================================
            # STEP 2: Name Matching
            # ============================================
            name_match_score = 0
            name_verified = False
            if name_match:
                # Fuzzy matching - check if extracted name contains user name or vice versa
                name_parts_extracted = set(name_match.split())
                name_parts_user = set(user_full_name.split())
                
                # Calculate overlap
                common_parts = name_parts_extracted & name_parts_user
                name_match_score = len(common_parts) / max(len(name_parts_user), 1) * 100
                name_verified = name_match_score >= 50  # At least 50% of words match
                
                print(f"📛 Name Match Score: {name_match_score:.1f}% - {'✅ VERIFIED' if name_verified else '❌ FAILED'}")
            else:
                print("⚠️  Could not extract name from Aadhaar")
            
            # ============================================
            # STEP 3: Face Recognition (if profile pic provided)
            # ============================================
            face_match_score = 0
            face_verified = False
            face_comparison_done = False
            
            if profile_pic_url:
                try:
                    print("👤 Comparing faces...")
                    # Download profile picture
                    profile_response = requests.get(profile_pic_url, timeout=10)
                    profile_image = Image.open(BytesIO(profile_response.content))
                    profile_cv = cv2.cvtColor(np.array(profile_image), cv2.COLOR_RGB2BGR)
                    
                    # Detect faces
                    aadhar_face_encodings = face_recognition.face_encodings(aadhar_cv)
                    profile_face_encodings = face_recognition.face_encodings(profile_cv)
                    
                    if aadhar_face_encodings and profile_face_encodings:
                        # Compare faces
                        face_distances = face_recognition.face_distance([aadhar_face_encodings[0]], profile_face_encodings[0])
                        face_match_score = (1 - face_distances[0]) * 100  # Convert distance to similarity %
                        face_verified = face_match_score >= 70  # 70% threshold
                        face_comparison_done = True
                        print(f"😊 Face Match Score: {face_match_score:.1f}% - {'✅ VERIFIED' if face_verified else '❌ FAILED'}")
                    else:
                        print("⚠️  Could not detect faces in one or both images")
                except Exception as face_error:
                    print(f"⚠️  Face recognition error: {face_error}")
            
            # ============================================
            # STEP 4: Final Verification Decision
            # ============================================
            auto_verified = False
            verification_status = 'pending_manual_review'
            
            if name_verified and (face_verified or not face_comparison_done):
                auto_verified = True
                verification_status = 'auto_verified'
                print("✅ AUTO-VERIFIED: Name and face checks passed")
            elif name_verified and not face_verified:
                verification_status = 'pending_manual_review'
                print("⚠️  FLAGGED: Name OK but face mismatch - requires manual review")
            else:
                verification_status = 'pending_manual_review'
                print("⚠️  FLAGGED: Name verification failed - requires manual review")
            
            # ============================================
            # STEP 5: Update Firestore
            # ============================================
            db_firestore = firestore.client()
            
            verification_details = {
                'extracted_name': name_match,
                'name_match_score': round(name_match_score, 2),
                'face_match_score': round(face_match_score, 2) if face_comparison_done else None,
                'aadhaar_number': aadhaar_number,
                'dob': dob,
                'verification_status': verification_status,
                'verified_at': firestore.SERVER_TIMESTAMP,
                'verification_method': 'ocr_face_recognition'
            }
            
            update_data = {
                'isAadharVerified': auto_verified,
                'verification_details': verification_details
            }
            
            db_firestore.collection('users').document(user_id).update(update_data)
            print(f"✅ Updated Firestore for user: {user_id}")
            
            return jsonify({
                'success': True,
                'auto_verified': auto_verified,
                'verification_status': verification_status,
                'name_match_score': round(name_match_score, 2),
                'face_match_score': round(face_match_score, 2) if face_comparison_done else None,
                'extracted_name': name_match,
                'aadhaar_number': aadhaar_number,
                'dob': dob,
                'message': 'Verification complete' if auto_verified else 'Flagged for manual review'
            })
            
        except Exception as e:
            print(f"❌ Verification error: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    # ====== CRIME TYPE PREDICTION ENDPOINT (PyTorch Model) ======
    @app.route('/predict-crime-type', methods=['POST'])
    def predict_crime_type():
        """
        Predict crime type using PyTorch model (replaces Gemini API)
        
        Request:
        {
            "description": "I saw someone break into a car",
            "location": "Andheri West",  # optional
            "time_of_occurrence": "10:30 PM"  # optional
        }
        
        Response:
        {
            "crime_type": "Burglary",
            "confidence": 0.86,
            "probabilities": {
                "Armed Robbery": 0.02,
                "Arson": 0.01,
                ...
            },
            "reasoning": "Model predicted Burglary with high confidence"
        }
        """
        # Debug: print raw request headers/body to help diagnose client payload issues
        raw_body = ''
        try:
            print('---- /predict-crime-type DEBUG HEADERS ----')
            for k, v in request.headers.items():
                print(f'{k}: {v}')
            raw_body = request.get_data(as_text=True)
            print('---- /predict-crime-type RAW BODY ----')
            print(raw_body[:2000])
            print('---- END DEBUG ----')
        except Exception as _:
            pass

        # Try to parse JSON body first (silent=True avoids raising)
        data = request.get_json(silent=True)
        if not data:
            # If Flask didn't parse JSON, try to decode raw body as JSON
            try:
                import json as _json
                if raw_body:
                    data = _json.loads(raw_body)
                else:
                    data = request.form.to_dict() if request.form else {}
            except Exception:
                data = request.form.to_dict() if request.form else {}

        # For debugging, log what keys we received
        try:
            print(f"📥 Received keys: {list(data.keys())}")
        except Exception:
            pass

        # Accept both 'description' and 'text' as aliases
        description = (data.get('description') or data.get('text') or '')
        if isinstance(description, str):
            description = description.strip()
        else:
            description = ''

        # Extra fallback: if still empty, pick the first non-empty string value from payload
        if not description:
            try:
                for v in data.values():
                    if isinstance(v, str) and v.strip():
                        description = v.strip()
                        print(f"🔁 Falling back to first string field for description: '{description[:60]}'")
                        break
            except Exception:
                pass
        location = data.get('location', 'Unknown')
        # Accept 'time_of_occurrence' or legacy 'time'
        time_of_occurrence = data.get('time_of_occurrence') or data.get('time') or ''
        
        if not description:
            return jsonify({'error': 'Description is required'}), 400
        
        try:
            print(f"\n{'='*70}")
            print(f"📊 /predict-crime-type request received")
            print(f"{'='*70}")
            print(f"📝 Description: {description[:100]}...")
            print(f"📍 Location: {location}")
            print(f"🕒 Time: {time_of_occurrence}")
            
            # Load model if not already loaded
            if CRIME_TYPE_MODEL is None:
                print("⏳ Loading crime type model...")
                load_crime_type_artifacts()
            
            # Prefer explicit part_of_day from client payload if provided; else extract from time
            part_of_day = data.get('part_of_day') or extract_part_of_day_from_time(time_of_occurrence)
            print(f"☀️  Part of Day: {part_of_day}")
            
            # Prepare model input
            city_encoder = CRIME_TYPE_ENCODERS['location']
            part_encoder = CRIME_TYPE_ENCODERS['part_of_day']
            crime_encoder = CRIME_TYPE_ENCODERS['crime_type']
            
            # Encode categorical features
            city_idx = 0
            if location in city_encoder.classes_:
                city_idx = city_encoder.transform([location])[0]
                print(f"✅ Location encoded: {location} -> {city_idx}")
            else:
                print(f"⚠️  Location '{location}' not in training data, using default (0)")
            
            part_idx = 0
            if part_of_day in part_encoder.classes_:
                part_idx = part_encoder.transform([part_of_day])[0]
                print(f"✅ Part of day encoded: {part_of_day} -> {part_idx}")
            else:
                print(f"⚠️  Part of day '{part_of_day}' not in training data, using default (0)")
            
            # Tokenize text
            encoding = CRIME_TYPE_TOKENIZER(
                description,
                truncation=True,
                padding='max_length',
                max_length=128,
                return_tensors='pt'
            )
            print(f"✅ Text tokenized: {encoding['input_ids'].shape}")
            
            # Run model inference with available inputs
            # Note: The deployed model only accepts 4 parameters (input_ids, attention_mask, city, part_of_day)
            # Despite being trained on more features, the inference architecture is simplified
            with torch.no_grad():
                logits = CRIME_TYPE_MODEL(
                    input_ids=encoding['input_ids'],
                    attention_mask=encoding['attention_mask'],
                    city=torch.tensor([city_idx], dtype=torch.long),
                    part_of_day=torch.tensor([part_idx], dtype=torch.long)
                )
                
                probabilities = torch.softmax(logits, dim=1)[0]
                predicted_idx = torch.argmax(probabilities).item()
                confidence = probabilities[predicted_idx].item()
                
                # Get crime type label
                crime_type = crime_encoder.inverse_transform([predicted_idx])[0]
                
                # Get all probabilities
                prob_dict = {}
                for idx, prob in enumerate(probabilities.tolist()):
                    label = crime_encoder.inverse_transform([idx])[0]
                    prob_dict[label] = round(prob, 4)
            
            print(f"\n🎯 Prediction Result:")
            print(f"   Crime Type: {crime_type}")
            print(f"   Confidence: {confidence*100:.2f}%")
            print(f"   Probabilities (top 3):")
            sorted_probs = sorted(prob_dict.items(), key=lambda x: x[1], reverse=True)[:3]
            for crime, prob in sorted_probs:
                print(f"      {crime}: {prob*100:.2f}%")
            
            # Generate reasoning and apply critical keyword overrides
            text_lower = description.lower()
            reasoning = f"ML Model: {crime_type} ({confidence*100:.1f}% confidence)"

            # Comprehensive keyword lists for all crime types
            kidnapping_keywords = ['kidnap', 'kidnapped', 'kidnapping', 'abduct', 'abducted', 'taken', 'missing child', 'child missing', 'snatched', 'snatch', 'missing', 'went missing', 'disappeared']
            weapon_keywords = ['gun', 'guns', 'pistol', 'rifle', 'firearm', 'armed', 'knife', 'knives', 'blade', 'bomb', 'weapon', 'weapons']
            theft_keywords = ['stolen', 'theft', 'wallet', 'phone', 'bag', 'stole', 'steal', 'stealing', 'steals', 'pickpocket', 'pick-pocket', 'snatched', 'snatch', 'took my']
            burglary_keywords = ['broke into', 'break in', 'burglary', 'burglar', 'breaking in', 'house break-in', 'home invasion', 'broke in']
            assault_keywords = ['fighting', 'fight', 'punch', 'hit', 'beat', 'attack', 'attacked', 'assaulted', 'assault', 'brawl', 'punching']
            rape_keywords = ['raped', 'rape', 'sexual assault', 'assaulted sexually', 'sexually assaulted', 'forced', 'forced sex', 'forced against will']
            sexual_harassment_keywords = ['sexual harassment', 'sexually harassed', 'harassed sexually', 'inappropriate touch', 'groping', 'harassment', 'unwanted advances', 'touched inappropriately', 'advances']
            drug_keywords = ['drugs', 'narcotics', 'cocaine', 'heroin', 'marijuana', 'cannabis', 'meth', 'drug offense', 'dealer', 'dealing', 'powder', 'white powder', 'white substance']
            arson_keywords = ['fire', 'set fire', 'burning', 'arson', 'burned', 'burnt', 'explosion', 'exploded', 'explosive']
            fraud_keywords = ['fraud', 'scam', 'scammed', 'defraud', 'defrauded', 'cheated', 'phishing', 'fake', 'hacked', 'hacking', 'hack', 'cybercrime', 'compromised', 'drained my', 'disappeared with money', 'disappeared with client', 'disappeared with company', 'stole the money', 'stole all']
            vandalism_keywords = ['vandalism', 'vandalized', 'graffiti', 'spray painted', 'damaged', 'defaced', 'threw paint', 'threw on walls', 'paint on walls', 'paint on']
            child_keywords = ['child', 'children', 'kid', 'kids', 'baby', 'infant', 'toddler', 'minor']

            # Apply overrides with safety-first priority (most severe first)
            detected_issue = None
            override_label = None
            
            # Check fraud early to avoid "disappeared" matching kidnapping
            if any(f in text_lower for f in fraud_keywords):
                # Fraud (check before kidnapping to avoid "disappeared with money" matching kidnapping)
                print("⚠️ Fraud keywords detected")
                crime_type = 'Fraud'
                confidence = max(confidence, 0.87)
                prob_dict = {label: 0.01 for label in prob_dict}
                if 'Fraud' in prob_dict:
                    prob_dict['Fraud'] = confidence
                reasoning = "⚠️ Fraud indicators detected - classified as Fraud."
                
            elif any(k in text_lower for k in kidnapping_keywords):
                # CRITICAL: Kidnapping/abduction
                print("🚨 Kidnapping keywords detected")
                detected_issue = 'kidnapping'
                override_label = 'Kidnapping'
                crime_type = 'Murder'  # Escalate to Murder for severity
                confidence = max(confidence, 0.97)
                prob_dict = {label: 0.01 for label in prob_dict}
                if 'Murder' in prob_dict:
                    prob_dict['Murder'] = confidence
                reasoning = "🚨 CRITICAL: Kidnapping/abduction detected - escalated to Murder severity level."
                
            elif any(r in text_lower for r in rape_keywords):
                # CRITICAL: Rape (check before harassment to avoid false positives)
                print("🚨 Rape keywords detected")
                crime_type = 'Rape'
                confidence = max(confidence, 0.95)
                prob_dict = {label: 0.01 for label in prob_dict}
                if 'Rape' in prob_dict:
                    prob_dict['Rape'] = confidence
                reasoning = "🚨 CRITICAL: Sexual violence detected - classified as Rape."
                
            elif any(w in text_lower for w in weapon_keywords) and any(r in text_lower for r in ['robbery', 'robbed', 'steal', 'stole', 'snatch', 'taking belongings', 'taking their']):
                # Weapon + robbery -> Armed Robbery
                print("⚠️ Weapon + robbery detected")
                crime_type = 'Armed Robbery'
                confidence = max(confidence, 0.92)
                prob_dict = {label: 0.01 for label in prob_dict}
                if 'Armed Robbery' in prob_dict:
                    prob_dict['Armed Robbery'] = confidence
                reasoning = "⚠️ Weapon + robbery indicators detected - classified as Armed Robbery."
                
            elif any(w in text_lower for w in weapon_keywords) and any(t in text_lower for t in theft_keywords):
                # Weapon + theft -> Armed Robbery (alternative pattern)
                print("⚠️ Weapon + theft detected")
                crime_type = 'Armed Robbery'
                confidence = max(confidence, 0.92)
                prob_dict = {label: 0.01 for label in prob_dict}
                if 'Armed Robbery' in prob_dict:
                    prob_dict['Armed Robbery'] = confidence
                reasoning = "⚠️ Weapon + theft indicators detected - classified as Armed Robbery."
                
            elif any(w in text_lower for w in weapon_keywords):
                # Weapon mention alone -> Assault (unless it matches robbery pattern, which was checked above)
                print("⚠️ Weapon detected")
                crime_type = 'Assault'
                confidence = max(confidence, 0.90)
                prob_dict = {label: 0.01 for label in prob_dict}
                if 'Assault' in prob_dict:
                    prob_dict['Assault'] = confidence
                reasoning = "⚠️ Weapon-related keywords detected - likely Assault."
                
            elif any(sh in text_lower for sh in sexual_harassment_keywords) and not any(r in text_lower for r in rape_keywords):
                # Sexual Harassment (but not rape - avoid double-matching)
                print("⚠️ Sexual harassment keywords detected")
                crime_type = 'Sexual Harassment'
                confidence = max(confidence, 0.91)
                prob_dict = {label: 0.01 for label in prob_dict}
                if 'Sexual Harassment' in prob_dict:
                    prob_dict['Sexual Harassment'] = confidence
                reasoning = "⚠️ Sexual harassment indicators detected - classified as Sexual Harassment."
                
            elif any(d in text_lower for d in drug_keywords):
                # Drug Offense
                print("⚠️ Drug keywords detected")
                crime_type = 'Drug Offense'
                confidence = max(confidence, 0.88)
                prob_dict = {label: 0.01 for label in prob_dict}
                if 'Drug Offense' in prob_dict:
                    prob_dict['Drug Offense'] = confidence
                reasoning = "⚠️ Drug-related keywords detected - classified as Drug Offense."
                
            elif any(a in text_lower for a in arson_keywords):
                # Arson
                print("⚠️ Arson keywords detected")
                crime_type = 'Arson'
                confidence = max(confidence, 0.90)
                prob_dict = {label: 0.01 for label in prob_dict}
                if 'Arson' in prob_dict:
                    prob_dict['Arson'] = confidence
                reasoning = "⚠️ Fire/arson indicators detected - classified as Arson."
                
            elif any(v in text_lower for v in vandalism_keywords):
                # Vandalism
                print("⚠️ Vandalism keywords detected")
                crime_type = 'Vandalism'
                confidence = max(confidence, 0.86)
                prob_dict = {label: 0.01 for label in prob_dict}
                if 'Vandalism' in prob_dict:
                    prob_dict['Vandalism'] = confidence
                reasoning = "⚠️ Vandalism indicators detected - classified as Vandalism."
                
            elif any(b in text_lower for b in burglary_keywords):
                # Burglary (breaking in)
                print("⚠️ Burglary keywords detected")
                crime_type = 'Burglary'
                confidence = max(confidence, 0.88)
                prob_dict = {label: 0.01 for label in prob_dict}
                if 'Burglary' in prob_dict:
                    prob_dict['Burglary'] = confidence
                reasoning = "⚠️ Burglary indicators detected - classified as Burglary."
                
            elif any(a in text_lower for a in assault_keywords):
                # Assault (fighting, violence without weapons)
                print("⚠️ Assault keywords detected")
                crime_type = 'Assault'
                confidence = max(confidence, 0.89)
                prob_dict = {label: 0.01 for label in prob_dict}
                if 'Assault' in prob_dict:
                    prob_dict['Assault'] = confidence
                reasoning = "⚠️ Assault/violence indicators detected - classified as Assault."
                
            elif any(t in text_lower for t in theft_keywords) and not any(w in text_lower for w in weapon_keywords):
                # Theft without weapons
                print("⚠️ Theft keywords detected")
                crime_type = 'Theft'
                confidence = max(confidence, 0.89)
                prob_dict = {label: 0.01 for label in prob_dict}
                if 'Theft' in prob_dict:
                    prob_dict['Theft'] = confidence
                reasoning = "⚠️ Theft indicators detected - classified as Theft."
            
            # Check for child safety keywords (append to reasoning)
            if any(c in text_lower for c in child_keywords):
                reasoning += " | ⚠️ ALERT: Involves minor/child"

            # Include detection metadata so clients can show a friendlier label (e.g., 'Kidnapping') while
            # server maps to a severity label (e.g., 'Murder') for escalation and triage.
            # Note: do not expose numeric confidence to client UI by default; keep it internal.
            result = {
                'crime_type': crime_type,
                'probabilities': prob_dict,
                'reasoning': reasoning.replace(f"({confidence*100:.1f}% confidence)", ""),
                'part_of_day': part_of_day,
                'model_used': 'PyTorch HybridRiskPredictionModel'
            }

            if detected_issue:
                result['detected_issue'] = detected_issue
            if override_label:
                result['override_label'] = override_label
            # Log override events for later analysis / finetuning dataset
            try:
                if detected_issue or override_label:
                    log_entry = {
                        'timestamp': time.time(),
                        'text': description,
                        'predicted_label': crime_type,
                        'probabilities': prob_dict,
                        'detected_issue': detected_issue,
                        'override_label': override_label,
                    }
                    log_path = os.path.join(os.path.dirname(__file__), 'override_logs.jsonl')
                    # Ensure directory exists (should, it's the server folder)
                    with open(log_path, 'a', encoding='utf-8') as f:
                        f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")
            except Exception:
                # Don't let logging break the endpoint
                import traceback as _tb
                _tb.print_exc()

            print(f"✅ Crime type prediction complete")
            print(f"{'='*70}\n")

            return jsonify(result)
            
        except Exception as e:
            print(f"❌ Crime type prediction error: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    def extract_part_of_day_from_time(time_str: str) -> str:
        """Extract part of day from time string"""
        if not time_str or time_str == 'Unknown':
            return 'Unknown'
        
        try:
            import re
            hour = None
            
            # Try HH:MM format
            match = re.search(r"(\d{1,2}):(\d{2})", time_str)
            if match:
                hour = int(match.group(1)) % 24
            else:
                # Try "10 PM" or "10am" format
                match = re.search(r"(\d{1,2})\s*(am|pm|AM|PM)", time_str)
                if match:
                    h = int(match.group(1)) % 12
                    if match.group(2).lower() == 'pm':
                        h = (h % 12) + 12
                    hour = h
            
            if hour is not None:
                if 6 <= hour < 12:
                    return 'Morning'
                elif 12 <= hour < 18:
                    return 'Afternoon'
                elif 18 <= hour < 24:
                    return 'Evening'
                else:
                    return 'Night'
        except:
            pass
        
        return 'Unknown'

    # Simple health endpoint for connectivity checks
    @app.get('/healthz')
    def healthz():
        return jsonify({"status": "ok"})

    # Configure debug/reloader from environment to avoid auto restarts when undesired
    debug_env = os.getenv('FLASK_DEBUG', '0').lower() in ('1', 'true', 'yes')
    use_reloader = os.getenv('FLASK_RELOAD', '0').lower() in ('1', 'true', 'yes')
    port = int(os.getenv('PORT', 8080))

    print("Starting Flask server...")
    print("Local development mode: DEV_SKIP_AUTH =", DEV_SKIP_AUTH)
    print("Mock mode (no PyTorch):", MOCK_MODE)
    print(f"Server will be available at http://localhost:{port}")
    
    # Initialize escalation prediction service (optional, can run without it)
    try:
        from escalation_model_service import initialize_escalation_service
        # Try to initialize but don't block server startup
        import threading
        def init_async():
            try:
                initialize_escalation_service()
            except Exception as e:
                print(f"⚠️  Escalation service initialization failed: {e}")
                print("   Server will use fallback predictions for escalation.")
        
        thread = threading.Thread(target=init_async, daemon=True)
        thread.start()
        print("⏳ Escalation service initializing in background...")
    except ImportError as e:
        print(f"⚠️  Escalation service not available: {e}")
    except Exception as e:
        print(f"⚠️  Error setting up escalation service: {e}")
    
    app.run(host='0.0.0.0', port=port, debug=debug_env, use_reloader=use_reloader)
