import { Bell, Check, Hash, MessageCircle, MoreHorizontal, Plus, Search, Shield, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSocial } from "../contexts/SocialContext";
import { useDirectMessages } from "../contexts/DirectMessageContext";
import { createFriendRequest } from "../services/friendService";
import { searchUsers } from "../services/userService";

const tabs = ["Todos", "Online", "Solicitações", "Bloqueados"];

export default function SocialWorkspace({ section }) {
  const params = useParams();
  const content = section === "friends" ? <FriendsView /> : section === "requests" ? <NotificationsView /> : section === "messages" ? <MessagesView /> : section === "search" ? <SearchView /> : section === "groups" ? <GroupsView groupId={params.groupId} /> : section === "channels" ? <TextChannelView channelId={params.channelId} /> : <EmptySocialView section={section} />;
  return <div className="social-workspace">{content}</div>;
}

function SocialHeader({ eyebrow, title, description, action }) {
  return <header className="social-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{action}</header>;
}

function FriendsView() {
  const { friends, requests, addFriendRequest, acceptRequest, rejectRequest, removeFriend, blockUser, blocked } = useSocial();
  const [tab, setTab] = useState("Todos");
  const [query, setQuery] = useState("");
  const visibleFriends = friends.filter((friend) => tab === "Online" ? friend.status === "online" : tab === "Todos");
  return <div className="social-content"><SocialHeader eyebrow="Rede" title="Amigos" description="Sua rede social fica organizada aqui." action={<button className="primary-button" onClick={() => document.getElementById("friend-search")?.focus()}><UserPlus size={16} /> Adicionar amigo</button>} /><div className="social-toolbar"><div className="social-search"><Search size={16} /><input id="friend-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar usuário ou @username" /></div><div className="social-tabs">{tabs.map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}{item === "Solicitações" && requests.length > 0 && <b>{requests.length}</b>}</button>)}</div></div>{query && <div className="search-result"><UsersRound size={18} /><div><strong>Nenhum usuário encontrado</strong><span>A pesquisa real será conectada ao Firestore na próxima fase.</span></div><button className="icon-button" title="Limpar pesquisa" onClick={() => setQuery("")}><X size={15} /></button></div>}{tab === "Solicitações" ? <div className="social-list">{requests.length === 0 && <EmptyLine text="Nenhuma solicitação pendente." />}{requests.map((request) => <PersonRow person={request} key={request.id}><button className="small-action" onClick={() => acceptRequest(request.id)}><Check size={14} /> Aceitar</button><button className="small-action muted-action" onClick={() => rejectRequest(request.id)}>Recusar</button></PersonRow>)}</div> : tab === "Bloqueados" ? <div className="social-list">{blocked.length === 0 && <EmptyLine text="Nenhuma pessoa bloqueada." />}{blocked.map((person) => <PersonRow person={person} key={person.uid}><button className="small-action" onClick={() => addFriendRequest(person)}>Desbloquear</button></PersonRow>)}</div> : <div className="social-list">{visibleFriends.length === 0 && <EmptyLine text="Nenhum amigo nesta lista. Pesquise usuários para começar." />}{visibleFriends.map((friend) => <PersonRow person={friend} key={friend.uid}><button className="icon-button" title="Remover amigo" onClick={() => removeFriend(friend.uid)}><X size={15} /></button><button className="icon-button" title="Bloquear usuário" onClick={() => blockUser(friend)}><Shield size={15} /></button></PersonRow>)}</div>}</div>;
}

function PersonRow({ person, children }) {
  return <article className="person-row"><div className="avatar avatar-fallback">{person.displayName?.[0] ?? "?"}</div><div><strong>{person.displayName ?? "Usuário"}</strong><span>@{person.username ?? "username"} · <i className={person.status === "online" ? "online-label" : ""}>{person.status === "online" ? "Online" : "Offline"}</i></span></div><div className="person-actions">{children}</div></article>;
}

