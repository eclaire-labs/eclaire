// Timezone data using standard IANA timezone identifiers
export const TIMEZONES = [
  // Americas
  {
    value: "America/New_York",
    label: "Eastern Time (New York) - GMT-5/-4",
    offset: "UTC-5/-4",
  },
  {
    value: "America/Chicago",
    label: "Central Time (Chicago) - GMT-6/-5",
    offset: "UTC-6/-5",
  },
  {
    value: "America/Denver",
    label: "Mountain Time (Denver) - GMT-7/-6",
    offset: "UTC-7/-6",
  },
  {
    value: "America/Los_Angeles",
    label: "Pacific Time (Los Angeles) - GMT-8/-7",
    offset: "UTC-8/-7",
  },
  {
    value: "America/Anchorage",
    label: "Alaska Time (Anchorage) - GMT-9/-8",
    offset: "UTC-9/-8",
  },
  {
    value: "Pacific/Honolulu",
    label: "Hawaii Time (Honolulu) - GMT-10",
    offset: "UTC-10",
  },
  {
    value: "America/Toronto",
    label: "Eastern Time (Toronto) - GMT-5/-4",
    offset: "UTC-5/-4",
  },
  {
    value: "America/Vancouver",
    label: "Pacific Time (Vancouver) - GMT-8/-7",
    offset: "UTC-8/-7",
  },
  {
    value: "America/Mexico_City",
    label: "Central Time (Mexico City) - GMT-6/-5",
    offset: "UTC-6/-5",
  },
  {
    value: "America/Sao_Paulo",
    label: "Brasília Time (São Paulo) - GMT-3",
    offset: "UTC-3",
  },
  {
    value: "America/Buenos_Aires",
    label: "Argentina Time (Buenos Aires) - GMT-3",
    offset: "UTC-3",
  },
  {
    value: "America/Santiago",
    label: "Chile Time (Santiago) - GMT-4/-3",
    offset: "UTC-4/-3",
  },

  // Europe
  {
    value: "Europe/London",
    label: "Greenwich Mean Time (London) - GMT+0/+1",
    offset: "UTC+0/+1",
  },
  {
    value: "Europe/Paris",
    label: "Central European Time (Paris) - GMT+1/+2",
    offset: "UTC+1/+2",
  },
  {
    value: "Europe/Berlin",
    label: "Central European Time (Berlin) - GMT+1/+2",
    offset: "UTC+1/+2",
  },
  {
    value: "Europe/Rome",
    label: "Central European Time (Rome) - GMT+1/+2",
    offset: "UTC+1/+2",
  },
  {
    value: "Europe/Madrid",
    label: "Central European Time (Madrid) - GMT+1/+2",
    offset: "UTC+1/+2",
  },
  {
    value: "Europe/Amsterdam",
    label: "Central European Time (Amsterdam) - GMT+1/+2",
    offset: "UTC+1/+2",
  },
  {
    value: "Europe/Stockholm",
    label: "Central European Time (Stockholm) - GMT+1/+2",
    offset: "UTC+1/+2",
  },
  {
    value: "Europe/Zurich",
    label: "Central European Time (Zurich) - GMT+1/+2",
    offset: "UTC+1/+2",
  },
  {
    value: "Europe/Vienna",
    label: "Central European Time (Vienna) - GMT+1/+2",
    offset: "UTC+1/+2",
  },
  {
    value: "Europe/Helsinki",
    label: "Eastern European Time (Helsinki) - GMT+2/+3",
    offset: "UTC+2/+3",
  },
  {
    value: "Europe/Athens",
    label: "Eastern European Time (Athens) - GMT+2/+3",
    offset: "UTC+2/+3",
  },
  {
    value: "Europe/Moscow",
    label: "Moscow Time (Moscow) - GMT+3",
    offset: "UTC+3",
  },
  {
    value: "Europe/Istanbul",
    label: "Turkey Time (Istanbul) - GMT+3",
    offset: "UTC+3",
  },

  // Asia & Middle East
  {
    value: "Asia/Dubai",
    label: "Gulf Standard Time (Dubai) - GMT+4",
    offset: "UTC+4",
  },
  {
    value: "Asia/Tehran",
    label: "Iran Standard Time (Tehran) - GMT+3:30/+4:30",
    offset: "UTC+3:30/+4:30",
  },
  {
    value: "Asia/Karachi",
    label: "Pakistan Standard Time (Karachi) - GMT+5",
    offset: "UTC+5",
  },
  {
    value: "Asia/Kolkata",
    label: "India Standard Time (Mumbai) - GMT+5:30",
    offset: "UTC+5:30",
  },
  {
    value: "Asia/Dhaka",
    label: "Bangladesh Standard Time (Dhaka) - GMT+6",
    offset: "UTC+6",
  },
  {
    value: "Asia/Bangkok",
    label: "Indochina Time (Bangkok) - GMT+7",
    offset: "UTC+7",
  },
  {
    value: "Asia/Ho_Chi_Minh",
    label: "Indochina Time (Ho Chi Minh City) - GMT+7",
    offset: "UTC+7",
  },
  {
    value: "Asia/Jakarta",
    label: "Western Indonesia Time (Jakarta) - GMT+7",
    offset: "UTC+7",
  },
  {
    value: "Asia/Singapore",
    label: "Singapore Standard Time - GMT+8",
    offset: "UTC+8",
  },
  { value: "Asia/Hong_Kong", label: "Hong Kong Time - GMT+8", offset: "UTC+8" },
  {
    value: "Asia/Shanghai",
    label: "China Standard Time (Shanghai) - GMT+8",
    offset: "UTC+8",
  },
  {
    value: "Asia/Beijing",
    label: "China Standard Time (Beijing) - GMT+8",
    offset: "UTC+8",
  },
  {
    value: "Asia/Taipei",
    label: "China Standard Time (Taipei) - GMT+8",
    offset: "UTC+8",
  },
  {
    value: "Asia/Manila",
    label: "Philippine Time (Manila) - GMT+8",
    offset: "UTC+8",
  },
  {
    value: "Asia/Kuala_Lumpur",
    label: "Malaysia Time (Kuala Lumpur) - GMT+8",
    offset: "UTC+8",
  },
  {
    value: "Asia/Tokyo",
    label: "Japan Standard Time (Tokyo) - GMT+9",
    offset: "UTC+9",
  },
  {
    value: "Asia/Seoul",
    label: "Korea Standard Time (Seoul) - GMT+9",
    offset: "UTC+9",
  },

  // Australia & Oceania
  {
    value: "Australia/Sydney",
    label: "Australian Eastern Time (Sydney) - GMT+10/+11",
    offset: "UTC+10/+11",
  },
  {
    value: "Australia/Melbourne",
    label: "Australian Eastern Time (Melbourne) - GMT+10/+11",
    offset: "UTC+10/+11",
  },
  {
    value: "Australia/Brisbane",
    label: "Australian Eastern Time (Brisbane) - GMT+10",
    offset: "UTC+10",
  },
  {
    value: "Australia/Perth",
    label: "Australian Western Time (Perth) - GMT+8",
    offset: "UTC+8",
  },
  {
    value: "Australia/Adelaide",
    label: "Australian Central Time (Adelaide) - GMT+9:30/+10:30",
    offset: "UTC+9:30/+10:30",
  },
  {
    value: "Pacific/Auckland",
    label: "New Zealand Time (Auckland) - GMT+12/+13",
    offset: "UTC+12/+13",
  },

  // Africa
  {
    value: "Africa/Cairo",
    label: "Eastern European Time (Cairo) - GMT+2",
    offset: "UTC+2",
  },
  {
    value: "Africa/Johannesburg",
    label: "South Africa Standard Time - GMT+2",
    offset: "UTC+2",
  },
  {
    value: "Africa/Lagos",
    label: "West Africa Time (Lagos) - GMT+1",
    offset: "UTC+1",
  },
  {
    value: "Africa/Nairobi",
    label: "East Africa Time (Nairobi) - GMT+3",
    offset: "UTC+3",
  },
].sort((a, b) => a.label.localeCompare(b.label));

