// Backend API Configuration
// Use your machine's local IP address for Expo to reach backend from device/simulator

export const BACKEND_API_URL = 'http://192.168.29.169:8080';
// Alternative: Use 'http://localhost:8080' only if testing on the same machine in web browser

export const AUTO_VERIFY_REPORT_ENDPOINT = `${BACKEND_API_URL}/auto-verify-report`;
export const CRIME_PREDICTION_ENDPOINT = `${BACKEND_API_URL}/predict-crime-type`;
export const PROCESS_NEW_REPORT_ENDPOINT = `${BACKEND_API_URL}/process-new-report`;
