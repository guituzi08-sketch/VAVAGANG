# VAVAGANG

## Desenvolvimento

1. Copie `.env.example` para `.env` e preencha as variáveis com a configuração do projeto Firebase autorizado.
2. Ative Google em **Authentication > Sign-in method**.
3. Crie o Firestore Database e publique as regras versionadas em `firestore.rules`.
4. Adicione `localhost` e o domínio de produção em **Authentication > Settings > Authorized domains**.
5. Execute:

```bash
npm install
npm run dev
```

O app usa Authentication, Firestore e WebRTC diretamente no navegador. Câmera, microfone e compartilhamento de tela exigem HTTPS em produção ou `localhost` em desenvolvimento.

## GitHub Pages

O repositório `guituzi08-sketch/VAVAGANG` é um site de projeto. A URL final será:

`https://guituzi08-sketch.github.io/VAVAGANG/`

O workflow em `.github/workflows/deploy-pages.yml` instala com `npm ci`, executa `npm run build` e publica `dist`. Antes do primeiro push, cadastre os seis valores do `.env` como **Settings > Secrets and variables > Actions > New repository secret**, usando os nomes `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` e `VITE_FIREBASE_APP_ID`.

Depois, em **Settings > Pages**, selecione **Source: GitHub Actions**. Faça push para `main` e acompanhe a execução na aba **Actions**. O domínio `guituzi08-sketch.github.io` também deve estar autorizado no Firebase Authentication.

## Estrutura

- `src/firebase.js`: inicialização do Firebase Web SDK por variáveis de ambiente.
- `src/contexts/AuthContext.jsx`: sessão Google e sincronização de perfil.
- `src/contexts/CallContext.jsx`: mídia local, peers e sinalização Firestore.
- `src/services/`: operações de usuários e salas.
- `firestore.rules`: autorização para usuários autenticados e dados próprios.