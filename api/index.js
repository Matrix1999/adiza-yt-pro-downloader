const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Your personal list of 10 Webshare proxies.
const PROXIES = [
    { host: "23.95.150.145", port: 6114, auth: "mzeaoegv:xpqvpxas05fi" },
    { host: "198.23.239.134", port: 6540, auth: "mzeaoegv:xpqvpxas05fi" },
    { host: "45.38.107.97", port: 6014, auth: "mzeaoegv:xpqvpxas05fi" },
    { host: "107.172.163.27", port: 6543, auth: "mzeaoegv:xpqvpxas05fi" },
    { host: "64.137.96.74", port: 6641, auth: "mzeaoegv:xpqvpxas05fi" },
    { host: "45.43.186.39", port: 6257, auth: "mzeaoegv:xpqvpxas05fi" },
    { host: "154.203.43.247", port: 5536, auth: "mzeaoegv:xpqvpxas05fi" },
    { host: "216.10.27.159", port: 6837, auth: "mzeaoegv:xpqvpxas05fi" },
    { host: "136.0.207.84", port: 6661, auth: "mzeaoegv:xpqvpxas05fi" },
    { host: "142.147.128.93", port: 6593, auth: "mzeaoegv:xpqvpxas05fi" }
];

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
        // --- 1. Randomly select a proxy for this request ---
        const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
        const proxyAgent = new HttpsProxyAgent(`http://${proxy.auth}@${proxy.host}:${proxy.port}`);

        // --- 2. Call the 'init' endpoint via the proxy ---
        const initApiUrl = `https://www.1.mnuu.nu/api/v1/init?query=${encodeURIComponent(videoUrl)}`;
        const initResponse = await axios.get(initApiUrl, {
            httpsAgent: proxyAgent,
            headers: {
                'Origin': 'https://y2mate.nu',
                'Referer': 'https://y2mate.nu/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            }
        });

        if (initResponse.status !== 200 || !initResponse.data.result?.sig) {
            throw new Error('Could not get signature from init API.');
        }

        const { sig, v, title } = initResponse.data.result;

        // --- 3. Call the 'convert' endpoint via the same proxy ---
        const convertApiUrl = `https://umnu.mnuu.nu/api/v1/convert?sig=${encodeURIComponent(sig)}&v=${encodeURIComponent(v)}&f=mp3&_=`;
        const convertResponse = await axios.get(convertApiUrl, {
            httpsAgent: proxyAgent,
            headers: {
                'Origin': 'https://y2mate.nu',
                'Referer': 'https://y2mate.nu/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            }
        });
        
        if (convertResponse.data.status !== 'success' || !convertResponse.data.dlink) {
            throw new Error(`Conversion failed: ${convertResponse.data.mess || 'No link found.'}`);
        }
        
        // --- 4. Success! Send the final JSON response ---
        return res.status(200).json({
            status: 'success',
            title: title || 'Unknown Title',
            download_url: convertResponse.data.dlink,
        });

    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
};
