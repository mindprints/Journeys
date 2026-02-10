const express = require('express');

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const multer = require('multer');
const app = express();
const port = Number(process.env.PORT) || 3010;

// Constants
const JSON_POSTERS_DIR = path.join(__dirname, 'JSON_Posters');
const POSTERS_DIR_NAME = 'Posters';
const POSTERS_DIR = path.join(JSON_POSTERS_DIR, POSTERS_DIR_NAME);
const JOURNEYS_DIR = path.join(JSON_POSTERS_DIR, 'Journeys');
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const CATEGORY_CONFIG_PATH = path.join(JSON_POSTERS_DIR, 'category-config.json');
const WIKI_OUTPUT_DIR = path.join(__dirname, 'ai_posters');
const WIKI_LOG_PATH = path.join(WIKI_OUTPUT_DIR, 'wikipedia_grab.log');
const GRAB_LOG_PATH = path.join(WIKI_OUTPUT_DIR, 'grab.log');
const MERGE_LOG_PATH = path.join(WIKI_OUTPUT_DIR, 'merge_enrichment.log');

// Set up multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Add error handler for JSON parsing errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  next(err);
});

// Set static files with caching headers
app.use(express.static('./', {
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      // No caching for HTML files
      res.setHeader('Cache-Control', 'no-cache');
    } else if (path.endsWith('.js') || path.endsWith('.css')) {
      // Cache JS and CSS for 1 hour
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// --- Helper Functions ---

// Function to find a poster file by its filename across all subdirectories
async function findPosterByFilename(filename) {
  try {
    const roots = getPosterRootDirectories();
    for (const root of roots) {
      const files = fs.readdirSync(root.path);
      if (files.includes(filename)) {
        const filePath = path.join(root.path, filename);
        return await resolvePosterData(filePath, `${root.relative}/${filename}`);
      }
      const imagesDir = path.join(root.path, 'images');
      if (fs.existsSync(imagesDir)) {
        const imageFiles = fs.readdirSync(imagesDir);
        if (imageFiles.includes(filename)) {
          const imagePath = path.join(imagesDir, filename);
          return await resolvePosterData(imagePath, `${root.relative}/images/${filename}`);
        }
      }
    }
    return null; // Not found
  } catch (error) {
    console.error(`Error finding poster ${filename}:`, error);
    return null;
  }
}

// Function to resolve poster data based on its path
async function resolvePosterData(absolutePath, relativePath) {
  const filename = path.basename(absolutePath);
  const ext = path.extname(filename).toLowerCase();
  let poster = {
    path: relativePath,
    filename: filename,
    title: filename.replace(ext, ''), // Default title
    type: 'unknown',
    data: null,
    thumbnail: null,
    categories: []
  };

  if (ext === '.log') {
    poster.type = 'skip-log';
    return poster;
  }

  if (ext === '.json') {
    try {
      const fileContent = fs.readFileSync(absolutePath, 'utf8');
      const jsonData = JSON.parse(fileContent);
      poster.data = jsonData;

      // --- Detect v2 unified poster format ---
      if (jsonData.version === 2) {
        poster.type = 'poster-v2';
        poster.title = jsonData.front?.title || poster.title;
        poster.front = jsonData.front;
        poster.back = jsonData.back;
        poster.meta = jsonData.meta;
        if (Array.isArray(jsonData.meta?.categories)) {
          poster.categories = jsonData.meta.categories;
        }

        // Resolve image paths in v2 posters
        if (poster.back?.image?.src && !poster.back.image.src.startsWith('http')) {
          // Image paths in v2 should be relative to project root (centralized)
          // No modification needed if already in images/ folder
        }

        // Handle front thumbnail
        if (poster.front?.thumbnail && !poster.front.thumbnail.startsWith('http')) {
          poster.thumbnail = poster.front.thumbnail;
        }

        return poster;
      }

      // --- v1 format detection (legacy) ---
      poster.type = jsonData.type || 'json'; // Default to 'json' if type not specified
      poster.title = jsonData.title || jsonData.figure || jsonData.url || poster.title; // More specific title sources
      if (Array.isArray(jsonData.meta?.categories)) {
        poster.categories = jsonData.meta.categories;
      } else if (Array.isArray(jsonData.categories)) {
        poster.categories = jsonData.categories;
      }

      // --- Resolve Thumbnail Path --- 
      let finalThumbnailPath = null;
      if (jsonData.thumbnail && !jsonData.thumbnail.startsWith('http')) {
        // Check if it already looks like a full path relative to project root
        if (jsonData.thumbnail.startsWith('JSON_Posters/')) {
          finalThumbnailPath = jsonData.thumbnail; // Use it directly
          console.warn(`Warning: Thumbnail path in ${relativePath} (${jsonData.thumbnail}) seems absolute-relative. Using directly.`);
        } else {
          // Assume it's relative to the JSON file's directory
          finalThumbnailPath = path.join(path.dirname(relativePath), jsonData.thumbnail).replace(/\\/g, '/');
        }
      } else if (jsonData.thumbnail) {
        // Handle http(s) URLs directly
        finalThumbnailPath = jsonData.thumbnail;
      }
      poster.thumbnail = finalThumbnailPath;

      // --- Resolve Image Path (for type: image JSON wrappers) --- 
      let finalImagePath = null;
      if (poster.type === 'image' && jsonData.imagePath && !jsonData.imagePath.startsWith('http')) {
        // Check if it already looks like a full path relative to project root
        if (jsonData.imagePath.startsWith('JSON_Posters/')) {
          finalImagePath = jsonData.imagePath;
          console.warn(`Warning: Image path in ${relativePath} (${jsonData.imagePath}) seems absolute-relative. Using directly.`);
        } else {
          // Assume it's relative to the JSON file's directory
          finalImagePath = path.join(path.dirname(relativePath), jsonData.imagePath).replace(/\\/g, '/');
        }
      } else if (poster.type === 'image' && jsonData.imagePath) {
        // Handle http(s) URLs directly
        finalImagePath = jsonData.imagePath;
      }
      // Store resolved image path in the poster object if applicable
      if (finalImagePath) {
        poster.imagePath = finalImagePath;
      }

      // --- Set Thumbnail Fallback for Image Wrappers --- 
      // If it's an image wrapper and thumbnail wasn't explicitly set, use the resolved imagePath as thumbnail
      if (poster.type === 'image' && poster.imagePath && !poster.thumbnail) {
        poster.thumbnail = poster.imagePath;
      }

    } catch (error) {
      console.error(`Error reading or parsing JSON file ${absolutePath}:`, error);
      poster.type = 'error';
      poster.error = `Failed to load JSON: ${error.message}`;
    }
  } else if (IMAGE_EXTENSIONS.includes(ext)) {
    // No longer treat raw images as standalone posters.
    // In v2, images should be referenced via JSON poster files.
    // Mark as skip so they don't appear in the carousel.
    poster.type = 'skip-raw-image';
    console.log(`[resolvePosterData] Skipping raw image file: ${relativePath} (use v2 poster JSON to reference images)`);
  } else {
    console.warn(`Unsupported file type for poster: ${relativePath}`);
    // Could potentially handle other file types here if needed
  }
  return poster;
}

function formatCategoryLabel(category) {
  return category
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase());
}

function collectAllPosters() {
  const roots = getPosterRootDirectories();
  const allPosters = [];
  for (const root of roots) {
    const files = fs.readdirSync(root.path);

    for (const file of files) {
      const absolutePath = path.join(root.path, file);
      const relativePath = `${root.relative}/${file}`;
      if (fs.statSync(absolutePath).isDirectory()) continue;
      allPosters.push(resolvePosterData(absolutePath, relativePath));
    }

    const imagesDir = path.join(root.path, 'images');
    if (fs.existsSync(imagesDir) && fs.statSync(imagesDir).isDirectory()) {
      const imageFiles = fs.readdirSync(imagesDir);
      for (const imgFile of imageFiles) {
        const imgAbsolutePath = path.join(imagesDir, imgFile);
        const imgRelativePath = `${root.relative}/images/${imgFile}`;
        if (fs.statSync(imgAbsolutePath).isDirectory()) continue;
        allPosters.push(resolvePosterData(imgAbsolutePath, imgRelativePath));
      }
    }
  }

  return Promise.all(allPosters);
}

function getPosterRootDirectories() {
  const roots = [];
  if (fs.existsSync(POSTERS_DIR)) {
    roots.push({
      name: POSTERS_DIR_NAME,
      path: POSTERS_DIR,
      relative: `JSON_Posters/${POSTERS_DIR_NAME}`
    });
  }

  if (fs.existsSync(WIKI_OUTPUT_DIR)) {
    roots.push({
      name: 'ai_posters',
      path: WIKI_OUTPUT_DIR,
      relative: 'ai_posters'
    });
  }

  const legacyDirs = fs.readdirSync(JSON_POSTERS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory()
      && dirent.name !== 'Journeys'
      && dirent.name !== 'poster_schemas'
      && dirent.name !== POSTERS_DIR_NAME);

  legacyDirs.forEach(dirent => {
    roots.push({
      name: dirent.name,
      path: path.join(JSON_POSTERS_DIR, dirent.name),
      relative: `JSON_Posters/${dirent.name}`
    });
  });

  return roots;
}

function getPosterCategories(posters) {
  const map = new Map();
  posters.forEach(poster => {
    let categories = [];
    if (Array.isArray(poster.categories)) {
      categories = poster.categories;
    } else if (Array.isArray(poster.meta?.categories)) {
      categories = poster.meta.categories;
    } else if (Array.isArray(poster.data?.meta?.categories)) {
      categories = poster.data.meta.categories;
    } else if (Array.isArray(poster.data?.categories)) {
      categories = poster.data.categories;
    }

    categories
      .filter(c => typeof c === 'string')
      .map(c => c.trim())
      .filter(Boolean)
      .forEach(category => {
        const key = category.toLowerCase();
        if (!map.has(key)) map.set(key, category);
      });
  });

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}


// --- API Endpoints ---

// Get load options (directories and journeys)
app.get('/api/load-options', async (req, res) => {
  try {
    let options = [];

    // Get categories
    const posters = await collectAllPosters();
    const categories = getPosterCategories(posters).map(category => ({
      name: formatCategoryLabel(category),
      value: category,
      type: 'category'
    }));
    options = options.concat(categories);

    // Get journeys
    if (fs.existsSync(JOURNEYS_DIR)) {
      const journeyFiles = fs.readdirSync(JOURNEYS_DIR)
        .filter(file => file.endsWith('.json'));

      journeyFiles.forEach(file => {
        try {
          const filePath = path.join(JOURNEYS_DIR, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          options.push({
            name: `${data.name || 'Unnamed'} (Journey)`,
            value: file, // Just the filename
            type: 'journey'
          });
        } catch (error) {
          console.error(`Error reading journey file ${file}:`, error);
          // Optionally add an error entry to the options
          options.push({
            name: `${file} (Invalid Journey File)`,
            value: file,
            type: 'journey-error' // Special type for frontend handling
          });
        }
      });
    }

    // Sort options alphabetically by name
    options.sort((a, b) => a.name.localeCompare(b.name));

    res.json(options);
  } catch (error) {
    console.error('Error getting load options:', error);
    res.status(500).json({ error: 'Failed to get load options: ' + error.message });
  }
});

// Get posters from a specific directory
app.get('/api/posters-in-directory', async (req, res) => {
  try {
    const { directory } = req.query;
    if (!directory) {
      return res.status(400).json({ error: 'Directory parameter is required' });
    }

    const dirPath = path.join(__dirname, directory);
    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: 'Directory not found: ' + directory });
    }

    let postersData = [];
    const files = fs.readdirSync(dirPath);
    const includedImages = new Set(); // Track images included via JSON

    // Process JSON files first
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const absolutePath = path.join(dirPath, file);
      const relativePath = `${directory}/${file}`;
      const poster = await resolvePosterData(absolutePath, relativePath);
      if (poster.type === 'image' && poster.imagePath) {
        // Track image path relative to the root JSON_Posters dir for uniqueness check
        const baseImagePath = path.relative(JSON_POSTERS_DIR, path.resolve(path.dirname(absolutePath), poster.imagePath));
        includedImages.add(baseImagePath.replace(/\\/g, '/'));
      }
      postersData.push(poster);
    }

    // Process images in the main directory (if not already included)
    for (const file of files.filter(f => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()))) {
      const relativeImagePath = `${directory}/${file}`;
      const baseImagePath = path.relative(JSON_POSTERS_DIR, path.join(dirPath, file));
      if (!includedImages.has(baseImagePath.replace(/\\/g, '/'))) {
        const absolutePath = path.join(dirPath, file);
        postersData.push(await resolvePosterData(absolutePath, relativeImagePath));
      }
    }

    // Process images in the /images subdirectory (if not already included)
    const imagesDir = path.join(dirPath, 'images');
    if (fs.existsSync(imagesDir)) {
      const imageFiles = fs.readdirSync(imagesDir).filter(f => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()));
      for (const file of imageFiles) {
        const relativeImagePath = `${directory}/images/${file}`;
        const baseImagePath = path.relative(JSON_POSTERS_DIR, path.join(imagesDir, file));
        if (!includedImages.has(baseImagePath.replace(/\\/g, '/'))) {
          const absolutePath = path.join(imagesDir, file);
          postersData.push(await resolvePosterData(absolutePath, relativeImagePath));
        }
      }
    }

    res.json(postersData.filter(p => p.type !== 'error' && p.type !== 'unknown' && p.type !== 'skip-raw-image')); // Filter out errors/unknown/raw-images
  } catch (error) {
    console.error('Error getting posters from directory:', error);
    res.status(500).json({ error: 'Failed to get posters: ' + error.message });
  }
});

