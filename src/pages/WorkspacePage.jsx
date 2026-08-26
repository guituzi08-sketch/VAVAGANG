import { Bell, Headphones, MessageSquare, Search, Settings, UsersRound } from "lucide-react";
import { useParams } from "react-router-dom";
import VoiceChannelPage from "../components/VoiceChannelPage";

const sections = {
  friends: { eyebrow: "Rede", title: "Amigos", description: "Encontre e gerencie conexões reais da sua rede.", icon: UsersRound },
  requests: { eyebrow: "Rede", title: "Solicitações", description: "Solicitações de amizade aparecerão aqui.", icon: Bell },
  messages: { eyebrow: "Privado", title: "Mensagens", description: "Suas conversas privadas aparecerão aqui.", icon: MessageSquare },
  groups: { eyebrow: "Grupo", title: "Grupo", description: "Os dados deste grupo serão carregados do Firestore.", icon: UsersRound },
  channels: { eyebrow: "Canal", title: "Canal de texto", description: "As mensagens deste canal serão carregadas do Firestore.", icon: MessageSquare },
  voice: { eyebrow: "Voz", title: "Canal de voz", description: "A chamada deste canal será carregada do Firestore.", icon: Headphones },
  settings: { eyebrow: "Conta", title: "Configurações", description: "Preferências da sua conta Vavagang.", icon: Settings },
};

export default function WorkspacePage({ section }) {
  const params = useParams();
  const content = sections[section] ?? sections.messages;
  const Icon = content.icon;
  const identifier = params.groupId ?? params.channelId ?? params.voiceId;

  if (section === "voice") return <VoiceChannelPage roomId={identifier} />;

  return <div className="workspace-page"><div className="workspace-page-header"><div><p className="eyebrow">{content.eyebrow}</p><h1>{content.title}{identifier && <span className="page-id"> / {identifier}</span>}</h1><p className="muted">{content.description}</p></div><button className="search-field" title="Pesquisar"><Search size={16} /> Pesquisar</button></div><div className="workspace-empty"><div className="empty-icon"><Icon size={24} /></div><h2>{section === "settings" ? "Preferências em breve" : "Nada por aqui ainda"}</h2><p>{section === "friends" ? "Adicione pessoas reais para começar sua rede." : section === "messages" ? "Quando você iniciar uma conversa, ela aparecerá nesta área." : "Esta área está preparada para receber dados reais."}</p><div className="empty-line"><Bell size={15} /> Nenhum dado foi criado ainda</div></div></div>;
}