function NotificationsView() {
  const { notifications, requests, markNotificationRead, markAllNotificationsRead } = useSocial();
  return <div className="social-content"><SocialHeader eyebrow="Central" title="Notificações" description="Solicitações e eventos importantes do seu espaço." action={<button className="secondary-button" onClick={markAllNotificationsRead}>Marcar todas como lidas</button>} /><div className="social-list notification-list">{requests.map((request) => <article className="notification-row" key={request.id}><Bell size={18} /><div><strong>Nova solicitação de amizade</strong><span>{request.displayName} quer adicionar você.</span></div><button className="small-action">Ver</button></article>)}{notifications.map((notification) => <article className={`notification-row ${notification.read ? "read" : ""}`} key={notification.id}><Bell size={18} /><div><strong>{notification.title}</strong><span>{notification.text}</span></div>{!notification.read && <button className="small-action" onClick={() => markNotificationRead(notification.id)}>Marcar como lida</button>}</article>)}{requests.length === 0 && notifications.length === 0 && <EmptyLine text="Nenhuma notificação por enquanto." />}</div></div>;
}

function SearchView() {
  const [query, setQuery] = useState("");
  const { firebaseUser } = useAuth();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sentRequests, setSentRequests] = useState({});
  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) { setResults([]); setError(""); setLoading(false); return undefined; }
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        setResults((await searchUsers(normalizedQuery)).filter((user) => user.uid !== firebaseUser?.uid));
        setError("");
      } catch (searchError) {
        setResults([]);
        setError(searchError.code === "permission-denied" ? "Pesquisa online indisponível porque o banco de usuários ainda não está configurado." : "Pesquisa online indisponível porque o banco de usuários ainda não está configurado.");
      } finally { setLoading(false); }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [query, firebaseUser?.uid]);
  async function addFriend(user) {
    try { await createFriendRequest(firebaseUser, user); setSentRequests((current) => ({ ...current, [user.uid]: true })); } catch (requestError) { setError(requestError.code === "permission-denied" ? "Você não tem permissão para enviar esta solicitação." : "Não foi possível enviar a solicitação. Tente novamente."); }
  }
  return <div className="social-content"><SocialHeader eyebrow="Explorar" title="Pesquisar usuários" description="Encontre pessoas por nome, username ou @username." /><div className="global-search-large"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar usuário ou @username" /></div><div className="search-categories"><span>Usuários</span><span>Grupos</span><span>Canais</span><span>Mensagens</span></div>{loading && <p className="search-status">Procurando usuários...</p>}{error && <p className="error-message">{error}</p>}{!loading && !error && query.trim() && results.length === 0 && <div className="workspace-empty"><Search size={24} /><h2>Nenhum usuário encontrado.</h2><p>Confira o nome ou username e tente novamente.</p></div>}{!loading && results.length > 0 && <div className="social-list">{results.map((user) => <article className="person-row" key={user.uid}><div className="avatar avatar-fallback">{user.photoURL ? <img className="avatar" src={user.photoURL} alt="" /> : user.displayName?.[0] ?? "?"}</div><div><strong>{user.displayName ?? "Usuário"}</strong><span>@{user.username ?? "username"} · <i className="online-label">{user.presenceStatus === "online" ? "Online" : "Offline"}</i></span></div><div className="person-actions"><button className="small-action" disabled={sentRequests[user.uid]} onClick={() => addFriend(user)}>{sentRequests[user.uid] ? "Solicitação enviada" : "Adicionar amigo"}</button></div></article>)}</div>}</div>;
}

function MessagesView() {
  const { friends } = useSocial();
  const { openPrivateChat } = useDirectMessages();
  return <div className="social-content"><SocialHeader eyebrow="Privado" title="Mensagens" description="Conversas privadas e contatos recentes." /><div className="conversation-list">{friends.length === 0 && <EmptyLine text="Adicione amigos para iniciar uma conversa privada." />}{friends.map((friend) => <button className="conversation-row" key={friend.uid} onClick={() => openPrivateChat(friend)}><div className="avatar avatar-fallback">{friend.displayName?.[0] ?? "?"}</div><div><strong>{friend.displayName}</strong><span>{friend.status === "online" ? "Online" : "Offline"}</span></div><MessageCircle size={16} /></button>)}</div></div>;
}

