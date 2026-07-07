// Material Symbols Outlined 아이콘 — 시안 v2 단일 아이콘 시스템 (이모지·유니코드 글리프 대체)
// 사용: <Icon name="close" /> · 크기 <Icon name="add" size={18} /> · 채움 <Icon name="star" fill />
interface IconProps {
  name: string;
  size?: number; // px, 기본 18
  fill?: boolean;
  weight?: number; // 300~600, 기본 400
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export function Icon({ name, size = 18, fill = false, weight = 400, className = "", style, title }: IconProps) {
  return (
    <span
      className={`mi${fill ? " fill" : ""} ${className}`}
      aria-hidden={title ? undefined : true}
      title={title}
      style={{
        fontSize: size,
        fontVariationSettings: `'opsz' ${size <= 20 ? 20 : 24}, 'wght' ${weight}, 'GRAD' 0, 'FILL' ${fill ? 1 : 0}`,
        ...style,
      }}
    >
      {name}
    </span>
  );
}
