const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- MULTER MULTI-FILE UPLOAD CONFIGURATION (PHOTOS & VIDEOS) ---
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit for video upload support
});

// --- SQLITE DATABASE SETUP WITH AUTOMATIC MIGRATION ---
const dbFile = path.join(__dirname, 'warehouse.db');
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) console.error('Database error:', err.message);
  else console.log('Connected to SQLite database (warehouse.db)');
});

db.serialize(() => {
  // Users Table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullName TEXT,
    email TEXT UNIQUE,
    username TEXT,
    phone TEXT,
    password TEXT
  )`);

  // Marketplace Listings Table (Warehouse vs Transport)
  db.run(`CREATE TABLE IF NOT EXISTS marketplace_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT DEFAULT 'WAREHOUSE',
    ownerName TEXT,
    location TEXT,
    sqftAvailable INTEGER,
    pricePerSqFt REAL,
    vehicleType TEXT,
    capacityTon REAL,
    contactPhone TEXT,
    description TEXT,
    photoUrl TEXT,
    feePaid INTEGER DEFAULT 300,
    status TEXT DEFAULT 'AVAILABLE',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, () => {
    db.run(`ALTER TABLE marketplace_listings ADD COLUMN type TEXT DEFAULT 'WAREHOUSE'`, () => {});
    db.run(`ALTER TABLE marketplace_listings ADD COLUMN vehicleType TEXT`, () => {});
    db.run(`ALTER TABLE marketplace_listings ADD COLUMN capacityTon REAL`, () => {});
    db.run(`ALTER TABLE marketplace_listings ADD COLUMN description TEXT`, () => {});
    db.run(`ALTER TABLE marketplace_listings ADD COLUMN photoUrl TEXT`, () => {});
    db.run(`ALTER TABLE marketplace_listings ADD COLUMN feePaid INTEGER DEFAULT 300`, () => {});
  });

  // Inventory Items Table
  db.run(`CREATE TABLE IF NOT EXISTS inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE,
    productName TEXT,
    category TEXT,
    quantity INTEGER DEFAULT 0,
    reorderLevel INTEGER DEFAULT 10,
    unitPrice REAL DEFAULT 0.0,
    turnoverRate TEXT DEFAULT 'FAST',
    lastRestocked DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// --- AUTHENTICATION API ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  const { fullName, email, username, phone, password } = req.body;
  if (!email || !password || !fullName) return res.status(400).json({ success: false, message: 'Missing fields' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `INSERT INTO users (fullName, email, username, phone, password) VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [fullName, email, username, phone, hashedPassword], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ success: false, message: 'Email already registered' });
        return res.status(500).json({ success: false, message: err.message });
      }
      res.json({ success: true, userId: this.lastID });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err || !user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    res.json({ success: true, user: { name: user.fullName, email: user.email } });
  });
});

