import {
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Headphones,
  Lock,
  Monitor,
  Palette,
  Save,
  Shield,
  SlidersHorizontal,
  UserRound,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import Avatar from "../components/Avatar";
import { removeProfileImage, uploadProfileImage, validateProfileImage } from "../services/profileImageService";
import { updateUserProfile } from "../services/userService";
import { getErrorMessage } from "../utils/errorMessage";

const categories = [
  { id: "account", label: "Minha conta", icon: UserRound },
  { id: "profile", label: "Perfil", icon: UserRound },
  { id: "privacy", label: "Privacidade", icon: Lock },
  { id: "security", label: "Segurança", icon: Shield },
  { id: "appearance", label: "Aparência", icon: Palette },
  { id: "notifications", label: "Notificações", icon: Volume2 },
  { id: "voice", label: "Voz e vídeo", icon: Headphones },
  { id: "chat", label: "Chat", icon: SlidersHorizontal },
  { id: "advanced", label: "Avançado", icon: Monitor },
];

const defaults = {
  privacy: "Todos",
  messages: true,
  mentions: true,
  friendships: true,
  followers: true,
  likes: true,
  comments: true,
  calls: true,
  enterSends: true,
  linkPreviews: true,
  autoMedia: true,
  language: "Português (Brasil)",
  animations: "Todas",
  density: "Normal",
  scale: "Normal",
  status: "Online",
};

export default function SettingsPage() {
  const { firebaseUser, profile, refreshProfile } = useAuth();
  const [selected, setSelected] = useState("account");
  const [settings, setSettings] = useState(() => ({
    ...defaults,
    ...readLocalSettings(),
  }));
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSettings((current) => ({ ...current, ...profile?.settings }));
  }, [profile?.settings]);
  useEffect(() => {
    applyAppearance(settings);
  }, [settings.animations, settings.scale, settings.theme]);

  function updateSetting(key, value) {
    setSaved(false);
    setSettings((current) => ({ ...current, [key]: value }));
    if (["animations", "density", "scale"].includes(key))
      localStorage.setItem(
        "vavagang:settings",
        JSON.stringify({ ...settings, [key]: value }),
      );
  }

  async function saveSettings() {
    setSaved(false);
    setSaveError("");
    setSaving(true);
    try {
      await updateUserProfile(firebaseUser.uid, { settings });
      localStorage.setItem("vavagang:settings", JSON.stringify(settings));
      setSaved(true);
    } catch (error) {
      setSaveError(getErrorMessage(error, "Não foi possível salvar as configurações."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="settings-page">
      <header className="settings-topbar">
        <div>
          <p className="eyebrow">Conta e experiência</p>
          <h1>Configurações</h1>
        </div>
        <button
          className="settings-close"
          onClick={() => window.history.back()}
          title="Fechar"
        >
          <X size={18} />
        </button>
      </header>
      <div className="settings-layout">
        <nav
          className="settings-sidebar"
          aria-label="Categorias de configurações"
        >
          <p className="settings-nav-title">Preferências</p>
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <button
                className={`settings-nav-item ${selected === category.id ? "active" : ""}`}
                key={category.id}
                onClick={() => setSelected(category.id)}
              >
                <Icon size={16} />
                <span>{category.label}</span>
                <ChevronRight size={14} />
              </button>
            );
          })}
          <p className="settings-nav-title settings-nav-lower">Conta</p>
          <a className="settings-nav-item" href="mailto:suporte@vavagang.app">
            <CircleHelp size={16} />
            <span>Ajuda e suporte</span>
          </a>
        </nav>
        <section className="settings-content">
          <SettingsSection
            id={selected}
            profile={profile}
            firebaseUser={firebaseUser}
            settings={settings}
            updateSetting={updateSetting}
            refreshProfile={refreshProfile}
          />
        </section>
      </div>
      <div className="settings-savebar">
        <span>
          {saveError ? <span className="settings-error">{saveError}</span> : saved ? (
            <>
              <Check size={15} /> Alterações salvas
            </>
          ) : (
            "Suas preferências ficam vinculadas à sua conta."
          )}
        </span>
        <button className="primary-button settings-save" onClick={saveSettings} disabled={saving}>
          <Save size={16} /> {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </main>
  );
}