// Get posters by category (using meta.categories)
app.get('/api/posters-in-category', async (req, res) => {
  try {
    const { category } = req.query;
    if (!category) {
      return res.status(400).json({ error: 'Category parameter is required' });
    }

    const allPosters = await collectAllPosters();
    const needle = String(category).toLowerCase();

    const filtered = allPosters.filter(poster => {
      const categories = Array.isArray(poster.categories)
        ? poster.categories
        : Array.isArray(poster.meta?.categories)
          ? poster.meta.categories
        : Array.isArray(poster.data?.meta?.categories)
            ? poster.data.meta.categories
            : Array.isArray(poster.data?.categories)
              ? poster.data.categories
              : [];

      const normalized = categories
        .filter(c => typeof c === 'string')
        .map(c => c.trim().toLowerCase())
        .filter(Boolean);

      return normalized.includes(needle);
    });

    res.json(filtered.filter(p => p.type !== 'error' && p.type !== 'unknown' && p.type !== 'skip-raw-image'));
  } catch (error) {
    console.error('Error getting posters by category:', error);
    res.status(500).json({ error: 'Failed to get posters by category: ' + error.message });
  }
});

// Get posters by a list of filenames
app.post('/api/posters-by-filenames', async (req, res) => {
  try {
    const { filenames } = req.body;
    if (!Array.isArray(filenames)) {
      return res.status(400).json({ error: 'Filenames must be an array' });
    }

    let postersData = [];
    for (const filename of filenames) {
      const poster = await findPosterByFilename(filename);
      if (poster && poster.type !== 'error' && poster.type !== 'unknown') {
        postersData.push(poster);
      } else {
        console.warn(`Poster not found or invalid: ${filename}`);
        // Optionally add placeholder or skip
      }
    }

    // Preserve original order from the journey file
    const orderedPosters = filenames.map(fname => postersData.find(p => p.filename === fname)).filter(Boolean);

    res.json(orderedPosters);
  } catch (error) {
    console.error('Error getting posters by filenames:', error);
    res.status(500).json({ error: 'Failed to get posters by filenames: ' + error.message });
  }
});


