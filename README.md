# VAVAGANG

## Desenvolvimento

1. Copie `.env.example` para `.env` e preencha as variáveis com a configuração do projeto Firebase autorizado e a publishable key do projeto Supabase `vavacallstorage`.
2. Ative Google em **Authentication > Sign-in method**.
3. Crie o Firestore Database e publique as regras versionadas em `firestore.rules`.
4. Adicione `localhost` e o domínio de produção em **Authentication > Settings > Authorized domains**.
5. No Supabase, mantenha o bucket público `sound-effects` e crie policies de Storage para permitir upload no bucket. Como o login do app é Firebase, a policy não recebe automaticamente o usuário como `authenticated`; para restringir uploads por usuário, use um endpoint backend com a service role, nunca no frontend.
6. Execute:

```bash
npm install
npm run dev
```

O app usa Authentication, Firestore, Supabase Storage e WebRTC diretamente no navegador. Câmera, microfone e compartilhamento de tela exigem HTTPS em produção ou `localhost` em desenvolvimento. Os efeitos sonoros usam o Firestore apenas para metadados e eventos; o áudio é reproduzido localmente e não passa pelo WebRTC.

## GitHub Pages

O repositório `guituzi08-sketch/VAVAGANG` é um site de projeto. A URL final será:

`https://guituzi08-sketch.github.io/VAVAGANG/`

