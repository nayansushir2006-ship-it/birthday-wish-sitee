// ==========================================================================
// DYNAMIC FIREBASE INTEGRATION HELPER (CLIENT-SIDE SERVICE)
// ==========================================================================

class ServerlessFirebaseManager {
    constructor() {
        this.app = null;
        this.db = null;
        this.libs = {};
    }

    async init(config) {
        try {
            // Dynamically import Firebase scripts from CDN
            const firebaseApp = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
            const firebaseFirestore = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            
            this.app = firebaseApp.initializeApp(config);
            this.db = firebaseFirestore.getFirestore(this.app);
            this.libs = firebaseFirestore;
            return true;
        } catch (error) {
            console.error("Firebase SDK failed to load:", error);
            return false;
        }
    }

    async fetchCollection(collectionName) {
        if (!this.db) return [];
        try {
            const ref = this.libs.collection(this.db, collectionName);
            const snapshot = await this.libs.getDocs(ref);
            const list = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() });
            });
            return list;
        } catch (e) {
            console.error(`Error loading collection ${collectionName}:`, e);
            return [];
        }
    }

    async saveDoc(collectionName, docId, data) {
        if (!this.db) return;
        const ref = this.libs.doc(this.libs.collection(this.db, collectionName), docId);
        await this.libs.setDoc(ref, data, { merge: true });
    }

    async deleteDoc(collectionName, docId) {
        if (!this.db) return;
        const ref = this.libs.doc(this.libs.collection(this.db, collectionName), docId);
        await this.libs.deleteDoc(ref);
    }
}

// ==========================================================================
// BIRTHDAYSURPRISE CLIENT APP CONTROLLER
// ==========================================================================

class BirthdayAppController {
    constructor() {
        this.db = null;
        this.currentUser = null;
        this.currentView = 'landing';
        this.audioPlayer = new Audio();
        this.audioPlayer.loop = true;
        this.speechUtterance = null;
        this.selectedThemeOption = 'pink-princess';
        this.activeUserTab = 'tab-wish';
        this.activeAdminTab = 'admin-overview';
        this.activeEditUserId = null;

        // Hybrid Settings
        this.isServerless = false;
        this.firebase = new ServerlessFirebaseManager();

        this.init();
    }

    async init() {
        // 1. Detect environment and fetch database state
        await this.reloadDb();

        // 2. Start background visuals
        this.createParticles();
        this.spawnBalloons();

        // 3. Navigate to Landing
        this.navigateTo('landing');
    }

    // ==========================================================================
    // ENVIRONMENT DETECTION & DATABASE REFRESH
    // ==========================================================================
    async reloadDb() {
        try {
            // Attempt to contact local Node.js server
            const response = await fetch('/api/db');
            if (response.ok) {
                this.db = await response.json();
                this.isServerless = false;
                this.updateEnvironmentUI();
                this.populateUserSelects();
                return;
            }
        } catch (error) {
            // Express API failed or offline. Fallback to Serverless Mode
        }

        // Initialize Serverless Mode (Vercel Host)
        await this.initServerlessMode();
    }

    async initServerlessMode() {
        this.isServerless = true;
        
        // Default Firebase Config of your project (so it works out-of-the-box on Vercel!)
        const defaultFbConfig = {
            apiKey: "AIzaSyCWJ8tz45APW483fOrCrVyde0x0LWX2hVw",
            authDomain: "birthday-wish-s.firebaseapp.com",
            projectId: "birthday-wish-s",
            appId: "1:202245956575:web:93cea742439ee463fc5a6a"
        };

        // Try loading configs from LocalStorage, falling back to our hardcoded defaults
        const fbConfig = JSON.parse(localStorage.getItem('serverless_fb_config')) || defaultFbConfig;
        
        this.updateEnvironmentUI();

        console.log("Firebase initializing connection...");
        const ready = await this.firebase.init(fbConfig);
        if (ready) {
            // Fetch collections from Firestore
            const users = await this.firebase.fetchCollection('users');
            const tracks = await this.firebase.fetchCollection('tracks');
            const logs = await this.firebase.fetchCollection('logs');
            const thanks = await this.firebase.fetchCollection('thanks');
            const settings = await this.firebase.fetchCollection('settings');

            // Retrieve custom admin password if set
            const adminSetting = settings.find(s => s.id === 'admin');
            const savedAdminPassword = adminSetting ? adminSetting.password : 'admin123';

            // Retrieve Cloudinary config if saved in Firestore
            const cloudSetting = settings.find(s => s.id === 'cloudinary');
            const activeCloudinary = cloudSetting ? {
                cloudName: cloudSetting.cloudName,
                uploadPreset: cloudSetting.uploadPreset
            } : (JSON.parse(localStorage.getItem('serverless_cld_config')) || null);

            // Bind fetched documents
            this.db = {
                adminPassword: savedAdminPassword,
                cloudinary: activeCloudinary,
                users: users,
                tracks: tracks.length > 0 ? tracks : this.getDefaultTracks(),
                logs: logs,
                thanks: thanks
            };

            // Seed defaults if Firestore users collection is empty
            if (this.db.users.length === 0) {
                await this.seedDefaultServerlessData();
            }

            console.log("Serverless mode connected successfully!");
            this.populateUserSelects();
            return;
        }

        // Fallback Database in case config is empty (allows viewing Admin Dashboard offline/before config)
        this.db = {
            adminPassword: 'admin123',
            cloudinary: cldConfig || null,
            users: [
                {
                    id: 'usr-demo',
                    name: 'Demo User (Configure Firebase first)',
                    username: 'demo',
                    password: '123',
                    birthdate: '2026-01-01',
                    wishMessage: 'वाढदिवसाच्या शुभेच्छा! डेटा कायमस्वरूपी सेव्ह करण्यासाठी कृपया प्रथम डेटाबेस कॉन्फिगर करा.',
                    theme: 'cosmic-dark',
                    musicTrackId: 'track-1',
                    gallery: []
                }
            ],
            tracks: this.getDefaultTracks(),
            logs: [],
            thanks: []
        };
        this.populateUserSelects();
    }

