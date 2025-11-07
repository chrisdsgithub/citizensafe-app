"""
Incident Escalation Risk Prediction Service
Uses HybridRiskModel (BERT + Categorical Embeddings) for predicting Low/Medium/High risk
"""

import os
import pickle
import numpy as np
import torch
import torch.nn as nn
from transformers import BertTokenizer, BertModel
import pandas as pd
from datetime import datetime

# ============================================================================
# MODEL ARCHITECTURE (Same as training)
# ============================================================================

class HybridRiskModel(nn.Module):
    """
    Multi-modal model combining BERT text encoding with categorical embeddings
    """
    def __init__(self, vocab_sizes, n_numeric=1, n_classes=3):
        super(HybridRiskModel, self).__init__()

        # Text processing: BERT
        self.bert = BertModel.from_pretrained('bert-base-uncased')
        self.bert_dropout = nn.Dropout(0.3)
        bert_hidden_size = 768

        # Categorical embeddings
        self.embeddings = nn.ModuleDict()
        total_embed_dim = 0

        for feature, vocab_size in vocab_sizes.items():
            # Dynamic embedding dimension
            embed_dim = min(50, max(4, int(vocab_size ** 0.6)))
            self.embeddings[feature] = nn.Embedding(vocab_size, embed_dim)
            total_embed_dim += embed_dim

        # Numerical feature processing (minimal, placeholder)
        self.numeric_fc = nn.Linear(n_numeric, 32)

        # Structured features MLP
        struct_in_dim = total_embed_dim + 32  # embeddings + numeric features
        self.struct_mlp = nn.Sequential(
            nn.Linear(struct_in_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Dropout(0.2)
        )

        # Fusion and classification head
        fusion_input_dim = bert_hidden_size + 128  # BERT + structured MLP
        self.classifier = nn.Sequential(
            nn.Linear(fusion_input_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, n_classes)
        )

    def forward(self, input_ids, attention_mask, categorical_features, numerical_features):
        # Text encoding with BERT
        bert_output = self.bert(input_ids=input_ids, attention_mask=attention_mask)
        text_features = bert_output.last_hidden_state[:, 0, :]  # [CLS] token
        text_features = self.bert_dropout(text_features)

        # Categorical embeddings
        embedded_features = []
        for feature_name, embedding_layer in self.embeddings.items():
            embedded = embedding_layer(categorical_features[feature_name])
            embedded_features.append(embedded)

        # Concatenate all embeddings
        cat_features = torch.cat(embedded_features, dim=1)

        # Process numerical features
        num_features = torch.relu(self.numeric_fc(numerical_features))

        # Combine structured features
        struct_features = torch.cat([cat_features, num_features], dim=1)
        struct_features = self.struct_mlp(struct_features)

        # Fusion: combine text and structured features
        fused_features = torch.cat([text_features, struct_features], dim=1)

        # Classification
        output = self.classifier(fused_features)

        return output


# ============================================================================
# GLOBAL VARIABLES
# ============================================================================

MODEL = None
PREPROCESSING_INFO = None
TOKENIZER = None
DEVICE = None


# ============================================================================
# MODEL LOADING
# ============================================================================

def load_escalation_model():
    """Load the trained HybridRiskModel"""
    global MODEL, PREPROCESSING_INFO, TOKENIZER, DEVICE
    
    if MODEL is not None:
        return MODEL, PREPROCESSING_INFO, TOKENIZER
    
    try:
        # Set device
        DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"🔮 Loading Escalation Model on {DEVICE}...")
        
        # Model path
        model_dir = os.path.dirname(__file__)
        model_path = os.path.join(model_dir, 'best_hybrid_risk_model.pth')
        preprocessing_path = os.path.join(model_dir, 'preprocessing_info.pkl')
        
        # Check if files exist
        if not os.path.exists(model_path):
            print(f"⚠️  Model file not found: {model_path}")
            return None, None, None
        
        if not os.path.exists(preprocessing_path):
            print(f"⚠️  Preprocessing file not found: {preprocessing_path}")
            return None, None, None
        
        # Load preprocessing info
        with open(preprocessing_path, 'rb') as f:
            PREPROCESSING_INFO = pickle.load(f)
        
        # Load model checkpoint
        checkpoint = torch.load(model_path, map_location=DEVICE)
        vocab_sizes = checkpoint['vocab_sizes']
        
        # Initialize model
        MODEL = HybridRiskModel(vocab_sizes=vocab_sizes, n_numeric=1, n_classes=3)
        MODEL.load_state_dict(checkpoint['model_state_dict'])
        MODEL = MODEL.to(DEVICE)
        MODEL.eval()
        
        # Load tokenizer
        TOKENIZER = BertTokenizer.from_pretrained('bert-base-uncased')
        
        print(f"✅ Escalation Model loaded successfully!")
        print(f"   Model F1 Score: {checkpoint.get('val_f1', 'N/A')}")
        
        return MODEL, PREPROCESSING_INFO, TOKENIZER
    
    except Exception as e:
        print(f"❌ Failed to load escalation model: {e}")
        import traceback
        traceback.print_exc()
        return None, None, None


