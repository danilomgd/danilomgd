import { cx } from '@/lib/format';
import type { User } from '@/lib/types';

export function Avatar({
  user,
  size = 24,
  className,
}: {
  user: Pick<User, 'username' | 'color' | 'initials' | 'avatarUrl'> | null | undefined;
  size?: number;
  className?: string;
}) {
  if (!user) {
    return (
      <span
        className={cx(
          'inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line muted',
          className,
        )}
        style={{ width: size, height: size, fontSize: size * 0.42 }}
        title="Sem responsável"
      >
        ?
      </span>
    );
  }
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        className,
      )}
      style={{ width: size, height: size, background: user.color, fontSize: size * 0.4 }}
      title={user.username}
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.username}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        user.initials
      )}
    </span>
  );
}

export function AvatarStack({
  users,
  size = 22,
  max = 3,
}: {
  users: User[];
  size?: number;
  max?: number;
}) {
  if (!users.length) return <Avatar user={null} size={size} />;
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((u, i) => (
        <Avatar
          key={u.id}
          user={u}
          size={size}
          className={cx('ring-2 ring-[var(--bg)]', i > 0 && '-ml-1.5')}
        />
      ))}
      {rest > 0 && (
        <span
          className="-ml-1.5 inline-flex items-center justify-center rounded-full bg-ink-200 text-[10px] font-semibold text-ink-700 ring-2 ring-[var(--bg)]"
          style={{ width: size, height: size }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
