import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('❌ กรุณาระบุ DISCORD_TOKEN และ CLIENT_ID ในไฟล์ .env ก่อนรันคำสั่งนี้');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('🏓 เช็คสถานะการเชื่อมต่อและความเร็วตอบสนอง (Latency) ของบอท'),

  new SlashCommandBuilder()
    .setName('join')
    .setDescription('🔊 สั่งให้บอทกระโดดเข้าห้องแชตเสียงที่คุณกำลังอยู่'),

  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('👋 สั่งให้บอทออกจากห้องแชตเสียง'),

  new SlashCommandBuilder()
    .setName('activity')
    .setDescription('🚀 สร้างลิงก์เปิด Discord Activity (มินิแอป) ในห้องเสียงที่คุณอยู่'),

  new SlashCommandBuilder()
    .setName('info')
    .setDescription('ℹ️ ข้อมูลระบบและความสามารถของบอท'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log('⏳ กำลังดึงคำสั่งเดิมและตรวจสอบ Entry Point...');

    let finalCommands = [...commands];

    if (!GUILD_ID || GUILD_ID.trim() === '' || GUILD_ID.includes('วาง')) {
      // ดึงคำสั่งที่มีอยู่เดิมใน Global
      const existingCommands = await rest.get(Routes.applicationCommands(CLIENT_ID));
      const entryPointCmd = existingCommands.find(c => c.type === 4); // PRIMARY_ENTRY_POINT

      if (entryPointCmd) {
        console.log(`✨ พบ Activity Entry Point command: "${entryPointCmd.name}" (รักษาไว้ตามข้อกำหนดของ Discord)`);
        finalCommands.push({
          name: entryPointCmd.name,
          type: entryPointCmd.type,
          handler: entryPointCmd.handler,
          description: entryPointCmd.description || '',
        });
      }

      console.log('⏳ กำลังลงทะเบียน Global Slash Commands...');
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: finalCommands }
      );
      console.log('✅ ลงทะเบียน Global Slash Commands สำเร็จ (/ping, /join, /leave, /activity, /info)');
    } else {
      console.log(`⏳ กำลังลงทะเบียนคำสั่งใน Guild ID: ${GUILD_ID}...`);
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: finalCommands }
      );
      console.log(`✅ ลงทะเบียน Slash Commands สำเร็จใน Guild ID: ${GUILD_ID}`);
    }
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการลงทะเบียน Commands:', error);
  }
}

registerCommands();
