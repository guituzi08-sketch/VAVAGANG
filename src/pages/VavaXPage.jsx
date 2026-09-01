import {
  Bell,
  Heart,
  ImagePlus,
  MessageCircle,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Avatar from "../components/Avatar";
import {
  addVavaXComment,
  createVavaXPost,
  classifyVavaXMedia,
  deleteVavaXPost,
  hasVavaXLike,
  isVavaXFollowing,
  subscribeToVavaXComments,
  subscribeToVavaXNotifications,
  subscribeToVavaXPosts,
  toggleVavaXFollow,
  toggleVavaXLike,
  markVavaXNotificationRead,
} from "../services/vavaxService";
import { getErrorMessage } from "../utils/errorMessage";

export default function VavaXPage() {
  const { firebaseUser, profile } = useAuth();
  const [posts, setPosts] = useState([]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [caption, setCaption] = useState("");
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsRef = useRef(null);

  useEffect(
    () =>
      subscribeToVavaXPosts(setPosts, (snapshotError) =>
        setError(getErrorMessage(snapshotError, "Não foi possível carregar os posts.")),
      ),
    [],
  );
  useEffect(() => subscribeToVavaXNotifications(firebaseUser.uid, setNotifications, () => setError("Não foi possível carregar as notificações.")), [firebaseUser.uid]);
  useEffect(() => {
    if (!showNotifications) return undefined;
    function closeOnOutsideClick(event) {
      if (!notificationsRef.current?.contains(event.target)) setShowNotifications(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [showNotifications]);

  async function publish(event) {
    event.preventDefault();
    try {
      await createVavaXPost({
        author: profile || firebaseUser,
        mediaUrl,
        mediaType,
        caption,
      });
      setMediaUrl("");
      setMediaType("image");
      setCaption("");
      setComposerOpen(false);
      setError("");
    } catch (publishError) {
      setError(publishError.code ? "Não foi possível publicar o post." : getErrorMessage(publishError, "Não foi possível publicar o post."));
    }
  }

  return (
    <div className="vavax-page">
      <header className="vavax-topbar">
        <NavLink className="vavax-brand" to="/vavax">
          <span>𝕏</span>
          <strong>VAVAX</strong>
        </NavLink>
        <div className="vavax-topbar-actions">
          <span className="vavax-status">
            <i /> conectado
          </span>
          <div className="vavax-notification-anchor" ref={notificationsRef}>
            <button className="icon-button" title="Notificações VavaX" onClick={() => setShowNotifications((current) => !current)}>
              <Bell size={16} /> {notifications.filter((item) => !item.read).length || ""}
            </button>
            {showNotifications && (
              <div className="vavax-notifications" role="dialog" aria-label="Notificações">
                <h2>Notificações</h2>
                <div className="vavax-notification-list">
                  {notifications.length === 0 && <span className="vavax-notification-empty">Nenhuma notificação.</span>}
                  {notifications.slice(0, 8).map((item) => (
                    <button key={item.id} className={item.read ? "vavax-notification" : "vavax-notification unread"} onClick={() => markVavaXNotificationRead(item.id).catch(() => setError("Não foi possível atualizar a notificação."))}>
                      <strong>{item.senderName}</strong>
                      <span>{item.type === "like" ? "curtiu seu post." : item.type === "comment" ? "comentou no seu post." : "começou a seguir você."}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Avatar profile={profile} />
        </div>
      </header>
      <main className="vavax-layout">
        <aside className="vavax-sidebar">
          <div className="vavax-profile">
            <Avatar profile={profile} className="avatar vavax-avatar" />
            <strong>
              {profile?.nickname || profile?.displayName || "Usuário"}
            </strong>
            <span>@{profile?.username || "vavax_user"}</span>
            <p>Compartilhe o que está acontecendo agora.</p>
          </div>
          <nav className="vavax-side-nav">
            <NavLink to="/vavax">
              <ImagePlus size={16} /> Feed
            </NavLink>
            <NavLink to="/friends">
              <Users size={16} /> Pessoas
            </NavLink>
            <NavLink to="/requests">
              <Heart size={16} /> Notificações
            </NavLink>
          </nav>
        </aside>
        <section className="vavax-feed">
          <div className="vavax-feed-header">
            <div>
              <p className="eyebrow">Rede social</p>
              <h1>VavaX</h1>
              <p className="muted">
                Posts, conversas e pessoas para acompanhar.
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => setComposerOpen(true)}
            >
              <ImagePlus size={16} /> Publicar
            </button>
          </div>
          <div className="vavax-post-list">
            {posts.length === 0 && (
              <div className="vavax-empty">
                <MessageCircle size={22} />
                <p>Ainda não há posts no VavaX.</p>
                <span>Publique uma imagem para começar.</span>
              </div>
            )}
            {posts.map((post) => (
              <VavaXPost
                key={post.id}
                post={post}
                user={firebaseUser}
                onError={setError}
              />
            ))}
          </div>
        </section>
      </main>
      {isComposerOpen && (
        <div
          className="vavax-modal-backdrop"
          onClick={() => setComposerOpen(false)}
        >
          <form
            className="vavax-composer"
            onSubmit={publish}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="vavax-close"
              type="button"
              onClick={() => setComposerOpen(false)}
              title="Fechar"
            >
              <X size={17} />
            </button>
            <p className="eyebrow">Novo post</p>
            <h2>Compartilhar no VavaX</h2>
            <label>
              Tipo de publicação
              <select value={mediaType} onChange={(event) => setMediaType(event.target.value)}>
                <option value="image">Imagem</option>
                <option value="video">Vídeo/URL</option>
              </select>
            </label>
            <label>
              {mediaType === "video" ? "URL do vídeo" : "URL da imagem"}
              <input
                value={mediaUrl}
                onChange={(event) => setMediaUrl(event.target.value)}
                placeholder={mediaType === "video" ? "YouTube, Vimeo ou arquivo .mp4/.webm" : "https://..."}
                required
              />
            </label>
            <label>
              Legenda
              <textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="O que você está pensando?"
                maxLength={500}
              />
            </label>
            {error && <p className="vavax-form-error" role="alert">{error}</p>}
            <button className="primary-button" type="submit">
              <Send size={15} /> Publicar post
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function VavaXPost({ post, user, onError }) {
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [showComments, setShowComments] = useState(false);

  useEffect(
    () =>
      subscribeToVavaXComments(post.id, setComments, (error) =>
        onError("Não foi possível carregar os comentários."),
      ),
    [post.id, onError],
  );
  useEffect(() => {
    let active = true;
    Promise.all([
      hasVavaXLike(post.id, user?.uid),
      isVavaXFollowing(post.authorId, user?.uid),
    ])
      .then(([nextLiked, nextFollowing]) => {
        if (active) {
          setLiked(nextLiked);
          setFollowing(nextFollowing);
        }
      })
      .catch(() => onError("Não foi possível carregar as interações do post."));
    return () => {
      active = false;
    };
  }, [post.id, post.authorId, user?.uid, onError]);

  async function like() {
    try {
      setLiked(await toggleVavaXLike(post, user));
    } catch (error) {
      onError("Não foi possível atualizar a curtida.");
    }
  }

  async function follow() {
    try {
      setFollowing(await toggleVavaXFollow(post.authorId, user));
    } catch (error) {
      onError("Não foi possível atualizar o seguimento.");
    }
  }

  async function comment(event) {
    event.preventDefault();
    try {
      await addVavaXComment(post, user, commentText);
      setCommentText("");
      setShowComments(true);
    } catch (error) {
      onError("Não foi possível publicar o comentário.");
    }
  }

  async function remove() {
    if (!window.confirm("Excluir este post?")) return;
    try {
      await deleteVavaXPost(post.id);
    } catch (error) {
      onError("Não foi possível excluir o post.");
    }
  }

  return (
    <article className="vavax-post">
      <header>
        <div className="vavax-author">
          <Avatar profile={post} />
          <div>
            <strong>{post.displayName}</strong>
            <span>@{post.username || "vavax_user"}</span>
          </div>
        </div>
        <div className="vavax-post-actions">
          {post.authorId !== user?.uid && (
            <button
              className={following ? "vavax-follow following" : "vavax-follow"}
              onClick={follow}
              title={following ? "Deixar de seguir" : "Seguir"}
            >
              <UserPlus size={14} /> {following ? "Seguindo" : "Seguir"}
            </button>
          )}
          {post.authorId === user?.uid && (
            <button
              className="icon-button"
              onClick={remove}
              title="Excluir post"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </header>
      <VavaXPostMedia post={post} onError={onError} />
      {post.caption && <p className="vavax-caption">{post.caption}</p>}
      <div className="vavax-post-meta">
        <button
          className={liked ? "vavax-action active" : "vavax-action"}
          onClick={like}
        >
          <Heart size={17} fill={liked ? "currentColor" : "none"} />{" "}
          {post.likeCount || 0}
        </button>
        <button
          className="vavax-action"
          onClick={() => setShowComments(!showComments)}
        >
          <MessageCircle size={17} /> {post.commentCount || 0}
        </button>
      </div>
      {showComments && (
        <div className="vavax-comments">
          {comments.map((commentItem) => (
            <div className="vavax-comment" key={commentItem.id}>
              <strong>{commentItem.displayName}</strong>
              <span>{commentItem.text}</span>
            </div>
          ))}
          <form onSubmit={comment}>
            <input
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder="Escreva um comentário..."
              maxLength={300}
            />
            <button
              className="icon-button"
              disabled={!commentText.trim()}
              title="Comentar"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </article>
  );
}

function VavaXPostMedia({ post, onError }) {
  const [failed, setFailed] = useState(false);
  const media = post.mediaType === "video" ? classifyVavaXMedia(post.mediaUrl) : null;
  if (failed || (post.mediaType === "video" && !media)) {
    return <p className="vavax-media-error">Não foi possível reproduzir este vídeo.</p>;
  }
  if (post.mediaType !== "video") {
    return <img className="vavax-post-media" src={post.mediaUrl} alt={post.caption || "Imagem publicada no VavaX"} onError={(event) => { event.currentTarget.style.display = "none"; }} />;
  }
  if (media.provider !== "direct") {
    return <iframe className="vavax-post-media vavax-post-embed" src={media.embedUrl} title={post.caption || "Vídeo publicado no VavaX"} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen onError={() => setFailed(true)} />;
  }
  return <video className="vavax-post-media" src={post.mediaUrl} controls preload="metadata" onError={() => { setFailed(true); onError("Não foi possível reproduzir este vídeo."); }} />;
}
