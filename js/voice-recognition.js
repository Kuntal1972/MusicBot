/**
 * Voice Recognition Manager
 * MODE_ADD  → listens and adds recognised text as a song to the queue table
 * MODE_PLAY → listens and directly searches + plays the song or playlist
 */
class VoiceRecognitionManager {
    static MODE_ADD  = 'add';
    static MODE_PLAY = 'play';

    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.currentMode = null;

        this._onResult   = null;
        this._onStart    = null;
        this._onEnd      = null;
        this._onInterim  = null;
        this._onError    = null;

        this._supported = ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
    }

    get supported() { return this._supported; }

    onResult(cb)  { this._onResult  = cb; }
    onStart(cb)   { this._onStart   = cb; }
    onEnd(cb)     { this._onEnd     = cb; }
    onInterim(cb) { this._onInterim = cb; }
    onError(cb)   { this._onError   = cb; }

    startListening(mode) {
        if (!this._supported) {
            this._onError && this._onError('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
            return;
        }
        if (this.isListening) this.stopListening();

        this.currentMode = mode;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SR();
        this.recognition.lang = CONFIG.VOICE_LANGUAGE;
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => {
            this.isListening = true;
            this._onStart && this._onStart(mode);
        };

        this.recognition.onresult = (event) => {
            let interim = '';
            let final   = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) final += transcript;
                else interim += transcript;
            }
            if (interim) this._onInterim && this._onInterim(interim);
            if (final)   this._onResult  && this._onResult(final.trim(), mode);
        };

        this.recognition.onerror = (event) => {
            this.isListening = false;
            let msg = 'Voice recognition error';
            switch (event.error) {
                case 'no-speech':         msg = 'No speech detected. Please try again.'; break;
                case 'audio-capture':     msg = 'Microphone not found. Check your microphone.'; break;
                case 'not-allowed':       msg = 'Microphone permission denied.'; break;
                case 'network':           msg = 'Network error during voice recognition.'; break;
                case 'aborted':           return; // user-initiated stop, no error needed
            }
            this._onError && this._onError(msg);
            this._onEnd && this._onEnd();
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this._onEnd && this._onEnd();
        };

        this.recognition.start();
    }

    stopListening() {
        if (this.recognition) {
            try { this.recognition.abort(); } catch (_) {}
            this.recognition = null;
        }
        this.isListening = false;
    }

    /**
     * Parse a voice command for MODE_PLAY.
     * Returns { type: 'song'|'playlist', query: string }
     */
    static parsePlayCommand(text) {
        let t = text.trim().toLowerCase();

        // Strip leading "play" / "open" / "search"
        t = t.replace(/^(play|open|search for|search|put on|start)\s+/i, '');

        // Detect playlist keyword
        const isPlaylist = /\bplaylist\b/i.test(t);
        const query = t.replace(/\bplaylist\b/gi, '').trim();

        return { type: isPlaylist ? 'playlist' : 'song', query: query || text.trim() };
    }
}
