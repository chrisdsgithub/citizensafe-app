#!/usr/bin/env python3
"""
Test script to verify the trained voice sentiment model loads correctly
"""

import os
import sys

# Add server directory to path
sys.path.insert(0, os.path.dirname(__file__))

from voice_sentiment_service import load_voice_model

def test_model_loading():
    """Test if the model loads successfully"""
    print("=" * 60)
    print("Testing Voice Sentiment Model Loading")
    print("=" * 60)
    
    # Check if model file exists
    model_path = os.path.join(os.path.dirname(__file__), 'final_model.keras')
    print(f"\n1️⃣  Checking model file...")
    if os.path.exists(model_path):
        file_size = os.path.getsize(model_path) / (1024 * 1024)  # MB
        print(f"   ✅ Model file found: {model_path}")
        print(f"   📦 File size: {file_size:.2f} MB")
    else:
        print(f"   ❌ Model file NOT found: {model_path}")
        return False
    
    # Try to load the model
    print(f"\n2️⃣  Loading model with custom Attention layer...")
    try:
        model = load_voice_model()
        
        if model is None:
            print("   ❌ Model loading returned None")
            return False
        
        print(f"   ✅ Model loaded successfully!")
        print(f"   📊 Model summary:")
        print(f"      - Input shape: {model.input_shape}")
        print(f"      - Output shape: {model.output_shape}")
        print(f"      - Total parameters: {model.count_params():,}")
        
        # Verify input/output shapes match training
        expected_input = (None, 200, 120)  # (batch, timesteps, features)
        expected_output = (None, 8)  # (batch, 8 emotions)
        
        print(f"\n3️⃣  Verifying model architecture...")
        if model.input_shape == expected_input:
            print(f"   ✅ Input shape correct: {model.input_shape}")
        else:
            print(f"   ⚠️  Input shape mismatch!")
            print(f"      Expected: {expected_input}")
            print(f"      Got: {model.input_shape}")
        
        if model.output_shape == expected_output:
            print(f"   ✅ Output shape correct: {model.output_shape}")
        else:
            print(f"   ⚠️  Output shape mismatch!")
            print(f"      Expected: {expected_output}")
            print(f"      Got: {model.output_shape}")
        
        print(f"\n" + "=" * 60)
        print("✅ MODEL READY FOR PREDICTIONS!")
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"   ❌ Error loading model: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = test_model_loading()
    sys.exit(0 if success else 1)