O workflow em `.github/workflows/main.yml` instala com `npm ci`, executa `npm run build` e publica `dist`. Antes do primeiro push, cadastre os valores do `.env` como secrets, usando os nomes Firebase já listados e também `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.

Depois, em **Settings > Pages**, selecione **Source: GitHub Actions**. Faça push para `main` e acompanhe a execução na aba **Actions**. O domínio `guituzi08-sketch.github.io` também deve estar autorizado no Firebase Authentication.

## Estrutura

- `src/firebase.js`: inicialização do Firebase Web SDK por variáveis de ambiente.
- `src/supabase.js`: cliente Supabase Storage usando apenas valores públicos do frontend.
- `src/contexts/SoundEffectsContext.jsx`: lista, reproduz e publica efeitos sonoros compartilhados.
- `src/contexts/AuthContext.jsx`: sessão Google e sincronização de perfil.
- `src/contexts/CallContext.jsx`: mídia local, peers e sinalização Firestore.
- `src/services/`: operações de usuários e salas.
- `firestore.rules`: autorização para usuários autenticados e dados próprios.

## Prévia da comunidade

<table style="width: 100%; table-layout: fixed; border: none; border-collapse: collapse; background-color: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
	<thead>
		<tr style="border: none;">
			<th style="width: 20%; text-align: left; border: none; padding: 10px; font-weight: 600;">Bom de mira <span style="color: #8b949e; font-size: 0.8em;">▼</span></th>
			<th style="width: 55%; text-align: left; border: none; padding: 10px; font-weight: 600;"># geral</th>
			<th style="width: 25%; text-align: left; border: none; padding: 10px; font-weight: 600; font-size: 0.85em;">Buscar Bom de mira</th>
		</tr>
	</thead>
	<tbody>
		<tr style="border-top: 1px solid #30363d; vertical-align: top;">
			<td style="border-right: 1px solid #30363d; padding: 10px;">
				<ul style="list-style-type: none; padding: 0; margin: 0; font-size: 0.9em;">
					<li style="margin-bottom: 8px; color: #8b949e;">📅 Eventos</li>
					<li style="margin-bottom: 15px; color: #8b949e;">🌐 Impulsos de servidor</li>
					<li style="margin-bottom: 8px; font-weight: 600;">🔊 Ressaca do Corote</li>
					<li style="margin-bottom: 5px; color: #8b949e; font-size: 0.85em;">Canais de Texto ▼</li>
					<li style="background-color: #21262d; padding: 5px 10px; border-radius: 6px; font-weight: 600; color: #ffffff;"># geral</li>
					<li style="margin-top: 15px; color: #8b949e; font-size: 0.85em;">Canais de Voz ▼</li>
					<li style="margin-bottom: 8px;">🔊 Geral</li>
				</ul>
				<div style="margin-top: 80px; display: flex; justify-content: space-between; align-items: center; background-color: #161b22; padding: 10px; border-radius: 6px; font-size: 0.9em;">
					<span>b</span><span style="color: #e5534b;">🎤</span><span>🎧</span><span>⚙️</span>
				</div>
			</td>
			<td style="border-right: 1px solid #30363d; padding: 15px;">
				<div style="display: flex; margin-bottom: 20px;">
					<img src="https://i.imgur.com/1q6w0qB.png" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 15px;" alt="Gabriel Orlando">
					<div>
						<div style="font-weight: 600;">Gabriel Orlando <span style="color: #8b949e; font-weight: 400; font-size: 0.8em;">24/08/2026, 18:54</span></div>
						<a href="https://bit.ly/4wORmH7" style="color: #58a6ff; text-decoration: none;">https://bit.ly/4wORmH7</a>
						<div style="background-color: #161b22; border-left: 4px solid #58a6ff; padding: 10px; margin-top: 8px; border-radius: 4px;">
							<div style="font-weight: 600; color: #58a6ff;">Squadcall</div>
							<div style="font-size: 0.9em; color: #c9d1d9;">Squadcall — built on Replit. Update this description to reflect the app.</div>
						</div>
					</div>
				</div>
				<div style="display: flex;">
					<img src="https://i.imgur.com/3zX6oFm.png" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 15px;" alt="Zidane_BR">
					<div>
						<div style="font-weight: 600;">Zidane_BR <span style="color: #8b949e; font-weight: 400; font-size: 0.8em;">24/08/2026, 19:48</span></div>
						<img src="https://i.imgur.com/SeuRelatorio.png" alt="Relatório de Combate" style="max-width: 100%; border-radius: 8px; margin-top: 8px; border: 1px solid #30363d;">
					</div>
				</div>
				<div style="margin-top: 50px; background-color: #161b22; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; color: #8b949e;">
					<span>+ Conversar em #geral</span><span>🎁 👾 😊 😂 ➕</span>
				</div>
			</td>
			<td style="padding: 10px;">
				<div style="font-size: 0.8em; color: #8b949e; margin-bottom: 15px;">Atividade — 13</div>
				<div style="background-color: #161b22; padding: 10px; border-radius: 6px; margin-bottom: 10px; display: flex; align-items: center;">
					<img src="https://i.imgur.com/7rZ6oFm.png" style="width: 35px; height: 35px; border-radius: 50%; margin-right: 10px;" alt="marronzinxd">
					<div><div style="font-weight: 600; font-size: 0.9em;">marronzinxd</div><div style="font-size: 0.85em;">🎮 Fortnite</div><div style="font-size: 0.75em; color: #8b949e;">📅 6d atrás • 🟢 Em alta</div></div>
					<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Fortnite_F_Logo.svg/768px-Fortnite_F_Logo.svg.png" style="width: 20px; margin-left: auto; opacity: 0.5;" alt="Fortnite">
				</div>
				<div style="background-color: #161b22; padding: 10px; border-radius: 6px; margin-bottom: 15px; display: flex; align-items: center;">
					<img src="https://i.imgur.com/7rZ6oFm.png" style="width: 35px; height: 35px; border-radius: 50%; margin-right: 10px;" alt="marronzinxd">
					<div><div style="font-weight: 600; font-size: 0.9em;">marronzinxd</div><div style="font-size: 0.85em;">💥 VALORANT</div><div style="font-size: 0.75em; color: #8b949e;">🏆 Mais jogado: 18h</div></div>
					<img src="https://images.ctfassets.net/xthazk194yca/7E749y4B6M3o100fEbfLpL/e28c14ed83d61b6686c466d45ac95e24/val-logo.png" style="width: 20px; margin-left: auto; opacity: 0.5;" alt="VALORANT">
				</div>
				<div style="font-size: 0.8em; color: #8b949e; margin-bottom: 8px;">Disponível — 2</div>
				<div style="font-size: 0.9em; margin-bottom: 3px;"><span style="color: #22d3ee;">●</span> Boogie <span style="background-color: #0366d6; color: white; padding: 2px 4px; border-radius: 4px; font-size: 0.7em;">APP</span></div>
				<div style="font-size: 0.9em; margin-bottom: 15px;"><span style="color: #22d3ee;">●</span> Rafa <span style="color: #a335ee;">👺</span></div>
				<div style="font-size: 0.8em; color: #8b949e; margin-bottom: 8px;">Offline — 8</div>
				<div style="font-size: 0.9em; color: #6e7681; margin-bottom: 3px;">● Gab</div>
				<div style="font-size: 0.9em; color: #6e7681; margin-bottom: 3px;">● Gab</div>
				<div style="font-size: 0.9em; color: #6e7681; margin-bottom: 3px;">● Gabriel</div>
				<div style="font-size: 0.9em; color: #6e7681; margin-bottom: 3px;">● Gabriel Orlando</div>
			</td>
		</tr>
	</tbody>
</table>