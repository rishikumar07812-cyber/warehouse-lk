const dashboardTranslations = {
  en: {
    forecastTitle: "48-HOUR WEATHER CLIMATE FORECAST",
    live: "Live",
    relocateBtn: "Find safe Warehouse Space (Relocate Stock)",
    lblHumidity: "Indoor Humidity",
    lblTemperature: "Temperature",
    lblWind: "Wind Speed",
    lblDryZone: "Dry Zone Space",
    statusDryZone: "Sq.Ft Free (+ Sell Space)",
    navHome: "Home",
    navMarket: "Market Place",
    navStock: "Stock",
    navSetting: "Setting",
    lowRisk: "Low Risk",
    mediumRisk: "Medium Risk",
    highRisk: "High Risk",
    now: "Now"
  },
  si: {
    forecastTitle: "පැය 48 කාලගුණ අනාවැකිය",
    live: "සජීවී",
    relocateBtn: "ආරක්ෂිත ගබඩා ඉඩ සොයාගන්න (තොග ගෙනියන්න)",
    lblHumidity: "අභ්‍යන්තර ආර්ද්‍රතාවය",
    lblTemperature: "උෂ්ණත්වය",
    lblWind: "සුළඟේ වේගය",
    lblDryZone: "වියළි කලාපීය ඉඩ",
    statusDryZone: "වර්ග අඩි හිස්ව ඇත (+ විකුණන්න)",
    navHome: "මුල් පිටුව",
    navMarket: "වෙළඳපොළ",
    navStock: "තොග",
    navSetting: "සැකසුම්",
    lowRisk: "අඩු අවදානම",
    mediumRisk: "මධ්‍යම අවදානම",
    highRisk: "ඉහළ අවදානම",
    now: "දැන්"
  },
  ta: {
    forecastTitle: "48-மணிநேர வானிலை முன்னறிவிப்பு",
    live: "நேரலை",
    relocateBtn: "பாதுகாப்பான கிடங்கு இடத்தை உருவாக்கவும்",
    lblHumidity: "உட்புற ஈரப்பதம்",
    lblTemperature: "வெப்பநிலை",
    lblWind: "காற்றின் வேகம்",
    lblDryZone: "உலர்ந்த பகுதி இடம்",
    statusDryZone: "சதுர அடி காலியாக உள்ளது",
    navHome: "முகப்பு",
    navMarket: "சந்தை",
    navStock: "பங்கு",
    navSetting: "அமைப்புகள்",
    lowRisk: "குறைந்த ஆபத்து",
    mediumRisk: "நடுத்தர ஆபத்து",
    highRisk: "அதிக ஆபத்து",
    now: "இப்போது"
  }
};

function getGlobalLang() {
  return localStorage.getItem('warehouse_lang') || 'en';
}

function setGlobalLang(lang) {
  localStorage.setItem('warehouse_lang', lang);
}