// Get all JSON_Posters subdirectories (Used by Journey Editor and Unified Editor)
app.get('/api/directories', (req, res) => {
  try {
    if (!fs.existsSync(POSTERS_DIR)) {
      fs.mkdirSync(POSTERS_DIR, { recursive: true });
    }

    res.json([
      {
        name: POSTERS_DIR_NAME,
        path: `JSON_Posters/${POSTERS_DIR_NAME}`
      }
    ]);
  } catch (error) {
    console.error('Error getting directories:', error);
    res.status(500).json({ error: 'Failed to get directories: ' + error.message });
  }
});

// Get all posters from the central store
app.get('/api/posters-all', async (req, res) => {
  try {
    const posters = await collectAllPosters();
    res.json(posters.filter(p => p.type !== 'error' && p.type !== 'unknown' && p.type !== 'skip-raw-image'));
  } catch (error) {
    console.error('Error getting all posters:', error);
    res.status(500).json({ error: 'Failed to get posters: ' + error.message });
  }
});

// Get all categories from poster metadata
app.get('/api/categories', async (req, res) => {
  try {
    const posters = await collectAllPosters();
    const categories = getPosterCategories(posters).map(category => ({
      name: formatCategoryLabel(category),
      value: category
    }));
    res.json(categories);
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ error: 'Failed to get categories: ' + error.message });
  }
});