# ============================================================================
# PREDICTION FUNCTION
# ============================================================================

def predict_escalation_risk(incident_data):
    """
    Predict escalation risk for a single incident
    
    Args:
        incident_data: dict with keys:
            - description: str (required)
            - location: str (required)
            - sub_location: str (optional, defaults to 'Unknown')
            - crime_type: str (optional, defaults to 'Unknown')
            - datetime_occurred: str (optional, format 'DD-MM-YYYY HH:MM', defaults to now)
            - part_of_day: str (optional, one of Morning/Afternoon/Evening/Night)
            - is_user_report: bool (optional, defaults to True)
    
    Returns:
        dict with:
            - predicted_risk: 'Low' | 'Medium' | 'High'
            - confidence: float (0-1)
            - probabilities: {'Low': float, 'Medium': float, 'High': float}
            - reasoning: str
    """
    
    # Load model if not loaded
    model, preprocessing_info, tokenizer = load_escalation_model()
    
    if model is None:
        return {
            'predicted_risk': 'Medium',
            'confidence': 0.0,
            'probabilities': {'Low': 0.33, 'Medium': 0.34, 'High': 0.33},
            'reasoning': 'Escalation model not available. Using fallback prediction.',
            'error': 'Model not loaded'
        }
    
    try:
        # Extract and validate input
        description = incident_data.get('description', 'Unknown incident')
        location = incident_data.get('location', 'Unknown')
        sub_location = incident_data.get('sub_location', 'Unknown')
        crime_type = incident_data.get('crime_type', 'Unknown')
        is_user_report = incident_data.get('is_user_report', True)
        
        # Parse datetime
        datetime_str = incident_data.get('datetime_occurred')
        if datetime_str:
            try:
                # Try format: DD-MM-YYYY HH:MM
                dt = pd.to_datetime(datetime_str, format='%d-%m-%Y %H:%M')
            except:
                try:
                    # Try format: YYYY-MM-DD HH:MM:SS
                    dt = pd.to_datetime(datetime_str)
                except:
                    # Default to now
                    dt = datetime.now()
        else:
            dt = datetime.now()
        
        hour = dt.hour
        day_of_week = dt.dayofweek
        month = dt.month
        
        # Determine part_of_day if not provided
        part_of_day = incident_data.get('part_of_day')
        if not part_of_day:
            if 5 <= hour < 12:
                part_of_day = 'Morning'
            elif 12 <= hour < 17:
                part_of_day = 'Afternoon'
            elif 17 <= hour < 21:
                part_of_day = 'Evening'
            else:
                part_of_day = 'Night'
        
        # Get label encoders
        label_encoders = preprocessing_info['label_encoders']
        
        # Track unknown categories for confidence adjustment
        unknown_categories = []
        
        # Safe encoding function with better fallback
        def safe_encode(col, value):
            le = label_encoders[col]
            if value in le.classes_:
                return le.transform([value])[0]
            else:
                unknown_categories.append(col)
                # Use middle of range instead of 0 for unknown values
                n_classes = len(le.classes_)
                return n_classes // 2
        
        # Encode categorical features
        location_enc = safe_encode('location', location)
        sub_location_enc = safe_encode('sub_location', sub_location)
        crime_type_enc = safe_encode('crime_type', crime_type)
        hour_enc = safe_encode('hour', str(hour))
        part_of_day_enc = safe_encode('part_of_day', part_of_day)
        day_of_week_enc = safe_encode('day_of_week', str(day_of_week))
        month_enc = safe_encode('month', str(month))
        is_user_report_val = int(is_user_report)
        
        # Tokenize description
        max_length = 128
        encoding = tokenizer.encode_plus(
            description,
            add_special_tokens=True,
            max_length=max_length,
            padding='max_length',
            truncation=True,
            return_attention_mask=True,
            return_tensors='pt'
        )
        
        input_ids = encoding['input_ids'].to(DEVICE)
        attention_mask = encoding['attention_mask'].to(DEVICE)
        
        # Prepare categorical features
        categorical_features = {
            'location': torch.tensor([location_enc], dtype=torch.long).to(DEVICE),
            'sub_location': torch.tensor([sub_location_enc], dtype=torch.long).to(DEVICE),
            'crime_type': torch.tensor([crime_type_enc], dtype=torch.long).to(DEVICE),
            'hour': torch.tensor([hour_enc], dtype=torch.long).to(DEVICE),
            'part_of_day': torch.tensor([part_of_day_enc], dtype=torch.long).to(DEVICE),
            'is_user_report': torch.tensor([is_user_report_val], dtype=torch.long).to(DEVICE),
            'day_of_week': torch.tensor([day_of_week_enc], dtype=torch.long).to(DEVICE),
            'month': torch.tensor([month_enc], dtype=torch.long).to(DEVICE)
        }
        
        # Dummy numerical features
        numerical_features = torch.zeros(1, 1).to(DEVICE)
        
        # Make prediction
        with torch.no_grad():
            outputs = model(input_ids, attention_mask, categorical_features, numerical_features)
            probs = torch.softmax(outputs, dim=1)
            pred = torch.argmax(outputs, dim=1)
        
        # Map to risk labels
        risk_labels = ['Low', 'Medium', 'High']
        predicted_risk = risk_labels[pred.item()]
        raw_confidence = probs[0][pred.item()].item()
        
        # Get all probabilities
        raw_probabilities = {
            'Low': float(probs[0][0].item()),
            'Medium': float(probs[0][1].item()),
            'High': float(probs[0][2].item())
        }
        
        # Analyze description quality
        is_generic_description = len(description.split()) < 8
        
        # Check for violence/urgency keywords
        violence_keywords = ['shot', 'fire', 'fired', 'gun', 'weapon', 'knife', 'stab', 'attack', 
                           'assault', 'threat', 'violence', 'hurt', 'blood', 'injured', 'dead', 
                           'kill', 'murder', 'robbery', 'armed', 'hostage', 'kidnap']
        has_violence_keywords = any(word in description.lower() for word in violence_keywords)
        
        # Check for child safety concerns (HIGH PRIORITY)
        child_safety_keywords = ['child', 'children', 'kid', 'kids', 'girl', 'boy', 'baby', 
                                'infant', 'toddler', 'minor', 'juvenile', 'abduct', 'trafficking',
                                'kidnap', 'molest', 'abuse']
        has_child_safety_concerns = any(keyword in description.lower() for keyword in child_safety_keywords)
        
        # Check for generic/low-risk keywords (REMOVED 'suspicious' - it can indicate real threats)
        generic_keywords = ['noise', 'loud', 'sound', 'hearing', 'heard']
        has_generic_keywords = any(keyword in description.lower() for keyword in generic_keywords)
        
        # Calculate data quality score
        unknown_ratio = len(unknown_categories) / 8.0  # 8 total categorical features
        
        # Adjust confidence for unknown categories
        # Each unknown category reduces confidence by 15%
        confidence_penalty = len(unknown_categories) * 0.15
        adjusted_confidence = max(0.3, raw_confidence - confidence_penalty)
        
        # CRITICAL: Check for LIFE-THREATENING situations (HIGHEST PRIORITY)
        life_threatening_keywords = ['hostage', 'gun', 'armed', 'weapon', 'shooting', 'shooter',
                                     'bomb', 'explosive', 'terror', 'active shooter', 'gunman',
                                     'armed robbery', 'held at gunpoint', 'threatening with']
        has_life_threatening = any(keyword in description.lower() for keyword in life_threatening_keywords)
        
        # CRITICAL: Upgrade to High Risk if child safety concerns detected
        if has_child_safety_concerns and predicted_risk != 'High':
            print(f"⚠️  CHILD SAFETY CONCERN DETECTED - Upgrading from {predicted_risk} to High Risk")
            predicted_risk = 'High'
            adjusted_confidence = 0.85
            raw_probabilities = {
                'Low': 0.05,
                'Medium': 0.10,
                'High': 0.85
            }
        
        # CRITICAL: Upgrade to High Risk if LIFE-THREATENING situation detected
        if has_life_threatening and predicted_risk != 'High':
            print(f"🚨 LIFE-THREATENING SITUATION DETECTED - Upgrading from {predicted_risk} to High Risk")
            print(f"   Keywords found: {[kw for kw in life_threatening_keywords if kw in description.lower()]}")
            predicted_risk = 'High'
            adjusted_confidence = 0.95  # Even higher confidence than child safety
            raw_probabilities = {
                'Low': 0.02,
                'Medium': 0.03,
                'High': 0.95
            }
        
        # Override logic for unreliable predictions
        should_override = False
        override_reasoning = []
        
        # NEVER override if LIFE-THREATENING or child safety concerns present
        if has_life_threatening or has_child_safety_concerns:
            should_override = False
        else:
            # Case 1: Many unknown categories + generic description + no violence/child concerns
            if unknown_ratio > 0.3 and is_generic_description and not has_violence_keywords:
                if predicted_risk == 'High':
                    should_override = True
                    override_reasoning.append("high confidence with many unknown features")
            
            # Case 2: Generic noise complaints without violence/child indicators
            if has_generic_keywords and not has_violence_keywords:
                if predicted_risk == 'High':
                    should_override = True
                    override_reasoning.append("generic description without urgency indicators")
        
        # Apply override
        if should_override:
            # Downgrade to Low or Medium based on context
            if has_generic_keywords:
                predicted_risk = 'Low'
                adjusted_confidence = 0.60
                raw_probabilities = {
                    'Low': 0.60,
                    'Medium': 0.35,
                    'High': 0.05
                }
            else:
                predicted_risk = 'Medium'
                adjusted_confidence = 0.55
                raw_probabilities = {
                    'Low': 0.20,
                    'Medium': 0.55,
                    'High': 0.25
                }
        
        # Generate reasoning
        reasoning = _generate_reasoning(
            predicted_risk, adjusted_confidence, raw_probabilities,
            crime_type=crime_type, location=location, part_of_day=part_of_day, is_user_report=is_user_report,
            unknown_categories=unknown_categories, is_generic_description=is_generic_description, 
            was_overridden=should_override, override_reasons=override_reasoning,
            has_child_safety_concerns=has_child_safety_concerns,
            has_life_threatening=has_life_threatening
        )
        
        result = {
            'predicted_risk': predicted_risk,
            'confidence': float(adjusted_confidence),
            'probabilities': raw_probabilities,
            'reasoning': reasoning,
            'model_used': 'HybridRiskModel (BERT + Categorical Embeddings)',
            'features_analyzed': {
                'description_length': len(description),
                'location': location,
                'crime_type': crime_type,
                'time': part_of_day,
                'user_report': is_user_report,
                'unknown_categories': unknown_categories if unknown_categories else None
            }
        }
        
        return result
    
    except Exception as e:
        print(f"❌ Error predicting escalation risk: {e}")
        import traceback
        traceback.print_exc()
        
        return {
            'predicted_risk': 'Medium',
            'confidence': 0.0,
            'probabilities': {'Low': 0.33, 'Medium': 0.34, 'High': 0.33},
            'reasoning': f'Error during prediction: {str(e)}',
            'error': str(e)
        }


