"use client";

import React from "react";

interface UserAvatarProps {
  avatar?: string | null;
  name?: string | null;
  className?: string;
  fallbackClassName?: string;
}

export function UserAvatar({
  avatar,
  name,
  className = "h-8 w-8 text-[12px]",
  fallbackClassName = "bg-[#f2f2f7] text-[#1d1d1f] border border-black/[0.08]",
}: UserAvatarProps) {
  const [imageError, setImageError] = React.useState(false);
  const isHttp = Boolean(avatar && (avatar.startsWith("http://") || avatar.startsWith("https://")));

  const initials = React.useMemo(() => {
    if (avatar && avatar.length <= 3 && !avatar.startsWith("http")) {
      return avatar.toUpperCase();
    }
    if (name) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    return "U";
  }, [avatar, name]);

  if (isHttp && avatar && !imageError) {
    return (
      <div className={`relative rounded-full overflow-hidden shrink-0 ${className}`}>
        <img
          src={avatar}
          alt={name || "User Avatar"}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold shrink-0 select-none ${fallbackClassName} ${className}`}
    >
      {initials}
    </div>
  );
}
