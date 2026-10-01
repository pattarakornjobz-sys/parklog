// ใส่ค่าจาก Supabase → Project Settings → API (ดู DEPLOY.md ขั้นตอนที่ 4)
// anon key เปิดเผยได้ เพราะข้อมูลถูกป้องกันด้วย Row Level Security
window.PARKLOG_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-KEY'
};