// Get all images from the centralized images directory
app.get('/api/images', (req, res) => {
  try {
    const imagesDir = path.join(__dirname, 'images', 'originals');
    const images = [];

    if (fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir);
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (IMAGE_EXTENSIONS.includes(ext)) {
          images.push({
            name: file,
            path: `images/originals/${file}`
          });
        }
      });
    }

    // Sort alphabetically by name
    images.sort((a, b) => a.name.localeCompare(b.name));

    res.json(images);
  } catch (error) {
    console.error('Error getting images:', error);
    res.status(500).json({ error: 'Failed to get images: ' + error.message });
  }
});


// DEPRECATED: Get posters filenames from a directory (use /api/posters-in-directory instead)
app.get('/api/posters', (req, res) => {
  console.warn("Deprecated API endpoint /api/posters called. Use /api/posters-in-directory instead.");
  try {
    const { directory } = req.query;
    if (!directory) {
      return res.status(400).json({ error: 'Directory parameter is required' });
    }
    const dirPath = path.join(__dirname, directory);
    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: 'Directory not found: ' + dirPath });
    }
    const files = fs.readdirSync(dirPath);
    res.json(files);
  } catch (error) {
    console.error('Error in deprecated /api/posters:', error);
    res.status(500).json({ error: 'Failed to get posters: ' + error.message });
  }
});

