import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
const { Pool } = pg;

// Load environment variables from the .env file
dotenv.config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  headers: {
    'apikey': process.env.SUPABASE_API_KEY
  },
});

const app = express();
const server = createServer(app);

app.use(bodyParser.json());
app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));

app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  try{
    await pool.query('INSERT INTO users (name, email, password) VALUES ($1, $2, $3)', [name, email, hashedPassword]);
    console.log('User Signed Up successfully. Redirecting to stream.');
    res.status(201).json({ message: 'User Signed Up successfully. Redirecting to stream.' });
    }catch (error) {
    res.status(500).send('Error registering user');
  }
});

app.post('/signin', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password);
      if (validPassword) {
        res.json({ user, redirectTo: '/stream' });
      } else {
        res.status(401).send('Invalid credentials');
      }
    } else {
      res.status(401).send('User not found, Sign Up');
    }
  } catch (error) {
    res.status(500).send('Error logging in user');
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let ffmpegProcess = null;
let ffmpegClosed = false;
let streamKey = '';

const startFFmpeg = (key) => {
  const options = [
    '-i', '-',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-r', '25',
    '-g', '50',
    '-keyint_min', '25',
    '-crf', '25',
    '-pix_fmt', 'yuv420p',
    '-sc_threshold', '0',
    '-profile:v', 'main',
    '-level', '3.1',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-f', 'flv',
    `rtmp://a.rtmp.youtube.com/live2/${key}`
  ];

  ffmpegProcess = spawn('ffmpeg', options);

  ffmpegProcess.stdout.on('data', (data) => {
    console.log(`ffmpeg stdout: ${data}`);
  });

  ffmpegProcess.stderr.on('data', (data) => {
    console.error(`ffmpeg stderr: ${data}`);
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`ffmpeg process exited with code ${code}`);
    ffmpegClosed = true;
  });

  ffmpegClosed = false;
};

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('startstream', (key) => {
    streamKey = key; // Store the stream key
    if (ffmpegProcess) {
      ffmpegProcess.kill(); // Stop any existing process
    }
    startFFmpeg(streamKey); // Start FFmpeg with the new key
  });

  socket.on('binarystream', (data) => {
    if (ffmpegClosed || !ffmpegProcess) {
      console.error('FFmpeg process is closed or not started.');
      return;
    }

    if (ffmpegProcess.stdin.writable) {
      ffmpegProcess.stdin.write(data, (err) => {
        if (err) {
          console.error('Error writing to FFmpeg stdin:', err);
        }
      });
    } else {
      console.error('FFmpeg stdin is not writable.');
    }
  });

  socket.on('stopstream', () => {
    if (ffmpegProcess) {
      ffmpegProcess.stdin.end();
      ffmpegProcess.kill();
      ffmpegProcess = null;
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    if (ffmpegProcess) {
      ffmpegProcess.stdin.end();
      ffmpegProcess.kill();
      ffmpegProcess = null;
    }
  });
});

server.listen(4000, () => {
  console.log('Server is running on port 4000');
});
