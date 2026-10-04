import React, { useState, useEffect } from 'react';
import { isGoogleDefaultAvatar, isGoogleDefaultAvatarSync } from '../../lib/utils/avatarUtils';

export interface UserAvatarProps {
  user?: {
    name?: string;
    avatarUrl?: string;
    email?: string;
  } | null;
  src?: string | null;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  roundedClassName?: string;
  shape?: string;
  imgClassName?: string;
  showBorder?: boolean;
  borderColorClassName?: string;
  fallbackType?: 'instagram' | 'initials';
  alt?: string;
}

/**
 * Pixel-accurate Instagram default silhouette avatar fallback SVG.
 * Features the signature medium-grey background with solid white
 * circular head and pill/capsule torso proportions.
 */
export const InstagramAvatarFallback: React.FC<{ className?: string; altText?: string }> = ({
  className = 'w-full h-full',
  altText = 'Default avatar',
}) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label={altText}
    role="img"
  >
    <rect width="100" height="100" fill="#797E87" />
    <circle cx="50" cy="37.5" r="14.5" fill="#FFFFFF" />
    <rect x="24" y="55.5" width="52" height="19" rx="9.5" fill="#FFFFFF" />
  </svg>
);

const SIZE_MAP = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-2xl',
  '2xl': 'w-20 h-20 text-3xl',
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  src,
  name,
  size = 'md',
  className = '',
  roundedClassName = 'rounded-2xl',
  shape,
  imgClassName = '',
  showBorder = false,
  borderColorClassName = 'border-white dark:border-[#12121A]',
  fallbackType = 'instagram',
  alt,
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  const effectiveSrc = (src !== undefined ? src : user?.avatarUrl) || null;
  const effectiveName = (name !== undefined ? name : user?.name) || 'User';

  const [isDefaultAvatar, setIsDefaultAvatar] = useState<boolean>(() => {
    return isGoogleDefaultAvatarSync(effectiveSrc) === true;
  });

  // Reset error state and classify image source if changes
  useEffect(() => {
    setImageFailed(false);
    if (!effectiveSrc) {
      setIsDefaultAvatar(false);
      return;
    }

    const syncCheck = isGoogleDefaultAvatarSync(effectiveSrc);
    if (syncCheck !== null) {
      setIsDefaultAvatar(syncCheck);
      return;
    }

    if (
      effectiveSrc.includes('googleusercontent.com') ||
      effectiveSrc.includes('google.com') ||
      effectiveSrc.includes('gstatic.com')
    ) {
      let isMounted = true;
      isGoogleDefaultAvatar(effectiveSrc).then((isDef) => {
        if (isMounted) {
          setIsDefaultAvatar(isDef);
        }
      });
      return () => {
        isMounted = false;
      };
    } else {
      setIsDefaultAvatar(false);
    }
  }, [effectiveSrc]);

  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;
  const borderClass = showBorder ? `border-2 ${borderColorClassName}` : '';
  const effectiveRounding = shape || roundedClassName;

  return (
    <div
      className={`relative shrink-0 overflow-hidden flex items-center justify-center select-none ${sizeClass} ${effectiveRounding} ${borderClass} ${className}`}
      data-testid="user-avatar"
    >
      {effectiveSrc && !imageFailed && !isDefaultAvatar ? (
        <img
          src={effectiveSrc}
          alt={alt || effectiveName}
          onError={() => setImageFailed(true)}
          className={`w-full h-full object-cover ${imgClassName}`}
          loading="lazy"
        />
      ) : fallbackType === 'initials' && effectiveName ? (
        <div className="w-full h-full bg-indigo-600 text-white flex items-center justify-center font-bold">
          {effectiveName.charAt(0).toUpperCase()}
        </div>
      ) : (
        <InstagramAvatarFallback className="w-full h-full object-cover" altText={alt || effectiveName} />
      )}
    </div>
  );
};