    getDefaultTracks() {
        return [
            { id: 'track-1', title: 'Romantic Piano Theme', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
            { id: 'track-2', title: 'Upbeat Acoustic Vibe', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
            { id: 'track-3', title: 'Party Electronic Beats', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' }
        ];
    }

    async seedDefaultServerlessData() {
        console.log("Seeding initial demo data into Firestore...");
        const defaultUsers = [
            {
                id: 'usr-1',
                name: 'Sanav Bhosale',
                username: 'sanav',
                password: '123',
                birthdate: '2003-05-12',
                wishMessage: 'लाडक्या सानवला वाढदिवसाच्या अनंत शुभेच्छा! 🎂✨\n\nसदा हसत राहा! 😊👑❤️',
                theme: 'pink-princess',
                musicTrackId: 'track-1',
                gallery: []
            }
        ];
        
        for (const user of defaultUsers) {
            await this.firebase.saveDoc('users', user.id, user);
        }
        
        this.db.users = defaultUsers;
    }

    // ==========================================================================
    // UI ENVIRONMENT MODIFIERS
    // ==========================================================================
    updateEnvironmentUI() {
        const badge = document.getElementById('sys-mode-badge');
        const pulse = document.getElementById('sys-mode-pulse');
        const desc = document.getElementById('sys-mode-desc');
        
        const fbConfigCard = document.getElementById('fb-config-card');
        const cldUnsignedGroup = document.getElementById('cld-unsigned-group');
        const cldSecretGroup = document.getElementById('cld-secret-group');

        if (!badge) return;

        if (this.isServerless) {
            badge.innerText = "Vercel Serverless Mode";
            badge.className = "badge badge-cyan";
            pulse.className = "status-pulse cyan";
            desc.innerText = "प्रोजेक्ट सर्व्हरलेस चालू आहे (उदा. Vercel). डेटा थेट Google Firestore वरून आणला जात आहे.";

            // Show Firebase settings card and Cloudinary unsigned uploads
            if (fbConfigCard) fbConfigCard.classList.remove('hide');
            if (cldUnsignedGroup) cldUnsignedGroup.classList.remove('hide');
            if (cldSecretGroup) cldSecretGroup.classList.add('hide'); // hide API secret

            // Populate Firebase values from localStorage
            const fbConfig = JSON.parse(localStorage.getItem('serverless_fb_config'));
            if (fbConfig) {
                document.getElementById('fb-api-key').value = fbConfig.apiKey || '';
                document.getElementById('fb-auth-domain').value = fbConfig.authDomain || '';
                document.getElementById('fb-project-id').value = fbConfig.projectId || '';
                document.getElementById('fb-app-id').value = fbConfig.appId || '';

                document.getElementById('btn-save-fb').innerText = "Update Config";
                document.getElementById('btn-disconnect-fb').classList.remove('hide');
                document.getElementById('fb-config-help').innerText = "Firebase डेटाबेस चालू आहे!";
            } else {
                document.getElementById('fb-api-key').value = '';
                document.getElementById('fb-auth-domain').value = '';
                document.getElementById('fb-project-id').value = '';
                document.getElementById('fb-app-id').value = '';

                document.getElementById('btn-save-fb').innerText = "Save Database Config";
                document.getElementById('btn-disconnect-fb').classList.add('hide');
                document.getElementById('fb-config-help').innerText = "Vercel वर डेटा कायमस्वरूपी सेव्ह करण्यासाठी तुमचे Firebase तपशील भरा:";
            }

            // Populate Cloudinary settings
            const cldConfig = JSON.parse(localStorage.getItem('serverless_cld_config'));
            if (cldConfig) {
                document.getElementById('cld-cloud-name').value = cldConfig.cloudName || '';
                document.getElementById('cld-preset').value = cldConfig.uploadPreset || '';
            } else {
                document.getElementById('cld-cloud-name').value = '';
                document.getElementById('cld-preset').value = '';
            }
        } else {
            badge.innerText = "Express Server Mode";
            badge.className = "badge badge-green";
            pulse.className = "status-pulse green";
            desc.innerText = "प्रोजेक्ट लोकल Node.js सर्व्हरवर चालत आहे. डेटा 'db.json' आणि फाईल्स 'uploads/' मध्ये सेव्ह होत आहेत.";

            // Hide Firebase card (since server uses db.json) and enable full Cloudinary configuration
            if (fbConfigCard) fbConfigCard.classList.add('hide');
            if (cldUnsignedGroup) cldUnsignedGroup.classList.add('hide');
            if (cldSecretGroup) cldSecretGroup.classList.remove('hide');

            // Populate Cloudinary settings from Express database
            if (this.db && this.db.cloudinary) {
                document.getElementById('cld-cloud-name').value = this.db.cloudinary.cloudName || '';
                document.getElementById('cld-api-key').value = this.db.cloudinary.apiKey || '';
                document.getElementById('cld-api-secret').value = '••••••••••••••••';
            } else {
                document.getElementById('cld-cloud-name').value = '';
                document.getElementById('cld-api-key').value = '';
                document.getElementById('cld-api-secret').value = '';
            }
        }
    }

    // ==========================================================================
    // SAVE CREDENTIAL CONFIGURATIONS
    // ==========================================================================
    async saveCloudinarySettings() {
        const cloudName = document.getElementById('cld-cloud-name').value.trim();

        if (this.isServerless) {
            const uploadPreset = document.getElementById('cld-preset').value.trim();
            if (!cloudName || !uploadPreset) {
                alert("कृपया Cloud Name आणि Upload Preset अचूक भरा!");
                return;
            }
            
            // Save to Firestore so ALL devices can access it!
            if (this.firebase.db) {
                try {
                    await this.firebase.saveDoc('settings', 'cloudinary', { cloudName, uploadPreset });
                    alert("Cloudinary स्टोरेज सेटिंग्ज क्लाउडवर सेव्ह झाल्या! 🚀");
                } catch (e) {
                    console.error("Firestore Cloudinary save error:", e);
                    localStorage.setItem('serverless_cld_config', JSON.stringify({ cloudName, uploadPreset }));
                    alert("Cloudinary स्टोरेज सेटिंग्ज लोकल सेव्ह झाल्या.");
                }
            } else {
                localStorage.setItem('serverless_cld_config', JSON.stringify({ cloudName, uploadPreset }));
                alert("Cloudinary स्टोरेज सेटिंग्ज लोकल सेव्ह झाल्या.");
            }
            await this.reloadDb();
        } else {
            // Express mode
            const apiKey = document.getElementById('cld-api-key').value.trim();
            const apiSecret = document.getElementById('cld-api-secret').value.trim();

            if (!cloudName || !apiKey || !apiSecret) {
                alert("कृपया सर्व रकाने अचूक भरा!");
                return;
            }

            try {
                const response = await fetch('/api/cloudinary', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cloudName, apiKey, apiSecret })
                });
                const result = await response.json();
                if (result.success) {
                    alert("Cloudinary सर्व्हरवर सेव्ह झाले! 🚀");
                    await this.reloadDb();
                }
            } catch (e) {
                console.error(e);
            }
        }
    }

