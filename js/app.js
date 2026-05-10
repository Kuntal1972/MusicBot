/**
 * MusicBotApp — main controller
 * Coordinates QueueManager, YouTubePlayerManager, VoiceRecognitionManager, CSVParser
 */
class MusicBotApp {
    constructor() {
        this.queue  = new QueueManager();
        this.ytPlayer = new YouTubePlayerManager();
        this.voice  = new VoiceRecognitionManager();
        this.csv    = new CSVParser();

        this.volume        = CONFIG.DEFAULT_VOLUME;
        this.isPlaying     = false;
        this.isPaused      = false;
        this.playingMode   = 'queue'; // 'queue' | 'playlist'
        this._toastTimer   = null;

        this._bindEvents();
        this._bindPlayerEvents();
        this._bindVoiceEvents();
        this._checkAPIKey();
        this._renderTable();
        this._updateControls();
        this._setStatusDot('', 'Initialising…');
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  INITIALISATION
    // ═══════════════════════════════════════════════════════════════════════
    _checkAPIKey() {
        const bad = !CONFIG.YOUTUBE_API_KEY ||
                    CONFIG.YOUTUBE_API_KEY === 'YOUR_YOUTUBE_DATA_API_V3_KEY_HERE';
        const el = document.getElementById('apiKeyWarning');
        el && (el.style.display = bad ? 'flex' : 'none');
        if (!this.voice.supported) {
            ['voiceAddBtn', 'voicePlayBtn'].forEach(id => {
                const b = document.getElementById(id);
                if (b) { b.disabled = true; b.title = 'Not supported in this browser'; }
            });
            this._showToast('Voice recognition requires Chrome or Edge.', 'warning', 5000);
        }
    }

    _bindEvents() {
        // ── Add song ──────────────────────────────────────────────────────
        this._on('addSongBtn',  'click',   () => this._handleAddSong());
        this._on('songInput',   'keydown', (e) => e.key === 'Enter' && this._handleAddSong());

        // ── CSV upload ────────────────────────────────────────────────────
        this._on('csvUpload', 'change', (e) => this._handleCSV(e));

        // ── Playlist ──────────────────────────────────────────────────────
        this._on('playPlaylistBtn', 'click',   () => this._handlePlayPlaylist());
        this._on('playlistInput',   'keydown', (e) => e.key === 'Enter' && this._handlePlayPlaylist());

        // ── Voice ─────────────────────────────────────────────────────────
        this._on('voiceAddBtn',  'click', () => this._startVoice(VoiceRecognitionManager.MODE_ADD));
        this._on('voicePlayBtn', 'click', () => this._startVoice(VoiceRecognitionManager.MODE_PLAY));
        this._on('cancelVoiceBtn', 'click', () => this._stopVoice());

        // ── Queue table actions ───────────────────────────────────────────
        this._on('masterCheckbox',  'change', (e) => { e.target.checked ? this.queue.selectAll() : this.queue.deselectAll(); this._renderTable(); });
        this._on('selectAllBtn',    'click',  () => { this.queue.selectAll();   this._renderTable(); });
        this._on('deselectAllBtn',  'click',  () => { this.queue.deselectAll(); this._renderTable(); });
        this._on('playSelectedBtn', 'click',  () => this._playSelected());
        this._on('clearAllBtn',     'click',  () => this._handleClearAll());

        // ── Player controls ───────────────────────────────────────────────
        this._on('playPauseBtn', 'click', () => this._togglePlayPause());
        this._on('resumeBtn',    'click', () => this._handleResume());
        this._on('stopBtn',      'click', () => this._handleStop());
        this._on('prevBtn',      'click', () => this._handlePrevious());
        this._on('nextBtn',      'click', () => this._handleNext());
        this._on('volDownBtn',   'click', () => this._adjustVolume(-CONFIG.VOLUME_STEP));
        this._on('volUpBtn',     'click', () => this._adjustVolume(CONFIG.VOLUME_STEP));
        this._on('volumeSlider', 'input', (e) => this._setVolume(parseInt(e.target.value)));
    }

    _bindPlayerEvents() {
        this.ytPlayer.onReady(() => {
            this.ytPlayer.setVolume(this.volume);
            this._setStatusDot('ready', 'Ready');
            this._showToast('YouTube player ready', 'success');
        });

        this.ytPlayer.onStateChange((state) => {
            const S = this.ytPlayer.STATE;
            if (state === S.PLAYING) {
                this.isPlaying = true; this.isPaused = false;
                this._setStatusDot('playing', 'Playing');
                // Update Now Playing title from the iframe player's video data
                try {
                    const data = this.ytPlayer.player.getVideoData();
                    if (data && data.title) this._updateNowPlaying(data.title, null, data.author || '');
                } catch (_) {}
            } else if (state === S.PAUSED) {
                this.isPlaying = false; this.isPaused = true;
                this._setStatusDot('paused', 'Paused');
            } else if (state === S.ENDED) {
                this.isPlaying = false; this.isPaused = false;
                this._setStatusDot('ready', 'Ready');
                if (this.playingMode === 'queue') {
                    // Stop first so YouTube doesn't auto-advance its search playlist
                    this.ytPlayer.stop();
                    this._autoNext();
                }
            } else if (state === S.BUFFERING) {
                this.isPlaying = true;
                this._setStatusDot('playing', 'Buffering…');
            }
            this._updatePlayPauseBtn();
        });

        this.ytPlayer.onError((msg, code) => {
            this._showToast(`Player error: ${msg}`, 'error');
            const cur = this.queue.getCurrentSong();
            if (cur) this.queue.setStatus(cur.id, 'error');
            this._renderTable();
            // auto-skip on unplayable video
            if ([100, 101, 150].includes(code)) {
                setTimeout(() => this._autoNext(), 1500);
            }
        });
    }

    _bindVoiceEvents() {
        this.voice.onStart((mode) => {
            this._showVoiceOverlay(mode);
        });

        this.voice.onInterim((text) => {
            const el = document.getElementById('voiceInterimText');
            if (el) el.textContent = text;
        });

        this.voice.onResult(async (text, mode) => {
            this._hideVoiceOverlay();
            if (mode === VoiceRecognitionManager.MODE_ADD) {
                await this._addSongToQueue(text, 'voice');
                this._showToast(`Voice added: "${text}"`, 'success');
            } else {
                await this._voiceDirectPlay(text);
            }
        });

        this.voice.onEnd(() => this._hideVoiceOverlay());

        this.voice.onError((msg) => {
            this._hideVoiceOverlay();
            this._showToast(msg, 'error');
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  SONG MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════
    _handleAddSong() {
        const input = document.getElementById('songInput');
        const title = input.value.trim();
        if (!title) { this._showToast('Please enter a song name', 'warning'); return; }
        this._addSongToQueue(title, 'manual');
        input.value = '';
    }

    _addSongToQueue(title, source = 'manual') {
        this.queue.addSong(title, null, source);
        this._renderTable();
    }

    async _handleCSV(event) {
        const file = event.target.files[0];
        if (!file) return;
        const statusEl = document.getElementById('csvStatus');
        statusEl.textContent = 'Parsing…';
        statusEl.className = 'status-badge info';
        statusEl.style.display = 'inline-block';
        try {
            const songs = await this.csv.parseFile(file);
            if (songs.length === 0) {
                this._showToast('No songs found in CSV file', 'warning');
                statusEl.textContent = 'No songs found';
                statusEl.className = 'status-badge warning';
                return;
            }
            songs.forEach(s => this.queue.addSong(s, null, 'csv'));
            this._renderTable();
            this._showToast(`${songs.length} song(s) imported from CSV`, 'success');
            statusEl.textContent = `${songs.length} imported`;
            statusEl.className = 'status-badge success';
        } catch (err) {
            this._showToast(`CSV error: ${err.message}`, 'error');
            statusEl.textContent = 'Error';
            statusEl.className = 'status-badge error';
        }
        // Reset so same file can be re-selected
        event.target.value = '';
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  PLAYBACK
    // ═══════════════════════════════════════════════════════════════════════
    async _playSelected() {
        const selected = this.queue.getSelected();
        if (selected.length === 0) {
            this._showToast('No songs selected. Check the boxes in the table.', 'warning');
            return;
        }
        this.playingMode = 'queue';
        this.queue.setPlaybackQueue(selected.map(s => s.id));
        const first = this.queue.startPlayback();
        if (first) await this._playQueueSong(first);
    }

    async _playQueueSong(song) {
        if (!song) return;
        console.log('[App] Playing song:', song.title, '| player ready:', this.ytPlayer.isReady);

        this.queue.songs.forEach(s => { if (s.status === 'playing') s.status = 'played'; });
        this.queue.setStatus(song.id, 'playing');
        this._renderTable();

        // Try Data API first for rich metadata; fall back to IFrame search (no key needed)
        const apiResult = await this.ytPlayer.searchVideo(song.title);
        if (apiResult) {
            console.log('[App] API result — videoId:', apiResult.videoId);
            this.queue.setVideoId(song.id, apiResult.videoId);
            song.videoId = apiResult.videoId;
            this._updateNowPlaying(apiResult.title, apiResult.thumbnail, apiResult.channelTitle);
            this.ytPlayer.loadVideo(apiResult.videoId);
        } else {
            // No API key or API failed → use YouTube IFrame built-in search (always works)
            console.log('[App] Using IFrame search fallback for:', song.title);
            this._updateNowPlaying(song.title, null, 'Searching…');
            this.ytPlayer.playBySearch(song.title);
        }
    }

    async _autoNext() {
        const cur = this.queue.getCurrentSong();
        if (cur && cur.status === 'playing') this.queue.setStatus(cur.id, 'played');
        const next = this.queue.advance();
        if (next) {
            await this._playQueueSong(next);
        } else {
            this._updateNowPlaying('Queue finished', null, '');
            this._showToast('Playback complete', 'info');
            this._renderTable();
        }
    }

    async _handleNext() {
        if (this.playingMode === 'playlist') { this.ytPlayer.next(); return; }
        const cur = this.queue.getCurrentSong();
        if (cur) this.queue.setStatus(cur.id, 'played');
        const next = this.queue.advance();
        if (next) await this._playQueueSong(next);
        else this._showToast('No next song', 'info');
    }

    async _handlePrevious() {
        if (this.playingMode === 'playlist') { this.ytPlayer.previous(); return; }
        const cur = this.queue.getCurrentSong();
        if (cur) this.queue.setStatus(cur.id, 'queued');
        const prev = this.queue.retreat();
        if (prev) await this._playQueueSong(prev);
        else this._showToast('No previous song', 'info');
    }

    _togglePlayPause() {
        const state = this.ytPlayer.getState();
        const S = this.ytPlayer.STATE;
        if (state === S.PLAYING || state === S.BUFFERING) {
            this.ytPlayer.pause();
            this._showToast('Paused', 'info', 1500);
        } else if (state === S.PAUSED || state === S.CUED) {
            this.ytPlayer.play();
            this._showToast('Resumed', 'info', 1500);
        }
        this._updatePlayPauseBtn();
    }

    _handleResume() {
        const state = this.ytPlayer.getState();
        const S = this.ytPlayer.STATE;
        if (state === S.PAUSED || state === S.CUED) {
            this.ytPlayer.play();
            this._showToast('Resumed', 'info', 1500);
        }
    }

    _handleStop() {
        this.ytPlayer.stop();
        this.isPlaying = false; this.isPaused = false;
        this._setStatusDot('ready', 'Stopped');
        // Reset all playing songs back to queued
        this.queue.songs.forEach(s => { if (s.status === 'playing') s.status = 'queued'; });
        this._renderTable();
        this._updateNowPlaying('Stopped', null, '');
        this._showToast('Stopped', 'info', 1500);
    }

    _adjustVolume(delta) {
        this._setVolume(this.volume + delta);
    }

    _setVolume(v) {
        this.volume = Math.max(0, Math.min(100, v));
        this.ytPlayer.setVolume(this.volume);
        const slider  = document.getElementById('volumeSlider');
        const display = document.getElementById('volumeDisplay');
        if (slider)  slider.value    = this.volume;
        if (display) display.textContent = `${this.volume}%`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  PLAYLIST
    // ═══════════════════════════════════════════════════════════════════════
    async _handlePlayPlaylist() {
        const input = document.getElementById('playlistInput').value.trim();
        if (!input) { this._showToast('Enter a playlist name or URL', 'warning'); return; }
        await this._playPlaylistByInput(input);
    }

    async _playPlaylistByInput(input) {
        this.playingMode = 'playlist';

        // Direct playlist ID or URL
        const directId = YouTubePlayerManager.extractPlaylistId(input);
        if (directId && !/\s/.test(input)) {
            this.ytPlayer.loadPlaylistById(directId);
            this._updateNowPlaying('Playlist', null, input);
            this._showToast('Playlist loaded', 'success');
            return;
        }

        // Try Data API for playlist ID
        const result = await this.ytPlayer.searchPlaylist(input);
        if (result) {
            this.ytPlayer.loadPlaylistById(result.playlistId);
            this._updateNowPlaying(result.title, result.thumbnail, result.channelTitle);
            this._showToast(`Playlist: "${result.title}"`, 'success');
        } else {
            // Fallback: treat the input as a search query
            this.ytPlayer.playBySearch(input);
            this._updateNowPlaying(input, null, 'Searching playlist…');
            this._showToast(`Playing search results for: "${input}"`, 'info');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  VOICE RECOGNITION
    // ═══════════════════════════════════════════════════════════════════════
    _startVoice(mode) {
        if (this.voice.isListening) { this.voice.stopListening(); return; }
        this.voice.startListening(mode);
    }

    _stopVoice() {
        this.voice.stopListening();
        this._hideVoiceOverlay();
    }

    async _voiceDirectPlay(text) {
        const { type, query } = VoiceRecognitionManager.parsePlayCommand(text);
        this._showToast(`Voice: playing ${type} "${query}"`, 'info');
        if (type === 'playlist') {
            await this._playPlaylistByInput(query);
        } else {
            // Direct play: create a temporary song entry and play immediately
            const song = this.queue.addSong(query, null, 'voice');
            this._renderTable();
            this.playingMode = 'queue';
            this.queue.setPlaybackQueue([song.id]);
            this.queue.startPlayback();
            await this._playQueueSong(song);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  CLEAR ALL
    // ═══════════════════════════════════════════════════════════════════════
    _handleClearAll() {
        if (this.queue.length === 0) return;
        this.ytPlayer.stop();
        this.isPlaying = false; this.isPaused = false;
        this.queue.clearAll();
        this._renderTable();
        this._updateNowPlaying('No song playing', null, '');
        this._showToast('Queue cleared', 'info');
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  TABLE RENDERING
    // ═══════════════════════════════════════════════════════════════════════
    _renderTable() {
        const tbody = document.getElementById('queueBody');
        const songs = this.queue.songs;

        // Stats
        const selected = songs.filter(s => s.selected).length;
        document.getElementById('totalSongs').textContent    = `${songs.length} song${songs.length !== 1 ? 's' : ''}`;
        document.getElementById('selectedSongs').textContent = `${selected} selected`;
        const master = document.getElementById('masterCheckbox');
        if (master) master.checked = songs.length > 0 && selected === songs.length;

        if (songs.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                  <td colspan="6">
                    <div class="empty-state">
                      <span class="empty-icon">🎵</span>
                      <p>No songs in queue. Add songs to get started!</p>
                    </div>
                  </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = songs.map((song, idx) => {
            const sourceIcon = { manual: '✏️', csv: '📄', voice: '🎤', playlist: '📋' }[song.source] || '❓';
            const statusCls  = { queued: 'status-queued', playing: 'status-playing', played: 'status-played', error: 'status-error' }[song.status] || '';
            const statusLabel = { queued: 'Queued', playing: '▶ Playing', played: '✓ Played', error: '✗ Error' }[song.status] || song.status;
            return `
            <tr class="song-row ${song.status === 'playing' ? 'row-playing' : ''}" data-id="${song.id}">
              <td class="col-check">
                <input type="checkbox" class="song-checkbox" data-id="${song.id}" ${song.selected ? 'checked' : ''}>
              </td>
              <td class="col-num">${idx + 1}</td>
              <td class="col-title">
                <span class="song-title-text" title="${this._esc(song.title)}">${this._esc(song.title)}</span>
              </td>
              <td class="col-source">
                <span class="source-badge" title="${song.source}">${sourceIcon} ${this._cap(song.source)}</span>
              </td>
              <td class="col-status">
                <span class="status-pill ${statusCls}">${statusLabel}</span>
              </td>
              <td class="col-actions">
                <button class="action-btn play-song-btn" data-id="${song.id}" title="Play this song">▶</button>
                <button class="action-btn remove-btn" data-id="${song.id}" title="Remove">🗑</button>
              </td>
            </tr>`;
        }).join('');

        // Delegate events on tbody
        tbody.querySelectorAll('.song-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                this.queue.toggleSelect(parseInt(e.target.dataset.id));
                this._renderTable();
            });
        });
        tbody.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.queue.removeSong(parseInt(e.target.dataset.id));
                this._renderTable();
            });
        });
        tbody.querySelectorAll('.play-song-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id   = parseInt(e.target.dataset.id);
                const song = this.queue.getSongById(id);
                if (!song) return;
                this.playingMode = 'queue';
                this.queue.setPlaybackQueue([id]);
                this.queue.startPlayback();
                this._playQueueSong(song);
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  UI HELPERS
    // ═══════════════════════════════════════════════════════════════════════
    _updateNowPlaying(title, thumbnail, sub) {
        const titleEl = document.getElementById('nowPlayingTitle');
        const subEl   = document.getElementById('nowPlayingSub');
        const imgEl   = document.getElementById('thumbImg');
        const ph      = document.getElementById('thumbPlaceholder');
        if (titleEl) titleEl.textContent = title;
        if (subEl)   subEl.textContent   = sub || '';
        if (thumbnail && imgEl) {
            imgEl.src = thumbnail; imgEl.style.display = 'block';
            ph && (ph.style.display = 'none');
        } else if (imgEl) {
            imgEl.style.display = 'none';
            ph && (ph.style.display = 'flex');
        }
    }

    _updatePlayPauseBtn() {
        const btn   = document.getElementById('playPauseBtn');
        const state = this.ytPlayer.getState();
        const S     = this.ytPlayer.STATE;
        if (!btn) return;
        const playing = state === S.PLAYING || state === S.BUFFERING;
        btn.textContent = playing ? '⏸' : '▶';
        btn.title       = playing ? 'Pause' : 'Play/Resume';
    }

    _updateControls() {
        this._updatePlayPauseBtn();
    }

    _showVoiceOverlay(mode) {
        const overlay = document.getElementById('voiceOverlay');
        const text    = document.getElementById('voiceListeningText');
        const interim = document.getElementById('voiceInterimText');
        if (overlay) overlay.classList.remove('hidden');
        if (text)    text.textContent    = mode === VoiceRecognitionManager.MODE_PLAY ? 'Say a song or playlist name...' : 'Say the song name...';
        if (interim) interim.textContent = '';
        const voiceBtn = mode === VoiceRecognitionManager.MODE_PLAY
            ? document.getElementById('voicePlayBtn')
            : document.getElementById('voiceAddBtn');
        if (voiceBtn) { voiceBtn.classList.add('btn-active'); voiceBtn.textContent = mode === VoiceRecognitionManager.MODE_PLAY ? '🔴 Listening...' : '🔴 Listening...'; }
    }

    _hideVoiceOverlay() {
        document.getElementById('voiceOverlay')?.classList.add('hidden');
        const addBtn  = document.getElementById('voiceAddBtn');
        const playBtn = document.getElementById('voicePlayBtn');
        if (addBtn)  { addBtn.classList.remove('btn-active');  addBtn.textContent  = '🎤 Voice Add'; }
        if (playBtn) { playBtn.classList.remove('btn-active'); playBtn.textContent = '🎤 Voice Play'; }
    }

    _showLoading(text = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        const msg     = document.getElementById('loadingText');
        if (overlay) overlay.classList.remove('hidden');
        if (msg)     msg.textContent = text;
    }

    _hideLoading() {
        document.getElementById('loadingOverlay')?.classList.add('hidden');
    }

    _showToast(message, type = 'info', duration = 3000) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        clearTimeout(this._toastTimer);
        toast.textContent = message;
        toast.className   = `toast toast-${type} toast-show`;
        this._toastTimer  = setTimeout(() => {
            toast.classList.remove('toast-show');
        }, duration);
    }

    _setStatusDot(state, label) {
        const dot = document.getElementById('statusDot');
        const lbl = document.getElementById('statusLabel');
        if (dot) { dot.className = `status-dot ${state}`; }
        if (lbl) lbl.textContent = label;
    }

    // Escape HTML special chars
    _esc(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    _cap(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : str; }

    // Attach event listener helper
    _on(id, event, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MusicBotApp();
});