function SettingsSection({ id, ...props }) {
  if (id === "profile") return <ProfileSettings {...props} />;
  if (id === "privacy") return <PrivacySettings {...props} />;
  if (id === "security") return <SecuritySettings {...props} />;
  if (id === "appearance") return <AppearanceSettings {...props} />;
  if (id === "notifications") return <NotificationsSettings {...props} />;
  if (id === "voice") return <VoiceSettings {...props} />;
  if (id === "chat") return <ChatSettings {...props} />;
  if (id === "advanced") return <AdvancedSettings {...props} />;
  return <AccountSettings {...props} />;
}

function SectionHeader({ eyebrow, title, description }) {
  return (
    <div className="settings-section-header">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
    </div>
  );
}
function SettingCard({ title, description, children }) {
  return (
    <section className="setting-card">
      <div className="setting-card-copy">
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </div>
      {children}
    </section>
  );
}
function Choice({ value, options, onChange }) {
  return (
    <select
      className="settings-select"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => {
        const item =
          typeof option === "string"
            ? { label: option, value: option }
            : option;
        return (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        );
      })}
    </select>
  );
}
function Toggle({ checked, onChange }) {
  return (
    <button
      className={`toggle ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span />
    </button>
  );
}
function TextField({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        disabled={disabled}
            onChange={disabled ? undefined : (event) => onChange(event.target.value)}
      />
    </label>
  );
}

function AccountSettings({ profile, firebaseUser, refreshProfile }) {
  const [name, setName] = useState(profile?.displayName ?? "");
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [status, setStatus] = useState(profile?.status ?? "Online");
  const [message, setMessage] = useState("");
  useEffect(() => {
    setNickname(profile?.nickname ?? "");
  }, [profile?.nickname]);
  async function saveProfile(event) {
    event.preventDefault();
    setMessage("");
    try {
      await refreshProfile({
        displayName: name.trim(),
        nickname,
        username: username.trim().replace(/^@/, ""),
        bio: bio.trim(),
        status,
      });
      setMessage("Perfil atualizado");
    } catch (error) {
      setMessage(error.message);
    }
  }
  return (
    <>
      <SectionHeader
        eyebrow="Conta"
        title="Minha conta"
        description="Gerencie os dados básicos vinculados à sua identidade Vavagang."
      />
      <div className="account-hero">
        <div className="avatar avatar-fallback account-avatar">
          {name?.[0] ?? "V"}
        </div>
        <div>
          <strong>{nickname || name || "Seu nome"}</strong>
          <span>{firebaseUser?.email}</span>
        </div>
        <span className="status-pill">
          <i /> {status}
        </span>
      </div>
      <form className="settings-form" onSubmit={saveProfile}>
        <SettingCard
          title="Dados do perfil"
          description="Nome, nickname, username, bio e status são salvos no seu perfil Firestore."
        >
          <div className="field-grid">
            <TextField label="Nome" value={name} onChange={setName} />
            <TextField
              label="Nickname"
              value={nickname}
              onChange={setNickname}
            />
            <TextField
              label="Username"
              value={username}
              onChange={setUsername}
            />
            <TextField
              label="E-mail"
              value={firebaseUser?.email}
              disabled
            />
            <TextField label="Status" value={status} onChange={setStatus} />
          </div>
          <label className="settings-field full-field">
            <span>Bio</span>
            <textarea
              value={bio}
              maxLength={160}
              onChange={(event) => setBio(event.target.value)}
            />
          </label>
          <div className="settings-actions">
            <button className="primary-button" type="submit">
              <Save size={16} /> Editar perfil
            </button>
            {message && <span className="settings-feedback">{message}</span>}
          </div>
        </SettingCard>
      </form>
      <SettingCard
        title="Data de criação"
        description="Registrada pelo Firebase no primeiro login."
      >
        <span className="account-date">{formatDate(profile?.createdAt)}</span>
      </SettingCard>
    </>
  );
}

function ProfileSettings({ profile, refreshProfile }) {
  const [avatar, setAvatar] = useState(profile?.photoURL ?? "");
  const [banner, setBanner] = useState(profile?.bannerURL ?? "");
  const [preview, setPreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [avatarMessage, setAvatarMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  function selectAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarMessage("");
    try {
      validateProfileImage(file);
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    } catch (error) {
      setAvatarMessage(error.message);
    }
  }
  async function saveAvatar() {
    if (!selectedFile) return;
    setUploading(true);
    setAvatarMessage("Enviando imagem...");
    try {
      const url = await uploadProfileImage(profile.uid, selectedFile);
      await refreshProfile({ photoURL: url });
      setAvatar(url);
      setSelectedFile(null);
      setPreviewUrl("");
      setAvatarMessage("Foto de perfil atualizada.");
    } catch (error) {
      setAvatarMessage(error.message || "Não foi possível atualizar a foto de perfil.");
    } finally {
      setUploading(false);
    }
  }
  async function clearAvatar() {
    setUploading(true);
    setAvatarMessage("");
    try {
      await removeProfileImage(profile.uid);
      await refreshProfile({ photoURL: "" });
      setAvatar("");
      setSelectedFile(null);
      setPreviewUrl("");
      setAvatarMessage("Foto de perfil removida.");
    } catch (error) {
      setAvatarMessage(error.message || "Não foi possível remover a foto de perfil.");
    } finally {
      setUploading(false);
    }
  }
  async function save() {
    await refreshProfile({ photoURL: avatar, bannerURL: banner });
  }
  return (
    <>
      <SectionHeader
        eyebrow="Identidade"
        title="Perfil"
        description="Ajuste como sua presença aparece para outras pessoas."
      />
      <SettingCard
        title="Avatar"
        description="Escolha uma imagem JPG, PNG ou WEBP de até 5 MB."
      >
        <div className="profile-media-row">
          <Avatar profile={{ ...profile, photoURL: previewUrl || avatar }} className="avatar account-avatar" />
          <div className="profile-upload-controls">
            <label className="secondary-button profile-file-button">
              <Camera size={16} /> Alterar foto
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectAvatar} disabled={uploading} />
            </label>
            {selectedFile && <button className="primary-button" type="button" onClick={saveAvatar} disabled={uploading}>{uploading ? "Enviando imagem..." : "Confirmar upload"}</button>}
            {avatar && !selectedFile && <button className="secondary-button" type="button" onClick={clearAvatar} disabled={uploading}>Remover foto</button>}
            {avatarMessage && <span className="settings-feedback" role="status">{avatarMessage}</span>}
          </div>
        </div>
      </SettingCard>
      <SettingCard
        title="Banner"
        description="A imagem será salva no seu perfil quando você confirmar."
      >
        <TextField label="URL do banner" value={banner} onChange={setBanner} />
      </SettingCard>
      <div className="settings-actions">
        <button
          className="secondary-button"
          onClick={() => setPreview(!preview)}
        >
          {preview ? "Fechar prévia" : "Visualizar perfil"}
        </button>
        <button className="primary-button" onClick={save}>
          <Save size={16} /> Salvar perfil
        </button>
      </div>
      {preview && (
        <div
          className="profile-preview"
          style={banner ? { backgroundImage: `url(${banner})` } : undefined}
        >
          <Avatar profile={{ ...profile, photoURL: previewUrl || avatar }} className="avatar account-avatar" />
          <strong>{profile?.displayName}</strong>
          <span>@{profile?.username ?? "username"}</span>
          <p>{profile?.bio || "Sua bio aparecerá aqui."}</p>
        </div>
      )}
    </>
  );
}

function PrivacySettings({ settings, updateSetting }) {
  return (
    <>
      <SectionHeader
        eyebrow="Controle"
        title="Privacidade"
        description="Escolha quem pode interagir com você e com o que você publica."
      />
      <SettingCard
        title="Mensagens diretas"
        description="Quem pode iniciar uma conversa com você."
      >
        <Choice
          value={settings.privacy}
          options={["Todos", "Amigos", "Ninguém"]}
          onChange={(value) => updateSetting("privacy", value)}
        />
      </SettingCard>
      <SettingCard
        title="Solicitações de amizade"
        description="Controle quem pode enviar uma solicitação."
      >
        <Choice
          value={settings.friendRequests ?? "Todos"}
          options={["Todos", "Amigos em comum", "Ninguém"]}
          onChange={(value) => updateSetting("friendRequests", value)}
        />
      </SettingCard>
      <SettingCard
        title="Status e atividade"
        description="O status salvo na sua conta é usado pela interface autenticada."
      >
        <Toggle
          checked={settings.showStatus ?? true}
          onChange={(value) => updateSetting("showStatus", value)}
        />
      </SettingCard>
    </>
  );
}

function SecuritySettings({ firebaseUser }) {
  return (
    <>
      <SectionHeader
        eyebrow="Proteção"
        title="Segurança"
        description="Veja a sessão atual e as proteções disponíveis pela autenticação Firebase."
      />
      <SettingCard
        title="Sessão atual"
        description="Esta sessão é mantida pelo Firebase Authentication."
      >
        <div className="session-row">
          <Monitor size={18} />
          <div>
            <strong>Navegador atual</strong>
            <span>{firebaseUser?.email}</span>
          </div>
          <span className="session-now">Ativa agora</span>
        </div>
      </SettingCard>
      <SettingCard
        title="Autenticação em duas etapas"
        description="O Vavagang ainda não implementa uma camada própria de 2FA."
      >
        <span className="feature-note">
          Configure métodos adicionais diretamente na conta Google vinculada.
        </span>
      </SettingCard>
      <SettingCard
        title="Encerrar sessão"
        description="Use o botão de sair no menu da conta para encerrar esta sessão."
      >
        <span className="feature-note">
          O encerramento global de sessões depende das ferramentas do provedor
          Google.
        </span>
      </SettingCard>
    </>
  );
}

function AppearanceSettings({ settings, updateSetting }) {
  const themes = [
    { name: "VAVAGANG DARK", color: "#2563eb" },
    { name: "MIDNIGHT", color: "#7c3aed" },
    { name: "CYBER BLUE", color: "#06b6d4" },
    { name: "EMERALD", color: "#10b981" },
    { name: "RED NIGHT", color: "#ef4444" },
  ];
  return (
    <>
      <SectionHeader
        eyebrow="Interface"
        title="Aparência"
        description="Escolha a densidade e o ritmo visual da sua experiência."
      />
      <SettingCard
        title="Temas"
        description="A preferência é salva na sua conta e aplicada neste navegador."
      >
        <div className="theme-grid">
          {themes.map((theme) => (
            <button
              className={`theme-option ${settings.theme === theme.name ? "selected" : ""}`}
              key={theme.name}
              onClick={() => updateSetting("theme", theme.name)}
            >
              <span
                className="theme-preview"
                style={{
                  background: `linear-gradient(135deg, #07090c 60%, ${theme.color})`,
                }}
              >
                <i />
              </span>
              <b>{theme.name}</b>
              {settings.theme === theme.name && <Check size={14} />}
            </button>
          ))}
        </div>
      </SettingCard>
      <SettingCard
        title="Densidade"
        description="Ajuste o espaço entre elementos da interface."
      >
        <Choice
          value={settings.density}
          options={["Compacta", "Normal", "Confortável"]}
          onChange={(value) => updateSetting("density", value)}
        />
      </SettingCard>
      <SettingCard
        title="Animações"
        description="Reduza movimento para uma experiência mais confortável."
      >
        <Choice
          value={settings.animations}
          options={["Todas", "Reduzidas", "Desativadas"]}
          onChange={(value) => updateSetting("animations", value)}
        />
      </SettingCard>
    </>
  );
}