// Save a poster (JSON data)
app.post('/api/save-poster', (req, res) => {
  try {
    const { path: posterPath, data } = req.body;

    if (!posterPath || !data) {
      return res.status(400).json({ error: 'Path and data are required' });
    }

    const filePath = path.join(__dirname, posterPath);
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true }); // Create directory if it doesn't exist
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true, message: 'Poster saved successfully' });
  } catch (error) {
    console.error('Error saving poster:', error);
    res.status(500).json({ error: 'Failed to save poster' });
  }
});

// Save an image file
app.post('/api/save-image', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    const imagePath = req.body.path;
    if (!imagePath) {
      return res.status(400).json({ error: 'Path is required' });
    }
    const filePath = path.join(__dirname, imagePath);
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true }); // Create directory if it doesn't exist
    }
    fs.writeFileSync(filePath, req.file.buffer);
    res.json({ success: true, message: 'Image saved successfully' });
  } catch (error) {
    console.error('Error saving image:', error);
    res.status(500).json({ error: 'Failed to save image' });
  }
});

// Delete a poster or image file
app.post('/api/delete-poster', (req, res) => {
  try {
    const { path: posterPath } = req.body;
    if (!posterPath) {
      return res.status(400).json({ error: 'Path is required' });
    }
    const filePath = path.join(__dirname, posterPath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Save a file (primarily for JSON wrappers in editor)
app.post('/api/save-file', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    const filePath = req.body.path;
    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }
    const fullPath = path.join(__dirname, filePath);
    const dirPath = path.dirname(fullPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true }); // Create directory if it doesn't exist
    }
    fs.writeFileSync(fullPath, req.file.buffer);
    res.json({ success: true, message: 'File saved successfully' });
  } catch (error) {
    console.error('Error saving file:', error);
    res.status(500).json({ error: 'Failed to save file' });
  }
});

