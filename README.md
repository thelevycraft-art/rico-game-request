# RICO GAME REQUEST

Website request game untuk streamer dengan:
- Landing page gaming
- Form request game
- Search game
- Voting
- Status request
- Dashboard admin
- Statistik
- OBS Browser Source overlay
- SQLite database lokal

## 1. Install Node.js
Install Node.js LTS terlebih dahulu.

## 2. Buka terminal
Masuk ke folder project:
```bash
cd rico-game-request
```

## 3. Install dependency
```bash
npm install
```

## 4. Buat konfigurasi
Copy `.env.example` menjadi `.env`.

Windows PowerShell:
```powershell
Copy-Item .env.example .env
```

Lalu ubah:
```env
SESSION_SECRET=buat-string-rahasia-sendiri
ADMIN_USER=admin
ADMIN_PASSWORD=password-kamu
```

Catatan: server juga bisa berjalan tanpa `.env`, tetapi password default adalah `admin123`. Untuk penggunaan online, WAJIB mengganti password dan SESSION_SECRET.

## 5. Jalankan
```bash
npm start
```

Buka:
http://localhost:3000

Dashboard:
http://localhost:3000/admin/

OBS:
http://localhost:3000/overlay/

## 6. Menambahkan ke OBS
OBS > Sources > Browser > URL:
http://localhost:3000/overlay/

Ukuran yang disarankan:
Width 600
Height 150

Centang "Shutdown source when not visible" jika diperlukan.

## 7. Catatan database
Database otomatis dibuat di:
data/games.db

Jangan menghapus file tersebut jika ingin mempertahankan request dan vote.

## 8. Untuk online
Untuk tahap berikutnya, sebaiknya:
- pakai VPS/hosting Node.js
- HTTPS
- session store berbasis database/Redis
- rate limiting
- Cloudflare
- database PostgreSQL/Supabase
- login penonton
- upload gambar
- jadwal stream
- Discord/Telegram notification
