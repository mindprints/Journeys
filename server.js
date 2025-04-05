const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.json': 'application/json'
};

const server = http.createServer((req, res) => {
    // Handle the /api/directories endpoint to list all directories in JSON_Posters
    if (req.url === '/api/directories') {
        const basePath = path.join(__dirname, 'JSON_Posters');
        
        // Check if the base directory exists
        fs.stat(basePath, (err, stats) => {
            if (err || !stats.isDirectory()) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'JSON_Posters directory not found' }));
                return;
            }

            // Read the base directory to find all subdirectories
            fs.readdir(basePath, { withFileTypes: true }, (err, files) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Unable to read directory' }));
                } else {
                    // Filter out only directories
                    const directories = files
                        .filter(dirent => dirent.isDirectory())
                        .map(dirent => dirent.name);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(directories));
                }
            });
        });
    }
    // Handle the /api/posters endpoint
    else if (req.url.startsWith('/api/posters')) {
        const urlParams = new URL(req.url, `http://${req.headers.host}`);
        const directory = urlParams.searchParams.get('directory') || 'JSON_Posters/initialposters';
        const dirPath = path.join(__dirname, directory);

        // Check if the directory exists
        fs.stat(dirPath, (err, stats) => {
            if (err || !stats.isDirectory()) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Directory not found' }));
                return;
            }

            // Define allowed extensions
            const allowedExtensions = ['.json', '.png', '.jpg', '.jpeg', '.gif', '.webp'];

            // Read the directory and filter allowed files
            fs.readdir(dirPath, (err, files) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Unable to read directory' }));
                } else {
                    // Filter files based on the allowed extensions
                    const relevantFiles = files.filter(file => {
                        const ext = path.extname(file).toLowerCase();
                        return allowedExtensions.includes(ext);
                    });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(relevantFiles)); // Send the filtered list
                }
            });
        });
    } else {
        // Serve static files for all other requests
        let filePath = req.url === '/' ? './index.html' : '.' + req.url;
        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(404);
                    res.end('File not found');
                } else {
                    res.writeHead(500);
                    res.end('Server error: ' + err.code);
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
    }
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('Press Ctrl+C to stop the server');
}); 