// Create a new directory in JSON_Posters
app.post('/api/create-directory', (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Directory name required' });
    }
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '');
    if (!sanitizedName) {
      return res.status(400).json({ error: 'Invalid directory name' });
    }
    const dirPath = path.join(JSON_POSTERS_DIR, sanitizedName);
    if (fs.existsSync(dirPath)) {
      return res.status(409).json({ error: 'Directory already exists' });
    }
    fs.mkdirSync(dirPath, { recursive: true });
    res.json({ success: true, message: 'Directory created', path: `JSON_Posters/${sanitizedName}` });
  } catch (error) {
    console.error('Error creating directory:', error);
    res.status(500).json({ error: 'Failed to create directory: ' + error.message });
  }
});

// Check if a directory exists
app.post('/api/check-directory', (req, res) => {
  try {
    const { path: dirPath } = req.body;
    if (!dirPath) {
      return res.status(400).json({ error: 'Path is required' });
    }
    const fullPath = path.join(__dirname, dirPath);
    const exists = fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
    res.json({ exists });
  } catch (error) {
    console.error('Error checking directory:', error);
    res.status(500).json({ error: 'Failed to check directory: ' + error.message });
  }
});

// Create an images directory within a specified path
app.post('/api/create-images-directory', (req, res) => {
  try {
    const { path: dirPath } = req.body;
    if (!dirPath) {
      return res.status(400).json({ error: 'Path is required' });
    }
    const fullPath = path.join(__dirname, dirPath);
    fs.mkdirSync(fullPath, { recursive: true });
    res.json({ success: true, message: 'Images directory created', path: dirPath });
  } catch (error) {
    console.error('Error creating images directory:', error);
    res.status(500).json({ error: 'Failed to create images directory: ' + error.message });
  }
});

// Get all journeys (for Journey Editor)
app.get('/api/journeys', (req, res) => {
  try {
    if (!fs.existsSync(JOURNEYS_DIR)) {
      fs.mkdirSync(JOURNEYS_DIR, { recursive: true });
    }
    const files = fs.readdirSync(JOURNEYS_DIR).filter(file => file.endsWith('.json'));
    const journeys = files.map(file => {
      try {
        const filePath = path.join(JOURNEYS_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return { filename: file, name: data.name || 'Unnamed', description: data.description || '', posterCount: data.posters ? data.posters.length : 0, dateModified: data.dateModified || '' };
      } catch (error) {
        console.error(`Error reading journey file ${file}:`, error);
        return { filename: file, name: 'Error: Invalid File', description: '', posterCount: 0, dateModified: '' };
      }
    });
    res.json(journeys);
  } catch (error) {
    console.error('Error getting journeys:', error);
    res.status(500).json({ error: 'Failed to get journeys: ' + error.message });
  }
});

// Get a single journey by filename
app.get('/api/journey/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename) {
      return res.status(400).json({ error: 'Filename required' });
    }
    const filePath = path.join(JOURNEYS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Journey file not found' });
    }
    const journeyData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(journeyData);
  } catch (error) {
    console.error('Error getting journey:', error);
    res.status(500).json({ error: 'Failed to get journey: ' + error.message });
  }
});