function NotificationsSettings({ settings, updateSetting }) {
  const items = [
    ["messages", "Mensagens"],
    ["mentions", "Menções"],
    ["friendships", "Amizades"],
    ["followers", "Seguidores"],
    ["likes", "Curtidas"],
    ["comments", "Comentários"],
    ["calls", "Chamadas"],
  ];
  return (
    <>
      <SectionHeader
        eyebrow="Alertas"
        title="Notificações"
        description="Controle quais eventos merecem sua atenção."
      />
      <SettingCard
        title="Notificações no aplicativo"
        description="Essas preferências serão salvas no seu documento de usuário."
      >
        <div className="toggle-list">
          {items.map(([key, label]) => (
            <div className="toggle-row" key={key}>
              <span>{label}</span>
              <Toggle
                checked={settings[key]}
                onChange={(value) => updateSetting(key, value)}
              />
            </div>
          ))}
        </div>
      </SettingCard>
    </>
  );
}

function VoiceSettings({ settings, updateSetting }) {
  const [devices, setDevices] = useState([]);
  const [selectedMic, setSelectedMic] = useState("");
  const [selectedCamera, setSelectedCamera] = useState("");
  const [micTesting, setMicTesting] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  useEffect(() => {
    enumerateDevices();
    return () =>
      streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  async function enumerateDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError("Seu navegador não oferece detecção de dispositivos de mídia.");
      return;
    }
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list);
      setSelectedMic(list.find((device) => device.kind === "audioinput")?.deviceId ?? "");
      setSelectedCamera(list.find((device) => device.kind === "videoinput")?.deviceId ?? "");
    } catch (mediaError) {
      setError(getErrorMessage(mediaError, "Não foi possível detectar seus dispositivos."));
    }
  }
  async function testMicrophone() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setMicTesting(true);
      setTimeout(() => {
        stream.getTracks().forEach((track) => track.stop());
        setMicTesting(false);
      }, 3000);
    } catch (mediaError) {
      setError(
        mediaError.name === "NotAllowedError"
          ? "Permissão de microfone recusada."
          : mediaError.message,
      );
    }
  }
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (mediaError) {
      setError(
        mediaError.name === "NotAllowedError"
          ? "Permissão de câmera recusada."
          : mediaError.message,
      );
    }
  }
  const microphones = devices.filter((device) => device.kind === "audioinput");
  const cameras = devices.filter((device) => device.kind === "videoinput");
  return (
    <>
      <SectionHeader
        eyebrow="Mídia"
        title="Voz e vídeo"
        description="Dispositivos e permissões detectados diretamente pelo seu navegador."
      />
      <SettingCard
        title="Microfone"
        description="Os dispositivos listados vêm de enumerateDevices()."
      >
        <Choice
          value={selectedMic}
          options={
            microphones.length
              ? microphones.map((device, index) => ({
                  label: device.label || `Microfone ${index + 1}`,
                  value: device.deviceId,
                }))
              : ["Nenhum microfone detectado"]
          }
          onChange={setSelectedMic}
        />
        <button
          className="secondary-button device-action"
          onClick={testMicrophone}
        >
          <Volume2 size={15} />{" "}
          {micTesting ? "Testando..." : "Testar microfone"}
        </button>
        <div className={`meter ${micTesting ? "active" : ""}`}>
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </SettingCard>
      <SettingCard
        title="Câmera"
        description="Ative a câmera para conferir o preview local."
      >
        <Choice
          value={selectedCamera}
          options={
            cameras.length
              ? cameras.map((device, index) => ({
                  label: device.label || `Câmera ${index + 1}`,
                  value: device.deviceId,
                }))
              : ["Nenhuma câmera detectada"]
          }
          onChange={setSelectedCamera}
        />
        <button
          className="secondary-button device-action"
          onClick={startCamera}
        >
          <Camera size={15} /> Testar câmera
        </button>
        {
          <video
            className="device-preview"
            ref={videoRef}
            autoPlay
            playsInline
            muted
          />
        }
      </SettingCard>
      {error && <p className="settings-error">{error}</p>}
      <SettingCard
        title="Entrada de voz"
        description="O modo selecionado será aplicado na chamada quando o controle estiver disponível."
      >
        <Choice
          value={settings.voiceMode ?? "Atividade de voz"}
          options={["Atividade de voz", "Push to Talk"]}
          onChange={(value) => updateSetting("voiceMode", value)}
        />
      </SettingCard>
    </>
  );
}

