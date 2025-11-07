/**
 * Auto Crime Classification Service
 * 
 * Automatically extracts location, time, and crime type from crime reports
 * using Gemini API. No manual input required.
 */

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

interface ExtractedCrimeData {
  location: string;
  time_of_occurrence: string;
  crime_type: string;
  confidence: number;
  reasoning: string;
}

interface AutoClassificationResult {
  success: boolean;
  data?: ExtractedCrimeData;
  error?: string;
}

/**
 * Automatically extract crime details and classify crime type from a report description
 * Uses Gemini API with structured JSON parsing
 * 
 * @param reportDescription - Full text description of the crime
 * @param apiKey - Gemini API key (from environment)
 * @returns Extracted location, time, and crime type with confidence
 */
export async function autoClassifyCrimeReport(
  reportDescription: string,
  apiKey: string
): Promise<AutoClassificationResult> {
  try {
    if (!reportDescription || reportDescription.trim().length === 0) {
      return {
        success: false,
        error: 'Report description is empty'
      };
    }

    if (!apiKey) {
      return {
        success: false,
        error: 'Gemini API key not configured'
      };
    }

    const extractionPrompt = `You are a crime report analysis expert. Extract structured information from this crime report and classify the crime type.

CRIME REPORT:
${reportDescription}

Extract and classify the following information. Respond in VALID JSON format ONLY:
{
  "location": "Extracted location (city/area). If not mentioned, say 'Unknown'",
  "time_of_occurrence": "Extracted time (e.g., '2:30 PM', 'Night', 'Morning'). If not mentioned, say 'Unknown'",
  "crime_type": "One of: Armed Robbery, Arson, Assault, Burglary, Cybercrime, Fraud, Murder, Rape, Theft, Traffic Offense, Vandalism",
  "confidence": 0.85,
  "reasoning": "Brief explanation of why this crime type was chosen based on keywords and context"
}

Important:
- confidence should be a number between 0 and 1 (0.0 - 1.0)
- Be specific with location if possible
- Choose the crime type that best matches the description
- If the description is vague, lower the confidence score accordingly`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: extractionPrompt
            }
          ]
        }
      ]
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: `Gemini API error: ${errorData?.error?.message || 'Unknown error'}`
      };
    }

    const result = await response.json();
    const responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      return {
        success: false,
        error: 'No response from Gemini API'
      };
    }

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        success: false,
        error: 'Could not parse Gemini response as JSON'
      };
    }

    const extractedData = JSON.parse(jsonMatch[0]) as ExtractedCrimeData;

    // Validate extracted data
    if (!extractedData.crime_type) {
      return {
        success: false,
        error: 'Failed to extract crime type'
      };
    }

    // Ensure confidence is a valid number between 0 and 1
    let confidence = extractedData.confidence;
    if (typeof confidence !== 'number') {
      confidence = 0.5;
    } else if (confidence > 1) {
      confidence = confidence / 100; // Convert from percentage
    }
    confidence = Math.max(0, Math.min(1, confidence)); // Clamp between 0-1

    return {
      success: true,
      data: {
        location: extractedData.location || 'Unknown',
        time_of_occurrence: extractedData.time_of_occurrence || 'Unknown',
        crime_type: extractedData.crime_type,
        confidence: confidence,
        reasoning: extractedData.reasoning || 'Crime classification based on report content'
      }
    };
  } catch (error) {
    console.error('Auto classification error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during classification'
    };
  }
}

/**
 * Extract location from report and format it
 */
export function formatExtractedLocation(location: string): { city: string; area?: string } {
  if (!location || location.toLowerCase() === 'unknown') {
    return { city: 'Unknown Location' };
  }

  // Split by comma if multiple locations mentioned
  const parts = location.split(',').map(p => p.trim());
  return {
    city: parts[0] || 'Unknown',
    area: parts[1]
  };
}

/**
 * Format extracted time for display
 */
export function formatExtractedTime(time: string): string {
  if (!time || time.toLowerCase() === 'unknown') {
    return 'Time Unknown';
  }
  return time;
}

/**
 * Get color for crime type for UI display
 */
export function getCrimeTypeColor(crimeType: string): string {
  const colorMap: { [key: string]: string } = {
    'Armed Robbery': '#FF4444',
    'Murder': '#8B0000',
    'Rape': '#FF1493',
    'Assault': '#FF6347',
    'Arson': '#FF8C00',
    'Burglary': '#DC143C',
    'Kidnap': '#8B008B',
    'Theft': '#FFB400',
    'Fraud': '#4169E1',
    'Cybercrime': '#1E90FF',
    'Vandalism': '#FFD700',
    'Traffic Offense': '#32CD32'
  };
  
  return colorMap[crimeType] || '#FFD700'; // Default to gold
}

/**
 * Get icon name for crime type (ionicons compatible)
 */
export function getCrimeTypeIcon(crimeType: string): string {
  const iconMap: { [key: string]: string } = {
    'Armed Robbery': 'alert-circle',
    'Murder': 'warning',
    'Rape': 'alert-circle',
    'Assault': 'alert-circle',
    'Arson': 'flame',
    'Burglary': 'lock-open',
    'Kidnap': 'alert-circle',
    'Theft': 'bag-remove',
    'Fraud': 'shield-alert',
    'Cybercrime': 'shield-alert',
    'Vandalism': 'hammer',
    'Traffic Offense': 'car'
  };
  
  return iconMap[crimeType] || 'alert-circle'; // Default to alert
}