// --- MARKETPLACE API ROUTES (WAREHOUSE RS. 300/= | TRANSPORT RS. 400/=) ---
app.post('/api/marketplace/list', upload.array('mediaFiles', 5), (req, res) => {
  const { listingType, ownerName, location, sqftAvailable, pricePerSqFt, vehicleType, capacityTon, contactPhone, description } = req.body;
  const type = listingType || 'WAREHOUSE';
  
  if (!ownerName || !contactPhone) {
    return res.status(400).json({ success: false, message: 'Please fill in all required fields.' });
  }

  let mediaUrls = [];
  if (req.files && req.files.length > 0) {
    mediaUrls = req.files.map(file => `/uploads/${file.filename}`);
  } else {
    mediaUrls.push('https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80');
  }

  const mediaJson = JSON.stringify(mediaUrls);
  const feePaid = type === 'TRANSPORT' ? 400 : 300;

  const query = `INSERT INTO marketplace_listings (type, ownerName, location, sqftAvailable, pricePerSqFt, vehicleType, capacityTon, contactPhone, description, photoUrl, feePaid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(query, [
    type,
    ownerName,
    location || 'Kurunegala',
    sqftAvailable || 0,
    pricePerSqFt || 0,
    vehicleType || 'Container Truck',
    capacityTon || 0,
    contactPhone,
    description || 'B2B Certified Logistics Asset',
    mediaJson,
    feePaid
  ], function(err) {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ 
      success: true, 
      message: `${type === 'TRANSPORT' ? 'Transport Vehicle' : 'Warehouse'} Ad published successfully! Rs. ${feePaid}/= fee charged.`, 
      listingId: this.lastID 
    });
  });
});

app.get('/api/marketplace/listings', (req, res) => {
  const filterType = req.query.type;
  let query = `SELECT * FROM marketplace_listings WHERE status = 'AVAILABLE'`;
  let params = [];

  if (filterType) {
    query += ` AND type = ?`;
    params.push(filterType);
  }

  query += ` ORDER BY createdAt DESC`;

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, listings: rows });
  });
});

app.delete('/api/marketplace/delete/:id', (req, res) => {
  const listingId = req.params.id;
  db.run(`DELETE FROM marketplace_listings WHERE id = ?`, [listingId], function(err) {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Listing deleted successfully.' });
  });
});

// --- INVENTORY MANAGEMENT API ROUTES ---
app.get('/api/inventory/items', (req, res) => {
  db.all(`SELECT * FROM inventory_items ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    
    const totalItems = rows.length;
    const totalValue = rows.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
    const lowStockCount = rows.filter(item => item.quantity <= item.reorderLevel).length;
    const fastMovingCount = rows.filter(item => item.turnoverRate === 'FAST').length;

    res.json({
      success: true,
      metrics: {
        totalItems,
        totalValue,
        lowStockCount,
        fastMovingCount
      },
      items: rows
    });
  });
});

app.post('/api/inventory/add', (req, res) => {
  const { sku, productName, category, quantity, reorderLevel, unitPrice, turnoverRate } = req.body;

  if (!productName || quantity === undefined) {
    return res.status(400).json({ success: false, message: 'Product Name and Quantity are required.' });
  }

  const generatedSku = sku || 'SKU-' + Math.floor(1000 + Math.random() * 9000);
  const query = `INSERT INTO inventory_items (sku, productName, category, quantity, reorderLevel, unitPrice, turnoverRate) VALUES (?, ?, ?, ?, ?, ?, ?)`;

  db.run(query, [generatedSku, productName, category || 'General', quantity, reorderLevel || 10, unitPrice || 0, turnoverRate || 'FAST'], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(400).json({ success: false, message: 'SKU already exists.' });
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json({ success: true, message: 'Product added successfully!', itemId: this.lastID });
  });
});

app.put('/api/inventory/update/:id', (req, res) => {
  const { id } = req.params;
  const { quantity, reorderLevel, turnoverRate } = req.body;

  db.run(
    `UPDATE inventory_items SET quantity = ?, reorderLevel = ?, turnoverRate = ?, lastRestocked = CURRENT_TIMESTAMP WHERE id = ?`,
    [quantity, reorderLevel, turnoverRate, id],
    function(err) {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json({ success: true, message: 'Inventory record updated.' });
    }
  );
});

app.delete('/api/inventory/delete/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM inventory_items WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Item deleted from inventory.' });
  });
});

// --- INDUSTRIAL FACILITY NODES & TELEMETRY ---
const CITIES = {
  colombo: { name: 'Colombo', region: 'Western Coast Canal Zone', lat: 6.9271, lon: 79.8612, elevation: 4 },
  biyagama: { name: 'Biyagama', region: 'Biyagama EPZ Industrial Belt', lat: 6.9535, lon: 79.9922, elevation: 8 },
  kurunegala: { name: 'Kurunegala', region: 'North Western Flood Zone', lat: 7.4863, lon: 80.3623, elevation: 116 },
  kandy: { name: 'Kandy', region: 'Central Province Mahaweli Basin', lat: 7.2906, lon: 80.6337, elevation: 500 },
  seethawaka: { name: 'Seethawaka', region: 'Seethawaka High-Rain Zone', lat: 6.9560, lon: 80.1980, elevation: 18 }
};

