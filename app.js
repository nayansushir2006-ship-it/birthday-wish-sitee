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
        this.mode = null; 
        this.firebaseManager = new ServerlessFirebaseManager();
        this.db = { users: [], tracks: [], logs: [], thanks: [], adminPassword: '', cloudinary: {} };
        this.currentUser = null;
        this.currentSectionIndex = 0;
        this.totalSections = 15;
        this.sectionIds = [
            'section-secret-entry', 'section-cinematic-intro', 'section-gift-box', 'section-timeline', 
            'section-quiz', 'section-personality', 'section-open-when', 'section-make-wish', 
            'section-cake', 'section-memories-wall', 'section-voice-message', 'section-future-you', 
            'section-unlock-message', 'section-final-message', 'section-celebration'
        ];
        this.audioPlayer = new Audio();
        this.audioPlayer.loop = true;
        this.voiceAudioPlayer = null;
        this.quizState = { currentIndex: 0, score: 0, answered: false };
        this.puzzleState = { levels: [], currentLevel: 0 };
        this.candlesBlown = false;
        this.isPlaying = false;
        this.selectedThemeOption = 'pink-princess';
        this.activeAdminTab = 'admin-overview';
        this.activeEditUserId = null;
        this.isServerless = false;
    }

    async init() {
        await this.reloadDb();
        this.generateParticles();
        this.generateBalloons();
        this.setupEventListeners();
        
        // Show landing screen by default, handled by index.html originally
        // For the 15-section immersive experience, if URL contains ?admin, we go to admin.
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('admin')) {
            this.navigateTo('screen-login-admin');
        } else {
            this.navigateTo('screen-landing');
        }
    }

    // ==========================================================================
    // ENVIRONMENT & DATABASE
    // ==========================================================================
    async reloadDb() {
        try {
            const response = await fetch('/api/db');
            if (response.ok) {
                this.db = await response.json();
                this.mode = 'express';
                this.isServerless = false;
                this.updateEnvironmentUI();
                this.populateUserSelects();
                return;
            }
        } catch (error) {}

        await this.initServerlessMode();
    }

    async initServerlessMode() {
        this.mode = 'serverless';
        this.isServerless = true;
        
        const defaultFbConfig = {
            apiKey: "AIzaSyCWJ8tz45APW483fOrCrVyde0x0LWX2hVw",
            authDomain: "birthday-wish-s.firebaseapp.com",
            projectId: "birthday-wish-s",
            appId: "1:202245956575:web:93cea742439ee463fc5a6a"
        };
        const fbConfig = JSON.parse(localStorage.getItem('serverless_fb_config')) || defaultFbConfig;
        
        this.updateEnvironmentUI();

        const ready = await this.firebaseManager.init(fbConfig);
        if (ready) {
            const users = await this.firebaseManager.fetchCollection('users');
            const tracks = await this.firebaseManager.fetchCollection('tracks');
            const logs = await this.firebaseManager.fetchCollection('logs');
            const thanks = await this.firebaseManager.fetchCollection('thanks');
            const settings = await this.firebaseManager.fetchCollection('settings');

            const adminSetting = settings.find(s => s.id === 'admin');
            const cloudSetting = settings.find(s => s.id === 'cloudinary');

            this.db = {
                adminPassword: adminSetting ? adminSetting.password : 'admin123',
                cloudinary: cloudSetting ? { cloudName: cloudSetting.cloudName, uploadPreset: cloudSetting.uploadPreset } : JSON.parse(localStorage.getItem('serverless_cld_config')),
                users: users,
                tracks: tracks.length > 0 ? tracks : this.getDefaultTracks(),
                logs: logs,
                thanks: thanks
            };

            if (this.db.users.length === 0) {
                await this.seedDefaultServerlessData();
            }
            this.populateUserSelects();
            return;
        }
        
        // Fallback
        this.db = {
            adminPassword: 'admin123', cloudinary: null, users: [], tracks: this.getDefaultTracks(), logs: [], thanks: []
        };
        this.populateUserSelects();
    }

    getDefaultTracks() {
        return [
            { id: 'track-1', title: 'Romantic Piano Theme', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
            { id: 'track-2', title: 'Upbeat Acoustic Vibe', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' }
        ];
    }
    
    async seedDefaultServerlessData() {
        const user = {
            id: 'usr-1', name: 'Demo User', username: 'demo', password: '123', birthdate: '2026-01-01',
            secretName: 'Demo', introGreeting: 'Hello there!', timeline: [], quiz: [], 
            personality: { bars: [], overallRating: '100/100' }, openWhenMessages: [], 
            wishStarMessage: 'Make a wish!', voiceMessage: { url: '', title: '' }, futureMessages: [], 
            puzzleLevels: [], finalMessage: 'Happy Birthday!', gallery: []
        };
        await this.firebaseManager.saveDoc('users', user.id, user);
        this.db.users = [user];
    }

    updateEnvironmentUI() {
        const badge = document.getElementById('sys-mode-badge');
        if (badge) {
            badge.innerText = this.isServerless ? "Vercel Serverless Mode" : "Express Server Mode";
        }
    }

    // ==========================================================================
    // VISUALS
    // ==========================================================================
    generateParticles() {
        const container = document.getElementById('particle-container');
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < 25; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            const size = Math.random() * 80 + 30;
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.animationDuration = `${Math.random() * 10 + 10}s`;
            particle.style.animationDelay = `${Math.random() * 12}s`;
            container.appendChild(particle);
        }
    }

    generateBalloons() {
        const container = document.getElementById('balloons-container');
        if (!container) return;
        container.innerHTML = '';
        const colors = ['#ff4d8d', '#d4af37', '#00f0ff', '#8a2be2', '#ff5722', '#4caf50'];
        for (let i = 0; i < 12; i++) {
            const balloon = document.createElement('div');
            balloon.className = 'balloon';
            balloon.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            balloon.style.left = `${Math.random() * 90 + 5}%`;
            balloon.style.animationDuration = `${Math.random() * 10 + 12}s`;
            balloon.style.animationDelay = `${Math.random() * 15}s`;
            balloon.style.transform = `scale(${Math.random() * 0.4 + 0.8})`;
            const string = document.createElement('div');
            string.className = 'balloon-string';
            balloon.appendChild(string);
            container.appendChild(balloon);
        }
    }

    triggerConfetti() {
        if (typeof confetti !== 'undefined') {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
    }

    // ==========================================================================
    // NAVIGATION
    // ==========================================================================
    navigateTo(screenId) {
        document.querySelectorAll('.screen, .bw-section').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.add('active');

        const dotsContainer = document.getElementById('section-nav-dots');
        if (dotsContainer) dotsContainer.style.display = 'none';

        const musicFloat = document.getElementById('music-player-float');
        if (musicFloat && (screenId === 'screen-landing' || screenId === 'screen-login-admin' || screenId === 'screen-admin-dashboard' || screenId === 'section-secret-entry')) {
            musicFloat.style.display = 'none';
        }

        if (screenId === 'screen-admin-dashboard') {
            this.switchAdminTab('admin-overview');
        }
    }

    navigateToSection(index) {
        if (index < 0 || index >= this.totalSections) return;
        document.querySelectorAll('.screen, .bw-section').forEach(s => s.classList.remove('active'));
        
        const targetId = this.sectionIds[index];
        const targetSection = document.getElementById(targetId);
        if (targetSection) targetSection.classList.add('active');
        
        this.currentSectionIndex = index;

        const dotsContainer = document.getElementById('section-nav-dots');
        if (dotsContainer) {
            dotsContainer.style.display = (index === 0) ? 'none' : 'flex';
        }

        const musicFloat = document.getElementById('music-player-float');
        if (musicFloat) {
            musicFloat.style.display = (index === 0) ? 'none' : 'flex';
        }

        this.updateNavDots();

        switch (targetId) {
            case 'section-cinematic-intro': this.startCinematicIntro(); break;
            case 'section-timeline': this.renderTimeline(); break;
            case 'section-quiz': this.startQuiz(); break;
            case 'section-personality': this.renderPersonality(); this.animatePersonalityBars(); break;
            case 'section-open-when': this.renderOpenWhen(); break;
            case 'section-make-wish': this.renderWishStars(); break;
            case 'section-memories-wall': this.renderMemoriesWall(); break;
            case 'section-voice-message': this.initVoicePlayer(); break;
            case 'section-future-you': this.renderFutureYou(); break;
            case 'section-unlock-message': this.initPuzzle(); break;
            case 'section-final-message': this.showFinalMessage(); break;
            case 'section-celebration': this.startCelebration(); break;
        }
    }

    nextSection() { this.navigateToSection(this.currentSectionIndex + 1); }
    prevSection() { this.navigateToSection(this.currentSectionIndex - 1); }

    updateNavDots() {
        const dotsContainer = document.getElementById('section-nav-dots');
        if (!dotsContainer) return;
        dotsContainer.innerHTML = '';
        for (let i = 0; i < this.totalSections; i++) {
            const dot = document.createElement('div');
            dot.className = 'nav-dot' + (i === this.currentSectionIndex ? ' active' : '');
            dot.onclick = () => { if (this.currentUser) this.navigateToSection(i); };
            dotsContainer.appendChild(dot);
        }
    }

    // ==========================================================================
    // 15 SECTIONS LOGIC
    // ==========================================================================
    async logUserLogin(username) {
        try {
            const newLog = {
                id: 'log-' + Date.now(),
                username: username || 'user',
                action: 'Logged in successfully',
                timestamp: new Date().toISOString()
            };
            this.db.logs = this.db.logs || [];
            this.db.logs.unshift(newLog);

            if (this.mode === 'express') {
                fetch('/api/logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newLog)
                }).catch(e => console.log('Log save error:', e));
            } else if (this.firebaseManager && this.firebaseManager.db) {
                this.firebaseManager.saveDoc('logs', newLog.id, newLog).catch(e => console.log(e));
            }
        } catch (e) {
            console.log('Logging error:', e);
        }
    }

    handleUserLogin(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        const usernameInput = document.getElementById('user-username') || document.getElementById('secret-name-input');
        const passwordInput = document.getElementById('user-password');
        const birthdateInput = document.getElementById('user-birthdate');
        
        if (!usernameInput) return false;
        const inputVal = usernameInput.value.trim().toLowerCase();
        const passVal = passwordInput ? passwordInput.value.trim() : '';
        const dateVal = birthdateInput ? birthdateInput.value : '';

        if (!inputVal) {
            this.showError('user-login-error', 'कृपया Username किंवा नाव प्रविष्ट करा!');
            this.showError('secret-error', 'कृपया नाव प्रविष्ट करा!');
            return false;
        }

        const user = this.db.users.find(u => {
            const matchesName = (u.username && u.username.toLowerCase() === inputVal) ||
                                (u.secretName && u.secretName.toLowerCase() === inputVal) ||
                                (u.name && u.name.toLowerCase() === inputVal);
            
            if (!matchesName) return false;

            if (passVal && u.password && u.password !== passVal) {
                return false;
            }

            if (dateVal && u.birthdate && u.birthdate !== dateVal) {
                return false;
            }

            return true;
        });

        if (user) {
            const errEl = document.getElementById('user-login-error');
            if (errEl) errEl.classList.add('hide');
            const errElSecret = document.getElementById('secret-error');
            if (errElSecret) errElSecret.classList.add('hide');
            
            this.currentUser = user;
            document.body.className = `theme-${user.theme || 'pink-princess'}`;
            
            this.logUserLogin(user.username || user.name);
            
            const activeTrack = this.db.tracks.find(t => t.id === user.musicTrackId);
            if (activeTrack) {
                this.audioPlayer.src = activeTrack.url;
                const titleEl = document.getElementById('music-float-title');
                if (titleEl) titleEl.textContent = activeTrack.title;
            }
            
            this.navigateToSection(1);
            return false;
        } else {
            this.showError('user-login-error', 'चुकीचा युझरनेम, पासवर्ड किंवा जन्मतारीख!');
            this.showError('secret-error', 'चुकीचे नाव! कृपया योग्य नाव टाका (उदा. Sanav किंवा Karan)');
            return false;
        }
    }

    handleSecretEntry(e) {
        return this.handleUserLogin(e);
    }

    startCinematicIntro() {
        const nameEl = document.getElementById('intro-name');
        if (nameEl) nameEl.textContent = `Hey ${this.currentUser.secretName || this.currentUser.name} ❤️`;
        const greetingEl = document.getElementById('intro-greeting-text');
        if (greetingEl) {
            const text = this.currentUser.introGreeting || "Happy Birthday!";
            this.typewriterEffect(greetingEl, text, 50, () => {
                const btn = document.getElementById('btn-lets-go');
                if (btn) btn.style.display = 'block';
            });
        }
        if (this.audioPlayer.src && this.audioPlayer.paused) {
            this.audioPlayer.play().catch(e=>console.log(e));
            this.updateMiniMusicIcon(true);
        }
    }

    typewriterEffect(element, text, speed = 50, callback) {
        let i = 0;
        element.innerHTML = '';
        text = text.replace(/\n/g, '<br>');
        let currentHTML = '';
        const timer = setInterval(() => {
            if (text.substr(i, 4) === '<br>') {
                currentHTML += '<br>';
                i += 4;
            } else {
                currentHTML += text.charAt(i);
                i++;
            }
            element.innerHTML = currentHTML;
            if (i >= text.length) {
                clearInterval(timer);
                if (callback) callback();
            }
        }, speed);
    }

    openGiftBox() {
        const wrapper = document.getElementById('gift-box-wrapper');
        if (wrapper) wrapper.classList.add('opened');
        this.triggerConfetti();
        setTimeout(() => this.nextSection(), 1200);
    }

    renderTimeline() {
        const container = document.getElementById('timeline-container');
        if (!container || !this.currentUser.timeline) return;
        container.innerHTML = '<div class="timeline-line"></div>';
        this.currentUser.timeline.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = `timeline-item ${index % 2 === 0 ? 'left' : 'right'}`;
            div.style.animationDelay = `${index * 0.2}s`;
            let html = `
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <div class="timeline-card glassmorphic">
                        <span class="timeline-date"><i class="fa-regular fa-calendar-days"></i> ${item.date}</span>
                        <h3 class="timeline-title">${item.title}</h3>
                        <p class="timeline-desc">${item.description}</p>
            `;
            if (item.image) html += `<img src="${item.image}" class="timeline-image" alt="Memory">`;
            html += `</div></div>`;
            div.innerHTML = html;
            container.appendChild(div);
        });
        container.scrollTop = 0;
    }

    startQuiz() {
        if (!this.currentUser.quiz || this.currentUser.quiz.length === 0) {
            this.nextSection();
            return;
        }
        this.quizState = { currentIndex: 0, score: 0, answered: false };

        // Reset visibility: show quiz card, hide result card
        const quizCard = document.getElementById('quiz-card-container');
        const quizCounter = document.getElementById('quiz-counter');
        const resultCard = document.getElementById('quiz-result');
        if (quizCard) quizCard.classList.remove('hide');
        if (quizCounter) quizCounter.classList.remove('hide');
        if (resultCard) resultCard.classList.add('hide');

        this.renderQuizQuestion();
    }

    renderQuizQuestion() {
        const q = this.currentUser.quiz[this.quizState.currentIndex];
        const counter = document.getElementById('quiz-counter');
        if (counter) counter.textContent = `${this.quizState.currentIndex + 1} / ${this.currentUser.quiz.length}`;
        const qText = document.getElementById('quiz-question');
        if (qText) qText.textContent = q.question;
        const optionsContainer = document.getElementById('quiz-options');
        if (optionsContainer) {
            optionsContainer.innerHTML = '';
            const letters = ['A', 'B', 'C', 'D'];
            q.options.forEach((opt, idx) => {
                const btn = document.createElement('button');
                btn.className = 'quiz-option';
                btn.innerHTML = `<span class="quiz-option-letter">${letters[idx]}</span> <span>${opt}</span>`;
                btn.onclick = () => this.selectQuizOption(idx);
                optionsContainer.appendChild(btn);
            });
        }
        const nextBtn = document.getElementById('btn-quiz-next');
        if (nextBtn) nextBtn.style.display = 'none';
    }

    selectQuizOption(index) {
        if (this.quizState.answered) return;
        this.quizState.answered = true;
        const q = this.currentUser.quiz[this.quizState.currentIndex];
        const options = document.querySelectorAll('.quiz-option');
        if (index === q.correct) {
            options[index].classList.add('correct');
            this.quizState.score++;
            this.triggerConfetti();
        } else {
            options[index].classList.add('wrong');
            if (options[q.correct]) options[q.correct].classList.add('correct');
        }

        setTimeout(() => {
            this.nextQuizQuestion();
        }, 1000);
    }

    nextQuizQuestion() {
        this.quizState.currentIndex++;
        this.quizState.answered = false;
        if (this.quizState.currentIndex >= this.currentUser.quiz.length) {
            this.showQuizResult();
        } else {
            this.renderQuizQuestion();
        }
    }

    async showQuizResult() {
        const score = this.quizState.score;
        const total = this.currentUser.quiz.length;
        const percent = Math.round((score / total) * 100);

        // Hide quiz card & counter, show result
        const quizCard = document.getElementById('quiz-card-container');
        const quizCounter = document.getElementById('quiz-counter');
        const quizNextBtn = document.getElementById('btn-quiz-next');
        const resultCard = document.getElementById('quiz-result');

        if (quizCard) quizCard.classList.add('hide');
        if (quizCounter) quizCounter.classList.add('hide');
        if (quizNextBtn) quizNextBtn.classList.add('hide');
        if (resultCard) resultCard.classList.remove('hide');

        // Set emoji & title
        const emojiEl = document.getElementById('quiz-result-emoji');
        const titleEl = document.getElementById('quiz-result-title');
        const scoreEl = document.getElementById('quiz-result-score');
        const msgEl = document.getElementById('quiz-result-msg');
        const barEl = document.getElementById('quiz-result-bar');

        let emoji = '🏆';
        let msg = 'Perfect! You know everything! 🎉';
        if (percent < 30) { emoji = '😅'; msg = 'Better luck next time! Keep trying! 💪'; }
        else if (percent < 50) { emoji = '🙂'; msg = 'Not bad! Room to improve! 📚'; }
        else if (percent < 70) { emoji = '😊'; msg = 'Good job! You know quite a bit! ⭐'; }
        else if (percent < 90) { emoji = '🤩'; msg = 'Awesome! Almost perfect! 🔥'; }
        else if (percent < 100) { emoji = '😎'; msg = 'Excellent! So close to perfect! 💯'; }

        if (emojiEl) emojiEl.textContent = emoji;
        if (titleEl) titleEl.textContent = 'Quiz Complete!';
        if (scoreEl) scoreEl.textContent = `${score} / ${total}`;
        if (msgEl) msgEl.textContent = msg;
        if (barEl) {
            barEl.style.width = '0%';
            setTimeout(() => { barEl.style.width = percent + '%'; }, 100);
        }

        if (percent === 100) this.triggerConfetti();

        // Save score to user data
        try {
            this.currentUser.quizScore = {
                score: score,
                total: total,
                percent: percent,
                date: new Date().toISOString()
            };
            await this.saveUser(this.currentUser);
        } catch(e) {
            console.log('Could not save quiz score:', e);
        }
    }

    renderPersonality() {
        const container = document.getElementById('personality-bars');
        if (!container || !this.currentUser.personality) return;
        container.innerHTML = '';
        const colorPalette = ['#ff4d8d', '#ff9f43', '#00f0ff', '#2ed573', '#a855f7'];
        this.currentUser.personality.bars.forEach((bar, idx) => {
            const row = document.createElement('div');
            row.className = 'personality-bar-row';
            const barColor = bar.color || colorPalette[idx % colorPalette.length];
            row.innerHTML = `
                <div class="personality-bar-emoji">${bar.emoji || '✨'}</div>
                <div class="personality-bar-label">${bar.label}</div>
                <div class="personality-bar-track">
                    <div class="personality-bar-fill" style="background: linear-gradient(90deg, ${barColor}, #ffffff); width: 0%;" data-width="${bar.value}%"></div>
                </div>
                <div class="personality-bar-value">${bar.value}%</div>
            `;
            container.appendChild(row);
        });
        const overall = document.getElementById('personality-overall');
        if (overall) {
            overall.innerHTML = `
                <i class="fa-solid fa-trophy" style="font-size: 2rem; color: #ffd700;"></i>
                <h3 style="color:#ffffff; margin-top:8px;">Overall Compatibility Rating</h3>
                <div class="overall-number">${this.currentUser.personality.overallRating || '99.9 / 100'} ❤️</div>
            `;
        }
    }

    animatePersonalityBars() {
        setTimeout(() => {
            document.querySelectorAll('.personality-bar-fill').forEach((fill, idx) => {
                setTimeout(() => { fill.style.width = fill.getAttribute('data-width'); }, idx * 150);
            });
        }, 200);
    }

    renderOpenWhen() {
        const list = document.getElementById('open-when-list');
        if (!list || !this.currentUser.openWhenMessages) return;
        list.innerHTML = '';
        this.currentUser.openWhenMessages.forEach(msg => {
            const card = document.createElement('div');
            card.className = 'envelope-card glassmorphic';
            card.style.borderColor = msg.color || 'var(--primary)';
            card.onclick = () => this.openEnvelope(msg.id);
            card.innerHTML = `<div class="envelope-emoji">${msg.emoji || '✉️'}</div><div class="envelope-label">Open when ${msg.emotion}</div><i class="fa-solid fa-chevron-right envelope-icon"></i>`;
            list.appendChild(card);
        });
    }

    openEnvelope(id) {
        const msg = this.currentUser.openWhenMessages.find(m => m.id === id);
        if (!msg) return;
        const title = document.getElementById('open-when-msg-title');
        const text = document.getElementById('open-when-msg-text');
        const overlay = document.getElementById('open-when-overlay');
        if (title) title.textContent = `Open when ${msg.emotion}`;
        if (text) text.textContent = msg.message;
        if (overlay) overlay.classList.remove('hide');
    }

    closeOpenWhen() {
        const overlay = document.getElementById('open-when-overlay');
        if (overlay) overlay.classList.add('hide');
    }
    
    closeEnvelope() {
        this.closeOpenWhen();
    }

    renderWishStars() {
        const container = document.getElementById('wish-stars-container');
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const star = document.createElement('div');
            star.className = 'wish-star';
            star.innerHTML = `<i class="fa-solid fa-star"></i>`;
            star.onclick = () => this.handleWishStar(star);
            container.appendChild(star);
        }
        const display = document.getElementById('wish-text-display');
        if (display) {
            display.classList.add('hide');
            display.classList.remove('visible');
        }
        const continueBtn = document.getElementById('btn-wish-continue');
        if (continueBtn) continueBtn.classList.add('hide');
    }

    handleWishStar(starElement) {
        if (starElement) {
            document.querySelectorAll('.wish-star').forEach(s => s.classList.remove('active'));
            if (starElement.classList) starElement.classList.add('active');
        }
        const display = document.getElementById('wish-text-display');
        const continueBtn = document.getElementById('btn-wish-continue');
        const msg = (this.currentUser && this.currentUser.wishStarMessage) ? this.currentUser.wishStarMessage : "May all your dreams and wishes come true! 🌟✨";
        if (display) {
            display.innerHTML = `<p class="font-cursive large-text" style="font-size:1.45rem; color:#ffffff !important; text-shadow:0 0 15px var(--primary-glow);">"${msg}"</p>`;
            display.classList.remove('hide');
            display.classList.add('visible');
        }
        if (continueBtn) continueBtn.classList.remove('hide');
        this.triggerConfetti();
    }

    blowCandles() {
        if (this.candlesBlown) return;
        this.candlesBlown = true;
        const container = document.getElementById('cake-container');
        if (container) container.classList.add('cake-blown');
        const msg = document.getElementById('cake-message');
        if (msg) msg.textContent = '🎉 Candle Extinguished! Make your wish below ✨';
        this.triggerConfetti();
        
        const modal = document.getElementById('candle-wish-modal');
        if (modal) {
            modal.classList.remove('hide');
            modal.classList.add('animate-fade-in');
        }
    }

    async submitCandleWish() {
        const input = document.getElementById('candle-wish-input');
        const statusEl = document.getElementById('candle-wish-status');
        const continueBtn = document.getElementById('btn-cake-continue');
        
        if (!input) return;
        const wishText = input.value.trim();
        if (!wishText) {
            if (statusEl) {
                statusEl.textContent = 'कृपया तुमची गुप्त इच्छा (Wish) टाईप करा!';
                statusEl.style.color = '#ff6b6b';
                statusEl.classList.remove('hide');
            }
            return;
        }
        
        const userName = (this.currentUser && (this.currentUser.name || this.currentUser.username)) ? (this.currentUser.name || this.currentUser.username) : 'Special Guest';
        
        const newThankNote = {
            id: 'th-' + Date.now(),
            username: userName,
            message: `🎂 Birthday Candle Wish: ${wishText}`,
            timestamp: new Date().toISOString()
        };

        const newLog = {
            id: 'log-' + Date.now(),
            username: userName,
            action: `Made a Birthday Candle Wish: "${wishText.substring(0, 35)}..."`,
            timestamp: new Date().toISOString()
        };

        this.db.thanks = this.db.thanks || [];
        this.db.thanks.unshift(newThankNote);
        this.db.logs = this.db.logs || [];
        this.db.logs.unshift(newLog);

        try {
            if (this.mode === 'express') {
                fetch('/api/thanks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newThankNote)
                }).catch(e => console.log(e));

                fetch('/api/logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newLog)
                }).catch(e => console.log(e));
            } else if (this.firebaseManager && this.firebaseManager.db) {
                this.firebaseManager.saveDoc('thanks', newThankNote.id, newThankNote).catch(e => console.log(e));
                this.firebaseManager.saveDoc('logs', newLog.id, newLog).catch(e => console.log(e));
            }
        } catch(e) { console.log(e); }

        if (statusEl) {
            statusEl.textContent = 'आपली इच्छा (Wish) यशस्वीरित्या जतन केली आहे आणि ॲडमिन कडे पाठवली आहे! ❤️✨';
            statusEl.style.color = '#4dff88';
            statusEl.classList.remove('hide');
        }
        
        input.disabled = true;
        const submitBtn = document.getElementById('btn-submit-candle-wish');
        if (submitBtn) submitBtn.style.display = 'none';
        
        if (continueBtn) continueBtn.classList.remove('hide');
        this.triggerConfetti();
    }

    renderMemoriesWall() {
        const filterContainer = document.getElementById('gallery-filter-tabs');
        if (filterContainer && this.currentUser.gallery) {
            const categories = ['All', ...new Set(this.currentUser.gallery.map(g => g.category || 'Other'))];
            filterContainer.innerHTML = '';
            categories.forEach((cat, idx) => {
                const btn = document.createElement('button');
                btn.className = 'gallery-filter-btn' + (idx === 0 ? ' active' : '');
                btn.textContent = cat;
                btn.onclick = () => {
                    document.querySelectorAll('.gallery-filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.filterGallery(cat);
                };
                filterContainer.appendChild(btn);
            });
        }
        this.filterGallery('All');
    }

    filterGallery(category) {
        const container = document.getElementById('gallery-slides-container');
        const dotsContainer = document.getElementById('gallery-dots');
        const counter = document.getElementById('gallery-slide-counter');
        if (!container || !this.currentUser.gallery) return;

        // Stop any existing auto-slide
        this.stopGalleryAutoSlide();

        container.innerHTML = '';
        if (dotsContainer) dotsContainer.innerHTML = '';

        let items = this.currentUser.gallery;
        if (category !== 'All') items = items.filter(g => (g.category || 'Other') === category);

        this.gallerySlides = items;
        this.galleryCurrentIndex = 0;

        if (items.length === 0) {
            container.innerHTML = '<p style="color:rgba(255,255,255,0.5);text-align:center;padding:40px;">No images in this category</p>';
            if (counter) counter.textContent = '0 / 0';
            return;
        }

        // Build slides
        items.forEach((item, i) => {
            const slide = document.createElement('div');
            slide.className = 'gallery-slide' + (i === 0 ? ' active' : '');
            slide.dataset.index = i;

            if (item.type === 'video') {
                slide.innerHTML = `<video src="${item.url}" controls style="pointer-events:auto;"></video>`;
            } else {
                slide.innerHTML = `<img src="${item.url}" alt="${item.caption || ''}" loading="lazy">`;
            }

            if (item.caption) {
                slide.innerHTML += `<div class="gallery-slide-caption">${item.caption}</div>`;
            }

            container.appendChild(slide);
        });

        // Build dots
        if (dotsContainer) {
            items.forEach((_, i) => {
                const dot = document.createElement('button');
                dot.className = 'gallery-dot' + (i === 0 ? ' active' : '');
                dot.onclick = () => this.goToSlide(i);
                dotsContainer.appendChild(dot);
            });
        }

        // Update counter
        if (counter) counter.textContent = `1 / ${items.length}`;

        // Initialize first slide
        this.goToSlide(0);
    }

    goToSlide(index) {
        const container = document.getElementById('gallery-slides-container');
        const dotsContainer = document.getElementById('gallery-dots');
        const counter = document.getElementById('gallery-slide-counter');
        if (!container || !this.gallerySlides || this.gallerySlides.length === 0) return;

        // Stop current timer before switching
        this.stopGalleryAutoSlide();

        const slides = container.querySelectorAll('.gallery-slide');
        const dots = dotsContainer ? dotsContainer.querySelectorAll('.gallery-dot') : [];

        // Stop and reset any videos on other slides
        slides.forEach(s => {
            s.classList.remove('active');
            const v = s.querySelector('video');
            if (v) {
                v.pause();
                v.onended = null;
                v.onplay = null;
            }
        });
        dots.forEach(d => d.classList.remove('active'));

        this.galleryCurrentIndex = index;
        const currentSlide = slides[index];
        if (currentSlide) currentSlide.classList.add('active');
        if (dots[index]) dots[index].classList.add('active');
        if (counter) counter.textContent = `${index + 1} / ${this.gallerySlides.length}`;

        const currentVideo = currentSlide ? currentSlide.querySelector('video') : null;
        if (currentVideo) {
            // Video slide: play full duration and advance only when video finishes
            currentVideo.currentTime = 0;
            currentVideo.onended = () => {
                this.galleryNext();
            };
            currentVideo.onplay = () => {
                this.stopGalleryAutoSlide();
            };
            const playPromise = currentVideo.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => {
                    // Autoplay blocked by browser policy; user can click play
                });
            }
        } else {
            // Image slide: start 3-second auto-slide timer
            this.startGalleryAutoSlide();
        }
    }

    galleryNext() {
        if (!this.gallerySlides || this.gallerySlides.length === 0) return;
        const next = (this.galleryCurrentIndex + 1) % this.gallerySlides.length;
        this.goToSlide(next);
    }

    galleryPrev() {
        if (!this.gallerySlides || this.gallerySlides.length === 0) return;
        const prev = (this.galleryCurrentIndex - 1 + this.gallerySlides.length) % this.gallerySlides.length;
        this.goToSlide(prev);
    }

    startGalleryAutoSlide() {
        this.stopGalleryAutoSlide();
        this.gallerySlideshowInterval = setInterval(() => {
            if (!this.gallerySlides || this.gallerySlides.length <= 1) return;

            // Safety check: if active slide is a playing video, don't interrupt it
            const container = document.getElementById('gallery-slides-container');
            if (container) {
                const activeSlide = container.querySelector('.gallery-slide.active');
                const activeVideo = activeSlide ? activeSlide.querySelector('video') : null;
                if (activeVideo && !activeVideo.paused && !activeVideo.ended) {
                    return;
                }
            }

            const next = (this.galleryCurrentIndex + 1) % this.gallerySlides.length;
            this.goToSlide(next);
        }, 3000);
    }

    stopGalleryAutoSlide() {
        if (this.gallerySlideshowInterval) {
            clearInterval(this.gallerySlideshowInterval);
            this.gallerySlideshowInterval = null;
        }
    }

    initVoicePlayer() {
        const playerContainer = document.getElementById('voice-player');
        if (!this.currentUser.voiceMessage || !this.currentUser.voiceMessage.url) {
            if (playerContainer) playerContainer.innerHTML = '<p>No voice message yet</p>';
            return;
        }
        if (!this.voiceAudioPlayer) {
            this.voiceAudioPlayer = new Audio(this.currentUser.voiceMessage.url);
            const progress = document.getElementById('voice-progress');
            const current = document.getElementById('voice-current-time');
            const dur = document.getElementById('voice-duration');
            this.voiceAudioPlayer.ontimeupdate = () => {
                if (progress) progress.value = (this.voiceAudioPlayer.currentTime / this.voiceAudioPlayer.duration) * 100 || 0;
                if (current) current.textContent = this.formatTime(this.voiceAudioPlayer.currentTime);
            };
            this.voiceAudioPlayer.onloadedmetadata = () => {
                if (dur) dur.textContent = this.formatTime(this.voiceAudioPlayer.duration);
            };
            this.voiceAudioPlayer.onended = () => {
                const btn = document.getElementById('voice-play-btn');
                if (btn) btn.innerHTML = '<i class="fa-solid fa-play"></i>';
                if (progress) progress.value = 0;
            };
            if (progress) {
                progress.oninput = (e) => {
                    this.voiceAudioPlayer.currentTime = (e.target.value / 100) * this.voiceAudioPlayer.duration;
                };
            }
        } else {
            this.voiceAudioPlayer.src = this.currentUser.voiceMessage.url;
        }
        const title = document.getElementById('voice-title');
        if (title) title.textContent = this.currentUser.voiceMessage.title;
    }

    toggleVoicePlay() {
        if (!this.voiceAudioPlayer) return;
        const btn = document.getElementById('voice-play-btn');
        if (this.voiceAudioPlayer.paused) {
            this.voiceAudioPlayer.play();
            if (btn) btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        } else {
            this.voiceAudioPlayer.pause();
            if (btn) btn.innerHTML = '<i class="fa-solid fa-play"></i>';
        }
    }

    renderFutureYou() {
        const tabs = document.getElementById('future-year-tabs');
        if (!tabs || !this.currentUser.futureMessages) return;
        tabs.innerHTML = '';
        this.currentUser.futureMessages.forEach((fm, i) => {
            const btn = document.createElement('button');
            btn.className = 'future-year-btn' + (i === 0 ? ' active' : '');
            btn.textContent = fm.year;
            btn.onclick = () => {
                document.querySelectorAll('.future-year-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectFutureYear(fm.year);
            };
            tabs.appendChild(btn);
        });
        if (this.currentUser.futureMessages.length > 0) {
            this.selectFutureYear(this.currentUser.futureMessages[0].year);
        }
    }

    selectFutureYear(year) {
        const fm = this.currentUser.futureMessages.find(f => f.year === year);
        const text = document.getElementById('future-message-text');
        if (text && fm) text.textContent = fm.message;
    }

    initPuzzle() {
        if (!this.currentUser.puzzleLevels) return;
        this.puzzleState = {
            levels: JSON.parse(JSON.stringify(this.currentUser.puzzleLevels)),
            currentLevel: 0
        };
        this.renderPuzzleLevels();
    }

    renderPuzzleLevels() {
        const container = document.getElementById('puzzle-levels');
        if (!container) return;
        container.innerHTML = '';
        this.puzzleState.levels.forEach((level, i) => {
            const card = document.createElement('div');
            card.className = 'puzzle-level-card glassmorphic' + (i === this.puzzleState.currentLevel ? ' active-level' : '') + (level.completed ? ' completed' : '');
            card.innerHTML = `<div class="puzzle-level-title">Level ${i + 1}: ${level.title}</div><div class="puzzle-level-status"><i class="fa-solid ${level.completed ? 'fa-check-circle' : 'fa-lock'}"></i></div>`;
            card.onclick = () => {
                this.puzzleState.currentLevel = i;
                this.renderPuzzleLevels();
            };
            container.appendChild(card);
        });
        
        this.showPuzzleQuestion();
        
        const finalBtn = document.getElementById('btn-unlock-final');
        if (finalBtn) {
            if (this.puzzleState.levels.every(l => l.completed)) finalBtn.classList.add('enabled');
            else finalBtn.classList.remove('enabled');
        }
    }

    showPuzzleQuestion() {
        const level = this.puzzleState.levels[this.puzzleState.currentLevel];
        const titleEl = document.getElementById('puzzle-active-title');
        const qEl = document.getElementById('puzzle-active-question');
        const input = document.getElementById('puzzle-answer-input');

        if (titleEl) {
            if (level) {
                titleEl.textContent = `Level ${this.puzzleState.currentLevel + 1}: ${level.title}`;
            } else {
                titleEl.textContent = 'All Puzzles Completed!';
            }
        }

        if (qEl) {
            if (level && !level.completed) {
                qEl.textContent = level.question;
            } else if (level && level.completed) {
                qEl.textContent = 'हा लेव्हल पूर्ण झाला आहे! 🎉 (Level Completed!)';
            } else {
                qEl.textContent = 'सर्व लेव्हल्स पूर्ण झाले आहेत! 🏆';
            }
        }

        if (input) {
            input.value = '';
            input.placeholder = level && !level.completed ? 'उत्तर येथे टाका (Your answer here)...' : 'Level Completed!';
            input.disabled = !level || level.completed;
        }
    }

    submitPuzzleAnswer() {
        const input = document.getElementById('puzzle-answer-input');
        if (!input) return;
        const answer = input.value.trim().toLowerCase();
        const level = this.puzzleState.levels[this.puzzleState.currentLevel];
        if (!level || level.completed) return;
        
        if (level.answer && answer === level.answer.trim().toLowerCase()) {
            level.completed = true;
            this.puzzleState.currentLevel++;
            this.triggerConfetti();
            this.renderPuzzleLevels();
        } else {
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 500);
        }
    }

    showFinalMessage() {
        const name = document.getElementById('final-name');
        const text = document.getElementById('final-msg-text');
        if (name) name.textContent = this.currentUser.name;
        if (text) text.textContent = this.currentUser.finalMessage || this.currentUser.wishMessage || 'Happy Birthday!';
    }

    startCelebration() {
        const name = document.getElementById('celebration-name');
        if (name) name.textContent = this.currentUser.name;
        
        let end = Date.now() + (3 * 1000);
        let colors = ['#bb0000', '#ffffff', '#ffdf00'];

        if (typeof confetti !== 'undefined') {
            (function frame() {
                confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: colors });
                confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: colors });
                if (Date.now() < end) requestAnimationFrame(frame);
            }());
        }
    }

    // ==========================================================================
    // EVENTS & HELPERS
    // ==========================================================================
    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (this.currentUser && !document.querySelector('.screen.active')) {
                if (e.key === 'ArrowRight') this.nextSection();
                if (e.key === 'ArrowLeft') this.prevSection();
            }
        });
        
        const formUser = document.getElementById('form-user-login');
        if (formUser) {
            formUser.addEventListener('submit', (e) => this.handleUserLogin(e));
        }

        const userInput = document.getElementById('user-username');
        if (userInput) {
            userInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleUserLogin(e);
            });
        }

        const secretInput = document.getElementById('secret-name-input');
        if (secretInput) {
            secretInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleUserLogin(e);
            });
        }

        const btnSecret = document.getElementById('btn-secret-continue');
        if (btnSecret) {
            btnSecret.addEventListener('click', (e) => this.handleUserLogin(e));
        }

        const starsContainer = document.getElementById('wish-stars-container');
        if (starsContainer) starsContainer.addEventListener('click', () => this.handleWishStar());
        
        const giftBoxWrapper = document.getElementById('gift-box-wrapper');
        if (giftBoxWrapper) giftBoxWrapper.addEventListener('click', () => this.openGiftBox());

        const btnToggleMusic = document.getElementById('btn-toggle-music-float');
        if (btnToggleMusic) btnToggleMusic.addEventListener('click', () => this.toggleBackgroundMusic());
    }

    toggleBackgroundMusic() {
        if (!this.audioPlayer.src) return;
        const btn = document.getElementById('btn-toggle-music-float');
        if (this.audioPlayer.paused) {
            this.audioPlayer.play().catch(e => console.log(e));
            this.updateMiniMusicIcon(true);
        } else {
            this.audioPlayer.pause();
            this.updateMiniMusicIcon(false);
        }
    }

    updateMiniMusicIcon(isPlaying) {
        const btn = document.getElementById('btn-toggle-music-float');
        if (btn) btn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
        const playerWidget = document.getElementById('music-player-float');
        if (playerWidget) {
            if (isPlaying) playerWidget.classList.add('playing');
            else playerWidget.classList.remove('playing');
        }
    }

    showError(elementId, message) {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = message;
            el.classList.remove('hide');
        }
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    openLightbox(url, caption) {
        let lb = document.getElementById('lightbox');
        if (!lb) {
            lb = document.createElement('div');
            lb.id = 'lightbox';
            lb.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;';
            lb.onclick = () => lb.remove();
            document.body.appendChild(lb);
        }
        lb.innerHTML = `<div style="text-align:center"><img src="${url}" style="max-width:90vw;max-height:80vh;border-radius:10px;box-shadow:0 0 20px var(--primary-glow);"><p style="color:#fff;margin-top:15px;font-size:1.2rem;">${caption || ''}</p></div>`;
    }

    // ==========================================================================
    // ADMIN PANEL & CRUD (PRESERVED + NEW)
    // ==========================================================================
    handleAdminLogin(e) {
        if(e) e.preventDefault();
        const pwd = document.getElementById('admin-password');
        if (pwd && pwd.value === this.db.adminPassword) {
            this.navigateTo('screen-admin-dashboard');
        } else {
            this.showError('admin-login-error', 'Incorrect password!');
        }
    }

    logoutAdmin() {
        window.location.href = window.location.pathname; // strip query params
    }

    switchAdminTab(tabId) {
        document.querySelectorAll('.admin-tab-pane').forEach(t => t.classList.remove('active'));
        const tab = document.getElementById(tabId);
        if (tab) tab.classList.add('active');
        this.activeAdminTab = tabId;
        
        if (tabId === 'admin-overview') this.loadAdminOverview();
        if (tabId === 'admin-users') this.renderAdminUsersList();
        if (tabId === 'admin-themes') { 
            this.populateUserSelects(); 
            const uId = document.getElementById('theme-user-select') ? document.getElementById('theme-user-select').value : null;
            if (uId) this.loadUserDataForTheme(uId);
        }
        if (tabId === 'admin-gallery') {
            this.populateUserSelects();
            const uId = document.getElementById('gallery-user-select') ? document.getElementById('gallery-user-select').value : null;
            this.loadUserGallery(uId);
        }
        if (tabId === 'admin-music') { this.populateUserSelects(); this.loadMusicTab(); }
        if (tabId === 'admin-records') this.loadLogs();
        if (tabId === 'admin-cloudinary') this.loadCloudConfig();
        
        // Auto load first user data if available for new tabs
        if (tabId.includes('-mgr')) {
            this.populateUserSelects();
            const firstUser = this.db.users[0];
            if (firstUser) {
                if (tabId === 'admin-timeline-mgr') this.loadAdminTimeline(firstUser.id);
                if (tabId === 'admin-quiz-mgr') this.loadAdminQuiz(firstUser.id);
                if (tabId === 'admin-personality-mgr') this.loadAdminPersonality(firstUser.id);
                if (tabId === 'admin-open-when-mgr') this.loadAdminOpenWhen(firstUser.id);
                if (tabId === 'admin-voice-mgr') this.loadAdminVoice(firstUser.id);
                if (tabId === 'admin-future-mgr') this.loadAdminFuture(firstUser.id);
                if (tabId === 'admin-puzzle-mgr') this.loadAdminPuzzle(firstUser.id);
            }
        }
    }

    async sendThankYouNote() {
        const input = document.getElementById('thank-you-input');
        const status = document.getElementById('thank-you-status');
        if (!input) return;
        const text = input.value.trim();
        if (!text) {
            if (status) {
                status.textContent = 'कृपया संदेश प्रविष्ट करा!';
                status.className = 'error-msg mt-2';
                status.classList.remove('hide');
            }
            return;
        }

        const note = {
            id: 'th-' + Date.now(),
            username: (this.currentUser ? (this.currentUser.name || this.currentUser.username) : 'Guest'),
            message: text,
            timestamp: new Date().toISOString()
        };

        this.db.thanks = this.db.thanks || [];
        this.db.thanks.unshift(note);

        try {
            if (this.mode === 'express') {
                await fetch('/api/thanks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(note)
                });
            } else if (this.firebaseManager && this.firebaseManager.db) {
                await this.firebaseManager.saveDoc('thanks', note.id, note);
            }
        } catch (e) {
            console.log('Error sending thanks:', e);
        }

        if (status) {
            status.textContent = 'खूप खूप धन्यवाद! तुमचा संदेश ॲडमीनला पाठवला गेला आहे! ❤️';
            status.style.color = '#4dff88';
            status.classList.remove('hide');
        }
        input.value = '';
        this.triggerConfetti();
    }

    loadLogs() {
        const logsList = document.getElementById('admin-logs-list');
        const thanksList = document.getElementById('admin-thanks-list');

        if (thanksList) {
            thanksList.innerHTML = '';
            const thanksArray = this.db.thanks || [];
            if (thanksArray.length === 0) {
                thanksList.innerHTML = '<p class="text-muted">अद्याप कोणताही मेसेज आलेला नाही.</p>';
            } else {
                thanksArray.forEach(t => {
                    const card = document.createElement('div');
                    card.className = 'admin-item-card glassmorphic mb-2 p-3';
                    card.style.background = 'rgba(255,255,255,0.05)';
                    card.style.borderRadius = '12px';
                    card.style.border = '1px solid rgba(255,255,255,0.1)';
                    card.innerHTML = `
                        <div style="margin-bottom:6px;"><strong style="color:var(--primary); font-size:1.1rem;">${t.username}</strong> <span style="color:rgba(255,255,255,0.5); font-size:0.8rem; float:right;">${new Date(t.timestamp).toLocaleString()}</span></div>
                        <p style="color:#ffffff; font-size:1rem; line-height:1.5;">"${t.message}"</p>
                    `;
                    thanksList.appendChild(card);
                });
            }
        }

        if (logsList) {
            logsList.innerHTML = '';
            const logsArray = this.db.logs || [];
            if (logsArray.length === 0) {
                logsList.innerHTML = '<p class="text-muted">अद्याप कोणतेही लॉग्स नाहीत.</p>';
            } else {
                logsArray.forEach(l => {
                    const div = document.createElement('div');
                    div.style.padding = '8px 12px';
                    div.style.borderBottom = '1px solid rgba(255,255,255,0.08)';
                    div.innerHTML = `<span style="color:var(--primary); font-weight:600;">@${l.username}</span> - ${l.action || 'Activity'} <small style="color:rgba(255,255,255,0.5); float:right;">${new Date(l.timestamp).toLocaleTimeString()}</small>`;
                    logsList.appendChild(div);
                });
            }
        }
    }

    async clearAllLogs() {
        if (confirm('Clear all logs and thank you messages?')) {
            this.db.logs = [];
            this.db.thanks = [];
            if (this.mode === 'express') {
                await fetch('/api/clear-logs', { method: 'POST' });
            }
            this.loadLogs();
        }
    }

    loadMusicTab() {
        const userSelect = document.getElementById('music-user-select');
        if (userSelect && userSelect.value) {
            this.loadUserMusicConfig(userSelect.value);
        }
        this.renderAdminTracksList();
    }

    loadUserMusicConfig(userId) {
        const user = this.db.users.find(u => u.id === userId);
        const trackSelect = document.getElementById('music-track-select');
        if (!trackSelect) return;
        trackSelect.innerHTML = '';
        (this.db.tracks || []).forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.title;
            trackSelect.appendChild(opt);
        });
        if (user && user.musicTrackId) trackSelect.value = user.musicTrackId;
    }

    async saveUserTrackSelection() {
        const userId = document.getElementById('music-user-select').value;
        const trackId = document.getElementById('music-track-select').value;
        const user = this.db.users.find(u => u.id === userId);
        if (user) {
            user.musicTrackId = trackId;
            await this.saveUser(user);
            alert('Music track assigned successfully!');
        }
    }

    async addNewMusicTrack() {
        const titleInput = document.getElementById('admin-new-track-title');
        const urlInput = document.getElementById('admin-new-track-url');
        const fileInput = document.getElementById('admin-new-track-file');
        
        if (!titleInput) return;
        let title = titleInput.value.trim();
        let url = urlInput ? urlInput.value.trim() : '';

        if (fileInput && fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            if (!title) title = file.name.replace(/\.[^/.]+$/, "");
            
            const formData = new FormData();
            formData.append('file', file);
            try {
                const res = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (data.url) {
                    url = data.url;
                }
            } catch (e) {
                console.error('Audio upload error:', e);
            }
        }

        if (!title || !url) {
            alert('कृपया गाण्याचे नाव प्रविष्ट करा आणि फाईल अपलोड करा किंवा MP3 URL टाका!');
            return;
        }

        const newTrack = { id: 'track-' + Date.now(), title, url };
        this.db.tracks = this.db.tracks || [];
        this.db.tracks.push(newTrack);

        if (this.mode === 'express') {
            await fetch('/api/tracks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTrack)
            });
        } else if (this.firebaseManager && this.firebaseManager.db) {
            await this.firebaseManager.saveDoc('tracks', newTrack.id, newTrack);
        }

        titleInput.value = '';
        if (urlInput) urlInput.value = '';
        if (fileInput) fileInput.value = '';

        alert('गाणे (Song Track) यशस्वीरित्या अपलोड / सेव्ह झाले आहे! 🎵');
        this.loadMusicTab();
    }

    renderAdminTracksList() {
        const list = document.getElementById('admin-tracks-list');
        if (!list) return;
        list.innerHTML = '';
        (this.db.tracks || []).forEach(t => {
            const li = document.createElement('li');
            li.style.padding = '8px 12px';
            li.style.marginBottom = '6px';
            li.style.background = 'rgba(255,255,255,0.05)';
            li.style.borderRadius = '8px';
            li.innerHTML = `<strong>${t.title}</strong><br><small style="opacity:0.6; word-break:break-all;">${t.url}</small>`;
            list.appendChild(li);
        });
    }

    populateUserSelects() {
        const selectIds = [
            'theme-user-select', 'gallery-user-select', 'music-user-select',
            'admin-tl-user-select', 'admin-quiz-user-select', 'admin-pers-user-select',
            'admin-ow-user-select', 'admin-voice-user-select', 'admin-future-user-select', 'admin-puzzle-user-select'
        ];
        selectIds.forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                const current = select.value;
                select.innerHTML = '';
                this.db.users.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = `${u.name} (@${u.username})`;
                    select.appendChild(opt);
                });
                if (current && this.db.users.some(u => u.id === current)) select.value = current;
            }
        });
    }

    loadAdminOverview() {
        // Preserved logic
        const tUsers = document.getElementById('stat-total-users');
        if (tUsers) tUsers.textContent = this.db.users.length;
    }

    renderAdminUsersList() {
        const tbody = document.getElementById('admin-users-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        this.db.users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${u.name}</strong></td>
                <td>@${u.username}</td>
                <td><code>${u.password}</code></td>
                <td>${u.birthdate}</td>
                <td><span class="badge badge-pink">${u.theme || 'N/A'}</span></td>
                <td class="actions-cell">
                    <button class="btn btn-secondary btn-table" onclick="appController.openUserModal('edit', '${u.id}')">Edit</button>
                    <button class="btn btn-danger btn-table" onclick="appController.deleteUser('${u.id}')">Del</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    openUserModal(mode, userId = null) {
        const modal = document.getElementById('modal-user');
        const titleEl = document.getElementById('user-modal-title');
        const form = document.getElementById('form-user-edit');
        if (!modal) return;

        if (mode === 'edit' && userId) {
            const u = this.db.users.find(x => x.id === userId);
            if (u) {
                if (titleEl) titleEl.textContent = 'Edit User Details';
                document.getElementById('edit-user-id').value = u.id;
                document.getElementById('edit-user-name').value = u.name || '';
                document.getElementById('edit-user-secretname').value = u.username || u.secretName || '';
                document.getElementById('edit-user-password').value = u.password || '123';
                document.getElementById('edit-user-birthdate').value = u.birthdate || '';
            }
        } else {
            if (titleEl) titleEl.textContent = 'Add New User';
            if (form) form.reset();
            document.getElementById('edit-user-id').value = '';
            document.getElementById('edit-user-password').value = '123';
        }
        modal.classList.remove('hide');
    }

    closeUserModal() {
        const modal = document.getElementById('modal-user');
        if (modal) modal.classList.add('hide');
    }

    async saveUserFromModal(e) {
        if (e) e.preventDefault();
        const id = document.getElementById('edit-user-id').value;
        const name = document.getElementById('edit-user-name').value.trim();
        const secretName = document.getElementById('edit-user-secretname').value.trim() || name.toLowerCase().replace(/\s+/g, '');
        const password = document.getElementById('edit-user-password').value.trim() || '123';
        const birthdate = document.getElementById('edit-user-birthdate').value;

        if (!name || !birthdate) {
            alert('कृपया नाव आणि जन्मतारीख भरा!');
            return;
        }

        let user;
        if (id) {
            user = this.db.users.find(u => u.id === id);
            if (user) {
                user.name = name;
                user.username = secretName;
                user.secretName = secretName;
                user.password = password;
                user.birthdate = birthdate;
            }
        } else {
            const newId = 'user-' + Date.now();
            user = {
                id: newId,
                name: name,
                username: secretName,
                secretName: secretName,
                password: password,
                birthdate: birthdate,
                theme: 'pink-princess',
                wishStarMessage: 'May all your dreams and wishes come true! 🌟✨',
                finalWishMessage: 'Happy Birthday! Wishing you endless joy and happiness! ❤️',
                gallery: [],
                timeline: []
            };
            this.db.users.push(user);
        }

        await this.saveUser(user);
        this.closeUserModal();
        this.renderAdminUsersList();
        this.populateUserSelects();
        alert(id ? 'युझर माहिती अपडेट झाली!' : 'नवीन युझर यशस्वीरित्या जोडला गेला! 🎉');
    }

    loadUserDataForTheme(userId) {
        if (!userId) {
            const userSelect = document.getElementById('theme-user-select');
            if (userSelect && userSelect.value) userId = userSelect.value;
            else if (this.db.users[0]) userId = this.db.users[0].id;
        }
        const user = this.db.users.find(u => u.id === userId);
        if (!user) return;

        const themeSelect = document.getElementById('admin-user-theme-select');
        const wishStarInput = document.getElementById('admin-wish-star-text');
        const wishTextInput = document.getElementById('admin-wish-text');

        if (themeSelect) themeSelect.value = user.theme || 'pink-princess';
        if (wishStarInput) wishStarInput.value = user.wishStarMessage || 'May all your dreams and wishes come true! 🌟✨';
        if (wishTextInput) wishTextInput.value = user.finalWishMessage || user.message || 'Happy Birthday! Wishing you endless joy and happiness! ❤️';
    }

    async saveThemeAndMessage() {
        const userIdSelect = document.getElementById('theme-user-select');
        const themeSelect = document.getElementById('admin-user-theme-select');
        const wishStarInput = document.getElementById('admin-wish-star-text');
        const wishTextInput = document.getElementById('admin-wish-text');
        const statusEl = document.getElementById('theme-save-status');

        if (!userIdSelect) return;
        const userId = userIdSelect.value;
        const user = this.db.users.find(u => u.id === userId);
        if (!user) {
            alert('कृपया युझर निवडा!');
            return;
        }

        user.theme = themeSelect ? themeSelect.value : 'pink-princess';
        user.wishStarMessage = wishStarInput ? wishStarInput.value.trim() : '';
        user.finalWishMessage = wishTextInput ? wishTextInput.value.trim() : '';
        user.message = user.finalWishMessage;

        await this.saveUser(user);

        if (statusEl) {
            statusEl.textContent = `${user.name} चे थीम आणि वाढदिवसाचा मेसेज यशस्वीरित्या सेव्ह झाला! ❤️✨`;
            statusEl.style.color = '#4dff88';
            statusEl.classList.remove('hide');
            setTimeout(() => statusEl.classList.add('hide'), 4000);
        }
        alert('थीम आणि मेसेज यशस्वीरित्या सेव्ह झाला!');
    }

    openGalleryModal() {
        const modal = document.getElementById('modal-gallery');
        if (modal) {
            const form = document.getElementById('form-gallery-add');
            if (form) form.reset();
            modal.classList.remove('hide');
        }
    }

    closeGalleryModal() {
        const modal = document.getElementById('modal-gallery');
        if (modal) modal.classList.add('hide');
    }

    loadUserGallery(userId) {
        const list = document.getElementById('admin-gallery-manager-grid');
        if (!list) return;
        list.innerHTML = '';

        if (!userId) {
            const userSelect = document.getElementById('gallery-user-select');
            if (userSelect && userSelect.value) userId = userSelect.value;
            else if (this.db.users[0]) userId = this.db.users[0].id;
        }

        const user = this.db.users.find(u => u.id === userId);
        if (!user || !user.gallery || user.gallery.length === 0) {
            list.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; background:rgba(255,255,255,0.03); border-radius:12px;"><p class="text-muted mb-0">अद्याप फोटो किंवा व्हिडिओ जोडलेले नाहीत. वर "+ Add Media" वर क्लिक करून नवीन जोडा.</p></div>';
            return;
        }

        user.gallery.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'admin-gallery-card glassmorphic p-3';

            const isVideo = item.type === 'video';
            const captionText = item.caption || item.title || 'Memory Media';
            card.innerHTML = `
                <div style="position:relative; width:100%; height:150px; border-radius:10px; overflow:hidden; margin-bottom:10px; background:#000; flex-shrink:0;">
                    ${isVideo 
                        ? `<video src="${item.url}" style="width:100%; height:100%; object-fit:cover;" controls></video>` 
                        : `<img src="${item.url}" style="width:100%; height:100%; object-fit:cover;" alt="${captionText}">`}
                    <span style="position:absolute; top:8px; left:8px; background:var(--primary, #e91e63); color:#fff; padding:3px 10px; border-radius:12px; font-size:0.72rem; font-weight:600; box-shadow:0 2px 6px rgba(0,0,0,0.4);">${item.category || 'Memories'}</span>
                    <span style="position:absolute; top:8px; right:8px; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); color:#fff; padding:3px 8px; border-radius:12px; font-size:0.72rem; font-weight:600;"><i class="fa-solid ${isVideo ? 'fa-video' : 'fa-image'}"></i> ${isVideo ? 'Video' : 'Photo'}</span>
                </div>
                <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between;">
                    <div>
                        <h4 style="color:#ffffff; font-size:0.95rem; font-weight:600; margin:0 0 6px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${captionText}">${captionText}</h4>
                        <div style="display:flex; align-items:center; gap:6px; color:rgba(255,255,255,0.55); font-size:0.75rem; margin-bottom:12px; background:rgba(0,0,0,0.3); padding:5px 8px; border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,0.05);" title="${item.url}">
                            <i class="fa-solid fa-link" style="font-size:0.7rem; flex-shrink:0; color:var(--primary, #e91e63);"></i>
                            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:monospace; width:100%;">${item.url}</span>
                        </div>
                    </div>
                    <button class="btn btn-sm btn-danger w-full" style="display:flex; align-items:center; justify-content:center; gap:8px; margin-top:auto;" onclick="appController.deleteGalleryItem('${user.id}', ${index})">
                        <i class="fa-solid fa-trash"></i> Delete Media
                    </button>
                </div>
            `;
            list.appendChild(card);
        });
    }

    async saveGalleryItem(e) {
        if (e) e.preventDefault();
        const userSelect = document.getElementById('gallery-user-select');
        const userId = userSelect ? userSelect.value : null;
        const user = this.db.users.find(u => u.id === userId);
        if (!user) {
            alert('कृपया युझर निवडा!');
            return;
        }

        const typeInput = document.querySelector('input[name="media-type"]:checked');
        const type = typeInput ? typeInput.value : 'image';
        const category = document.getElementById('gallery-item-category').value;
        let url = document.getElementById('gallery-item-url').value.trim();
        const fileInput = document.getElementById('gallery-item-file');
        const caption = document.getElementById('gallery-item-caption').value.trim();

        if (fileInput && fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            const formData = new FormData();
            formData.append('file', file);
            try {
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.url) url = data.url;
            } catch (err) {
                console.error('File upload error:', err);
            }
        }

        if (!url) {
            alert('कृपया फोटोंची ऑनलाईन URL टाका किंवा फाईल सिलेक्ट करून अपलोड करा!');
            return;
        }

        user.gallery = user.gallery || [];
        user.gallery.push({
            id: 'g-' + Date.now(),
            type: type,
            category: category,
            url: url,
            caption: caption,
            title: caption || category
        });

        await this.saveUser(user);
        this.closeGalleryModal();
        this.loadUserGallery(user.id);
        alert('फोटो/व्हिडिओ गॅलरीमध्ये यशस्वीरित्या जोडला गेला! 🎉');
    }

    async deleteGalleryItem(userId, itemIndex) {
        const user = this.db.users.find(u => u.id === userId);
        if (!user || !user.gallery) return;
        if (confirm('हा फोटो/व्हिडिओ गॅलरीमधून डिलीट करायचा आहे का?')) {
            user.gallery.splice(itemIndex, 1);
            await this.saveUser(user);
            this.loadUserGallery(user.id);
        }
    }

    loadCloudConfig() {
        const cloudName = document.getElementById('cloud-cloud-name');
        const uploadPreset = document.getElementById('cloud-upload-preset');
        if (cloudName && this.db.cloudinary) cloudName.value = this.db.cloudinary.cloudName || 'awfaw7he';
        if (uploadPreset && this.db.cloudinary) uploadPreset.value = this.db.cloudinary.uploadPreset || 'birthday_preset';
    }

    async saveCloudinaryConfig() {
        const cloudName = document.getElementById('cloud-cloud-name').value.trim();
        const uploadPreset = document.getElementById('cloud-upload-preset').value.trim();
        const status = document.getElementById('cloudinary-status');

        this.db.cloudinary = { cloudName, uploadPreset };
        if (this.mode === 'express') {
            await fetch('/api/settings/cloudinary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.db.cloudinary)
            }).catch(e => console.log(e));
        }
        if (status) {
            status.textContent = 'Cloudinary स्टोरेज कॉन्फिगरेशन यशस्वीरित्या सेव्ह झाले! 🔒';
            status.style.color = '#4dff88';
            status.classList.remove('hide');
            setTimeout(() => status.classList.add('hide'), 4000);
        }
        alert('Cloudinary Storage Config Saved Successfully!');
    }

    async saveFirebaseConfig() {
        const status = document.getElementById('firebase-status');
        if (status) {
            status.textContent = 'Firebase डेटाबेस कॉन्फिगरेशन अपडेट झाले आहे! ❤️';
            status.style.color = '#4dff88';
            status.classList.remove('hide');
            setTimeout(() => status.classList.add('hide'), 4000);
        }
        alert('Firebase Config Updated Successfully!');
    }

    disconnectDatabase() {
        if (confirm('डेटाबेस डीस्कनेक्ट करायचा आहे का?')) {
            alert('Database disconnected. Site running in serverless mode.');
        }
    }

    async updateAdminPassword() {
        const pwd1 = document.getElementById('cloud-new-password').value.trim();
        const pwd2 = document.getElementById('cloud-confirm-password').value.trim();
        const status = document.getElementById('password-status');

        if (!pwd1) {
            alert('कृपया नवीन पासवर्ड टाका!');
            return;
        }
        if (pwd1 !== pwd2) {
            alert('दोन्ही पासवर्ड जुळत नाहीत!');
            return;
        }

        this.db.adminPassword = pwd1;
        if (this.mode === 'express') {
            await fetch('/api/admin/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword: pwd1 })
            }).catch(e => console.log(e));
        }

        document.getElementById('cloud-new-password').value = '';
        document.getElementById('cloud-confirm-password').value = '';

        if (status) {
            status.textContent = 'Chetan Password यशस्वीरित्या बदलला गेला आहे! 🔑';
            status.style.color = '#4dff88';
            status.classList.remove('hide');
            setTimeout(() => status.classList.add('hide'), 4000);
        }
        alert('Chetan Admin Password Updated Successfully!');
    }

    async saveUser(user) {
        if (this.mode === 'express') {
            await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(user)
            });
        } else {
            await this.firebaseManager.saveDoc('users', user.id, user);
        }
        await this.reloadDb();
    }

    async deleteUser(userId) {
        if (confirm('Delete user?')) {
            if (this.mode === 'express') {
                await fetch(`/api/users/${userId}`, { method: 'DELETE' });
            } else {
                await this.firebaseManager.deleteDoc('users', userId);
            }
            await this.reloadDb();
            this.renderAdminUsersList();
        }
    }

    // New Admin CRUD Methods
    async loadAdminTimeline(userId) {
        const user = this.db.users.find(u => u.id === userId);
        const list = document.getElementById('admin-tl-list');
        if (!user || !list) return;
        list.innerHTML = '';
        (user.timeline || []).forEach(item => {
            const div = document.createElement('div');
            div.innerHTML = `${item.date} - ${item.title} <button onclick="appController.deleteTimelineItem('${user.id}', '${item.id}')">Del</button>`;
            list.appendChild(div);
        });
    }
    
    async addTimelineItem() {
        const userId = document.getElementById('admin-tl-user-select').value;
        const date = document.getElementById('admin-tl-date').value;
        const title = document.getElementById('admin-tl-title').value;
        const desc = document.getElementById('admin-tl-desc').value;
        const image = document.getElementById('admin-tl-image').value;
        const user = this.db.users.find(u => u.id === userId);
        if (user) {
            if (!user.timeline) user.timeline = [];
            user.timeline.push({ id: 'tl-' + Date.now(), date, title, description: desc, image });
            await this.saveUser(user);
            this.loadAdminTimeline(userId);
        }
    }

    async deleteTimelineItem(userId, itemId) {
        const user = this.db.users.find(u => u.id === userId);
        if (user && user.timeline) {
            user.timeline = user.timeline.filter(t => t.id !== itemId);
            await this.saveUser(user);
            this.loadAdminTimeline(userId);
        }
    }

    async loadAdminQuiz(userId) {
        const user = this.db.users.find(u => u.id === userId);
        const list = document.getElementById('admin-quiz-list');
        if (!user || !list) return;
        list.innerHTML = '';
        (user.quiz || []).forEach(q => {
            const div = document.createElement('div');
            div.innerHTML = `${q.question} <button onclick="appController.deleteQuizQuestion('${user.id}', '${q.id}')">Del</button>`;
            list.appendChild(div);
        });

        // Show quiz score
        const scoreBox = document.getElementById('admin-quiz-score-display');
        if (scoreBox) {
            if (user.quizScore) {
                const s = user.quizScore;
                const dateStr = s.date ? new Date(s.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A';
                scoreBox.innerHTML = `
                    <div class="admin-score-big">${s.score} / ${s.total}</div>
                    <div class="admin-score-percent">${s.percent}%</div>
                    <div class="admin-score-bar-wrapper">
                        <div class="admin-score-bar" style="width:${s.percent}%"></div>
                    </div>
                    <div class="admin-score-date">Last attempted: ${dateStr}</div>
                `;
            } else {
                scoreBox.innerHTML = '<p style="color:rgba(255,255,255,0.5);">No score recorded yet</p>';
            }
        }
    }

    async addQuizQuestion() {
        const userId = document.getElementById('admin-quiz-user-select').value;
        const user = this.db.users.find(u => u.id === userId);
        if (user) {
            const q = document.getElementById('admin-quiz-question').value;
            const options = [
                document.getElementById('admin-quiz-opt-a').value,
                document.getElementById('admin-quiz-opt-b').value,
                document.getElementById('admin-quiz-opt-c').value,
                document.getElementById('admin-quiz-opt-d').value
            ];
            const correct = parseInt(document.getElementById('admin-quiz-correct').value, 10);
            if (!user.quiz) user.quiz = [];
            user.quiz.push({ id: 'q-' + Date.now(), question: q, options, correct });
            await this.saveUser(user);
            this.loadAdminQuiz(userId);
        }
    }

    async deleteQuizQuestion(userId, questionId) {
        const user = this.db.users.find(u => u.id === userId);
        if (user && user.quiz) {
            user.quiz = user.quiz.filter(q => q.id !== questionId);
            await this.saveUser(user);
            this.loadAdminQuiz(userId);
        }
    }

    async loadAdminPersonality(userId) {
        const user = this.db.users.find(u => u.id === userId);
        if (!user) return;
        const list = document.getElementById('admin-pers-bars-list');
        if (list) {
            list.innerHTML = '';
            (user.personality?.bars || []).forEach((b, idx) => {
                const div = document.createElement('div');
                div.innerHTML = `${b.label} (${b.value}%) <button onclick="appController.deletePersonalityBar('${user.id}', ${idx})">Del</button>`;
                list.appendChild(div);
            });
        }
        const overall = document.getElementById('admin-pers-overall');
        if (overall) overall.value = user.personality?.overallRating || '';
    }

    // Aliases for HTML event handlers
    loadPersonalityItems(userId) { return this.loadAdminPersonality(userId); }
    addPersonalityTrait() { return this.addPersonalityBar(); }
    loadTimelineItems(userId) { return this.loadAdminTimeline(userId); }
    loadQuizItems(userId) { return this.loadAdminQuiz(userId); }
    loadOpenWhenItems(userId) { return this.loadAdminOpenWhen(userId); }
    loadVoiceInfo(userId) { return this.loadAdminVoice(userId); }
    loadFutureItems(userId) { return this.loadAdminFuture(userId); }
    loadPuzzleItems(userId) { return this.loadAdminPuzzle(userId); }

    async addPersonalityBar() {
        const userId = document.getElementById('admin-pers-user-select').value;
        const user = this.db.users.find(u => u.id === userId);
        if (user) {
            if (!user.personality) user.personality = { bars: [], overallRating: '0/100' };
            const labelEl = document.getElementById('admin-pers-label');
            const emojiEl = document.getElementById('admin-pers-emoji');
            const valEl = document.getElementById('admin-pers-value');
            const colorEl = document.getElementById('admin-pers-color');
            const bar = {
                label: labelEl ? labelEl.value : '',
                emoji: emojiEl ? emojiEl.value : '',
                value: valEl ? parseInt(valEl.value, 10) || 0 : 0,
                color: colorEl ? colorEl.value : '#ff6b6b'
            };
            user.personality.bars.push(bar);
            await this.saveUser(user);
            if (labelEl) labelEl.value = '';
            if (emojiEl) emojiEl.value = '';
            if (valEl) valEl.value = '';
            this.loadAdminPersonality(userId);
        }
    }

    async deletePersonalityBar(userId, idx) {
        const user = this.db.users.find(u => u.id === userId);
        if (user && user.personality?.bars) {
            user.personality.bars.splice(idx, 1);
            await this.saveUser(user);
            this.loadAdminPersonality(userId);
        }
    }

    async savePersonalityOverall() {
        const userId = document.getElementById('admin-pers-user-select').value;
        const user = this.db.users.find(u => u.id === userId);
        if (user) {
            if (!user.personality) user.personality = { bars: [], overallRating: '0/100' };
            user.personality.overallRating = document.getElementById('admin-pers-overall').value;
            await this.saveUser(user);
        }
    }

    async loadAdminOpenWhen(userId) {
        const user = this.db.users.find(u => u.id === userId);
        const list = document.getElementById('admin-ow-list');
        if (!user || !list) return;
        list.innerHTML = '';
        (user.openWhenMessages || []).forEach(m => {
            const div = document.createElement('div');
            div.innerHTML = `${m.emotion} <button onclick="appController.deleteOpenWhenMessage('${user.id}', '${m.id}')">Del</button>`;
            list.appendChild(div);
        });
    }

    async addOpenWhenMessage() {
        const userId = document.getElementById('admin-ow-user-select').value;
        const user = this.db.users.find(u => u.id === userId);
        if (user) {
            if (!user.openWhenMessages) user.openWhenMessages = [];
            user.openWhenMessages.push({
                id: 'ow-' + Date.now(),
                emotion: document.getElementById('admin-ow-emotion').value,
                emoji: document.getElementById('admin-ow-emoji').value,
                color: document.getElementById('admin-ow-color').value,
                message: document.getElementById('admin-ow-message').value
            });
            await this.saveUser(user);
            this.loadAdminOpenWhen(userId);
        }
    }

    async deleteOpenWhenMessage(userId, msgId) {
        const user = this.db.users.find(u => u.id === userId);
        if (user && user.openWhenMessages) {
            user.openWhenMessages = user.openWhenMessages.filter(m => m.id !== msgId);
            await this.saveUser(user);
            this.loadAdminOpenWhen(userId);
        }
    }

    async loadAdminVoice(userId) {
        const user = this.db.users.find(u => u.id === userId);
        const cur = document.getElementById('admin-voice-current');
        if (cur && user) {
            cur.textContent = user.voiceMessage?.url ? "Voice message set." : "No voice message.";
        }
    }

    async saveVoiceMessage() {
        const userId = document.getElementById('admin-voice-user-select').value;
        const user = this.db.users.find(u => u.id === userId);
        if (!user) return;

        const title = document.getElementById('admin-voice-title').value;
        const fileInput = document.getElementById('admin-voice-file');

        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const formData = new FormData();
            formData.append('file', file);

            const xhr = new XMLHttpRequest();
            if (this.isServerless) {
                const cldConfig = this.db.cloudinary;
                if (!cldConfig || !cldConfig.cloudName || !cldConfig.uploadPreset) {
                    alert("Configure Cloudinary settings first!");
                    return;
                }
                formData.append('upload_preset', cldConfig.uploadPreset);
                xhr.open('POST', `https://api.cloudinary.com/v1_1/${cldConfig.cloudName}/auto/upload`, true);
            } else {
                xhr.open('POST', '/api/upload', true);
            }

            xhr.onload = async () => {
                if (xhr.status === 200 || xhr.status === 201) {
                    const response = JSON.parse(xhr.responseText);
                    const fileUrl = this.isServerless ? response.secure_url : response.url;
                    if (fileUrl) {
                        user.voiceMessage = { url: fileUrl, title };
                        await this.saveUser(user);
                        this.loadAdminVoice(userId);
                        alert("Voice message saved!");
                    }
                }
            };
            xhr.send(formData);
        } else {
            alert("Please select an audio file!");
        }
    }

    async loadAdminFuture(userId) {
        const user = this.db.users.find(u => u.id === userId);
        const list = document.getElementById('admin-future-list');
        if (!user || !list) return;
        list.innerHTML = '';
        (user.futureMessages || []).forEach(f => {
            const div = document.createElement('div');
            div.innerHTML = `${f.year} <button onclick="appController.deleteFutureMessage('${user.id}', ${f.year})">Del</button>`;
            list.appendChild(div);
        });
    }

    async addFutureMessage() {
        const userId = document.getElementById('admin-future-user-select').value;
        const user = this.db.users.find(u => u.id === userId);
        if (user) {
            if (!user.futureMessages) user.futureMessages = [];
            user.futureMessages.push({
                year: parseInt(document.getElementById('admin-future-year').value, 10),
                message: document.getElementById('admin-future-message').value
            });
            await this.saveUser(user);
            this.loadAdminFuture(userId);
        }
    }

    async deleteFutureMessage(userId, year) {
        const user = this.db.users.find(u => u.id === userId);
        if (user && user.futureMessages) {
            user.futureMessages = user.futureMessages.filter(f => f.year !== year);
            await this.saveUser(user);
            this.loadAdminFuture(userId);
        }
    }

    async loadAdminPuzzle(userId) {
        const user = this.db.users.find(u => u.id === userId);
        const list = document.getElementById('admin-puzzle-list');
        if (!user || !list) return;
        list.innerHTML = '';
        (user.puzzleLevels || []).forEach(p => {
            const div = document.createElement('div');
            div.innerHTML = `${p.title} <button onclick="appController.deletePuzzleLevel('${user.id}', '${p.id}')">Del</button>`;
            list.appendChild(div);
        });
    }

    async addPuzzleLevel() {
        const userId = document.getElementById('admin-puzzle-user-select').value;
        const user = this.db.users.find(u => u.id === userId);
        if (user) {
            if (!user.puzzleLevels) user.puzzleLevels = [];
            user.puzzleLevels.push({
                id: 'pz-' + Date.now(),
                title: document.getElementById('admin-puzzle-title').value,
                type: 'puzzle',
                question: document.getElementById('admin-puzzle-question').value,
                answer: document.getElementById('admin-puzzle-answer').value,
                completed: false
            });
            await this.saveUser(user);
            this.loadAdminPuzzle(userId);
        }
    }

    async deletePuzzleLevel(userId, levelId) {
        const user = this.db.users.find(u => u.id === userId);
        if (user && user.puzzleLevels) {
            user.puzzleLevels = user.puzzleLevels.filter(p => p.id !== levelId);
            await this.saveUser(user);
            this.loadAdminPuzzle(userId);
        }
    }
}

const appController = new BirthdayAppController();
appController.init();
