module.exports = async (req, res) => {
    // Set CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const { url: videoUrl } = req.query;

    if (!videoUrl || !videoUrl.includes('youtu')) {
        return res.status(400).json({ status: 'error', message: 'Invalid or missing YouTube URL.' });
    }

    try {
        // --- 1. Call the public Cobalt API ---
        // This is a stable, open-source API that is less likely to be blocked.
        const cobaltApiResponse = await fetch('https://co.wuk.sh/api/json', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: videoUrl,
                isAudioOnly: true // We only want the MP3 audio
            })
        });

        if (!cobaltApiResponse.ok) {
            throw new Error(`The Cobalt API returned an error: ${cobaltApiResponse.statusText}`);
        }

        const result = await cobaltApiResponse.json();

        // --- 2. Check for a successful conversion ---
        if (result.status !== 'success' || !result.url) {
            throw new Error(`Conversion failed: ${result.text || 'No download link was returned.'}`);
        }
        
        // --- 3. Success! Send the final JSON response ---
        // Note: The Cobalt API does not provide a separate title, so your bot will need to use the title from its yt-search result.
        return res.status(200).json({
            status: 'success',
            download_url: result.url,
        });

    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