function getWindDirection(deg) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return `${directions[Math.round(deg / 45) % 8]} Monsoon Direction`;
}

function evaluateDisaster(weatherCondition, currentRain, humidity, windSpeed, elevation, cityName) {
  let disaster = { hasDisaster: false, name: "", title: "", msg: "", stat: "" };
  const cond = weatherCondition.toLowerCase();
  const safeZone = cityName.toLowerCase() === 'kurunegala' ? 'Matale' : 'Kurunegala';

  if (currentRain > 25 || cond.includes('flood')) {
    disaster = {
      hasDisaster: true,
      name: "FLASH FLOOD",
      title: "FLASH FLOOD WARNING",
      msg: `Severe rainfall (${currentRain}mm/h) at ${cityName}. Water levels risking warehouse floor ingress. Immediate stock relocation to ${safeZone} dry zone recommended.`,
      stat: `Rain: ${currentRain} mm/h`
    };
  } else if (currentRain > 15 && elevation > 100) {
    disaster = {
      hasDisaster: true,
      name: "LANDSLIDE",
      title: "LANDSLIDE RISK ALERT",
      msg: `Slope instability and hill saturation detected around ${cityName} (${elevation}m elevation). Logistics and transport corridors restricted.`,
      stat: `Elevation: ${elevation}m`
    };
  } else if (windSpeed > 65 || cond.includes('squall') || cond.includes('tornado')) {
    disaster = {
      hasDisaster: true,
      name: "SEVERE WIND",
      title: "EXTREME STORM SURGE WARNING",
      msg: `Severe gale winds (${windSpeed} km/h) impacting ${cityName}. Coastal dock operations halted and outdoor container yards at risk.`,
      stat: `Wind: ${windSpeed} km/h`
    };
  }

  return disaster;
}