function GroupsView({ groupId }) {
  const { groups, createGroup, updateGroup, deleteGroup, createChannel, deleteChannel } = useSocial();
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();
  const group = groups.find((item) => item.id === groupId);
  const [showCreate, setShowCreate] = useState(false);
  const [showChannel, setShowChannel] = useState(false);
  if (!groupId) return <GroupsList groups={groups} onCreate={() => setShowCreate(true)} onOpen={(id) => navigate(`/groups/${id}`)} modal={showCreate ? <GroupModal onClose={() => setShowCreate(false)} onCreate={(data) => { const created = createGroup(data); setShowCreate(false); navigate(`/groups/${created.id}`); }} /> : null} />;
  if (!group) return <div className="social-content"><SocialHeader eyebrow="Grupo" title="Grupo não encontrado" description="Este grupo ainda não existe nesta sessão." action={<button className="secondary-button" onClick={() => navigate("/groups")}>Voltar</button>} /></div>;
  const categories = [...new Set(group.channels.map((channel) => channel.category))];
  return <div className="social-content"><SocialHeader eyebrow="Grupo" title={group.name} description={group.description || "Comunidade Vavagang"} action={group.ownerId === firebaseUser?.uid && <button className="danger-button" onClick={() => { deleteGroup(group.id); navigate("/groups"); }}><Trash2 size={15} /> Excluir grupo</button>} /><div className="group-layout"><aside className="group-channel-list"><div className="channel-heading"><span>Canais</span><button className="nav-add" onClick={() => setShowChannel(true)} title="Criar canal"><Plus size={15} /></button></div>{categories.map((category) => <div key={category}><span className="nav-caption">{category}</span>{group.channels.filter((channel) => channel.category === category).map((channel) => <button className="group-channel-link" key={channel.id} onClick={() => navigate(channel.type === "VOICE" ? `/voice/${channel.id}` : `/channels/${channel.id}`)}><span>{channel.type === "VOICE" ? "🔊" : "#"}</span>{channel.name}<MoreHorizontal size={14} onClick={(event) => { event.stopPropagation(); deleteChannel(group.id, channel.id); }} /></button>)}</div>)}</aside><section className="group-overview"><UsersRound size={26} /><h2>{group.name}</h2><p>{group.description || "Escolha um canal para começar."}</p><span className="privacy-badge">{group.privacy === "private" ? "🔒 Privado" : "🌎 Público"}</span></section></div>{showChannel && <ChannelModal onClose={() => setShowChannel(false)} onCreate={(data) => { createChannel(group.id, data); setShowChannel(false); }} />}</div>;
}

function GroupsList({ groups, onCreate, onOpen, modal }) {
  return <div className="social-content"><SocialHeader eyebrow="Comunidades" title="Grupos" description="Crie espaços para suas pessoas e organize seus canais." action={<button className="primary-button" onClick={onCreate}><Plus size={16} /> Criar grupo</button>} /><div className="group-grid">{groups.length === 0 && <EmptyLine text="Nenhum grupo criado nesta sessão." />}{groups.map((group) => <button className="group-card" key={group.id} onClick={() => onOpen(group.id)}><div className="group-card-icon">🔥</div><strong>{group.name}</strong><span>{group.description || "Sem descrição"}</span><small>{group.channels.length} canais · {group.privacy === "private" ? "Privado" : "Público"}</small></button>)}</div>{modal}</div>;
}

