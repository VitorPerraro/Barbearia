#!/usr/bin/env node
// Script para gerar supabase-config.js a partir de variáveis de ambiente
// Roda automaticamente antes do deploy no Vercel

const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || 'https://seu-projeto.supabase.co';
const anonKey = process.env.SUPABASE_ANON_KEY || 'sua-chave-publica-aqui';

const configContent = `// Auto-gerado pelo build. Não edite manualmente!
window.NOIR_SUPABASE = {
  url: '${url}',
  anonKey: '${anonKey}',
};
`;

const configPath = path.join(process.cwd(), 'js', 'supabase-config.js');

// Cria a pasta js se não existir
const jsDir = path.join(process.cwd(), 'js');
if (!fs.existsSync(jsDir)) {
  fs.mkdirSync(jsDir, { recursive: true });
}

fs.writeFileSync(configPath, configContent);
console.log(`✅ supabase-config.js gerado em: ${configPath}`);
