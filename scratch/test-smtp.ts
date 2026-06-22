// Script de diagnóstico SMTP - roda com: npx tsx scratch/test-smtp.ts
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== Diagnóstico Completo de E-mail ===\n');

  // 1. Ler configurações do banco
  const { data, error } = await supabase
    .from('settings')
    .select('api_key')
    .eq('id', 'notification_settings')
    .single();

  if (error || !data) {
    console.error('❌ Erro ao ler configurações do banco:', error?.message);
    return;
  }

  const settings = JSON.parse(data.api_key);
  console.log('✅ Configurações lidas do banco:');
  console.log('  Host:', settings.smtp_host);
  console.log('  Port:', settings.smtp_port);
  console.log('  Secure:', settings.smtp_secure);
  console.log('  User:', settings.smtp_user);
  console.log('  Pass:', settings.smtp_pass ? '***' + settings.smtp_pass.slice(-4) : 'VAZIO');
  console.log('  From:', settings.smtp_from);
  console.log('');

  if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
    console.error('❌ SMTP não está totalmente configurado no banco!');
    return;
  }

  // 2. Buscar e-mail do profissional
  const { data: prof } = await supabase
    .from('professionals')
    .select('id, full_name, google_email')
    .limit(5);

  console.log('👥 Profissionais cadastrados:');
  prof?.forEach(p => console.log(`  ${p.full_name} → ${p.google_email || '(sem google_email)'}`));
  console.log('');

  // 3. Testar conexão SMTP
  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: Number(settings.smtp_port) || 587,
    secure: settings.smtp_secure !== undefined ? settings.smtp_secure : Number(settings.smtp_port) === 465,
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_pass
    }
  });

  console.log('🔌 Testando conexão SMTP...');
  try {
    await transporter.verify();
    console.log('✅ Conexão SMTP OK!\n');
  } catch (err: any) {
    console.error('❌ Falha na conexão SMTP:', err.message);
    if (err.response) console.error('   Resposta:', err.response);
    return;
  }

  // 4. Enviar e-mail de teste
  const testTo = 'punked.medeiros@gmail.com';
  const fromField = settings.smtp_from
    ? (settings.smtp_from.includes('<')
        ? settings.smtp_from
        : `"${settings.smtp_from}" <${settings.smtp_user}>`)
    : `"Evolução Clínica" <${settings.smtp_user}>`;

  console.log(`📧 Enviando e-mail de diagnóstico para: ${testTo}`);
  console.log(`   From: ${fromField}`);

  try {
    const info = await transporter.sendMail({
      from: fromField,
      to: testTo,
      subject: '[Diagnóstico] Teste SMTP - ' + new Date().toLocaleString('pt-BR'),
      text: 'E-mail de diagnóstico enviado com sucesso pelo script local.',
      html: '<p><strong>Diagnóstico SMTP</strong> — E-mail enviado pelo script de teste local. Se chegou, o SMTP está funcionando corretamente.</p>'
    });

    console.log('\n✅ E-MAIL ENVIADO COM SUCESSO!');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    console.log('   Accepted:', info.accepted);
    if (info.rejected?.length) console.log('   Rejected:', info.rejected);
  } catch (err: any) {
    console.error('\n❌ ERRO AO ENVIAR E-MAIL:', err.message);
    if (err.response) console.error('   Resposta SMTP:', err.response);
    if (err.code) console.error('   Código:', err.code);
  }
}

main().catch(console.error);
