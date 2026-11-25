(function () {
    /* ==========================================
       1. ENTERING ANIMATION (LANGSUNG JALAN)
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

    // Pengaman ganda
    setTimeout(closePreloader, 1600);

    /* ==========================================
       2. MANUAL AUDIO LOADER & REAL-TIME ANALYSER
    ========================================== */
    const manualAudioInput = document.getElementById('manual-audio-input');
    const loadTrackBtn = document.getElementById('load-track-btn');
    const uploadNavBtn = document.getElementById('upload-nav-btn');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const vinyl = document.getElementById('vinyl');
    const deckStatus = document.getElementById('deck-status');
    const currentTrackTitle = document.getElementById('current-track-title');
    const timeDisplay = document.getElementById('time-display');
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const volumeSlider = document.getElementById('volume-slider');
    const assignBtns = document.querySelectorAll('.assign-audio-btn');

    const audioPlayer = new Audio();
    audioPlayer.volume = 0.8;

    let audioCtx = null;
    let analyser = null;
    let dataArray = null;
    let sourceNode = null;
    let currentObjectURL = null;
    let selectedProjectContext = null;

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
        manualAudioInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            setupAudioContext();

            if (currentObjectURL) {
                URL.revokeObjectURL(currentObjectURL);
            }

            currentObjectURL = URL.createObjectURL(file);
            audioPlayer.src = currentObjectURL;

            const cleanFileName = file.name.replace(/\.[^/.]+$/, "");
            if (selectedProjectContext) {
                deckStatus.textContent = `PLAYING ON: ${selectedProjectContext.toUpperCase()}`;
                currentTrackTitle.textContent = cleanFileName;
            } else {
                deckStatus.textContent = 'MANUAL TRACK LOADED';
                currentTrackTitle.textContent = cleanFileName;
            }

            audioPlayer.play().then(() => {
                updatePlayState(true);
            }).catch(err => {
                console.error('Playback error:', err);
            });

            manualAudioInput.value = '';
        });
    }

    function updatePlayState(isPlaying) {
        if (isPlaying) {
            if (playPauseBtn) playPauseBtn.textContent = '❚❚ PAUSE';
            if (vinyl) vinyl.classList.add('spinning');
        } else {
            if (playPauseBtn) playPauseBtn.textContent = '▶ PLAY';
            if (vinyl) vinyl.classList.remove('spinning');
        }
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

    /* ==========================================
       3. REAL-TIME FREQUENCY VISUALIZER CANVAS
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
