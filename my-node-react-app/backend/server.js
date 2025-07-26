const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;
const uploadsDir = path.join(__dirname, 'uploads');

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });


app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working!' });
});

// 🔍 GET all media
app.get('/api/media', (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Error reading files' });

    const media = files.map((filename, index) => {
      const ext = path.extname(filename).toLowerCase();
      const type = ['.mp4', '.mov', '.avi'].includes(ext) ? 'video' : 'image';

      return {
        _id: index.toString(), // simulate an ID
        url: `http://localhost:${PORT}/uploads/${filename}`,
        type,
        caption: '', // placeholder
        filePath: filename,
      };
    });

    res.json(media);
  });
});

// 📤 POST upload media
app.post('/api/media/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = path.extname(req.file.filename).toLowerCase();
  const type = ['.mp4', '.mov', '.avi'].includes(ext) ? 'video' : 'image';

  const caption = req.body.caption || '';

  res.json({
    _id: Date.now().toString(),
    url: `http://localhost:${PORT}/uploads/${req.file.filename}`,
    type,
    caption,
    filePath: req.file.filename
  });
});

// 🗑️ POST delete media
app.post('/api/media/delete', (req, res) => {
  const { filePath } = req.body;

  if (!filePath) return res.status(400).json({ error: 'No filePath provided' });

  const fullPath = path.join(uploadsDir, filePath);
  fs.unlink(fullPath, err => {
    if (err) return res.status(500).json({ error: 'Error deleting file' });

    res.json({ success: true });
  });
});

app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
