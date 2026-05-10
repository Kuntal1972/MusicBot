class QueueManager {
    constructor() {
        this.songs = [];
        this.playbackList = [];   // ordered list of song IDs for current session
        this.currentPlayIndex = -1;
        this._idCounter = 0;
    }

    addSong(title, videoId = null, source = 'manual') {
        const song = {
            id: ++this._idCounter,
            title: title.trim(),
            videoId,
            source,          // 'manual' | 'csv' | 'voice' | 'playlist'
            status: 'queued', // 'queued' | 'playing' | 'played' | 'error'
            selected: false,
            addedAt: Date.now(),
        };
        this.songs.push(song);
        return song;
    }

    removeSong(id) {
        const idx = this.songs.findIndex(s => s.id === id);
        if (idx !== -1) this.songs.splice(idx, 1);

        const pbIdx = this.playbackList.indexOf(id);
        if (pbIdx !== -1) {
            this.playbackList.splice(pbIdx, 1);
            if (this.currentPlayIndex > pbIdx) this.currentPlayIndex--;
            else if (this.currentPlayIndex === pbIdx) this.currentPlayIndex = Math.min(this.currentPlayIndex, this.playbackList.length - 1);
        }
    }

    getSongById(id) {
        return this.songs.find(s => s.id === id) || null;
    }

    getSelected() {
        return this.songs.filter(s => s.selected);
    }

    selectAll() {
        this.songs.forEach(s => { s.selected = true; });
    }

    deselectAll() {
        this.songs.forEach(s => { s.selected = false; });
    }

    toggleSelect(id) {
        const song = this.getSongById(id);
        if (song) song.selected = !song.selected;
    }

    setVideoId(id, videoId) {
        const song = this.getSongById(id);
        if (song) song.videoId = videoId;
    }

    setStatus(id, status) {
        const song = this.getSongById(id);
        if (song) song.status = status;
    }

    setPlaybackQueue(ids) {
        this.playbackList = [...ids];
        this.currentPlayIndex = -1;
    }

    getCurrentSong() {
        if (this.currentPlayIndex < 0 || this.currentPlayIndex >= this.playbackList.length) return null;
        return this.getSongById(this.playbackList[this.currentPlayIndex]);
    }

    advance() {
        if (this.currentPlayIndex < this.playbackList.length - 1) {
            this.currentPlayIndex++;
            return this.getCurrentSong();
        }
        return null;
    }

    retreat() {
        if (this.currentPlayIndex > 0) {
            this.currentPlayIndex--;
            return this.getCurrentSong();
        }
        return null;
    }

    startPlayback() {
        if (this.playbackList.length === 0) return null;
        this.currentPlayIndex = 0;
        return this.getCurrentSong();
    }

    hasNext() {
        return this.currentPlayIndex < this.playbackList.length - 1;
    }

    hasPrevious() {
        return this.currentPlayIndex > 0;
    }

    clearAll() {
        this.songs = [];
        this.playbackList = [];
        this.currentPlayIndex = -1;
    }

    get length() { return this.songs.length; }
}
