const fs = require('fs');

// Read and parse CSV
const csv = fs.readFileSync('assets/mumbai_crime_data.csv', 'utf8');
const lines = csv.split('\n').filter(line => line.trim());
const headers = lines[0].split(',');

console.log('Processing', lines.length - 1, 'crime records...');

const crimes = lines.slice(1, 501).map(line => {
  const values = [];
  let currentValue = '';
  let inQuotes = false;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue.trim());

  const cleanValues = values.map(val => val.replace(/^"|"$/g, ''));

  return {
    incident_id: cleanValues[0] || '',
    location: cleanValues[1] || '',
    sub_location: cleanValues[2] || '',
    datetime_occurred: cleanValues[3] || '',
    hour: parseInt(cleanValues[4] || '0'),
    part_of_day: cleanValues[5] || '',
    crime_type: cleanValues[6] || '',
    description: cleanValues[7] || '',
    is_user_report: cleanValues[8]?.toLowerCase() === 'true',
    Risk_Label: cleanValues[9] || ''
  };
}).filter(crime => crime.incident_id);

console.log('Parsed', crimes.length, 'valid crime records');

// Add coordinates
const MUMBAI_LOCATIONS = {
  'Marine Drive': { latitude: 18.9433, longitude: 72.8232 },
  'Powai': { latitude: 19.1197, longitude: 72.9051 },
  'Thane': { latitude: 19.2183, longitude: 72.9781 },
  'Colaba': { latitude: 18.9067, longitude: 72.8147 },
  'Juhu': { latitude: 19.1075, longitude: 72.8263 },
  'Worli': { latitude: 19.0167, longitude: 72.8167 },
  'Bandra': { latitude: 19.0544, longitude: 72.8406 },
  'Chembur': { latitude: 19.0622, longitude: 72.9028 },
  'Andheri': { latitude: 19.1197, longitude: 72.8464 },
  'Goregaon': { latitude: 19.1646, longitude: 72.8493 },
  'Malad': { latitude: 19.1864, longitude: 72.8484 },
  'Kandivali': { latitude: 19.2041, longitude: 72.8354 },
  'Borivali': { latitude: 19.2294, longitude: 72.8573 },
  'Dahisar': { latitude: 19.2494, longitude: 72.8591 },
  'Ghatkopar': { latitude: 19.0865, longitude: 72.9093 },
  'Vikhroli': { latitude: 19.1111, longitude: 72.9278 },
  'Mulund': { latitude: 19.1718, longitude: 72.9557 },
  'Bhandup': { latitude: 19.1439, longitude: 72.9486 },
  'Nahur': { latitude: 19.1579, longitude: 72.9449 },
  'Airoli': { latitude: 19.1505, longitude: 72.9963 },
  'Ghansoli': { latitude: 19.1197, longitude: 73.0078 },
  'Kopar Khairane': { latitude: 19.1091, longitude: 73.0067 },
  'Vashi': { latitude: 19.0771, longitude: 73.0822 },
  'Sanpada': { latitude: 19.0649, longitude: 73.0097 },
  'Juinagar': { latitude: 19.0544, longitude: 73.0197 },
  'Nerul': { latitude: 19.0333, longitude: 73.0167 },
  'CBD Belapur': { latitude: 19.0178, longitude: 73.0400 },
  'Kharghar': { latitude: 19.0367, longitude: 73.0667 },
  'Kamothe': { latitude: 19.0167, longitude: 73.1000 },
  'Panvel': { latitude: 18.9894, longitude: 73.1175 },
  'Uran': { latitude: 18.8894, longitude: 72.9394 },
  'Pen': { latitude: 18.7294, longitude: 73.0967 },
  'Alibag': { latitude: 18.6414, longitude: 72.8722 },
  'Murud': { latitude: 18.3283, longitude: 72.9622 },
  'Mahad': { latitude: 18.0833, longitude: 73.4167 },
  'Mumbai': { latitude: 19.0760, longitude: 72.8777 }
};

let coordsAdded = 0;
crimes.forEach(crime => {
  const coords = MUMBAI_LOCATIONS[crime.location];
  if (coords) {
    crime.latitude = coords.latitude + (Math.random() - 0.5) * 0.01;
    crime.longitude = coords.longitude + (Math.random() - 0.5) * 0.01;
    coordsAdded++;
  }
});

console.log('Added coordinates to', coordsAdded, 'crimes');

// Generate the output file
const output = 'export const crimeData: CrimeData[] = ' + JSON.stringify(crimes, null, 2) + ';\n\n' +
  'export interface CrimeData {\n' +
  '  incident_id: string;\n' +
  '  location: string;\n' +
  '  sub_location: string;\n' +
  '  datetime_occurred: string;\n' +
  '  hour: number;\n' +
  '  part_of_day: string;\n' +
  '  crime_type: string;\n' +
  '  description: string;\n' +
  '  is_user_report: boolean;\n' +
  '  Risk_Label: string;\n' +
  '  latitude?: number;\n' +
  '  longitude?: number;\n' +
  '}\n';

fs.writeFileSync('src/services/crimeData.ts', output);
console.log('Generated src/services/crimeData.ts with', crimes.length, 'crimes');