// Country data with common countries
export const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "IT", label: "Italy" },
  { value: "ES", label: "Spain" },
  { value: "NL", label: "Netherlands" },
  { value: "SE", label: "Sweden" },
  { value: "NO", label: "Norway" },
  { value: "DK", label: "Denmark" },
  { value: "FI", label: "Finland" },
  { value: "CH", label: "Switzerland" },
  { value: "AT", label: "Austria" },
  { value: "BE", label: "Belgium" },
  { value: "IE", label: "Ireland" },
  { value: "PT", label: "Portugal" },
  { value: "GR", label: "Greece" },
  { value: "PL", label: "Poland" },
  { value: "CZ", label: "Czech Republic" },
  { value: "HU", label: "Hungary" },
  { value: "RO", label: "Romania" },
  { value: "BG", label: "Bulgaria" },
  { value: "HR", label: "Croatia" },
  { value: "SI", label: "Slovenia" },
  { value: "SK", label: "Slovakia" },
  { value: "EE", label: "Estonia" },
  { value: "LV", label: "Latvia" },
  { value: "LT", label: "Lithuania" },
  { value: "RU", label: "Russia" },
  { value: "UA", label: "Ukraine" },
  { value: "BY", label: "Belarus" },
  { value: "MD", label: "Moldova" },
  { value: "JP", label: "Japan" },
  { value: "KR", label: "South Korea" },
  { value: "CN", label: "China" },
  { value: "IN", label: "India" },
  { value: "SG", label: "Singapore" },
  { value: "HK", label: "Hong Kong" },
  { value: "TW", label: "Taiwan" },
  { value: "TH", label: "Thailand" },
  { value: "VN", label: "Vietnam" },
  { value: "MY", label: "Malaysia" },
  { value: "ID", label: "Indonesia" },
  { value: "PH", label: "Philippines" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "SA", label: "Saudi Arabia" },
  { value: "IL", label: "Israel" },
  { value: "TR", label: "Turkey" },
  { value: "EG", label: "Egypt" },
  { value: "ZA", label: "South Africa" },
  { value: "NG", label: "Nigeria" },
  { value: "KE", label: "Kenya" },
  { value: "BR", label: "Brazil" },
  { value: "AR", label: "Argentina" },
  { value: "MX", label: "Mexico" },
  { value: "CL", label: "Chile" },
  { value: "CO", label: "Colombia" },
  { value: "PE", label: "Peru" },
  { value: "NZ", label: "New Zealand" },
].sort((a, b) => a.label.localeCompare(b.label));

