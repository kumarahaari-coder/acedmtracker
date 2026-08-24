"use client";

import React, { useState, useEffect, useRef } from "react";
import { ImageOff } from "lucide-react";

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackTitle?: string;
}

export function SafeImage({
  src,
  alt,
  className = "",
  fallbackTitle = "Preview Media",
  ...props
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setHasError(false);
    if (imgRef.current) {
      if (imgRef.current.complete && imgRef.current.naturalWidth === 0 && src) {
        setHasError(true);
      }
    }
  }, [src]);

  if (!src || hasError) {
    return (
      <div
        data-testid="safe-image-fallback"
        className="w-full h-full flex flex-col items-center justify-center p-6 bg-[#f5f5f7] border border-black/[0.06] rounded-xl text-[#86868b] space-y-2 select-none"
      >
        <ImageOff className="h-8 w-8 text-[#86868b]" />
        <span className="text-[12px] font-medium text-center">{fallbackTitle}</span>
        <span className="text-[11px] text-[#86868b]">Preview Unavailable</span>
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt || fallbackTitle}
      onError={() => setHasError(true)}
      onLoad={(e) => {
        const target = e.currentTarget;
        if (target.naturalWidth === 0) {
          setHasError(true);
        }
      }}
      className={className}
      {...props}
    />
  );
}