function ChatSettings({ settings, updateSetting }) {
  return (
    <>
      <SectionHeader
        eyebrow="Conversas"
        title="Chat"
        description="Ajuste a forma como mensagens e mídias aparecem."
      />
      <SettingCard title="Comportamento do chat">
        <div className="toggle-list">
          <div className="toggle-row">
            <span>Enter envia mensagem</span>
            <Toggle
              checked={settings.enterSends}
              onChange={(value) => updateSetting("enterSends", value)}
            />
          </div>
          <div className="toggle-row">
            <span>Mostrar previews de links</span>
            <Toggle
              checked={settings.linkPreviews}
              onChange={(value) => updateSetting("linkPreviews", value)}
            />
          </div>
          <div className="toggle-row">
            <span>Mostrar mídia automaticamente</span>
            <Toggle
              checked={settings.autoMedia}
              onChange={(value) => updateSetting("autoMedia", value)}
            />
          </div>
        </div>
      </SettingCard>
    </>
  );
}
function AdvancedSettings({ settings, updateSetting }) {
  return (
    <>
      <SectionHeader
        eyebrow="Sistema"
        title="Avançado"
        description="Controles técnicos para adaptar a interface ao seu dispositivo."
      />
      <SettingCard title="Escala da interface">
        <Choice
          value={settings.scale}
          options={["Pequeno", "Normal", "Grande"]}
          onChange={(value) => updateSetting("scale", value)}
        />
      </SettingCard>
      <SettingCard
        title="Idioma"
        description="Escolha o idioma salvo para sua próxima sessão."
      >
        <Choice
          value={settings.language}
          options={["Português (Brasil)", "English", "Español"]}
          onChange={(value) => updateSetting("language", value)}
        />
      </SettingCard>
      <SettingCard
        title="Dados locais"
        description="Preferências de interface e volume individual podem ser removidas deste navegador."
      >
        <button
          className="secondary-button"
          onClick={() => {
            localStorage.removeItem("vavagang:settings");
            setSettings(defaults);
            setSaved(false);
          }}
        >
          Limpar preferências locais
        </button>
      </SettingCard>
    </>
  );
}

function readLocalSettings() {
  try {
    return JSON.parse(localStorage.getItem("vavagang:settings") ?? "{}");
  } catch {
    return {};
  }
}
function applyAppearance(settings) {
  const themeColors = {
    "VAVAGANG DARK": ["#2563eb", "#3b82f6"],
    MIDNIGHT: ["#7c3aed", "#a78bfa"],
    "CYBER BLUE": ["#0891b2", "#22d3ee"],
    EMERALD: ["#059669", "#34d399"],
    "RED NIGHT": ["#dc2626", "#fb7185"],
  };
  const [primary, highlight] =
    themeColors[settings.theme] ?? themeColors["VAVAGANG DARK"];
  document.documentElement.style.setProperty("--blue", primary);
  document.documentElement.style.setProperty("--blue-bright", highlight);
  document.documentElement.dataset.motion = settings.animations;
  document.documentElement.dataset.scale = settings.scale;
}
function formatDate(value) {
  if (!value) return "Data disponível após a sincronização.";
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(date);
}
