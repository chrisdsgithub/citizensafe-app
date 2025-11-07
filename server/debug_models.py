#!/usr/bin/env python3
"""
Debug script to test all available crime prediction models
"""
import os
import sys
import torch
import pickle
from transformers import DistilBertTokenizer

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

# Set CPU only
os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'
torch.set_num_threads(1)

# Import the model architecture
from app import HybridRiskPredictionModel

def test_model(model_path, description, location='Mumbai', time_of_occurrence='14:30'):
    """Test a single model file"""
    print(f"\n{'='*70}")
    print(f"Testing: {os.path.basename(model_path)}")
    print(f"{'='*70}")
    
    if not os.path.exists(model_path):
        print(f"❌ Model file not found: {model_path}")
        return
    
    file_size = os.path.getsize(model_path) / (1024**2)
    print(f"File size: {file_size:.1f} MB")
    
    try:
        # Load checkpoint
        ckpt = torch.load(model_path, map_location='cpu', weights_only=False)
        print(f"✅ Model loaded successfully")
        
        # Check checkpoint structure
        if isinstance(ckpt, dict):
            print(f"Checkpoint keys: {list(ckpt.keys())[:5]}...")
            
            # Extract label encoders
            if 'label_encoders' in ckpt:
                encoders = ckpt['label_encoders']
                print(f"Label encoders found: {list(encoders.keys())}")
                if 'crime_type' in encoders:
                    print(f"Crime types: {encoders['crime_type'].classes_}")
            
            # Try to load the model
            state_dict = ckpt.get('model_state_dict') or ckpt.get('state_dict')
            if state_dict is None:
                print("❌ No state_dict in checkpoint")
                return
            
            # Get encoders
            encoders = ckpt['label_encoders']
            num_cities = len(encoders['location'].classes_)
            num_parts = len(encoders['part_of_day'].classes_)
            num_classes = len(encoders['crime_type'].classes_)
            
            # Infer hidden sizes
            mlp_hidden_size = 128
            if 'mlp.0.weight' in state_dict:
                mlp_hidden_size = int(state_dict['mlp.0.weight'].shape[0])
            
            combined_size = None
            if 'classifier.0.weight' in state_dict:
                combined_size = int(state_dict['classifier.0.weight'].shape[1])
            
            if combined_size is not None:
                bert_hidden_size = combined_size - (mlp_hidden_size // 2)
                if bert_hidden_size <= 0:
                    bert_hidden_size = 768
            else:
                bert_hidden_size = 768
            
            print(f"Model config: cities={num_cities}, parts={num_parts}, classes={num_classes}")
            print(f"BERT hidden size: {bert_hidden_size}, MLP hidden size: {mlp_hidden_size}")
            
            # Load model
            model = HybridRiskPredictionModel(num_cities, num_parts, num_classes,
                                            bert_hidden_size=bert_hidden_size,
                                            mlp_hidden_size=mlp_hidden_size)
            
            # Remove DataParallel prefix
            new_state_dict = {}
            for k, v in state_dict.items():
                new_key = k[len('module.'):] if k.startswith('module.') else k
                new_state_dict[new_key] = v
            
            model.load_state_dict(new_state_dict, strict=False)
            model.eval()
            print(f"✅ Model loaded into architecture")
            
            # Test inference
            tokenizer = DistilBertTokenizer.from_pretrained('distilbert-base-uncased')
            
            # Prepare input
            encoding = tokenizer(
                description,
                truncation=True,
                padding='max_length',
                max_length=128,
                return_tensors='pt'
            )
            
            # Get indices
            city_idx = 0
            if location in encoders['location'].classes_:
                city_idx = encoders['location'].transform([location])[0]
            
            part_of_day = 'Morning'
            part_idx = 0
            if part_of_day in encoders['part_of_day'].classes_:
                part_idx = encoders['part_of_day'].transform([part_of_day])[0]
            
            # Run inference
            with torch.no_grad():
                logits = model(
                    input_ids=encoding['input_ids'],
                    attention_mask=encoding['attention_mask'],
                    city=torch.tensor([city_idx], dtype=torch.long),
                    part_of_day=torch.tensor([part_idx], dtype=torch.long)
                )
                
                probabilities = torch.softmax(logits, dim=1)[0]
                predicted_idx = torch.argmax(probabilities).item()
                confidence = probabilities[predicted_idx].item()
                
                crime_type = encoders['crime_type'].inverse_transform([predicted_idx])[0]
                
                print(f"\n🎯 Test Input: '{description}'")
                print(f"Predicted: {crime_type} ({confidence*100:.2f}%)")
                
                # Show top 3
                print(f"\nTop 3 predictions:")
                top_3_idx = torch.argsort(probabilities, descending=True)[:3]
                for idx in top_3_idx:
                    label = encoders['crime_type'].inverse_transform([idx.item()])[0]
                    prob = probabilities[idx].item()
                    print(f"  {label}: {prob*100:.2f}%")
                    
        else:
            print("❌ Checkpoint is not a dict")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

# Test all models
models = [
    '/Users/apple/Desktop/CitizenSafeApp/server/best_crime_model_reduced_accuracy.pth',
    '/Users/apple/Desktop/CitizenSafeApp/server/best_hybrid_risk_model.pth',
    '/Users/apple/Desktop/CitizenSafeApp/server/hybrid_risk_model.pth'
]

test_cases = [
    "man stole my wallet at the market",
    "man with guns at the mall",
    "child has been kidnapped from school",
    "two men fighting in the street",
    "someone broke into my house and stole electronics",
    "my bank account was hacked and money withdrawn"
]

for model_path in models:
    if os.path.exists(model_path):
        test_model(model_path, test_cases[0])  # Test with first case

print(f"\n{'='*70}\n")
