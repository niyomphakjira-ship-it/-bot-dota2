# 🚀 Discord Bot + Activity (Embedded App) Starter Kit

โปรเจกต์คู่มือและโค้ดตัวอย่างสำหรับพัฒนา **Discord Bot** พร้อมระบบสั่งเปิด **Discord Activity** (มินิแอป/เกมเว็บเล่นร่วมกันในห้องเสียงของ Discord) ด้วย **JavaScript / Node.js**

---

## 📁 โครงสร้างโปรเจกต์

```text
discord-bot-activity/
├── bot/                     # ฝั่ง Discord Bot (discord.js v14)
│   ├── src/
│   │   ├── index.js         # ตัวรันบอทหลัก พร้อม Slash Command Handler
│   │   └── register-commands.js # สคริปต์ลงทะเบียน Slash Commands
│   ├── .env.example         # ตัวอย่างการตั้งค่า Token และ IDs
│   └── package.json
│
├── activity-client/         # ฝั่ง Activity Web App (Vite + @discord/embedded-app-sdk)
│   ├── src/
│   │   ├── main.js          # ตรรกะของเกม และการเชื่อมต่อ Discord SDK
│   │   └── style.css        # ดีไซน์ธีม Discord Dark Mode
│   ├── index.html           # หน้าจอเว็บแอป
│   ├── vite.config.js
│   └── package.json
│
└── README.md
```

---

## 🛠️ ขั้นตอนที่ 1: ตั้งค่าบน Discord Developer Portal

1. ไปที่ [Discord Developer Portal](https://discord.com/developers/applications) และเข้าสู่ระบบ
2. กดปุ่ม **"New Application"** ตั้งชื่อแอปพลิเคชันของคุณ
3. **คัดลอก Client ID / Application ID:**
   - ที่แถบ **General Information** คัดลอก `Application ID`
4. **สร้าง Bot Token:**
   - ไปที่แถบ **Bot** -> กด **Reset Token** -> คัดลอก Token เก็บไว้
   - ในส่วน **Privileged Gateway Intents** ด้านล่าง ให้เปิดสวิตช์:
     - `Server Members Intent`
     - `Message Content Intent`
5. **เปิดใช้งาน Embedded App (สำหรับ Activity):**
   - ไปที่แถบ **Embedded App** (หรือ App / Activities)
   - เปิดฟีเจอร์ Embedded Application
6. **ดึง Bot เข้าเซิร์ฟเวอร์ Discord:**
   - ไปที่แถบ **OAuth2** -> **URL Generator**
   - ในช่อง **SCOPES** เลือก: `bot`, `applications.commands`
   - ในช่อง **BOT PERMISSIONS** เลือก:
     - `Send Messages`
     - `Create Instant Invite` (สำคัญมาก: บอทต้องใช้สิทธิ์นี้สร้างลิงก์ Activity)
     - `Embed Links`
     - `Connect` / `Speak`
   - คัดลอก URL ด้านล่างแล้วเปิดในเบราว์เซอร์เพื่อดึงบอทเข้าเซิร์ฟเวอร์ของคุณ

---

## 📦 ขั้นตอนที่ 2: ติดตั้ง Dependencies

เปิด Terminal หรือ PowerShell แล้วเข้าไปติดตั้งแพ็กเกจ:

### 1) ติดตั้งฝั่ง Bot:
```bash
cd bot
npm install
```

### 2) ติดตั้งฝั่ง Activity:
```bash
cd ../activity-client
npm install
```

---

## ⚙️ ขั้นตอนที่ 3: ตั้งค่าไฟล์ .env ของ Bot

ในโฟลเดอร์ `bot/` ให้คัดลอกไฟล์ `.env.example` เป็น `.env`:

```env
DISCORD_TOKEN=โทเคนบอทของคุณ
CLIENT_ID=Application_ID_ของคุณ
GUILD_ID=IDเซิร์ฟเวอร์_สำหรับเทสคำสั่งทันที (คลิกขวาที่ชื่อเซิร์ฟเวอร์ Discord -> Copy Server ID)
```

---

## 🎯 ขั้นตอนที่ 4: เริ่มต้นใช้งาน

### 1) ลงทะเบียน Slash Commands:
```bash
cd bot
node src/register-commands.js
```
*(ระบบจะลงทะเบียนคำสั่ง `/ping`, `/info`, และ `/activity` เข้าเซิร์ฟเวอร์ของคุณทันที)*

### 2) รันบอท Discord:
```bash
node src/index.js
```
เมื่อบอทออนไลน์จะขึ้นว่า `🤖 บอทพร้อมทำงานแล้วในชื่อ: ...`

### 3) รันฝั่ง Activity Client (มินิแอป):
```bash
cd ../activity-client
npm run dev
```
*(หน้าเว็บจะรันอยู่ที่ `http://localhost:3000` คุณสามารถเปิดในเบราว์เซอร์เพื่อลองเล่นใน Mock Dev Mode ได้ทันที)*

---

## 🎮 คำสั่งใน Discord
* `/ping`: เช็คสถานะการตอบสนองของบอท
* `/info`: ข้อมูลและสถิติของระบบ
* `/activity`: **ไฮไลต์สำคัญ** — บอทจะตรวจสอบว่าคุณอยู่ในห้องเสียงใด และสร้างปุ่มคลิกเปิด Activity มินิแอปขึ้นมาเล่นด้วยกันในห้องเสียงทันที!
