/**
 * YouTube Player Manager — simplified & robust
 *
 * KEY CHANGES:
 *  • playBySearch() uses the IFrame player's built-in search
 *    (listType:'search') so music plays WITHOUT the Data API.
 *  • After _handleReady(), the iframe gets allow="autoplay …"
 *    so Chrome's autoplay policy is satisfied.
 *  • Data API search is kept as opt-in for richer metadata only.
 */
class YouTubePlayerManager {
    constructor() {
        this.player          = null;
        this.isReady         = false;
        this.currentVideoId  = null;
        this._pendingAction  = null;   // {type:'search'|'video'|'playlist', value}

        this._onReadyCb       = null;
        this._onStateChangeCb = null;
        this._onErrorCb       = null;

        window.onYouTubeIframeAPIReady = () => this._initPlayer();
        this._loadScript();
    }

    onReady(cb)       { this._onReadyCb       = cb; }
    onStateChange(cb) { this._onStateChangeCb = cb; }
    onError(cb)       { this._onErrorCb       = cb; }

    // ── Script loader ─────────────────────────────────────────────────────────
    _loadScript() {
        if (document.getElementById('yt-iframe-api')) return;
        const tag   = document.createElement('script');
        tag.id      = 'yt-iframe-api';
        tag.src     = 'https://www.youtube.com/iframe_api';
        tag.onerror = () => this._onErrorCb && this._onErrorCb(
            'Could not load YouTube player — check your internet connection.', 0);
        document.head.appendChild(tag);
    }

    // ── Player init ───────────────────────────────────────────────────────────
    _initPlayer() {
        console.log('[YT] Creating player…');
        this.player = new YT.Player('ytPlayerIframe', {
            height: '160',
            width:  '100%',
            playerVars: {
                autoplay:       1,
                controls:       1,
                modestbranding: 1,
                rel:            0,
                iv_load_policy: 3,
                playsinline:    1,
                enablejsapi:    1,
                origin:         window.location.origin || 'http://localhost',
            },
            events: {
                onReady:       () => this._handleReady(),
                onStateChange: (e) => this._handleStateChange(e),
                onError:       (e) => this._handleError(e),
            },
        });
    }

    _handleReady() {
        console.log('[YT] Player ready');
        this.isReady = true;

        // ✅ Critical fix: grant autoplay permission to the iframe element
        // Without this, Chrome silently blocks playVideo() in async chains.
        const iframe = this.player.getIframe();
        if (iframe) {
            iframe.setAttribute('allow',
                'autoplay; encrypted-media; picture-in-picture; fullscreen');
        }

        this._onReadyCb && this._onReadyCb();

        // Replay anything requested before the player was ready
        if (this._pendingAction) {
            const a = this._pendingAction;
            this._pendingAction = null;
            this._dispatch(a);
        }
    }

    _handleStateChange(event) {
        const map = {'-1':'unstarted',0:'ended',1:'playing',2:'paused',3:'buffering',5:'cued'};
        console.log('[YT] State →', map[event.data] ?? event.data);
        this._onStateChangeCb && this._onStateChangeCb(event.data);
    }

    _handleError(event) {
        const msgs = {
            2:'Invalid video ID', 5:'HTML5 player error',
            100:'Video not found or private',
            101:'Embedding not allowed', 150:'Embedding not allowed',
        };
        const msg = msgs[event.data] || `Player error (code ${event.data})`;
        console.error('[YT] Error:', msg);
        this._onErrorCb && this._onErrorCb(msg, event.data);
    }

    // ── Dispatch helper ───────────────────────────────────────────────────────
    _dispatch(action) {
        if (action.type === 'search')   this._doSearch(action.value);
        if (action.type === 'video')    this._doVideo(action.value);
        if (action.type === 'playlist') this._doPlaylist(action.value);
    }

    // ── Public play methods ───────────────────────────────────────────────────

    /**
     * Play by search query — NO API KEY NEEDED.
     * Uses the IFrame player's built-in YouTube search.
     */
    playBySearch(query) {
        console.log('[YT] playBySearch:', query);
        if (!this.isReady) {
            this._pendingAction = { type: 'search', value: query };
            return;
        }
        this._doSearch(query);
    }

    _doSearch(query) {
        console.log('[YT] _doSearch:', query);
        // loadPlaylist with listType:'search' plays the top YouTube result
        this.player.loadPlaylist({
            listType: 'search',
            list:      query,
            index:     0,
        });
    }

