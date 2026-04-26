'use client';

import { cn } from '@/lib/utils';
import Avatar from 'boring-avatars';
import { AVATAR_COLORS, DEFAULT_VARIANT, type AvatarVariant } from '@/lib/identicon';

interface AssistantAvatarProps {
  /** Name to generate avatar from */
  name: string;
  /** Size in pixels (default 32) */
  size?: number;
  /** Avatar style variant (default 'beam') */
  variant?: AvatarVariant;
  /** Additional CSS classes */
  className?: string;
}

export function AssistantAvatar({
  name,
  size = 32,
  variant = DEFAULT_VARIANT,
  className,
}: AssistantAvatarProps) {
  return (
    <div
      className={cn('shrink-0 relative', className)}
      aria-label={`Avatar for ${name}`}
    >
      <Avatar
        size={size}
        name={name || 'assistant'}
        variant={variant}
        colors={AVATAR_COLORS}
      />
    </div>
  );
}