def _generate_reasoning(predicted_risk, confidence, probabilities, 
                       crime_type, location, part_of_day, is_user_report,
                       unknown_categories=None, is_generic_description=False,
                       was_overridden=False, override_reasons=None,
                       has_child_safety_concerns=False, has_life_threatening=False):
    """Generate contextual reasoning based on understanding of the report"""
    
    # Analyze the context to provide intelligent reasoning
    reasoning = ""
    
    if predicted_risk == 'High':
        # HIGHEST PRIORITY: Life-threatening situations (hostages, armed threats, active shooters)
        if has_life_threatening:
            reasoning = "🚨 LIFE-THREATENING SITUATION - Armed threat/hostage detected. IMMEDIATE tactical response required. Deploy SWAT/specialized units."
        # Special case for child safety
        elif has_child_safety_concerns:
            reasoning = "Child safety concern detected. Immediate response required."
        elif crime_type and 'post' not in crime_type.lower():
            reasoning = f"Serious incident of {crime_type.lower()} requiring immediate police response."
        else:
            reasoning = "Critical situation requiring urgent attention and resources."
            
        # Add time context if night
        if part_of_day and part_of_day.lower() == 'night':
            reasoning += " Nighttime occurrence increases severity."
            
    elif predicted_risk == 'Medium':
        reasoning = "Incident requires monitoring and potential intervention."
        if part_of_day:
            reasoning += f" Reported during {part_of_day.lower()}."
            
    else:  # Low risk
        reasoning = "Routine incident. Standard procedures apply."
        if is_generic_description:
            reasoning += " Limited details provided."
    
    return reasoning


# ============================================================================
# INITIALIZATION
# ============================================================================

def initialize_escalation_service():
    """Initialize the escalation prediction service on startup"""
    print("\n" + "="*70)
    print("Initializing Incident Escalation Prediction Service...")
    print("="*70)
    
    model, preprocessing_info, tokenizer = load_escalation_model()
    
    if model is not None:
        print("✅ Escalation service ready!")
        print("="*70 + "\n")
        return True
    else:
        print("⚠️  Escalation service running in fallback mode")
        print("="*70 + "\n")
        return False