    /** Play a specific YouTube video by ID */
    loadVideo(videoId) {
        console.log('[YT] loadVideo:', videoId);
        if (!this.isReady) {
            this._pendingAction = { type: 'video', value: videoId };
            return;
        }
        this._doVideo(videoId);
    }

    _doVideo(videoId) {
        this.currentVideoId = videoId;
        this.player.loadVideoById(videoId);
    }

    /** Play a YouTube playlist by playlist ID */
    loadPlaylistById(playlistId) {
        console.log('[YT] loadPlaylistById:', playlistId);
        if (!this.isReady) {
            this._pendingAction = { type: 'playlist', value: playlistId };
            return;
        }
        this._doPlaylist(playlistId);
    }

    _doPlaylist(playlistId) {
        this.player.loadPlaylist({ list: playlistId, listType: 'playlist' });
    }

    // ── Transport ─────────────────────────────────────────────────────────────
    play()     { this.isReady && this.player.playVideo(); }
    pause()    { this.isReady && this.player.pauseVideo(); }
    stop()     { this.isReady && this.player.stopVideo(); }
    next()     { this.isReady && this.player.nextVideo(); }
    previous() { this.isReady && this.player.previousVideo(); }

    setVolume(v) { this.isReady && this.player.setVolume(Math.max(0, Math.min(100, v))); }
    getVolume()  { return this.isReady ? this.player.getVolume() : 0; }
    getState()   { return this.isReady ? this.player.getPlayerState() : -1; }

    get STATE() {
        return { UNSTARTED:-1, ENDED:0, PLAYING:1, PAUSED:2, BUFFERING:3, CUED:5 };
    }

    // ── YouTube Data API (optional — only used for metadata) ──────────────────
    async searchVideo(query) {
        if (!CONFIG.YOUTUBE_API_KEY ||
            CONFIG.YOUTUBE_API_KEY === 'YOUR_YOUTUBE_DATA_API_V3_KEY_HERE') {
            return null;  // caller falls back to playBySearch
        }
        try {
            const url = new URL(CONFIG.YOUTUBE_SEARCH_URL);
            url.searchParams.set('part',       'snippet');
            url.searchParams.set('type',       'video');
            url.searchParams.set('q',          query);
            url.searchParams.set('maxResults', CONFIG.SEARCH_MAX_RESULTS);
            url.searchParams.set('key',        CONFIG.YOUTUBE_API_KEY);

            const res  = await fetch(url.toString());
            if (!res.ok) throw new Error(`API HTTP ${res.status}`);
            const data = await res.json();
            if (!data.items?.length) return null;

            const item = data.items[0];
            return {
                videoId:      item.id.videoId,
                title:        item.snippet.title,
                channelTitle: item.snippet.channelTitle,
                thumbnail:    item.snippet.thumbnails?.medium?.url
                           || item.snippet.thumbnails?.default?.url,
            };
        } catch (err) {
            console.warn('[YT API] search failed, will use IFrame search fallback:', err.message);
            return null;
        }
    }

    async searchPlaylist(query) {
        if (!CONFIG.YOUTUBE_API_KEY ||
            CONFIG.YOUTUBE_API_KEY === 'YOUR_YOUTUBE_DATA_API_V3_KEY_HERE') {
            return null;
        }
        try {
            const url = new URL(CONFIG.YOUTUBE_SEARCH_URL);
            url.searchParams.set('part',       'snippet');
            url.searchParams.set('type',       'playlist');
            url.searchParams.set('q',          query);
            url.searchParams.set('maxResults', '1');
            url.searchParams.set('key',        CONFIG.YOUTUBE_API_KEY);

            const res  = await fetch(url.toString());
            if (!res.ok) throw new Error(`API HTTP ${res.status}`);
            const data = await res.json();
            if (!data.items?.length) return null;

            const item = data.items[0];
            return {
                playlistId:   item.id.playlistId,
                title:        item.snippet.title,
                channelTitle: item.snippet.channelTitle,
                thumbnail:    item.snippet.thumbnails?.medium?.url,
            };
        } catch (err) {
            console.warn('[YT API] playlist search failed:', err.message);
            return null;
        }
    }

    static extractPlaylistId(input) {
        const m = input.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        if (m) return m[1];
        if (/^[a-zA-Z0-9_-]{10,}$/.test(input.trim())) return input.trim();
        return null;
    }
}