// Save a journey
app.post('/api/save-journey', (req, res) => {
  try {
    const { filename, data } = req.body;
    if (!filename || !data) {
      return res.status(400).json({ error: 'Filename and data required' });
    }
    if (!data.name || !Array.isArray(data.posters)) {
      return res.status(400).json({ error: 'Journey must have name and posters array' });
    }
    if (!data.dateCreated) {
      data.dateCreated = new Date().toISOString();
    }
    data.dateModified = new Date().toISOString();
    if (!fs.existsSync(JOURNEYS_DIR)) {
      fs.mkdirSync(JOURNEYS_DIR, { recursive: true });
    }
    const filePath = path.join(JOURNEYS_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true, message: 'Journey saved successfully' });
  } catch (error) {
    console.error('Error saving journey:', error);
    res.status(500).json({ error: 'Failed to save journey: ' + error.message });
  }
});

// Delete a journey
app.post('/api/delete-journey', (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'Filename required' });
    }
    const filePath = path.join(JOURNEYS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Journey file not found' });
    }
    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Journey deleted successfully' });
  } catch (error) {
    console.error('Error deleting journey:', error);
    res.status(500).json({ error: 'Failed to delete journey: ' + error.message });
  }
});

// Get all posters from all categories (Used by Journey Editor)
app.get('/api/all-posters', async (req, res) => {
  try {
    const allPosters = await collectAllPosters();
    const filtered = allPosters.filter(p => p.type !== 'error' && p.type !== 'unknown' && p.type !== 'skip-raw-image');
    const uniquePosters = Array.from(new Map(filtered.map(p => [p.path, p])).values());
    res.json(uniquePosters);
  } catch (error) {
    console.error('Error getting all posters for editor:', error);
    res.status(500).json({ error: 'Failed to get all posters: ' + error.message });
  }
});

// Category config
app.get('/api/category-config', (req, res) => {
  try {
    if (!fs.existsSync(CATEGORY_CONFIG_PATH)) {
      return res.json({ updated: null, categories: [] });
    }
    const raw = fs.readFileSync(CATEGORY_CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw);
    res.json(config);
  } catch (error) {
    console.error('Error reading category config:', error);
    res.status(500).json({ error: 'Failed to read category config: ' + error.message });
  }
});

app.post('/api/category-config', (req, res) => {
  try {
    const config = req.body || {};
    const payload = {
      updated: new Date().toISOString(),
      categories: Array.isArray(config.categories) ? config.categories : []
    };
    if (!fs.existsSync(JSON_POSTERS_DIR)) {
      fs.mkdirSync(JSON_POSTERS_DIR, { recursive: true });
    }
    fs.writeFileSync(CATEGORY_CONFIG_PATH, JSON.stringify(payload, null, 2));
    res.json({ success: true, config: payload });
  } catch (error) {
    console.error('Error saving category config:', error);
    res.status(500).json({ error: 'Failed to save category config: ' + error.message });
  }
});

// Unified grab runner
app.post('/api/run-grab', (req, res) => {
  try {
    const {
      source,
      category,
      topics,
      count,
      mergeEnrich,
      mergeOnly,
      search,
      filter,
      useCurated,
      curatedSet
    } = req.body || {};

    if (!source) {
      return res.status(400).json({ error: 'Source is required' });
    }

    const args = ['scripts/python/grab.py', '--source', String(source)];

    if (category) {
      args.push('--category', String(category));
    }

    if (Array.isArray(topics) && topics.length) {
      args.push('--topics', topics.join(','));
    }

    if (Number.isInteger(count)) {
      args.push('--count', String(count));
    }

    if (mergeEnrich !== undefined) {
      args.push('--merge-enrich', mergeEnrich ? 'true' : 'false');
    }

    if (mergeOnly !== undefined) {
      args.push('--merge-only', mergeOnly ? 'true' : 'false');
    }

    if (search) {
      args.push('--search', String(search));
    }

    if (filter) {
      args.push('--filter', String(filter));
    }

    if (useCurated) {
      args.push('--use-curated');
    }

    if (curatedSet) {
      args.push('--curated-set', String(curatedSet));
    }

    if (!fs.existsSync(WIKI_OUTPUT_DIR)) {
      fs.mkdirSync(WIKI_OUTPUT_DIR, { recursive: true });
    }

    const child = spawn('python', args, { cwd: __dirname });
    let output = '';
    let responded = false;

    const finalize = (payload, status = 200) => {
      if (responded) return;
      responded = true;
      res.status(status).json(payload);
    };

    child.stdout.on('data', data => {
      output += data.toString();
    });

    child.stderr.on('data', data => {
      output += data.toString();
    });

    child.on('error', error => {
      console.error('Failed to start unified grab:', error);
      finalize({ error: 'Failed to start unified grab: ' + error.message }, 500);
    });

    child.on('close', code => {
      try {
        fs.writeFileSync(GRAB_LOG_PATH, output, 'utf8');
      } catch (error) {
        console.error('Failed to write grab log:', error);
      }
      finalize({ success: code === 0, code, output });
    });
  } catch (error) {
    console.error('Error running unified grab:', error);
    res.status(500).json({ error: 'Failed to run unified grab: ' + error.message });
  }
});

