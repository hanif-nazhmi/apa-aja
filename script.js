(function () {
    /* ==========================================
       1. ENTERING ANIMATION (ANTI-MACET)
    ========================================== */
    const preloader = document.getElementById('preloader');
    const loadPercent = document.getElementById('load-percent');

    function closePreloader() {
        if (!preloader || preloader.dataset.done === '1') return;
        preloader.dataset.done = '1';
        preloader.classList.add('fade-out');
        document.body.classList.add('loaded');
        setTimeout(() => {
            if (preloader && preloader.parentNode) {
                preloader.remove();
            }
        }, 900);
    }

    let progress = 0;
    const bootInterval = setInterval(() => {
        progress += 15;
        if (progress >= 100) {
            progress = 100;
            clearInterval(bootInterval);
            if (loadPercent) loadPercent.textContent = '100%';
            setTimeout(closePreloader, 250);
        } else {
            if (loadPercent) loadPercent.textContent = `${progress}%`;
        }
    }, 60);

    setTimeout(closePreloader, 1600);

    /* ==========================================
       2. INDEXEDDB STORAGE (SIMPAN, RENAME, HAPUS LAGU)
    ========================================== */
    const DB_NAME = 'NazhmiSonicDB';
    const STORE_NAME = 'savedTracks';
    let db = null;

    function openAudioDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };
            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    function saveTrackToDB(customName, blob, projectTag = '') {
        return new Promise((resolve, reject) => {
            if (!db) return reject('DB not initialized');
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const record = {
                name: customName,
                blob: blob,
                project: projectTag,
                createdAt: Date.now()
            };
            const req = store.add(record);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function getAllTracksFromDB() {
        return new Promise((resolve, reject) => {
            if (!db) return resolve([]);
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    function renameTrackInDB(id, newName) {
        return new Promise((resolve, reject) => {
            if (!db) return reject('DB not initialized');
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const data = getReq.result;
                if (!data) return resolve();
                data.name = newName;
                const putReq = store.put(data);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            };
        });
    }

    function deleteTrackFromDB(id) {
        return new Promise((resolve, reject) => {
            if (!db) return reject('DB not initialized');
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    /* ==========================================
       3. AUDIO PLAYER, LIBRARY UI & ANALYSER
    ========================================== */
    const manualAudioInput = document.getElementById('manual-audio-input');
    const loadTrackBtn = document.getElementById('load-track-btn');
    const uploadNavBtn = document.getElementById('upload-nav-btn');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const vinyl = document.getElementById('vinyl');
    const cyberEmblem = document.getElementById('cyber-emblem');
    const deckStatus = document.getElementById('deck-status');
    const currentTrackTitle = document.getElementById('current-track-title');
    const timeDisplay = document.getElementById('time-display');
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const volumeSlider = document.getElementById('volume-slider');
    const assignBtns = document.querySelectorAll('.assign-audio-btn');
    const savedTracksList = document.getElementById('saved-tracks-list');
    const savedCount = document.getElementById('saved-count');

    const audioPlayer = new Audio();
    audioPlayer.volume = 0.8;

    let audioCtx = null;
    let analyser = null;
    let dataArray = null;
    let sourceNode = null;
    let currentObjectURL = null;
    let selectedProjectContext = null;
    let activeTrackId = null;

    function setupAudioContext() {
        try {
            if (!audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) return;
                audioCtx = new AudioContextClass();
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 128;
                dataArray = new Uint8Array(analyser.frequencyBinCount);

                sourceNode = audioCtx.createMediaElementSource(audioPlayer);
                sourceNode.connect(analyser);
                analyser.connect(audioCtx.destination);
            }
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        } catch (err) {
            console.warn('AudioContext skipped:', err);
        }
    }

    function playTrackRecord(record, autoPlay = true) {
        if (!record || !record.blob) return;

        if (currentObjectURL) {
            URL.revokeObjectURL(currentObjectURL);
        }

        currentObjectURL = URL.createObjectURL(record.blob);
        audioPlayer.src = currentObjectURL;
        activeTrackId = record.id;

        deckStatus.textContent = record.project
            ? `PLAYING ON: ${record.project.toUpperCase()}`
            : 'SAVED TRACK ACTIVE';
        currentTrackTitle.textContent = record.name;

        renderSavedLibrary();

        if (autoPlay) {
            setupAudioContext();
            audioPlayer.play().then(() => {
                updatePlayState(true);
            }).catch(err => console.error('Playback error:', err));
        }
    }

    async function renderSavedLibrary(autoLoadFirst = false) {
        const tracks = await getAllTracksFromDB();
        if (savedCount) savedCount.textContent = `${tracks.length} TRACK${tracks.length === 1 ? '' : 'S'}`;

        if (!savedTracksList) return;
        savedTracksList.innerHTML = '';

        if (tracks.length === 0) {
            savedTracksList.innerHTML = '<div class="empty-library">Belum ada lagu tersimpan. Klik "📂 TAMBAH LAGU".</div>';
            return;
        }

        tracks.forEach(track => {
            const item = document.createElement('div');
            item.className = `saved-item ${track.id === activeTrackId ? 'playing-now' : ''}`;

            const mainArea = document.createElement('div');
            mainArea.className = 'saved-item-main';
            mainArea.innerHTML = `
                <span class="saved-play-icon">${track.id === activeTrackId && !audioPlayer.paused ? '❚❚' : '▶'}</span>
                <span class="saved-item-title">${track.name}</span>
                ${track.project ? `<span class="saved-item-tag">${track.project}</span>` : ''}
            `;
            mainArea.addEventListener('click', () => playTrackRecord(track, true));

            const actions = document.createElement('div');
            actions.className = 'saved-item-actions';

            const renameBtn = document.createElement('button');
            renameBtn.className = 'icon-btn rename-btn';
            renameBtn.title = 'Ganti Nama Lagu';
            renameBtn.textContent = '✎';
            renameBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const updatedName = prompt('Masukkan nama baru untuk lagu ini:', track.name);
                if (updatedName && updatedName.trim() !== '') {
                    await renameTrackInDB(track.id, updatedName.trim());
                    if (track.id === activeTrackId) {
                        currentTrackTitle.textContent = updatedName.trim();
                    }
                    renderSavedLibrary();
                }
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'icon-btn delete-btn';
            deleteBtn.title = 'Hapus Lagu';
            deleteBtn.textContent = '✕';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Hapus lagu "${track.name}" dari penyimpanan?`)) {
                    await deleteTrackFromDB(track.id);
                    if (track.id === activeTrackId) {
                        audioPlayer.pause();
                        audioPlayer.src = '';
                        activeTrackId = null;
                        deckStatus.textContent = 'NO DISC LOADED';
                        currentTrackTitle.textContent = 'Masukkan lagu MP3/WAV manual...';
                        progressFill.style.width = '0%';
                        timeDisplay.textContent = '00:00 / 00:00';
                        updatePlayState(false);
                    }
                    renderSavedLibrary();
                }
            });

            actions.appendChild(renameBtn);
            actions.appendChild(deleteBtn);
            item.appendChild(mainArea);
            item.appendChild(actions);
            savedTracksList.appendChild(item);
        });

        if (autoLoadFirst && tracks.length > 0 && !activeTrackId) {
            playTrackRecord(tracks[tracks.length - 1], false);
        }
    }

    function triggerFilePicker(projectName = null) {
        selectedProjectContext = projectName;
        if (manualAudioInput) manualAudioInput.click();
    }

    if (loadTrackBtn) loadTrackBtn.addEventListener('click', () => triggerFilePicker(null));
    if (uploadNavBtn) uploadNavBtn.addEventListener('click', () => triggerFilePicker(null));

    assignBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const parentItem = btn.closest('.track-item');
            document.querySelectorAll('.track-item').forEach(el => el.classList.remove('active-slot'));
            if (parentItem) {
                parentItem.classList.add('active-slot');
                triggerFilePicker(parentItem.getAttribute('data-project'));
            }
        });
    });

    if (manualAudioInput) {
        manualAudioInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const defaultName = file.name.replace(/\.[^/.]+$/, "");
            const userCustomName = prompt('Beri nama untuk lagu ini:', defaultName);
            const finalName = (userCustomName && userCustomName.trim() !== '') ? userCustomName.trim() : defaultName;

            const newId = await saveTrackToDB(finalName, file, selectedProjectContext || '');
            const allTracks = await getAllTracksFromDB();
            const savedRecord = allTracks.find(t => t.id === newId);

            if (savedRecord) {
                playTrackRecord(savedRecord, true);
            }

            manualAudioInput.value = '';
        });
    }

    function updatePlayState(isPlaying) {
        if (isPlaying) {
            if (playPauseBtn) playPauseBtn.textContent = '❚❚ PAUSE';
            if (vinyl) vinyl.classList.add('spinning');
            if (cyberEmblem) cyberEmblem.classList.add('music-active');
        } else {
            if (playPauseBtn) playPauseBtn.textContent = '▶ PLAY';
            if (vinyl) vinyl.classList.remove('spinning');
            if (cyberEmblem) cyberEmblem.classList.remove('music-active');
        }
        renderSavedLibrary();
    }

    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            if (!audioPlayer.src) {
                triggerFilePicker(null);
                return;
            }
            setupAudioContext();
            if (audioPlayer.paused) {
                audioPlayer.play();
                updatePlayState(true);
            } else {
                audioPlayer.pause();
                updatePlayState(false);
            }
        });
    }

    audioPlayer.addEventListener('ended', () => {
        updatePlayState(false);
        if (progressFill) progressFill.style.width = '0%';
    });

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            audioPlayer.volume = parseFloat(e.target.value);
        });
    }

    function formatTime(sec) {
        if (isNaN(sec)) return '00:00';
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = Math.floor(sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    audioPlayer.addEventListener('timeupdate', () => {
        const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100 || 0;
        if (progressFill) progressFill.style.width = `${percent}%`;
        if (timeDisplay) timeDisplay.textContent = `${formatTime(audioPlayer.currentTime)} / ${formatTime(audioPlayer.duration)}`;
    });

    if (progressContainer) {
        progressContainer.addEventListener('click', (e) => {
            if (!audioPlayer.duration) return;
            const rect = progressContainer.getBoundingClientRect();
            const clickRatio = (e.clientX - rect.left) / rect.width;
            audioPlayer.currentTime = clickRatio * audioPlayer.duration;
        });
    }

    // Muat daftar lagu tersimpan saat website dibuka
    openAudioDB().then(() => {
        renderSavedLibrary(true);
    }).catch(err => console.warn('IndexedDB unavailable:', err));

    /* ==========================================
       4. REAL-TIME FREQUENCY VISUALIZER CANVAS
    ========================================== */
    const canvas = document.getElementById('visualizer-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let width, height;

        function resizeCanvas() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        let idlePhase = 0;

        function renderVisualizer() {
            ctx.clearRect(0, 0, width, height);

            ctx.strokeStyle = 'rgba(0, 243, 255, 0.03)';
            ctx.lineWidth = 1;
            for (let x = 0; x < width; x += 65) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }

            if (analyser && dataArray && !audioPlayer.paused) {
                analyser.getByteFrequencyData(dataArray);
                const barCount = dataArray.length;
                const barWidth = (width / barCount) * 1.4;
                let x = 0;

                for (let i = 0; i < barCount; i++) {
                    const barHeight = (dataArray[i] / 255) * (height * 0.42);
                    const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
                    gradient.addColorStop(0, 'rgba(188, 19, 254, 0.35)');
                    gradient.addColorStop(1, 'rgba(0, 243, 255, 0.55)');

                    ctx.fillStyle = gradient;
                    ctx.fillRect(x, height - barHeight, barWidth - 3, barHeight);
                    x += barWidth;
                }
            } else {
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(0, 243, 255, 0.18)';
                ctx.lineWidth = 2;
                for (let x = 0; x < width; x += 5) {
                    const y = (height * 0.78) + Math.sin(x * 0.008 + idlePhase) * 18 * Math.sin((x / width) * Math.PI);
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
                idlePhase += 0.03;
            }

            requestAnimationFrame(renderVisualizer);
        }

        renderVisualizer();
    }
})();
