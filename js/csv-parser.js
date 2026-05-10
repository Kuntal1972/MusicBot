class CSVParser {
    /**
     * Parse a CSV/TXT file and return an array of song name strings.
     * Handles: headers, quoted fields, multiple columns (takes first non-empty),
     * comma/semicolon/tab delimiters.
     */
    parseFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const songs = this._parse(e.target.result);
                    resolve(songs);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file, 'UTF-8');
        });
    }

    _parse(text) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) return [];

        // Detect delimiter
        const delimiters = [',', ';', '\t', '|'];
        let delimiter = ',';
        const firstLine = lines[0];
        for (const d of delimiters) {
            if (firstLine.includes(d)) { delimiter = d; break; }
        }

        const songs = [];
        const headerKeywords = ['song', 'title', 'name', 'track', 'music'];

        for (let i = 0; i < lines.length; i++) {
            const cols = this._splitLine(lines[i], delimiter);
            if (cols.length === 0) continue;

            // Skip header row
            if (i === 0) {
                const firstCol = cols[0].toLowerCase().replace(/[^a-z]/g, '');
                if (headerKeywords.some(k => firstCol.includes(k))) continue;
            }

            // Find the song column: prefer 'song'/'title' named column,
            // otherwise take the first non-empty column
            const songName = cols.find(c => c.length > 0);
            if (songName && songName.length > 0 && songName.length < 200) {
                songs.push(songName);
            }
        }
        return songs;
    }

    _splitLine(line, delimiter) {
        // Handle quoted fields
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (ch === delimiter && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        result.push(current.trim());
        return result;
    }
}