app.get('/api/grab-log', (req, res) => {
  try {
    if (!fs.existsSync(GRAB_LOG_PATH)) {
      return res.json({ log: '' });
    }
    const log = fs.readFileSync(GRAB_LOG_PATH, 'utf8');
    res.json({ log });
  } catch (error) {
    console.error('Error reading grab log:', error);
    res.status(500).json({ error: 'Failed to read grab log: ' + error.message });
  }
});

// Wikipedia grab runner
app.post('/api/run-wikipedia-grab', (req, res) => {
  try {
    const { category, topics, count, mergeEnrich, mergeOnly } = req.body || {};
    const args = ['scripts/python/wikipedia_grab'];

    if (category) {
      args.push('--category', String(category));
    }

    if (Array.isArray(topics) && topics.length) {
      args.push('--topics', topics.join(','));
    }

    if (Number.isInteger(count)) {
      args.push('--count', String(count));
    }

    if (mergeEnrich !== undefined) {
      args.push('--merge-enrich', mergeEnrich ? 'true' : 'false');
    }

    if (mergeOnly !== undefined) {
      args.push('--merge-only', mergeOnly ? 'true' : 'false');
    }

    if (!fs.existsSync(WIKI_OUTPUT_DIR)) {
      fs.mkdirSync(WIKI_OUTPUT_DIR, { recursive: true });
    }

    const child = spawn('python', args, { cwd: __dirname });
    let output = '';
    let responded = false;

    const finalize = (payload, status = 200) => {
      if (responded) return;
      responded = true;
      res.status(status).json(payload);
    };

    child.stdout.on('data', data => {
      output += data.toString();
    });

    child.stderr.on('data', data => {
      output += data.toString();
    });

    child.on('error', error => {
      console.error('Failed to start wikipedia grab:', error);
      finalize({ error: 'Failed to start wikipedia grab: ' + error.message }, 500);
    });

    child.on('close', code => {
      try {
        fs.writeFileSync(WIKI_LOG_PATH, output, 'utf8');
      } catch (error) {
        console.error('Failed to write wiki log:', error);
      }
      finalize({ success: code === 0, code, output });
    });
  } catch (error) {
    console.error('Error running wikipedia grab:', error);
    res.status(500).json({ error: 'Failed to run wikipedia grab: ' + error.message });
  }
});

app.get('/api/wikipedia-grab-log', (req, res) => {
  try {
    if (!fs.existsSync(WIKI_LOG_PATH)) {
      return res.json({ log: '' });
    }
    const log = fs.readFileSync(WIKI_LOG_PATH, 'utf8');
    res.json({ log });
  } catch (error) {
    console.error('Error reading wikipedia log:', error);
    res.status(500).json({ error: 'Failed to read wikipedia log: ' + error.message });
  }
});

app.get('/api/merge-enrichment-log', (req, res) => {
  try {
    if (!fs.existsSync(MERGE_LOG_PATH)) {
      return res.json({ log: '' });
    }
    const log = fs.readFileSync(MERGE_LOG_PATH, 'utf8');
    res.json({ log });
  } catch (error) {
    console.error('Error reading merge log:', error);
    res.status(500).json({ error: 'Failed to read merge log: ' + error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}); 
