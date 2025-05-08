// app/static/js/utils/soundManager.js

// Assign the result of the IIFE directly to window.soundManager
window.soundManager = (function() { // Start of IIFE

    const SOUND_SETTINGS_KEY = 'winChallengeSoundSettings';
    let isMuted = false;
    let currentVolume = 0.4; // Default volume (0.0 to 1.0)
    let audioInstances = []; // Keep track of playing sounds

    /**
     * Loads settings from localStorage on initialization.
     */
    function loadSettings() {
        try {
            const savedSettings = localStorage.getItem(SOUND_SETTINGS_KEY);
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                isMuted = typeof settings.muted === 'boolean' ? settings.muted : false;
                currentVolume = typeof settings.volume === 'number' ? Math.max(0, Math.min(1, settings.volume)) : 0.75;
                console.log('SoundManager: Settings loaded', { isMuted, currentVolume });
            } else {
                 console.log('SoundManager: No saved settings found, using defaults.');
                 saveSettings(); // Save defaults if nothing was loaded
            }
        } catch (e) {
            console.error("SoundManager: Error loading settings from localStorage:", e);
            isMuted = false;
            currentVolume = 0.75;
        }
        // No need to call updateAudioInstances here unless sounds could exist before init
    }

    /**
     * Saves current settings to localStorage.
     */
    function saveSettings() {
        try {
            const settings = {
                muted: isMuted,
                volume: currentVolume
            };
            localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error("SoundManager: Error saving settings to localStorage:", e);
        }
    }

    /**
     * Updates the volume and muted state of all currently tracked audio instances.
     */
    function updateAudioInstances() {
        audioInstances = audioInstances.filter(audio => !audio.ended); // Clean up only finished sounds
        audioInstances.forEach(audio => {
            // Check if audio object still exists and has properties (robustness)
            if (audio && typeof audio.muted !== 'undefined' && typeof audio.volume !== 'undefined') {
                audio.muted = isMuted;
                // Only set volume if not muted, otherwise it stays at its previous non-zero level
                // Muting is handled by the 'muted' property itself
                if (!isMuted) {
                   audio.volume = currentVolume;
                }
                // If muted, browser handles silence regardless of volume property
            } else {
                console.warn("SoundManager: Found invalid audio instance during update.");
            }
        });
        // Filter again *after* potential errors
         audioInstances = audioInstances.filter(audio => audio && typeof audio.muted !== 'undefined');
    }


    /**
     * Plays a sound file.
     * @param {string} soundUrl - The URL/path to the sound file.
     * @param {boolean} [loop=false] - Whether the sound should loop.
     * @returns {Audio|null} The created Audio object or null on error.
     */
    function playSound(soundUrl, loop = false) {
        if (!soundUrl) {
            console.error("SoundManager: No sound URL provided.");
            return null;
        }
        try {
            const audio = new Audio(soundUrl);
            audio.loop = loop;
            // Apply current settings immediately BEFORE playing
            audio.volume = currentVolume; // Set intended volume
            audio.muted = isMuted;      // Set mute state

            const playPromise = audio.play();

            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log(`SoundManager: Playing ${soundUrl}`);
                    // Add AFTER successful play start
                    audioInstances.push(audio);
                    if (!loop) {
                        audio.addEventListener('ended', () => {
                            audioInstances = audioInstances.filter(a => a !== audio);
                        }, { once: true });
                    }
                 }).catch(error => {
                    console.error(`SoundManager: Error playing sound "${soundUrl}":`, error);
                 });
            } else {
                 // Fallback for older browsers - play might not throw error immediately
                 console.log(`SoundManager: Playing ${soundUrl} (no promise)`);
                 audioInstances.push(audio);
                 if (!loop) {
                    audio.addEventListener('ended', () => {
                        audioInstances = audioInstances.filter(a => a !== audio);
                    }, { once: true });
                 }
            }
            return audio;
        } catch (e) {
            console.error(`SoundManager: Failed to create or play sound "${soundUrl}":`, e);
            return null;
        }
    }

    /**
     * Sets the global volume.
     * @param {number} level - Volume level (0.0 to 1.0).
     */
    function setVolume(level) {
        currentVolume = Math.max(0, Math.min(1, level));
        // console.log('SoundManager: Volume set to', currentVolume); // Reduce console noise
        isMuted = currentVolume <= 0.01; // Mute if volume is effectively zero
        updateAudioInstances();
        saveSettings();
        document.dispatchEvent(new CustomEvent('soundSettingsChanged', { detail: { volume: currentVolume, muted: isMuted } }));
    }

    /**
     * Toggles the global mute state.
     */
    function toggleMute() {
        isMuted = !isMuted;
        // console.log('SoundManager: Mute toggled to', isMuted); // Reduce console noise
        updateAudioInstances();
        saveSettings();
        document.dispatchEvent(new CustomEvent('soundSettingsChanged', { detail: { volume: currentVolume, muted: isMuted } }));
    }

    /**
     * Gets the current volume.
     * @returns {number} Volume level (0.0 to 1.0).
     */
    function getVolume() {
        return currentVolume;
    }

    /**
     * Gets the current mute state.
     * @returns {boolean} True if muted, false otherwise.
     */
    function isGloballyMuted() {
        return isMuted;
    }

    // Load settings when the module's IIFE runs
    loadSettings();

    // --- This return statement MUST be inside the IIFE ---
    return {
        // init: loadSettings, // No real need to expose init if it runs automatically
        playSound,
        setVolume,
        toggleMute,
        getVolume,
        isMuted: isGloballyMuted
    };

})(); // End of IIFE and assignment to window.soundManager