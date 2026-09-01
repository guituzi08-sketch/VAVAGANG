export default function Avatar({ profile, className = "avatar", fallbackClassName = "avatar-fallback", size }) {
  const name = profile?.nickname || profile?.displayName || profile?.email || "Usuário";
  const sizeClass = size ? ` ${size}` : "";
  if (profile?.photoURL) {
    return <img className={`${className}${sizeClass}`} src={profile.photoURL} alt={`Avatar de ${name}`} />;
  }
  return <div className={`${className} ${fallbackClassName}${sizeClass}`} aria-label={`Avatar de ${name}`}>{name[0]?.toUpperCase() ?? "V"}</div>;
}