    async saveFirebaseSettings() {
        const apiKey = document.getElementById('fb-api-key').value.trim();
        const authDomain = document.getElementById('fb-auth-domain').value.trim();
        const projectId = document.getElementById('fb-project-id').value.trim();
        const appId = document.getElementById('fb-app-id').value.trim();

        if (!apiKey || !authDomain || !projectId || !appId) {
            alert("कृपया सर्व Firebase रकाने भरा!");
            return;
        }

        const config = { apiKey, authDomain, projectId, appId };
        localStorage.setItem('serverless_fb_config', JSON.stringify(config));
        
        alert("Firebase डेटाबेस जोडला! वेबसाईट आता रीलोड होईल... ⏳");
        window.location.reload();
    }

    disconnectFirebase() {
        if (confirm("तुम्हाला Firebase डेटाबेस डिस्कनेक्ट करायचा आहे का?")) {
            localStorage.removeItem('serverless_fb_config');
            window.location.reload();
        }
    }

    async updateAdminPassword() {
        const newPassword = document.getElementById('admin-new-password').value.trim();
        const confirmPassword = document.getElementById('admin-confirm-password').value.trim();

        if (!newPassword) {
            alert("नवीन पासवर्ड रिकामा ठेवता येणार नाही!");
            return;
        }

        if (newPassword !== confirmPassword) {
            alert("पासवर्ड जुळत नाहीत! कृपया पुन्हा खात्री करा.");
            return;
        }

        try {
            if (this.isServerless) {
                // Serverless Firestore mode
                if (!this.firebase.db) {
                    alert("कृपया प्रथम Firebase डेटाबेस यशस्वीरित्या कनेक्ट करा!");
                    return;
                }
                await this.firebase.saveDoc('settings', 'admin', { password: newPassword });
                this.db.adminPassword = newPassword;
                alert("ॲडमीन पासवर्ड क्लाउडवर यशस्वीरित्या बदलला! 🔑");
            } else {
                // Express Local mode
                const response = await fetch('/api/admin/password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newPassword })
                });
                const result = await response.json();
                if (result.success) {
                    this.db.adminPassword = newPassword;
                    alert("ॲडमीन पासवर्ड यशस्वीरित्या बदलला! 🔑");
                } else {
                    alert("पासवर्ड बदलताना चूक झाली: " + result.error);
                }
            }
            
            // Clear inputs
            document.getElementById('admin-new-password').value = '';
            document.getElementById('admin-confirm-password').value = '';
            
        } catch (e) {
            console.error("Password update error:", e);
            alert("त्रुटी आली! पासवर्ड बदलता आला नाही.");
        }
    }

    // ==========================================================================
    // ROUTING & VIEW SWITCHER
    // ==========================================================================
    navigateTo(viewName) {
        this.currentView = viewName;
        
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        if (viewName === 'landing') {
            this.stopAudio();
            this.pauseSpeech();
            document.body.className = '';
            this.currentUser = null;
        }

        const targetScreen = document.getElementById(`screen-${viewName}`);
        if (targetScreen) {
            targetScreen.classList.add('active');
        }

        if (viewName === 'admin-dashboard') {
            this.renderAdminOverview();
            this.switchAdminTab('admin-overview');
        }
    }

    // ==========================================================================
    // VISUAL BACKGROUND SPARKLES & BALLOONS
    // ==========================================================================
    createParticles() {
        const container = document.getElementById('particle-container');
        if (!container) return;
        container.innerHTML = '';
        
        const count = 25;
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.classList.add('particle');
            
            const size = Math.random() * 80 + 30;
            const left = Math.random() * 100;
            const duration = Math.random() * 10 + 10;
            const delay = Math.random() * 12;
            
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;
            particle.style.left = `${left}%`;
            particle.style.animationDuration = `${duration}s`;
            particle.style.animationDelay = `${delay}s`;
            
            container.appendChild(particle);
        }
    }

    spawnBalloons() {
        const container = document.getElementById('balloons-container');
        if (!container) return;
        container.innerHTML = '';

        const colors = ['#ff4d8d', '#d4af37', '#00f0ff', '#8a2be2', '#ff5722', '#4caf50'];
        const count = 12;

        for (let i = 0; i < count; i++) {
            const balloon = document.createElement('div');
            balloon.classList.add('balloon');
            
            const color = colors[Math.floor(Math.random() * colors.length)];
            const left = Math.random() * 90 + 5;
            const duration = Math.random() * 10 + 12;
            const delay = Math.random() * 15;
            const scale = Math.random() * 0.4 + 0.8;

            balloon.style.backgroundColor = color;
            balloon.style.color = color;
            balloon.style.left = `${left}%`;
            balloon.style.animationDuration = `${duration}s`;
            balloon.style.animationDelay = `${delay}s`;
            balloon.style.transform = `scale(${scale})`;

            const string = document.createElement('div');
            string.classList.add('balloon-string');
            balloon.appendChild(string);

            container.appendChild(balloon);
        }
    }

    // ==========================================================================
    // AUDIO PLAYER & TEXT TO SPEECH (TTS)
    // ==========================================================================
    playAudio(url) {
        if (!url) return;
        try {
            this.audioPlayer.src = url;
            this.audioPlayer.play()
                .then(() => {
                    const disc = document.getElementById('music-vinyl-disc');
                    const wrapper = disc ? disc.parentElement : null;
                    if (wrapper) wrapper.classList.add('playing');
                    this.updateMiniMusicIcon(true);
                })
                .catch(e => {
                    console.log("Autoplay blocked. Awaiting user interaction.", e);
                });
        } catch (e) {
            console.error("Audio error:", e);
        }
    }

    stopAudio() {
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
        const disc = document.getElementById('music-vinyl-disc');
        const wrapper = disc ? disc.parentElement : null;
        if (wrapper) wrapper.classList.remove('playing');
        this.updateMiniMusicIcon(false);
    }

    toggleBackgroundMusic() {
        if (this.audioPlayer.paused) {
            this.audioPlayer.play();
            const disc = document.getElementById('music-vinyl-disc');
            const wrapper = disc ? disc.parentElement : null;
            if (wrapper) wrapper.classList.add('playing');
            this.updateMiniMusicIcon(true);
        } else {
            this.audioPlayer.pause();
            const disc = document.getElementById('music-vinyl-disc');
            const wrapper = disc ? disc.parentElement : null;
            if (wrapper) wrapper.classList.remove('playing');
            this.updateMiniMusicIcon(false);
        }
    }

    updateMiniMusicIcon(isPlaying) {
        const btn = document.getElementById('btn-toggle-music');
        if (btn) {
            btn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
        }
    }

    readMessageAloud() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            
            const text = document.getElementById('user-wish-message').innerText;
            const utterance = new SpeechSynthesisUtterance(text);
            const voices = window.speechSynthesis.getVoices();
            
            // Check if the text contains Devanagari (Marathi/Hindi) characters
            const isDevanagari = /[\u0900-\u097F]/.test(text);
            let preferredVoice = null;

            if (isDevanagari) {
                // 1. Try finding native Marathi voices
                const marathiVoices = voices.filter(v => v.lang.startsWith('mr'));
                preferredVoice = marathiVoices.find(v => v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Microsoft')) || marathiVoices[0];
                
                // 2. Fallback to Hindi voices (can read Devanagari perfectly with local Indian accent!)
                if (!preferredVoice) {
                    const hindiVoices = voices.filter(v => v.lang.startsWith('hi'));
                    preferredVoice = hindiVoices.find(v => v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Microsoft')) || hindiVoices[0];
                }

                utterance.lang = preferredVoice ? preferredVoice.lang : 'mr-IN';
            } else {
                // English text
                const englishVoices = voices.filter(v => v.lang.startsWith('en'));
                // Prefer Indian English (en-IN) for natural cadence
                preferredVoice = englishVoices.find(v => v.lang.includes('IN') && (v.name.includes('Google') || v.name.includes('Microsoft')))
                              || englishVoices.find(v => v.name.includes('Google') || v.name.includes('Microsoft'))
                              || englishVoices[0];
                
                utterance.lang = preferredVoice ? preferredVoice.lang : 'en-IN';
            }

            if (preferredVoice) {
                utterance.voice = preferredVoice;
                console.log(`TTS Active Voice: ${preferredVoice.name} (${preferredVoice.lang})`);
            }
            
            // Speed adjustments (slightly slower reading sounds more premium and clear)
            utterance.rate = isDevanagari ? 0.82 : 0.88;
            utterance.pitch = 1.0;
            
            const pauseBtn = document.getElementById('btn-pause-tts');
            
            utterance.onstart = () => {
                if (pauseBtn) pauseBtn.classList.remove('hide');
            };
            utterance.onend = () => {
                if (pauseBtn) pauseBtn.classList.add('hide');
            };
            utterance.onerror = (e) => {
                console.error("TTS Speech synthesis error:", e);
                if (pauseBtn) pauseBtn.classList.add('hide');
            };
            
            window.speechSynthesis.speak(utterance);
            this.speechUtterance = utterance;
        } else {
            console.warn("Speech synthesis is not supported on this browser.");
        }
    }

    pauseSpeech() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const pauseBtn = document.getElementById('btn-pause-tts');
            if (pauseBtn) pauseBtn.classList.add('hide');
        }
    }

    // ==========================================================================
    // LOGIN & AUTHENTICATION HANDLERS
    // ==========================================================================
    async handleUserLogin(e) {
        e.preventDefault();
        const usernameInput = document.getElementById('user-username').value.trim().toLowerCase();
        const passwordInput = document.getElementById('user-password').value;
        const birthdateInput = document.getElementById('user-birthdate').value;

        const errorDiv = document.getElementById('user-login-error');
        errorDiv.classList.add('hide');

        const user = this.db.users.find(u => 
            u.username.toLowerCase() === usernameInput && 
            u.password === passwordInput && 
            u.birthdate === birthdateInput
        );

        if (user) {
            this.currentUser = user;
            
            // Record login
            const logEntry = {
                id: 'log-' + Date.now(),
                username: user.username,
                action: 'Logged in successfully',
                timestamp: new Date().toISOString()
            };

            if (this.isServerless) {
                await this.firebase.saveDoc('logs', logEntry.id, logEntry);
                await this.reloadDb();
            } else {
                await fetch('/api/logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(logEntry)
                });
                await this.reloadDb();
            }

            document.getElementById('form-user-login').reset();
            this.navigateTo('surprise-unlock');
        } else {
            errorDiv.classList.remove('hide');
        }
    }

    handleAdminLogin(e) {
        e.preventDefault();
        const passwordInput = document.getElementById('admin-password').value;
        const errorDiv = document.getElementById('admin-login-error');
        errorDiv.classList.add('hide');

        if (passwordInput === this.db.adminPassword) {
            document.getElementById('form-admin-login').reset();
            this.navigateTo('admin-dashboard');
        } else {
            errorDiv.classList.remove('hide');
        }
    }

    logoutUser() {
        this.navigateTo('landing');
    }

    logoutAdmin() {
        this.navigateTo('landing');
    }

    // ==========================================================================
    // USER SURPRISE BLOWING CANDLE CELEBRATION
    // ==========================================================================
    unlockBirthdayExperience() {
        if (!this.currentUser) return;
        
        this.navigateTo('user-dashboard');
        document.body.className = `theme-${this.currentUser.theme}`;
        
        document.getElementById('user-display-name').innerText = this.currentUser.name;
        document.getElementById('user-hero-name').innerText = this.currentUser.name;
        document.getElementById('user-wish-message').innerText = this.currentUser.wishMessage;
        
        this.renderUserGallery();
        this.renderUserMusicPresets();
        this.triggerConfettiShower();

        const activeTrack = this.db.tracks.find(t => t.id === this.currentUser.musicTrackId);
        if (activeTrack) {
            document.getElementById('music-current-title').innerText = activeTrack.title;
            this.playAudio(activeTrack.url);
        }

        setTimeout(() => {
            this.readMessageAloud();
        }, 1200);

        const flame = document.getElementById('candle-flame');
        if (flame) flame.style.display = 'block';
        const instruct = document.getElementById('cake-instructions');
        if (instruct) instruct.innerHTML = '🕯️ मेणबत्ती विझवण्यासाठी केकवर क्लिक करा (Blow Candle!)';
    }

    renderUserGallery() {
        const grid = document.getElementById('user-gallery-grid');
        grid.innerHTML = '';

        if (!this.currentUser.gallery || this.currentUser.gallery.length === 0) {
            grid.innerHTML = '<p class="text-muted">गॅलरीमध्ये कोणतेही फोटो जोडलेले नाहीत.</p>';
            return;
        }

        this.currentUser.gallery.forEach((item) => {
            const div = document.createElement('div');
            div.classList.add('gallery-item');
            div.onclick = () => this.openLightbox(item.url, item.caption || '');

            if (item.type === 'image') {
                div.innerHTML = `
                    <img src="${item.url}" alt="Memory" onerror="this.src='https://images.unsplash.com/photo-1513151233558-d860c5398176?w=200'">
                    ${item.caption ? `<div class="gallery-caption-overlay">${item.caption}</div>` : ''}
                `;
            } else {
                div.innerHTML = `
                    <video src="${item.url}" muted></video>
                    <div class="video-badge"><i class="fa-solid fa-play"></i></div>
                    ${item.caption ? `<div class="gallery-caption-overlay">${item.caption}</div>` : ''}
                `;
            }
            grid.appendChild(div);
        });
    }

    renderUserMusicPresets() {
        const container = document.getElementById('user-music-presets');
        container.innerHTML = '';

        this.db.tracks.forEach(track => {
            const btn = document.createElement('button');
            btn.classList.add('music-preset-btn');
            if (track.id === this.currentUser.musicTrackId) {
                btn.classList.add('active');
            }
            btn.innerHTML = `<i class="fa-solid fa-compact-disc"></i> ${track.title}`;
            btn.onclick = async () => {
                this.currentUser.musicTrackId = track.id;
                document.getElementById('music-current-title').innerText = track.title;
                
                document.querySelectorAll('.music-preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.playAudio(track.url);

                // Save dynamic track selection
                if (this.isServerless) {
                    await this.firebase.saveDoc('users', this.currentUser.id, this.currentUser);
                } else {
                    await fetch('/api/users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(this.currentUser)
                    });
                }
                await this.reloadDb();
            };
            container.appendChild(btn);
        });
    }

    switchUserTab(tabId) {
        this.activeUserTab = tabId;
        
        document.querySelectorAll('.tabs-nav .tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = Array.from(document.querySelectorAll('.tabs-nav .tab-btn'))
            .find(btn => btn.getAttribute('onclick').includes(tabId));
        if (activeBtn) activeBtn.classList.add('active');

        document.querySelectorAll('.tabs-content .tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        document.getElementById(tabId).classList.add('active');
    }

    blowCandle() {
        const flame = document.getElementById('candle-flame');
        if (flame && flame.style.display !== 'none') {
            flame.style.display = 'none';
            document.getElementById('cake-instructions').innerHTML = '🎂 Happy Birthday Celebrated! 🎉';
            this.triggerConfettiShower();
        }
    }

    triggerConfettiShower() {
        if (typeof confetti === 'function') {
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
        }
    }

    async sendThanksMessage() {
        const textInput = document.getElementById('thanks-message-input');
        const text = textInput.value.trim();
        const successDiv = document.getElementById('thanks-success-msg');

        if (!text) return;

        const note = {
            id: 'th-' + Date.now(),
            username: this.currentUser.username,
            message: text,
            timestamp: new Date().toISOString()
        };

        try {
            if (this.isServerless) {
                await this.firebase.saveDoc('thanks', note.id, note);
            } else {
                await fetch('/api/thanks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(note)
                });
            }
            await this.reloadDb();
            
            successDiv.classList.remove('hide');
            textInput.value = '';

            setTimeout(() => successDiv.classList.add('hide'), 4000);
        } catch (e) {
            console.error(e);
        }
    }

    openLightbox(url, caption) {
        const lightbox = document.getElementById('lightbox');
        const img = document.getElementById('lightbox-img');
        const cap = document.getElementById('lightbox-caption');
        img.src = url;
        cap.innerText = caption;
        lightbox.classList.remove('hide');
    }

    closeLightbox() {
        document.getElementById('lightbox').classList.add('hide');
    }

    // ==========================================================================
    // ADMIN DASHBOARD DRAWER HANDLERS
    // ==========================================================================
    switchAdminTab(tabId) {
        this.activeAdminTab = tabId;
        
        document.querySelectorAll('.admin-sidebar .nav-item').forEach(item => {
            item.classList.remove('active');
        });
        const activeNav = Array.from(document.querySelectorAll('.admin-sidebar .nav-item'))
            .find(item => item.getAttribute('onclick').includes(tabId));
        if (activeNav) activeNav.classList.add('active');

        document.querySelectorAll('.admin-content .admin-tab-pane').forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(tabId).classList.add('active');

        if (tabId === 'admin-overview') {
            this.renderAdminOverview();
        } else if (tabId === 'admin-users') {
            this.renderAdminUsersList();
        } else if (tabId === 'admin-themes') {
            this.populateUserSelects();
            this.loadUserDataForTheme(document.getElementById('theme-user-select').value);
        } else if (tabId === 'admin-gallery') {
            this.populateUserSelects();
            this.loadUserGallery(document.getElementById('gallery-user-select').value);
        } else if (tabId === 'admin-music') {
            this.populateUserSelects();
            this.loadUserMusicConfig(document.getElementById('music-user-select').value);
        } else if (tabId === 'admin-records') {
            this.renderLogsAndThanks();
        } else if (tabId === 'admin-cloudinary') {
            this.updateEnvironmentUI();
        }
    }

    populateUserSelects() {
        const selects = ['theme-user-select', 'gallery-user-select', 'music-user-select'];
        if (!this.db || !this.db.users) return;

        selects.forEach(selectId => {
            const selectEl = document.getElementById(selectId);
            if (!selectEl) return;
            
            const currentVal = selectEl.value;
            selectEl.innerHTML = '';
            
            this.db.users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.innerText = `${u.name} (@${u.username})`;
                selectEl.appendChild(opt);
            });

            if (this.db.users.some(u => u.id === currentVal)) {
                selectEl.value = currentVal;
            }
        });
    }

    renderAdminOverview() {
        if (!this.db) return;
        document.getElementById('stat-total-users').innerText = this.db.users.length;
        document.getElementById('stat-total-thanks').innerText = this.db.thanks.length;

        let totalMedia = 0;
        this.db.users.forEach(u => {
            totalMedia += (u.gallery ? u.gallery.length : 0);
        });
        document.getElementById('stat-total-media').innerText = totalMedia;

        const todayStr = new Date().toISOString().substring(5, 10);
        let bdayCount = 0;
        const bdayListUl = document.getElementById('overview-birthdays-list');
        bdayListUl.innerHTML = '';

        this.db.users.forEach(u => {
            if (u.birthdate && u.birthdate.substring(5, 10) === todayStr) {
                bdayCount++;
                const li = document.createElement('li');
                li.classList.add('birthday-list-item');
                li.innerHTML = `
                    <div class="bday-user-info">
                        <i class="fa-solid fa-cake-candles"></i>
                        <strong>${u.name}</strong> (@${u.username})
                    </div>
                    <span class="bday-tag">Today's Birthday! 🍰</span>
                `;
                bdayListUl.appendChild(li);
            }
        });

        document.getElementById('stat-today-birthdays').innerText = bdayCount;
        if (bdayCount === 0) {
            bdayListUl.innerHTML = '<li class="text-muted" style="list-style:none;">आज कोणाचाही वाढदिवस नाही.</li>';
        }

        const recentLoginsTbody = document.getElementById('overview-recent-logins');
        recentLoginsTbody.innerHTML = '';
        
        const sortedLogs = [...this.db.logs].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
        
        if (sortedLogs.length === 0) {
            recentLoginsTbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">लॉगिन आढळले नाहीत.</td></tr>';
        } else {
            sortedLogs.forEach(log => {
                const tr = document.createElement('tr');
                const timeString = new Date(log.timestamp).toLocaleString('mr-IN', { hour12: true });
                tr.innerHTML = `
                    <td><strong>@${log.username}</strong></td>
                    <td>${timeString}</td>
                    <td><span class="badge badge-cyan">Successful</span></td>
                `;
                recentLoginsTbody.appendChild(tr);
            });
        }
    }

    renderAdminUsersList() {
        const tbody = document.getElementById('admin-users-table-body');
        tbody.innerHTML = '';

        if (!this.db || this.db.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">सिस्टममध्ये युझर्स आढळले नाहीत. नवीन युझर जोडा.</td></tr>';
            return;
        }

        this.db.users.forEach(u => {
            const tr = document.createElement('tr');
            const bdate = new Date(u.birthdate);
            const formattedDate = bdate.toLocaleDateString('mr-IN', { year: 'numeric', month: 'long', day: 'numeric' });
            
            let themeBadgeClass = 'badge-pink';
            if (u.theme === 'royal-gold') themeBadgeClass = 'badge-gold';
            else if (u.theme === 'cyber-neon') themeBadgeClass = 'badge-cyan';
            else if (u.theme === 'cosmic-dark') themeBadgeClass = 'badge-purple';

            tr.innerHTML = `
                <td><strong>${u.name}</strong></td>
                <td>@${u.username}</td>
                <td><code>${u.password}</code></td>
                <td>${formattedDate}</td>
                <td><span class="badge ${themeBadgeClass}">${u.theme}</span></td>
                <td class="actions-cell">
                    <button class="btn btn-secondary btn-table" onclick="appController.openUserModal('edit', '${u.id}')">
                        <i class="fa-solid fa-pen"></i> Edit
                    </button>
                    <button class="btn btn-danger btn-table" onclick="appController.deleteUser('${u.id}')">
                        <i class="fa-solid fa-trash-can"></i> Del
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    openUserModal(mode, userId = null) {
        const modal = document.getElementById('modal-user');
        const title = document.getElementById('user-modal-title');
        const form = document.getElementById('form-user-edit');
        form.reset();

        if (mode === 'add') {
            title.innerText = "नवीन युझर जोडा (Add New Birthday User)";
            this.activeEditUserId = null;
            document.getElementById('edit-user-id').value = '';
        } else if (mode === 'edit' && userId) {
            title.innerText = "युझर एडिट करा (Edit Birthday User)";
            this.activeEditUserId = userId;
            
            const user = this.db.users.find(u => u.id === userId);
            if (user) {
                document.getElementById('edit-user-id').value = user.id;
                document.getElementById('edit-user-name').value = user.name;
                document.getElementById('edit-user-username').value = user.username;
                document.getElementById('edit-user-password').value = user.password;
                document.getElementById('edit-user-birthdate').value = user.birthdate;
            }
        }
        modal.classList.remove('hide');
    }

    closeUserModal() {
        document.getElementById('modal-user').classList.add('hide');
    }

    async saveUser(e) {
        e.preventDefault();
        const idVal = document.getElementById('edit-user-id').value;
        const nameVal = document.getElementById('edit-user-name').value.trim();
        const usernameVal = document.getElementById('edit-user-username').value.trim().toLowerCase();
        const passwordVal = document.getElementById('edit-user-password').value.trim();
        const birthdateVal = document.getElementById('edit-user-birthdate').value;

        const duplicate = this.db.users.find(u => u.username === usernameVal && u.id !== idVal);
        if (duplicate) {
            alert("या युझरनेमचा युझर आधीपासून उपलब्ध आहे!");
            return;
        }

        const userObj = {
            id: idVal || ('usr-' + Date.now()),
            name: nameVal,
            username: usernameVal,
            password: passwordVal,
            birthdate: birthdateVal
        };

        if (idVal) {
            const existing = this.db.users.find(u => u.id === idVal);
            if (existing) {
                userObj.wishMessage = existing.wishMessage || '';
                userObj.theme = existing.theme || 'cosmic-dark';
                userObj.musicTrackId = existing.musicTrackId || 'track-1';
                userObj.gallery = existing.gallery || [];
            }
        } else {
            userObj.wishMessage = 'वाढदिवसाच्या हार्दिक शुभेच्छा! 🎂🎉';
            userObj.theme = 'cosmic-dark';
            userObj.musicTrackId = 'track-1';
            userObj.gallery = [];
        }

        if (this.isServerless) {
            await this.firebase.saveDoc('users', userObj.id, userObj);
        } else {
            await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userObj)
            });
        }
        
        await this.reloadDb();
        this.closeUserModal();
        this.renderAdminUsersList();
        this.populateUserSelects();
    }

    async deleteUser(userId) {
        if (confirm("तुम्हाला खात्री आहे की तुम्ही हा युझर डिलीट करू इच्छिता?")) {
            if (this.isServerless) {
                await this.firebase.deleteDoc('users', userId);
            } else {
                await fetch(`/api/users/${userId}`, { method: 'DELETE' });
            }
            await this.reloadDb();
            this.renderAdminUsersList();
            this.populateUserSelects();
        }
    }

    loadUserDataForTheme(userId) {
        if (!userId) return;
        const user = this.db.users.find(u => u.id === userId);
        if (!user) return;

        document.getElementById('admin-wish-text').value = user.wishMessage || '';
        this.selectThemeOption(user.theme || 'pink-princess');
    }

    selectThemeOption(themeName) {
        this.selectedThemeOption = themeName;
        document.querySelectorAll('.theme-card-option').forEach(card => {
            card.classList.remove('selected');
        });
        const selectedCard = document.getElementById(`opt-theme-${themeName}`);
        if (selectedCard) selectedCard.classList.add('selected');
    }

    async saveThemeAndMessage() {
        const userId = document.getElementById('theme-user-select').value;
        const wishText = document.getElementById('admin-wish-text').value;

        if (!userId) {
            alert("कृपया प्रथम एखादा युझर निवडा.");
            return;
        }

        const user = this.db.users.find(u => u.id === userId);
        if (user) {
            user.wishMessage = wishText;
            user.theme = this.selectedThemeOption;
            
            if (this.isServerless) {
                await this.firebase.saveDoc('users', user.id, user);
            } else {
                await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(user)
                });
            }
            await this.reloadDb();
            alert("थीम आणि मेसेज सेव्ह झाला! 🎉");
            this.renderAdminUsersList();
        }
    }

    // ==========================================================================
    // MEDIA GALLERY MANAGEMENT (SERVERLESS DIRECT UPLOAD VS EXPRESS API UPLOAD)
    // ==========================================================================
    loadUserGallery(userId) {
        const container = document.getElementById('admin-gallery-manager-grid');
        container.innerHTML = '';

        if (!userId) return;
        const user = this.db.users.find(u => u.id === userId);
        if (!user) return;

        if (!user.gallery || user.gallery.length === 0) {
            container.innerHTML = '<div class="text-center text-muted" style="grid-column: 1/-1; padding: 40px 0;">या युझरसाठी गॅलरीमध्ये कोणतीही फाईल नाही. जोडा!</div>';
            return;
        }

        user.gallery.forEach((item, index) => {
            const card = document.createElement('div');
            card.classList.add('admin-gallery-card');

            if (item.type === 'image') {
                card.innerHTML = `
                    <button class="admin-gallery-delete-btn" onclick="appController.deleteGalleryItem('${user.id}', ${index})">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                    <img src="${item.url}" alt="gallery img" onerror="this.src='https://images.unsplash.com/photo-1513151233558-d860c5398176?w=200'">
                `;
            } else {
                card.innerHTML = `
                    <button class="admin-gallery-delete-btn" onclick="appController.deleteGalleryItem('${user.id}', ${index})">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                    <video src="${item.url}" muted></video>
                    <div class="video-badge"><i class="fa-solid fa-play"></i></div>
                `;
            }
            container.appendChild(card);
        });
    }

    openGalleryModal() {
        const userId = document.getElementById('gallery-user-select').value;
        if (!userId) {
            alert("कृपया प्रथम युझर निवडा.");
            return;
        }
        
        document.getElementById('form-gallery-add').reset();
        
        const progressContainer = document.getElementById('gallery-upload-progress-container');
        const progressBar = document.getElementById('gallery-upload-progress-bar');
        const progressText = document.getElementById('gallery-upload-progress-text');
        
        if (progressContainer) progressContainer.classList.add('hide');
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.innerText = '0% Uploaded';

        this.toggleGalleryFormType('image');
        document.getElementById('modal-gallery').classList.remove('hide');
    }

    closeGalleryModal() {
        document.getElementById('modal-gallery').classList.add('hide');
    }

    toggleGalleryFormType(type) {
        const captionGroup = document.getElementById('gallery-item-caption-group');
        const urlInput = document.getElementById('gallery-item-url');
        const fileInput = document.getElementById('gallery-item-file');

        if (type === 'image') {
            if (captionGroup) captionGroup.classList.remove('hide');
            if (urlInput) urlInput.placeholder = 'https://images.unsplash.com/...';
            if (fileInput) fileInput.accept = 'image/*';
        } else {
            if (captionGroup) captionGroup.classList.add('hide');
            if (urlInput) urlInput.placeholder = 'https://www.w3schools.com/html/mov_bbb.mp4';
            if (fileInput) fileInput.accept = 'video/*';
        }
    }

    async saveGalleryItem(e) {
        e.preventDefault();
        const userId = document.getElementById('gallery-user-select').value;
        const type = document.querySelector('input[name="media-type"]:checked').value;
        const urlInput = document.getElementById('gallery-item-url').value.trim();
        const fileInput = document.getElementById('gallery-item-file');
        const caption = document.getElementById('gallery-item-caption').value.trim();

        if (!userId) return;
        const user = this.db.users.find(u => u.id === userId);
        if (!user) return;

        // File upload branch
        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const formData = new FormData();
            formData.append('file', file);

            const progressContainer = document.getElementById('gallery-upload-progress-container');
            const progressBar = document.getElementById('gallery-upload-progress-bar');
            const progressText = document.getElementById('gallery-upload-progress-text');

            if (progressContainer) progressContainer.classList.remove('hide');

            const xhr = new XMLHttpRequest();

            // Configure XHR URL depending on active environment
            if (this.isServerless) {
                const cldConfig = this.db.cloudinary;
                if (!cldConfig || !cldConfig.cloudName || !cldConfig.uploadPreset) {
                    alert("कृपया प्रथम Cloudinary सेटिंग्समध्ये Cloud Name आणि Upload Preset कॉन्फिगर करा!");
                    return;
                }
                formData.append('upload_preset', cldConfig.uploadPreset);
                xhr.open('POST', `https://api.cloudinary.com/v1_1/${cldConfig.cloudName}/auto/upload`, true);
            } else {
                xhr.open('POST', '/api/upload', true);
            }

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    if (progressBar) progressBar.style.width = `${percent}%`;
                    if (progressText) progressText.innerText = `${percent}% Uploaded`;
                }
            };

            xhr.onload = async () => {
                if (xhr.status === 200 || xhr.status === 201) {
                    const response = JSON.parse(xhr.responseText);
                    const fileUrl = this.isServerless ? response.secure_url : response.url;
                    
                    if (fileUrl) {
                        if (!user.gallery) user.gallery = [];
                        user.gallery.push({
                            type: type,
                            url: fileUrl,
                            caption: type === 'image' ? caption : ''
                        });

                        // Save update
                        if (this.isServerless) {
                            await this.firebase.saveDoc('users', user.id, user);
                        } else {
                            await fetch('/api/users', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(user)
                            });
                        }

                        await this.reloadDb();
                        this.closeGalleryModal();
                        this.loadUserGallery(userId);
                    } else {
                        alert("अपलोड अयशस्वी!");
                    }
                } else {
                    alert("अपलोड करताना त्रुटी आली. कृपया की तपासा.");
                }
            };

            xhr.send(formData);
        } else if (urlInput) {
            // URL Link mode
            if (!user.gallery) user.gallery = [];
            user.gallery.push({
                type: type,
                url: urlInput,
                caption: type === 'image' ? caption : ''
            });

            if (this.isServerless) {
                await this.firebase.saveDoc('users', user.id, user);
            } else {
                await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(user)
                });
            }

            await this.reloadDb();
            this.closeGalleryModal();
            this.loadUserGallery(userId);
        } else {
            alert("कृपया फाईल निवडा किंवा URL टाका!");
        }
    }

    async deleteGalleryItem(userId, index) {
        if (confirm("तुम्हाला गॅलरीमधील ही फाईल नक्की डिलीट करायची आहे?")) {
            const user = this.db.users.find(u => u.id === userId);
            if (user) {
                user.gallery.splice(index, 1);
                
                if (this.isServerless) {
                    await this.firebase.saveDoc('users', user.id, user);
                } else {
                    await fetch('/api/users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(user)
                    });
                }
                await this.reloadDb();
                this.loadUserGallery(userId);
            }
        }
    }

    // ==========================================================================
    // MUSIC TRACKS SELECTOR HANDLERS
    // ==========================================================================
    loadUserMusicConfig(userId) {
        if (!userId) return;
        const user = this.db.users.find(u => u.id === userId);
        if (!user) return;

        const container = document.getElementById('music-tracks-radio-container');
        container.innerHTML = '';

        this.db.tracks.forEach(track => {
            const div = document.createElement('div');
            div.classList.add('music-selection-item');
            if (track.id === user.musicTrackId) {
                div.classList.add('selected');
            }
            
            div.onclick = () => {
                this.selectMusicForUser(user.id, track.id);
            };

            div.innerHTML = `
                <div class="music-item-info">
                    <i class="fa-solid fa-music"></i>
                    <span>${track.title}</span>
                </div>
                <input type="radio" name="admin-music-radio" value="${track.id}" ${track.id === user.musicTrackId ? 'checked' : ''}>
            `;
            container.appendChild(div);
        });
    }

    async selectMusicForUser(userId, trackId) {
        const user = this.db.users.find(u => u.id === userId);
        if (user) {
            user.musicTrackId = trackId;
            if (this.isServerless) {
                await this.firebase.saveDoc('users', user.id, user);
            } else {
                await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(user)
                });
            }
            await this.reloadDb();
            this.loadUserMusicConfig(userId);
        }
    }

    async addNewMusicTrack() {
        const title = document.getElementById('music-new-title').value.trim();
        const urlInput = document.getElementById('music-new-url').value.trim();
        const fileInput = document.getElementById('music-new-file');

        if (!title) {
            alert("गाण्याचे नाव प्रविष्ट करा!");
            return;
        }

        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const formData = new FormData();
            formData.append('file', file);

            const progressContainer = document.getElementById('music-upload-progress-container');
            const progressBar = document.getElementById('music-upload-progress-bar');
            const progressText = document.getElementById('music-upload-progress-text');

            if (progressContainer) progressContainer.classList.remove('hide');

            const xhr = new XMLHttpRequest();
            
            if (this.isServerless) {
                const cldConfig = this.db.cloudinary;
                if (!cldConfig || !cldConfig.cloudName || !cldConfig.uploadPreset) {
                    alert("कृपया प्रथम Cloudinary कॉन्फिगर करा!");
                    return;
                }
                formData.append('upload_preset', cldConfig.uploadPreset);
                xhr.open('POST', `https://api.cloudinary.com/v1_1/${cldConfig.cloudName}/auto/upload`, true);
            } else {
                xhr.open('POST', '/api/upload', true);
            }

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    if (progressBar) progressBar.style.width = `${percent}%`;
                    if (progressText) progressText.innerText = `${percent}% Uploaded`;
                }
            };

            xhr.onload = async () => {
                if (xhr.status === 200 || xhr.status === 201) {
                    const response = JSON.parse(xhr.responseText);
                    const fileUrl = this.isServerless ? response.secure_url : response.url;
                    await this.registerTrackInBackend(title, fileUrl);
                } else {
                    alert("गाणे अपलोड अयशस्वी!");
                }
            };

            xhr.send(formData);
        } else if (urlInput) {
            await this.registerTrackInBackend(title, urlInput);
        } else {
            alert("गाण्याची थेट URL प्रविष्ट करा किंवा लॅपटॉपमधून फाईल निवडा!");
        }
    }

    async registerTrackInBackend(title, url) {
        const newTrack = { id: 'track-' + Date.now(), title, url };

        if (this.isServerless) {
            await this.firebase.saveDoc('tracks', newTrack.id, newTrack);
        } else {
            await fetch('/api/tracks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, url })
            });
        }

        // Reset fields
        document.getElementById('music-new-title').value = '';
        document.getElementById('music-new-url').value = '';
        document.getElementById('music-new-file').value = '';
        
        const progressContainer = document.getElementById('music-upload-progress-container');
        if (progressContainer) progressContainer.classList.add('hide');

        await this.reloadDb();
        const selectedUserId = document.getElementById('music-user-select').value;
        this.loadUserMusicConfig(selectedUserId);
        
        alert("नवीन गाणे जोडले गेले! 🎵");
    }

    // ==========================================================================
    // SYSTEM LOGS & AUDITS
    // ==========================================================================
    renderLogsAndThanks() {
        if (!this.db) return;

        const tbody = document.getElementById('logs-login-tbody');
        tbody.innerHTML = '';
        const sortedLogs = [...this.db.logs].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (sortedLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">कोणताही इतिहास सापडला नाही.</td></tr>';
        } else {
            sortedLogs.forEach(log => {
                const tr = document.createElement('tr');
                const timeString = new Date(log.timestamp).toLocaleString('mr-IN', { hour12: true });
                tr.innerHTML = `
                    <td><strong>@${log.username}</strong></td>
                    <td>${timeString}</td>
                    <td>${log.action}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        const thanksContainer = document.getElementById('logs-thanks-list');
        thanksContainer.innerHTML = '';
        const sortedThanks = [...this.db.thanks].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (sortedThanks.length === 0) {
            thanksContainer.innerHTML = '<div class="text-center text-muted" style="padding: 40px 0;">अद्याप कोणतेही थँक्यू मेसेजेस आलेले नाहीत.</div>';
        } else {
            sortedThanks.forEach(th => {
                const card = document.createElement('div');
                card.classList.add('thanks-msg-card');
                const timeString = new Date(th.timestamp).toLocaleString('mr-IN', { hour12: true });
                card.innerHTML = `
                    <div class="thanks-msg-header">
                        <strong>@${th.username}</strong>
                        <span>${timeString}</span>
                    </div>
                    <div class="thanks-msg-text">${th.message}</div>
                `;
                thanksContainer.appendChild(card);
            });
        }
    }

    async clearAllLogs() {
        if (confirm("तुम्हाला लॉगिन इतिहास आणि थँक्यू मेसेजेस डिलीट करायचे आहेत का?")) {
            if (this.isServerless) {
                // Delete in Firestore
                for (const log of this.db.logs) {
                    await this.firebase.deleteDoc('logs', log.id);
                }
                for (const th of this.db.thanks) {
                    await this.firebase.deleteDoc('thanks', th.id);
                }
            } else {
                await fetch('/api/clear-logs', { method: 'POST' });
            }
            await this.reloadDb();
            this.renderLogsAndThanks();
        }
    }
}

// Global initialization
let appController;
document.addEventListener('DOMContentLoaded', () => {
    appController = new BirthdayAppController();
});
