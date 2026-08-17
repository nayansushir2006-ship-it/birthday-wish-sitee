const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Request logging middleware for debugging
app.use((req, res, next) => {
    console.log(`[API Log] ${req.method} ${req.url}`, req.body || '');
    next();
});

// Ensure local folders exist
const uploadsDir = path.join(__dirname, 'uploads');
try {
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
} catch (e) {
    console.warn("Could not create uploads directory locally (expected on Serverless hosts):", e.message);
}

// Database initialization
const dbPath = fs.existsSync(path.join(__dirname, 'db.json'))
    ? path.join(__dirname, 'db.json')
    : path.join(process.cwd(), 'db.json');
let db = null;

const defaultDb = {
    adminPassword: 'admin123',
    cloudinary: null, // { cloudName, apiKey, apiSecret }
    users: [
        {
            id: 'usr-1',
            name: 'Sanav Bhosale',
            username: 'sanav',
            password: '123',
            birthdate: '2003-05-12',
            wishMessage: 'लाडक्या सानवला वाढदिवसाच्या अनंत शुभेच्छा! 🎂✨\n\nतुझे आयुष्य फुलांसारखे सुगंधी आणि ताऱ्यांसारखे चमकत राहो. तुझ्या सर्व इच्छा-आकांक्षा पूर्ण होऊ देत आणि तुला निरोगी आयुष्य लाभो, हीच देवाकडे प्रार्थना!\n\nसदा हसत राहा! 😊👑❤️',
            theme: 'pink-princess',
            musicTrackId: 'track-1',
            gallery: [
                { type: 'image', url: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800&auto=format&fit=crop&q=80', caption: 'वाढदिवस सेलिब्रेशन 🎉' },
                { type: 'image', url: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&auto=format&fit=crop&q=80', caption: 'रंगबेरंगी आठवणी ✨' },
                { type: 'image', url: 'https://images.unsplash.com/photo-1504196606672-aef5c9cefc92?w=800&auto=format&fit=crop&q=80', caption: 'आनंदाचा प्रत्येक क्षण 💖' },
                { type: 'image', url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&auto=format&fit=crop&q=80', caption: 'नेहमी हसत राहा 😊' }
            ]
        },
        {
            id: 'usr-2',
            name: 'Karan Patil',
            username: 'karan',
            password: '123',
            birthdate: '2000-07-08',
            wishMessage: 'Happy Birthday Karan! 🎂🎉\n\nWishing you a magnificent day filled with joy, laughter, and high energy. May this year unlock brand new opportunities and huge successes for you.\n\nKeep shining and rock on! 🎸🌟',
            theme: 'royal-gold',
            musicTrackId: 'track-2',
            gallery: [
                { type: 'image', url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&auto=format&fit=crop&q=80', caption: 'Retro Party Vibes! 🕶️' },
                { type: 'image', url: 'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=800&auto=format&fit=crop&q=80', caption: 'Moments of Happiness 💫' },
                { type: 'image', url: 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=800&auto=format&fit=crop&q=80', caption: 'Dream Big!' }
            ]
        }
    ],
    tracks: [
        { id: 'track-1', title: 'Romantic Piano Theme', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
        { id: 'track-2', title: 'Upbeat Acoustic Vibe', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
        { id: 'track-3', title: 'Party Electronic Beats', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
        { id: 'track-4', title: 'Sweet Acoustic Guitar', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' }
    ],
    logs: [
        { id: 'log-1', username: 'sanav', action: 'Logged in to dashboard', timestamp: '2026-07-07T14:15:32.000Z' }
    ],
    thanks: [
        { id: 'th-1', username: 'sanav', message: 'मस्त सरप्राईज आहे! खूप मनापासून आवडले! ❤️😊', timestamp: '2026-07-07T14:20:10.000Z' }
    ]
};

function readDb() {
    if (fs.existsSync(dbPath)) {
        try {
            const data = fs.readFileSync(dbPath, 'utf8');
            db = JSON.parse(data);
        } catch (e) {
            console.error("Error reading db.json. Using memory default.", e);
            db = { ...defaultDb };
        }
    } else {
        db = { ...defaultDb };
        writeDb();
    }
}

function writeDb() {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error("Error writing db.json:", e);
    }
}

// Initial Database Read
readDb();

// Configure Cloudinary Helper
function configureCloudinary() {
    if (db.cloudinary && db.cloudinary.cloudName && db.cloudinary.apiKey && db.cloudinary.apiSecret) {
        cloudinary.config({
            cloud_name: db.cloudinary.cloudName,
            api_key: db.cloudinary.apiKey,
            api_secret: db.cloudinary.apiSecret
        });
        console.log("Cloudinary API Configured!");
        return true;
    }
    console.log("Cloudinary not configured. Running in Local Uploads mode.");
    return false;
}
configureCloudinary();

// Configure Multer for File Uploads
const storageConfig = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const upload = multer({ storage: storageConfig });

// Serve static frontend assets
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(uploadsDir));

// ==========================================================================
// REST API ENDPOINTS
// ==========================================================================

// Get database state
app.get('/api/db', (req, res) => {
    readDb();
    // Return database without exposing Cloudinary API Secret to the frontend
    const sanitizedDb = { ...db };
    if (sanitizedDb.cloudinary) {
        sanitizedDb.cloudinary = {
            cloudName: db.cloudinary.cloudName,
            apiKey: db.cloudinary.apiKey,
            apiSecret: '••••••••••••••••' // mask the secret
        };
    }
    res.json(sanitizedDb);
});

// Update Cloudinary config
app.post('/api/cloudinary', (req, res) => {
    const { cloudName, apiKey, apiSecret } = req.body;
    if (!cloudName || !apiKey || !apiSecret) {
        return res.status(400).json({ error: "Missing config fields" });
    }

    db.cloudinary = { cloudName, apiKey, apiSecret };
    writeDb();
    const success = configureCloudinary();
    
    res.json({ success, message: "Cloudinary settings saved!" });
});

// Reset Cloudinary config
app.post('/api/cloudinary/disconnect', (req, res) => {
    db.cloudinary = null;
    writeDb();
    res.json({ success: true, message: "Cloudinary disconnected!" });
});

// Handle File Uploads (Local folder vs Cloudinary Cloud)
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    // If Cloudinary is configured, upload it there and delete the local temp file
    const isCloudinaryActive = db.cloudinary && db.cloudinary.cloudName && db.cloudinary.apiKey && db.cloudinary.apiSecret;
    if (isCloudinaryActive) {
        try {
            console.log(`Uploading file ${req.file.filename} to Cloudinary...`);
            const ext = path.extname(req.file.originalname).toLowerCase();
            const isAudioOrVideo = (req.file.mimetype && (req.file.mimetype.startsWith('audio/') || req.file.mimetype.startsWith('video/'))) ||
                                   ['.m4a', '.mp3', '.wav', '.ogg', '.aac', '.flac', '.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext);
            const resourceType = isAudioOrVideo ? "video" : "auto";

            const result = await cloudinary.uploader.upload(req.file.path, {
                resource_type: resourceType,
                folder: "birthday_wish_assets"
            });
            
            // Delete temp file from uploads directory
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            
            return res.json({
                success: true,
                url: result.secure_url,
                type: req.file.mimetype ? req.file.mimetype.split('/')[0] : (isAudioOrVideo ? 'audio' : 'file')
            });
        } catch (error) {
            console.error("Cloudinary Upload Error:", error);
            // Don't fail completely, fallback to serving the file locally
        }
    }

    // Local file fallback
    console.log(`Saving file ${req.file.filename} to local uploads folder...`);
    const localUrl = `/uploads/${req.file.filename}`;
    res.json({
        success: true,
        url: localUrl,
        type: req.file.mimetype.split('/')[0]
    });
});

// Save or Update User
app.post('/api/users', (req, res) => {
    const user = req.body;
    if (!user.name || !user.username) {
        return res.status(400).json({ error: "Missing user fields" });
    }

    readDb();
    const idx = db.users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
        db.users[idx] = { ...db.users[idx], ...user };
    } else {
        user.id = 'usr-' + Date.now();
        user.theme = user.theme || 'cosmic-dark';
        user.musicTrackId = user.musicTrackId || 'track-1';
        user.gallery = user.gallery || [];
        db.users.push(user);
    }
    writeDb();
    res.json({ success: true, user });
});

// Delete User
app.delete('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    readDb();
    db.users = db.users.filter(u => u.id !== userId);
    writeDb();
    res.json({ success: true });
});

// Add New Track
app.post('/api/tracks', (req, res) => {
    const { title, url } = req.body;
    if (!title || !url) {
        return res.status(400).json({ error: "Missing track title or URL" });
    }

    readDb();
    const newTrack = { id: 'track-' + Date.now(), title, url };
    db.tracks.push(newTrack);
    writeDb();
    res.json({ success: true, track: newTrack });
});

// Log entry
app.post('/api/logs', (req, res) => {
    const log = req.body;
    readDb();
    log.id = 'log-' + Date.now();
    log.timestamp = log.timestamp || new Date().toISOString();
    db.logs.push(log);
    writeDb();
    res.json({ success: true });
});

// Send thank you note
app.post('/api/thanks', (req, res) => {
    const note = req.body;
    readDb();
    note.id = 'th-' + Date.now();
    note.timestamp = note.timestamp || new Date().toISOString();
    db.thanks.push(note);
    writeDb();
    res.json({ success: true });
});

// Reset logs
app.post('/api/clear-logs', (req, res) => {
    readDb();
    db.logs = [];
    db.thanks = [];
    writeDb();
    res.json({ success: true });
});

// Update Admin Password
app.post('/api/admin/password', (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.trim() === '') {
        return res.status(400).json({ error: "Password cannot be empty" });
    }
    readDb();
    db.adminPassword = newPassword.trim();
    writeDb();
    res.json({ success: true, message: "Admin password updated successfully!" });
});

// Catch-all route to serve static index.html or files for single-page app
app.get('*', (req, res) => {
    const requestedPath = path.join(__dirname, req.path);
    if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
        return res.sendFile(requestedPath);
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Export Express App for Vercel Serverless Functions
module.exports = app;

// Start Express Server locally
if (require.main === module || (!process.env.VERCEL && !process.env.NOW_REGION)) {
    app.listen(PORT, () => {
        console.log(`==================================================`);
        console.log(`🎂 Birthday Wish Server running on port ${PORT}`);
        console.log(`🔗 Access it locally at: http://localhost:${PORT}`);
        console.log(`==================================================`);
    });
}