// Major cities worldwide
export const CITIES = [
  // North America
  { value: "New York", label: "New York", country: "US" },
  { value: "Los Angeles", label: "Los Angeles", country: "US" },
  { value: "Chicago", label: "Chicago", country: "US" },
  { value: "Houston", label: "Houston", country: "US" },
  { value: "San Francisco", label: "San Francisco", country: "US" },
  { value: "Seattle", label: "Seattle", country: "US" },
  { value: "Boston", label: "Boston", country: "US" },
  { value: "Miami", label: "Miami", country: "US" },
  { value: "Atlanta", label: "Atlanta", country: "US" },
  { value: "Denver", label: "Denver", country: "US" },
  { value: "Toronto", label: "Toronto", country: "CA" },
  { value: "Vancouver", label: "Vancouver", country: "CA" },
  { value: "Montreal", label: "Montreal", country: "CA" },
  { value: "Calgary", label: "Calgary", country: "CA" },

  // Europe
  { value: "London", label: "London", country: "GB" },
  { value: "Manchester", label: "Manchester", country: "GB" },
  { value: "Edinburgh", label: "Edinburgh", country: "GB" },
  { value: "Paris", label: "Paris", country: "FR" },
  { value: "Lyon", label: "Lyon", country: "FR" },
  { value: "Marseille", label: "Marseille", country: "FR" },
  { value: "Berlin", label: "Berlin", country: "DE" },
  { value: "Munich", label: "Munich", country: "DE" },
  { value: "Hamburg", label: "Hamburg", country: "DE" },
  { value: "Rome", label: "Rome", country: "IT" },
  { value: "Milan", label: "Milan", country: "IT" },
  { value: "Naples", label: "Naples", country: "IT" },
  { value: "Madrid", label: "Madrid", country: "ES" },
  { value: "Barcelona", label: "Barcelona", country: "ES" },
  { value: "Amsterdam", label: "Amsterdam", country: "NL" },
  { value: "Stockholm", label: "Stockholm", country: "SE" },
  { value: "Copenhagen", label: "Copenhagen", country: "DK" },
  { value: "Oslo", label: "Oslo", country: "NO" },
  { value: "Helsinki", label: "Helsinki", country: "FI" },
  { value: "Zurich", label: "Zurich", country: "CH" },
  { value: "Vienna", label: "Vienna", country: "AT" },
  { value: "Brussels", label: "Brussels", country: "BE" },
  { value: "Dublin", label: "Dublin", country: "IE" },
  { value: "Lisbon", label: "Lisbon", country: "PT" },
  { value: "Athens", label: "Athens", country: "GR" },
  { value: "Warsaw", label: "Warsaw", country: "PL" },
  { value: "Prague", label: "Prague", country: "CZ" },
  { value: "Budapest", label: "Budapest", country: "HU" },
  { value: "Moscow", label: "Moscow", country: "RU" },

  // Asia
  { value: "Tokyo", label: "Tokyo", country: "JP" },
  { value: "Osaka", label: "Osaka", country: "JP" },
  { value: "Seoul", label: "Seoul", country: "KR" },
  { value: "Shanghai", label: "Shanghai", country: "CN" },
  { value: "Beijing", label: "Beijing", country: "CN" },
  { value: "Shenzhen", label: "Shenzhen", country: "CN" },
  { value: "Mumbai", label: "Mumbai", country: "IN" },
  { value: "Delhi", label: "Delhi", country: "IN" },
  { value: "Bangalore", label: "Bangalore", country: "IN" },
  { value: "Singapore", label: "Singapore", country: "SG" },
  { value: "Hong Kong", label: "Hong Kong", country: "HK" },
  { value: "Bangkok", label: "Bangkok", country: "TH" },
  { value: "Ho Chi Minh City", label: "Ho Chi Minh City", country: "VN" },
  { value: "Kuala Lumpur", label: "Kuala Lumpur", country: "MY" },
  { value: "Jakarta", label: "Jakarta", country: "ID" },
  { value: "Manila", label: "Manila", country: "PH" },
  { value: "Dubai", label: "Dubai", country: "AE" },
  { value: "Tel Aviv", label: "Tel Aviv", country: "IL" },
  { value: "Istanbul", label: "Istanbul", country: "TR" },

  // Australia & Oceania
  { value: "Sydney", label: "Sydney", country: "AU" },
  { value: "Melbourne", label: "Melbourne", country: "AU" },
  { value: "Brisbane", label: "Brisbane", country: "AU" },
  { value: "Perth", label: "Perth", country: "AU" },
  { value: "Auckland", label: "Auckland", country: "NZ" },

  // South America
  { value: "São Paulo", label: "São Paulo", country: "BR" },
  { value: "Rio de Janeiro", label: "Rio de Janeiro", country: "BR" },
  { value: "Buenos Aires", label: "Buenos Aires", country: "AR" },
  { value: "Santiago", label: "Santiago", country: "CL" },
  { value: "Bogotá", label: "Bogotá", country: "CO" },
  { value: "Lima", label: "Lima", country: "PE" },
  { value: "Mexico City", label: "Mexico City", country: "MX" },

  // Africa
  { value: "Cape Town", label: "Cape Town", country: "ZA" },
  { value: "Johannesburg", label: "Johannesburg", country: "ZA" },
  { value: "Lagos", label: "Lagos", country: "NG" },
  { value: "Nairobi", label: "Nairobi", country: "KE" },
  { value: "Cairo", label: "Cairo", country: "EG" },
].sort((a, b) => a.label.localeCompare(b.label));

// Helper function to get user's timezone
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York"; // fallback
  }
}

// Helper function to filter cities by country (kept for potential future use)
export function getCitiesByCountry(countryCode: string) {
  return CITIES.filter((city) => city.country === countryCode);
}