function GroupModal({ onClose, onCreate }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [privacy, setPrivacy] = useState("public");
  return <Modal title="Criar grupo" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (name.trim()) onCreate({ name, description, privacy }); }}><Field label="Nome do grupo" value={name} onChange={setName} placeholder="ex: VAVAGANG" /><Field label="Descrição" value={description} onChange={setDescription} placeholder="Sobre este grupo" /><label className="modal-label">Privacidade<select className="modal-input" value={privacy} onChange={(event) => setPrivacy(event.target.value)}><option value="public">🌎 Público</option><option value="private">🔒 Privado</option></select></label><ModalActions onClose={onClose} submit="Criar grupo" /></form></Modal>;
}

function ChannelModal({ onClose, onCreate }) {
  const [name, setName] = useState(""); const [type, setType] = useState("TEXT"); const [category, setCategory] = useState("");
  return <Modal title="Criar canal" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (name.trim()) onCreate({ name, type, category }); }}><Field label="Nome do canal" value={name} onChange={setName} placeholder="ex: conversa" /><label className="modal-label">Tipo<select className="modal-input" value={type} onChange={(event) => setType(event.target.value)}><option value="TEXT"># Texto</option><option value="VOICE">🔊 Voz</option></select></label><Field label="Categoria" value={category} onChange={setCategory} placeholder="ex: SOCIAL" /><ModalActions onClose={onClose} submit="Criar canal" /></form></Modal>;
}

function Modal({ title, onClose, children }) { return <div className="composer-backdrop"><section className="composer-modal" role="dialog" aria-modal="true"><button className="composer-close" onClick={onClose} title="Fechar"><X size={17} /></button><p className="eyebrow">Estado local da interface</p><h2>{title}</h2>{children}</section></div>; }
function Field({ label, value, onChange, placeholder }) { return <label className="modal-label">{label}<input className="modal-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>; }
function ModalActions({ onClose, submit }) { return <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button">{submit}</button></div>; }
function TextChannelView({ channelId }) { const { groups, sendChannelMessage, editChannelMessage, deleteChannelMessage } = useSocial(); const channel = groups.flatMap((group) => group.channels).find((item) => item.id === channelId); const [text, setText] = useState(""); if (!channel) return <div className="social-content"><SocialHeader eyebrow="Canal" title="Canal não encontrado" description="Este canal ainda não existe nesta sessão." /></div>; return <div className="social-content text-channel-view"><SocialHeader eyebrow="Canal de texto" title={`# ${channel.name}`} description="Conversa da comunidade." /><div className="text-message-list">{channel.messages.length === 0 && <EmptyLine text="Nenhuma mensagem. Comece a conversa." />}{channel.messages.map((message) => <article className="text-message" key={message.id}><div className="avatar avatar-fallback">{message.authorName?.[0] ?? "V"}</div><div><strong>{message.authorName}</strong><small>{message.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small><p>{message.text}</p><div className="message-tools"><button onClick={() => editChannelMessage(channel.id, message.id, window.prompt("Editar mensagem", message.text) ?? message.text)}>Editar</button><button onClick={() => deleteChannelMessage(channel.id, message.id)}>Excluir</button></div></div></article>)}</div><form className="channel-message-form" onSubmit={(event) => { event.preventDefault(); sendChannelMessage(channel.id, text); setText(""); }}><input value={text} onChange={(event) => setText(event.target.value)} placeholder={`Enviar mensagem em #${channel.name}`} /><button className="primary-button" disabled={!text.trim()}><SendIcon /></button></form></div>; }
function SendIcon() { return <MessageCircle size={16} />; }
function EmptySocialView({ section }) { return <div className="social-content"><SocialHeader eyebrow="Vavagang" title={section} description="Esta área será conectada ao backend social na próxima fase." /><div className="workspace-empty"><Hash size={24} /><h2>Sem dados nesta sessão</h2><p>Nenhum dado falso foi incluído. Crie um grupo ou adicione uma fonte real para começar.</p></div></div>; }
function EmptyLine({ text }) { return <p className="social-empty-line">{text}</p>; }