app.get('/api/user-facilities', async (req, res) => {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  try {
    const results = [];
    for (const [key, node] of Object.entries(CITIES)) {
      let rainMm = 0;
      let windKmH = 10;
      let condition = 'clear';

      if (apiKey && apiKey !== 'your_actual_openweather_api_key_here') {
        try {
          const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${node.lat}&lon=${node.lon}&appid=${apiKey}&units=metric`;
          const response = await fetch(weatherUrl);
          const data = await response.json();
          if (data.main) {
            rainMm = data.rain ? (data.rain['1h'] || data.rain['3h'] || 0) : 0;
            windKmH = data.wind ? Math.round(data.wind.speed * 3.6) : 0;
            condition = data.weather ? data.weather[0].main.toLowerCase() : 'clear';
          }
        } catch (e) {
          console.error(`Telemetry error for ${node.name}:`, e.message);
        }
      }

      let badgeText = "Low Risk";
      let badgeClass = "badge-low";

      if (rainMm > 25 || condition.includes('flood')) {
        badgeText = "Flash Flood Alert";
        badgeClass = "badge-critical";
      } else if (rainMm > 15 && node.elevation > 100) {
        badgeText = "Landslide Alert";
        badgeClass = "badge-critical";
      } else if (windKmH > 65 || condition.includes('squall')) {
        badgeText = "Severe Wind Alert";
        badgeClass = "badge-critical";
      } else if (rainMm >= 5 && rainMm <= 25) {
        badgeText = "Moderate Threat";
        badgeClass = "badge-medium";
      } else {
        badgeText = "Low Risk";
        badgeClass = "badge-low";
      }

      results.push({ key, name: node.name, region: node.region, badgeText, badgeClass });
    }
    res.json({ success: true, facilities: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Telemetry Endpoint with PURE REAL dry zone space calculation
app.get('/api/dashboard-telemetry/:cityKey', async (req, res) => {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const cityKey = req.params.cityKey.toLowerCase();
  const city = CITIES[cityKey] || CITIES.colombo;

  try {
    let currentRain = 2;
    let humidity = 82;
    let temp = 29;
    let windSpeed = 12;
    let windDeg = 225;
    let condition = 'Clear';
    let hourlyForecasts = [];

    if (apiKey && apiKey !== 'your_actual_openweather_api_key_here') {
      const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${city.lat}&lon=${city.lon}&appid=${apiKey}&units=metric`;
      const wRes = await fetch(weatherUrl);
      const wData = await wRes.json();

      const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${city.lat}&lon=${city.lon}&appid=${apiKey}&units=metric`;
      const fRes = await fetch(forecastUrl);
      const fData = await fRes.json();

      if (wData.main && fData.list) {
        currentRain = wData.rain ? (wData.rain['1h'] || wData.rain['3h'] || 0) : 0;
        humidity = wData.main.humidity;
        temp = Math.round(wData.main.temp);
        windSpeed = Math.round(wData.wind.speed * 3.6);
        windDeg = wData.wind.deg || 225;
        condition = wData.weather[0].main;

        const cityTimezoneOffset = fData.city.timezone || 19800;
        const currentUtcTime = Date.now();

        hourlyForecasts = fData.list.map((item) => ({
          dt: item.dt,
          itemTime: item.dt * 1000,
          rain: item.rain ? (item.rain['3h'] || item.rain['1h'] || 0) : 0
        }))
        .filter(item => item.itemTime >= currentUtcTime - 1800000)
        .slice(0, 4)
        .map((item, index) => {
          const localDate = new Date((item.dt + cityTimezoneOffset) * 1000);
          const hours = localDate.getUTCHours();
          const minutes = localDate.getUTCMinutes();
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const formattedHours = hours % 12 === 0 ? 12 : hours % 12;
          const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
          const timeString = `${formattedHours < 10 ? '0' + formattedHours : formattedHours}:${formattedMinutes} ${ampm}`;

          const rainVal = item.rain;
          return {
            time: index === 0 ? 'Now' : timeString,
            rain: `${Math.round(rainVal)}mm`,
            risk: rainVal > 25 ? 'High' : (rainVal > 10 ? 'Mod' : 'Low')
          };
        });
      }
    }

    if (hourlyForecasts.length === 0) {
      hourlyForecasts = [
        { time: 'Now', rain: '2mm', risk: 'Low' },
        { time: '+3 Hrs', rain: '1mm', risk: 'Low' },
        { time: '+6 Hrs', rain: '3mm', risk: 'Low' },
        { time: '+9 Hrs', rain: '2mm', risk: 'Low' }
      ];
    }

    const disaster = evaluateDisaster(condition, currentRain, humidity, windSpeed, city.elevation, city.name);

    db.get(
      `SELECT COALESCE(SUM(sqftAvailable), 0) as realTotalSpace 
       FROM marketplace_listings 
       WHERE status = 'AVAILABLE' AND type = 'WAREHOUSE'
         AND (location LIKE ? OR location LIKE '%Dry Zone%' OR location LIKE '%Matale%' OR location LIKE '%Kurunegala%')`,
      [`%${city.name}%`],
      (err, row) => {
        const realSpace = (row && row.realTotalSpace) ? row.realTotalSpace : 0;

        res.json({
          success: true,
          cityName: city.name,
          disaster: disaster,
          currentRain: Math.round(currentRain),
          rainDesc: `${condition.toUpperCase()} & ${humidity}% HUMIDITY`,
          hourly: hourlyForecasts,
          humidity: `${humidity}%`,
          humidityStatus: humidity > 88 ? 'Dampness Alert' : 'Optimal Humidity',
          temperature: `${temp}°C`,
          tempStatus: temp > 28 ? 'Thermal Alert' : 'Optimal Storage',
          windSpeed: windSpeed,
          windDirection: getWindDirection(windDeg),
          dryZoneSpace: realSpace
        });
      }
    );

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`WAREHOUSE.LK Telemetry Engine running at http://localhost:${PORT}`);
});
